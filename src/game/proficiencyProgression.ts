import type { ProficiencyKey } from './engine';

/**
 * Marco cumulativo: totalRequired é o total bruto necessário para alcançar level.
 * A tabela é fornecida externamente; este módulo não define valores de balanceamento.
 */
export type ProficiencyProgressionMilestone = {
  level: number;
  totalRequired: number;
};

/**
 * Configuração versionada e específica de uma proficiência.
 * Deve ser aprovada/preenchida antes de ser usada em gameplay.
 */
export type ProficiencyProgressionTable = {
  version: string;
  key: ProficiencyKey;
  initialLevel: number;
  maxLevel: number;
  milestones: readonly ProficiencyProgressionMilestone[];
};

export type ProficiencyProgressionResult = {
  key: ProficiencyKey;
  tableVersion: string;
  total: number;
  level: number;
  isMaxLevel: boolean;
  progressInLevel: number;
  requiredForNextLevel: number | null;
  remainingForNextLevel: number;
  progressRatio: number;
  surplusAtMaxLevel: number;
};

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Progressão de proficiência: ${label} deve ser um inteiro seguro não negativo.`);
  }
}

/**
 * Valida a tabela sem impor curva, limite ou quantidade de uso.
 * Exige um marco para cada nível, começando em initialLevel com requisito zero.
 */
export function validateProficiencyProgressionTable(
  table: ProficiencyProgressionTable,
): void {
  if (!table || typeof table.version !== 'string' || !table.version.trim()) {
    throw new Error('Progressão de proficiência: versão da tabela ausente.');
  }
  if (!table.key || typeof table.key !== 'string') {
    throw new Error('Progressão de proficiência: chave inválida.');
  }

  assertNonNegativeSafeInteger(table.initialLevel, 'nível inicial');
  assertNonNegativeSafeInteger(table.maxLevel, 'nível máximo');
  if (table.maxLevel < table.initialLevel) {
    throw new Error('Progressão de proficiência: nível máximo menor que o nível inicial.');
  }
  if (!Array.isArray(table.milestones)) {
    throw new Error('Progressão de proficiência: marcos ausentes.');
  }

  const expectedCount = table.maxLevel - table.initialLevel + 1;
  if (table.milestones.length !== expectedCount) {
    throw new Error('Progressão de proficiência: deve existir exatamente um marco por nível.');
  }

  let previousRequired = -1;
  table.milestones.forEach((milestone, index) => {
    const expectedLevel = table.initialLevel + index;
    if (!milestone || milestone.level !== expectedLevel) {
      throw new Error('Progressão de proficiência: níveis dos marcos devem ser contíguos e ordenados.');
    }
    assertNonNegativeSafeInteger(milestone.totalRequired, 'requisito do marco');
    if (index === 0 && milestone.totalRequired !== 0) {
      throw new Error('Progressão de proficiência: o nível inicial deve começar com requisito zero.');
    }
    if (milestone.totalRequired <= previousRequired) {
      throw new Error('Progressão de proficiência: requisitos devem crescer estritamente a cada nível.');
    }
    previousRequired = milestone.totalRequired;
  });
}

/**
 * Calcula o nível derivado do contador bruto. Não altera nem consome o total.
 * No nível máximo, o excedente é reportado separadamente para uma decisão futura
 * sobre retenção/apresentação; o contador bruto continua sendo a fonte histórica.
 */
export function evaluateProficiencyProgression(
  total: number,
  table: ProficiencyProgressionTable,
): ProficiencyProgressionResult {
  assertNonNegativeSafeInteger(total, 'total acumulado');
  validateProficiencyProgressionTable(table);

  let currentIndex = 0;
  for (let index = 1; index < table.milestones.length; index += 1) {
    if (total < table.milestones[index].totalRequired) break;
    currentIndex = index;
  }

  const current = table.milestones[currentIndex];
  const next = table.milestones[currentIndex + 1];
  const isMaxLevel = !next;
  const progressInLevel = total - current.totalRequired;
  const requiredForNextLevel = next
    ? next.totalRequired - current.totalRequired
    : null;
  const remainingForNextLevel = next
    ? Math.max(0, next.totalRequired - total)
    : 0;

  return {
    key: table.key,
    tableVersion: table.version,
    total,
    level: current.level,
    isMaxLevel,
    progressInLevel,
    requiredForNextLevel,
    remainingForNextLevel,
    progressRatio: next && requiredForNextLevel
      ? Math.min(1, progressInLevel / requiredForNextLevel)
      : 1,
    surplusAtMaxLevel: isMaxLevel ? Math.max(0, total - current.totalRequired) : 0,
  };
}
