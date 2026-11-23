import type { ProficiencyKey } from './engine';
import {
  evaluateProficiencyProgression,
  type ProficiencyProgressionResult,
  type ProficiencyProgressionTable,
} from './proficiencyProgression';

export type ProficiencyProgressionBaseline = {
  preservedLevel: number;
  baselineCounter: number;
};

type ExtremeProgressionConfig = {
  maxLevel: number;
  totalAtMax: number;
  level1: number;
  level2: number;
  level3: number;
};

const PROGRESSION_EXPONENT = 1.8;

const LEGACY_PROFICIENCY_LEVEL_CONFIG: Readonly<Record<ProficiencyKey, readonly [number, number, number]>> = {
  espada: [14.65, 1.10, 150],
  arco: [14.65, 1.10, 150],
  cajado: [14.65, 1.10, 150],
  bastao_natureza: [14.65, 1.10, 150],
  golpes_recebidos: [3.66, 1.10, 150],
  machado_madeira: [10.96, 1.08, 100],
  picareta: [10.96, 1.08, 100],
  foice_mao: [10.96, 1.08, 100],
  vara_pesca: [5.48, 1.08, 100],
  faca_esfolar: [1.37, 1.08, 100],
  carroca_distancia: [13.57, 1.07, 100],
};

/** Reproduz os marcos levels-v1 usados pela migration, incluindo o arredondamento SQL. */
function getLegacyProficiencyMilestone(key: ProficiencyKey, level: number): number {
  if (level <= 0) return 0;
  const [base, growth] = LEGACY_PROFICIENCY_LEVEL_CONFIG[key];
  return Math.round(base * (Math.pow(growth, level) - 1) / (growth - 1));
}

/** Retorna o nível e a fração já percorrida dentro dele na curva levels-v1. */
export function getLegacyProficiencyProgress(
  key: ProficiencyKey,
  total: number,
): { level: number; progressRatio: number } {
  if (!Number.isSafeInteger(total) || total < 0) return { level: 0, progressRatio: 0 };
  const [, , maxLevel] = LEGACY_PROFICIENCY_LEVEL_CONFIG[key];
  let level = 0;
  for (let currentLevel = 1; currentLevel <= maxLevel; currentLevel += 1) {
    if (total < getLegacyProficiencyMilestone(key, currentLevel)) break;
    level = currentLevel;
  }
  if (level >= maxLevel) return { level, progressRatio: 1 };

  const currentRequired = getLegacyProficiencyMilestone(key, level);
  const nextRequired = getLegacyProficiencyMilestone(key, level + 1);
  const interval = nextRequired - currentRequired;
  return {
    level,
    progressRatio: interval > 0
      ? Math.min(1, Math.max(0, (total - currentRequired) / interval))
      : 0,
  };
}

/** Mantém a API de leitura do nível legado usada na migração de dados locais. */
export function getLegacyProficiencyLevel(key: ProficiencyKey, total: number): number {
  return getLegacyProficiencyProgress(key, total).level;
}

/**
 * Metas extremas de atividade contínua. Os totais máximos são calibrados
 * pelos intervalos de evento do jogo; não alteram a frequência dos eventos.
 */
const PROFICIENCY_LEVEL_CONFIG: Readonly<Record<ProficiencyKey, ExtremeProgressionConfig>> = {
  espada: { maxLevel: 150, totalAtMax: 2_700_000, level1: 100, level2: 250, level3: 450 },
  arco: { maxLevel: 150, totalAtMax: 3_105_000, level1: 100, level2: 250, level3: 450 },
  cajado: { maxLevel: 150, totalAtMax: 2_484_000, level1: 100, level2: 250, level3: 450 },
  bastao_natureza: { maxLevel: 150, totalAtMax: 2_484_000, level1: 100, level2: 250, level3: 450 },
  golpes_recebidos: { maxLevel: 150, totalAtMax: 2_250_000, level1: 80, level2: 200, level3: 350 },
  machado_madeira: { maxLevel: 100, totalAtMax: 2_000_000, level1: 80, level2: 200, level3: 350 },
  picareta: { maxLevel: 100, totalAtMax: 2_000_000, level1: 80, level2: 200, level3: 350 },
  foice_mao: { maxLevel: 100, totalAtMax: 2_000_000, level1: 80, level2: 200, level3: 350 },
  vara_pesca: { maxLevel: 100, totalAtMax: 211_765, level1: 12, level2: 30, level3: 55 },
  faca_esfolar: { maxLevel: 100, totalAtMax: 1_800_000, level1: 150, level2: 350, level3: 600 },
  carroca_distancia: { maxLevel: 100, totalAtMax: 558_643, level1: 500, level2: 1_500, level3: 3_000 },
};

function createTable(
  key: ProficiencyKey,
  config: ExtremeProgressionConfig,
): ProficiencyProgressionTable {
  const milestones: { level: number; totalRequired: number }[] = [
    { level: 0, totalRequired: 0 },
    { level: 1, totalRequired: config.level1 },
    { level: 2, totalRequired: config.level2 },
    { level: 3, totalRequired: config.level3 },
  ];
  let previous = config.level3;

  for (let level = 4; level <= config.maxLevel; level += 1) {
    const progress = (level - 3) / (config.maxLevel - 3);
    const calculated = Math.round(
      config.level3
        + (config.totalAtMax - config.level3) * Math.pow(progress, PROGRESSION_EXPONENT),
    );
    const totalRequired = Math.max(previous + 1, calculated);
    milestones.push({ level, totalRequired });
    previous = totalRequired;
  }

  return {
    version: 'levels-v2-extreme',
    key,
    initialLevel: 0,
    maxLevel: config.maxLevel,
    milestones,
  };
}

/** Uma tabela determinística por chave; a validação é executada nos testes, não na importação. */
export const PROFICIENCY_PROGRESSION_TABLES: readonly ProficiencyProgressionTable[] = (
  Object.entries(PROFICIENCY_LEVEL_CONFIG) as [ProficiencyKey, ExtremeProgressionConfig][]
).map(([key, config]) => createTable(key, config));

const TABLE_BY_KEY: Readonly<Record<ProficiencyKey, ProficiencyProgressionTable>> =
  Object.fromEntries(PROFICIENCY_PROGRESSION_TABLES.map(table => [table.key, table])) as
    Record<ProficiencyKey, ProficiencyProgressionTable>;

/**
 * O baseline preserva o nível e a fração conquistada na curva anterior.
 * Eventos posteriores ao contador de migração são somados sem serem reescalados.
 */
export function getProficiencyProgression(
  key: ProficiencyKey,
  total: number,
  baseline?: ProficiencyProgressionBaseline,
): ProficiencyProgressionResult {
  const table = TABLE_BY_KEY[key];
  let effectiveTotal = total;

  if (baseline
    && Number.isSafeInteger(baseline.preservedLevel)
    && baseline.preservedLevel >= 0
    && baseline.preservedLevel <= table.maxLevel
    && Number.isSafeInteger(baseline.baselineCounter)
    && baseline.baselineCounter >= 0) {
    const preservedMilestone = table.milestones[baseline.preservedLevel];
    const legacyProgress = getLegacyProficiencyProgress(key, baseline.baselineCounter);
    const nextMilestone = table.milestones[baseline.preservedLevel + 1];
    const preservedProgress = nextMilestone
      ? Math.round(legacyProgress.progressRatio
        * (nextMilestone.totalRequired - preservedMilestone.totalRequired))
      : 0;
    const eventsAfterBaseline = Math.max(0, total - baseline.baselineCounter);
    effectiveTotal = preservedMilestone.totalRequired + preservedProgress + eventsAfterBaseline;
  }

  return evaluateProficiencyProgression(effectiveTotal, table);
}
