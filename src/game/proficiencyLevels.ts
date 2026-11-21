import type { ProficiencyKey } from './engine';
import {
  evaluateProficiencyProgression,
  type ProficiencyProgressionResult,
  type ProficiencyProgressionTable,
} from './proficiencyProgression';

/**
 * Curva geométrica cumulativa: round(A * (b^L - 1) / (b - 1)).
 * Alvos estimados: nível 80 em ~150 h para combate, nível 100 em ~250 h
 * para sobrevivência e nível 100 em ~300 h para carroça. Taxas por hora são estimativas.
 * O nível 150 das proficiências de combate é inalcançável na prática;
 * o contador bruto continua acumulando qualquer excedente.
 */
const PROFICIENCY_LEVEL_CONFIG: Readonly<Record<ProficiencyKey, readonly [number, number, number]>> = {
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

function createTable(
  key: ProficiencyKey,
  [a, ratio, maxLevel]: readonly [number, number, number],
): ProficiencyProgressionTable {
  const milestones: { level: number; totalRequired: number }[] = [
    { level: 0, totalRequired: 0 },
  ];
  let previous = 0;

  for (let level = 1; level <= maxLevel; level += 1) {
    const calculated = Math.round(a * (Math.pow(ratio, level) - 1) / (ratio - 1));
    const totalRequired = calculated <= previous ? previous + 1 : calculated;
    milestones.push({ level, totalRequired });
    previous = totalRequired;
  }

  return {
    version: 'levels-v1',
    key,
    initialLevel: 0,
    maxLevel,
    milestones,
  };
}

/** Uma tabela determinística por chave; a validação é executada nos testes, não na importação. */
export const PROFICIENCY_PROGRESSION_TABLES: readonly ProficiencyProgressionTable[] = (
  Object.entries(PROFICIENCY_LEVEL_CONFIG) as [ProficiencyKey, readonly [number, number, number]][]
).map(([key, parameters]) => createTable(key, parameters));

const TABLE_BY_KEY: Readonly<Record<ProficiencyKey, ProficiencyProgressionTable>> =
  Object.fromEntries(PROFICIENCY_PROGRESSION_TABLES.map(table => [table.key, table])) as
    Record<ProficiencyKey, ProficiencyProgressionTable>;

export function getProficiencyProgression(
  key: ProficiencyKey,
  total: number,
): ProficiencyProgressionResult {
  return evaluateProficiencyProgression(total, TABLE_BY_KEY[key]);
}
