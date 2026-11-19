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
  source: 'proficiency';
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

const PROFICIENCY_KEYS = new Set<ProficiencyKey>([
  'espada', 'arco', 'cajado', 'bastao_natureza', 'golpes_recebidos',
  'machado_madeira', 'picareta', 'faca_esfolar', 'vara_pesca', 'foice_mao',
  'carroca_distancia',
]);
const ATTRIBUTE_KEYS = new Set<string>(Object.keys(ATTRIBUTE_USAGE.guerreiro));
const CLASS_IDS = new Set<string>(Object.keys(ATTRIBUTE_USAGE));

function isValidReward(reward: unknown): reward is ProficiencyAttributeReward {
  if (!reward || typeof reward !== 'object') return false;
  const candidate = reward as Partial<ProficiencyAttributeReward>;
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) return false;
  if (typeof candidate.version !== 'string' || !candidate.version.trim()) return false;
  if (typeof candidate.proficiencyKey !== 'string' || !PROFICIENCY_KEYS.has(candidate.proficiencyKey as ProficiencyKey)) return false;
  if (!Number.isSafeInteger(candidate.unlockLevel) || (candidate.unlockLevel ?? -1) < 0) return false;
  if (typeof candidate.enabled !== 'boolean') return false;
  if (!candidate.scope || typeof candidate.scope !== 'object') return false;
  if (candidate.scope.type === 'class') {
    if (!CLASS_IDS.has(String(candidate.scope.classId))) return false;
  } else if (candidate.scope.type !== 'character') {
    return false;
  }
  if (!candidate.effect || typeof candidate.effect !== 'object' || candidate.effect.type !== 'attribute_base') return false;
  if (typeof candidate.effect.attribute !== 'string' || !ATTRIBUTE_KEYS.has(candidate.effect.attribute)) return false;
  const amount = candidate.effect.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) return false;
  return true;
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
  if (!input || !CLASS_IDS.has(String(input.classId))) return [];

  const progressionTables = Array.isArray(input.progressionTables) ? input.progressionTables : [];
  const rewards = Array.isArray(input.rewards) ? input.rewards : [];
  const tables = new Map<ProficiencyKey, ProficiencyProgressionTable>();
  const seenTableKeys = new Set<ProficiencyKey>();
  const invalidTableKeys = new Set<ProficiencyKey>();
  for (const candidate of progressionTables) {
    const table = candidate as ProficiencyProgressionTable | null;
    if (!table || typeof table.key !== 'string' || !PROFICIENCY_KEYS.has(table.key)) continue;
    const key = table.key;
    if (seenTableKeys.has(key)) {
      tables.delete(key);
      invalidTableKeys.add(key);
      continue;
    }
    seenTableKeys.add(key);
    try {
      validateProficiencyProgressionTable(table);
      tables.set(key, table);
    } catch {
      invalidTableKeys.add(key);
    }
  }

  const idCounts = new Map<string, number>();
  for (const candidate of rewards) {
    if (!candidate || typeof candidate !== 'object') continue;
    const id = (candidate as { id?: unknown }).id;
    if (typeof id === 'string' && id.trim()) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }

  const progressionCache = new Map<ProficiencyKey, ReturnType<typeof evaluateProficiencyProgression> | null>();
  const contributions: ProficiencyAttributeContribution[] = [];

  for (const candidate of input.rewards ?? []) {
    if (!isValidReward(candidate)) continue;
    if (idCounts.get(candidate.id) !== 1) continue;
    if (!candidate.enabled) continue;
    if (candidate.scope.type === 'class' && candidate.scope.classId !== input.classId) continue;
    if (ATTRIBUTE_USAGE[input.classId][candidate.effect.attribute] <= 0) continue;

    const key = candidate.proficiencyKey;
    if (invalidTableKeys.has(key)) continue;
    const table = tables.get(key);
    if (!table || candidate.unlockLevel < table.initialLevel || candidate.unlockLevel > table.maxLevel) continue;

    let progression = progressionCache.get(key);
    if (!progressionCache.has(key)) {
      const total = input.totals?.[key] ?? 0;
      try {
        progression = evaluateProficiencyProgression(total, table);
      } catch {
        progression = null;
      }
      progressionCache.set(key, progression);
    }
    if (!progression || progression.level < candidate.unlockLevel) continue;

    contributions.push({
      source: 'proficiency',
      rewardId: candidate.id,
      rewardVersion: candidate.version,
      proficiencyKey: key,
      proficiencyTableVersion: progression.tableVersion,
      attribute: candidate.effect.attribute,
      amount: candidate.effect.amount,
    });
  }

  return contributions;
}
