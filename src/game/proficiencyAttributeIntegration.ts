import { ATTRIBUTE_USAGE, type AttributeKey } from './attributes';
import type { ClassId } from './config';
import type { ProficiencyKey } from './engine';
import {
  evaluateProficiencyProgression,
  validateProficiencyProgressionTable,
  type ProficiencyProgressionTable,
} from './proficiencyProgression';

/**
 * Etapa 8: contrato tipado para conectar recompensas desbloqueadas aos atributos.
 * Esta camada só resolve elegibilidade e expõe contribuições; não altera o personagem.
 */
export type ProficiencyAttributeReward = {
  id: string;
  version: string;
  proficiencyKey: ProficiencyKey;
  unlockLevel: number;
  enabled: boolean;
  scope:
    | { type: 'character' }
    | { type: 'class'; classId: ClassId };
  effect: {
    type: 'attribute_base';
    attribute: AttributeKey;
    amount: number;
  };
};

export type ProficiencyAttributeContribution = {
  rewardId: string;
  rewardVersion: string;
  proficiencyKey: ProficiencyKey;
  proficiencyTableVersion: string;
  attribute: AttributeKey;
  amount: number;
};

export type ProficiencyAttributeResolutionInput = {
  classId: ClassId;
  totals: Partial<Record<ProficiencyKey, number>>;
  progressionTables: readonly ProficiencyProgressionTable[];
  rewards: readonly ProficiencyAttributeReward[];
};

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Recompensa de proficiência: ${label} inválido.`);
  }
}

function validateReward(reward: ProficiencyAttributeReward): void {
  if (!reward || typeof reward !== 'object') {
    throw new Error('Recompensa de proficiência: definição inválida.');
  }
  assertNonEmptyString(reward.id, 'ID');
  assertNonEmptyString(reward.version, 'versão');
  if (!Number.isSafeInteger(reward.unlockLevel) || reward.unlockLevel < 0) {
    throw new Error('Recompensa de proficiência: nível de desbloqueio inválido.');
  }
  if (typeof reward.enabled !== 'boolean') {
    throw new Error('Recompensa de proficiência: estado enabled inválido.');
  }
  if (!reward.scope || (reward.scope.type !== 'character' && reward.scope.type !== 'class')) {
    throw new Error('Recompensa de proficiência: escopo inválido.');
  }
  if (!reward.effect || reward.effect.type !== 'attribute_base') {
    throw new Error('Recompensa de proficiência: tipo de efeito não suportado.');
  }
  if (!Number.isFinite(reward.effect.amount)) {
    throw new Error('Recompensa de proficiência: contribuição de atributo inválida.');
  }
}

/**
 * Retorna contribuições desbloqueadas para a classe/contexto informado.
 *
 * Importante: as contribuições permanecem separadas. Esta função não soma,
 * multiplica, limita ou arredonda valores e não as injeta em PlayerAttributes.
 * A política de combinação precisa ser aprovada antes de existir um adaptador
 * que aplique esses valores ao cálculo real do personagem.
 */
export function resolveProficiencyAttributeContributions(
  input: ProficiencyAttributeResolutionInput,
): ProficiencyAttributeContribution[] {
  const tables = new Map<ProficiencyKey, ProficiencyProgressionTable>();
  for (const table of input.progressionTables) {
    validateProficiencyProgressionTable(table);
    if (tables.has(table.key)) {
      throw new Error(`Progressão de proficiência duplicada: ${table.key}.`);
    }
    tables.set(table.key, table);
  }

  const rewardIds = new Set<string>();
  const contributions: ProficiencyAttributeContribution[] = [];

  for (const reward of input.rewards) {
    validateReward(reward);
    if (rewardIds.has(reward.id)) {
      throw new Error(`ID de recompensa duplicado: ${reward.id}.`);
    }
    rewardIds.add(reward.id);

    if (!reward.enabled) continue;
    if (reward.scope.type === 'class' && reward.scope.classId !== input.classId) continue;
    if (ATTRIBUTE_USAGE[input.classId][reward.effect.attribute] <= 0) continue;

    const table = tables.get(reward.proficiencyKey);
    if (!table) continue;
    if (table.key !== reward.proficiencyKey) continue;

    const total = input.totals[reward.proficiencyKey] ?? 0;
    const progression = evaluateProficiencyProgression(total, table);
    if (progression.level < reward.unlockLevel) continue;

    contributions.push({
      rewardId: reward.id,
      rewardVersion: reward.version,
      proficiencyKey: reward.proficiencyKey,
      proficiencyTableVersion: progression.tableVersion,
      attribute: reward.effect.attribute,
      amount: reward.effect.amount,
    });
  }

  return contributions;
}
