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
 * O baseline mantém o nível alcançado na curva anterior. Somente eventos
 * posteriores ao contador registrado na migração avançam na curva nova.
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
    const eventsAfterBaseline = Math.max(0, total - baseline.baselineCounter);
    effectiveTotal = preservedMilestone.totalRequired + eventsAfterBaseline;
  }

  return evaluateProficiencyProgression(effectiveTotal, table);
}
