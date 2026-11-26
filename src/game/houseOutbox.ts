export interface HouseItemStack {
  itemId: string;
  quantity: number;
}

export interface HouseDeltaEntry {
  itemId: string;
  quantity: number;
}

export interface PendingHouseBatch {
  opId: string;
  delta: HouseDeltaEntry[];
}

export interface PendingHouseMatch {
  version: 1;
  matchId: string;
  baseline: HouseItemStack[];
  batches: PendingHouseBatch[];
  confirmedOpIds: string[];
  updatedAt: number;
}

export interface HouseOutboxStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const MAX_ENTRY_QUANTITY = 999_999;
const DEFAULT_MAX_ENTRIES = 100;
const STORAGE_KEY_PREFIX = 'fibula-house-pending:';

function copyStack(stack: HouseItemStack): HouseItemStack {
  return { itemId: stack.itemId, quantity: stack.quantity };
}

/**
 * Calcula a diferença líquida por item. A ordem é a primeira aparição
 * no baseline, seguida pela primeira aparição em current.
 */
export function computeNetDelta(
  baseline: readonly HouseItemStack[],
  current: readonly HouseItemStack[],
): HouseDeltaEntry[] {
  const totals = new Map<string, number>();

  for (const item of baseline) {
    totals.set(item.itemId, (totals.get(item.itemId) ?? 0) - item.quantity);
  }
  for (const item of current) {
    totals.set(item.itemId, (totals.get(item.itemId) ?? 0) + item.quantity);
  }

  return Array.from(totals, ([itemId, quantity]) => ({ itemId, quantity }))
    .filter((entry) => entry.quantity !== 0);
}

/**
 * Divide entradas em lotes limitados por quantidade de registros e pelo
 * limite absoluto de quantidade aceito pela RPC.
 */
export function splitIntoBatches(
  delta: readonly HouseDeltaEntry[],
  maxEntries = DEFAULT_MAX_ENTRIES,
): HouseDeltaEntry[][] {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError('maxEntries deve ser um inteiro maior que zero.');
  }

  const batches: HouseDeltaEntry[][] = [];
  let batch: HouseDeltaEntry[] = [];

  const pushEntry = (entry: HouseDeltaEntry): void => {
    if (batch.length >= maxEntries) {
      batches.push(batch);
      batch = [];
    }
    batch.push(entry);
  };

  for (const entry of delta) {
    if (!Number.isSafeInteger(entry.quantity) || entry.quantity === 0) {
      throw new RangeError('A quantidade do delta deve ser um inteiro seguro diferente de zero.');
    }

    let remaining = entry.quantity;
    while (remaining !== 0) {
      const sign = remaining < 0 ? -1 : 1;
      const quantity = sign * Math.min(Math.abs(remaining), MAX_ENTRY_QUANTITY);
      pushEntry({ itemId: entry.itemId, quantity });
      remaining -= quantity;
    }
  }

  if (batch.length > 0) batches.push(batch);
  return batches;
}

function fnv1a32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Gera um UUID determinístico para (matchId, batchIndex).
 * O hash FNV-1a não é criptográfico; o identificador serve somente
 * para manter a idempotência local dos envios da mesma partida/lote.
 */
export function deriveOpId(matchId: string, batchIndex: number): string {
  const input = `${matchId}\u0000${batchIndex}`;
  const seeds = [0x811c9dc5, 0x12345678, 0x9e3779b9, 0xdeadbeef];
  const hex = seeds
    .map((seed) => fnv1a32(input, seed).toString(16).padStart(8, '0'))
    .join('')
    .split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

/** Cria um UUID para identificar uma partida, preferindo crypto.randomUUID. */
export function createMatchId(randomUUID?: () => string): string {
  if (randomUUID) return randomUUID();

  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }

  // Fallback não criptográfico para ambientes sem crypto.randomUUID.
  let seed = `${Date.now()}-${Math.random()}-${Math.random()}`;
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    seed = `${seed}${random}`;
    const value = character === 'x' ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

export function buildPendingMatch({
  matchId,
  baseline,
  current,
  now,
}: {
  matchId: string;
  baseline: readonly HouseItemStack[];
  current: readonly HouseItemStack[];
  now: number;
}): PendingHouseMatch {
  const batches = splitIntoBatches(computeNetDelta(baseline, current));
  return {
    version: 1,
    matchId,
    baseline: baseline.map(copyStack),
    batches: batches.map((delta, index) => ({
      opId: deriveOpId(matchId, index),
      delta: delta.map((entry) => ({ ...entry })),
    })),
    confirmedOpIds: [],
    updatedAt: now,
  };
}

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidStack(value: unknown): value is HouseItemStack {
  return isRecord(value)
    && typeof value.itemId === 'string'
    && value.itemId.length > 0
    && Number.isSafeInteger(value.quantity)
    && (value.quantity as number) > 0;
}

function isValidDeltaEntry(value: unknown): value is HouseDeltaEntry {
  return isRecord(value)
    && typeof value.itemId === 'string'
    && value.itemId.length > 0
    && Number.isSafeInteger(value.quantity)
    && (value.quantity as number) !== 0
    && Math.abs(value.quantity as number) <= MAX_ENTRY_QUANTITY;
}

function isValidPendingMatch(value: unknown): value is PendingHouseMatch {
  if (!isRecord(value)
    || value.version !== 1
    || typeof value.matchId !== 'string'
    || value.matchId.length === 0
    || !Array.isArray(value.baseline)
    || !value.baseline.every(isValidStack)
    || !Array.isArray(value.batches)
    || !Array.isArray(value.confirmedOpIds)
    || !value.confirmedOpIds.every((opId) => typeof opId === 'string')
    || typeof value.updatedAt !== 'number'
    || !Number.isFinite(value.updatedAt)) {
    return false;
  }

  return value.batches.every((batch) => isRecord(batch)
    && typeof batch.opId === 'string'
    && batch.opId.length > 0
    && Array.isArray(batch.delta)
    && batch.delta.length <= DEFAULT_MAX_ENTRIES
    && batch.delta.every(isValidDeltaEntry));
}

/** Persiste a partida pendente. Retorna false se o storage falhar. */
export function savePendingMatch(
  storage: HouseOutboxStorage,
  userId: string,
  pending: PendingHouseMatch,
): boolean {
  try {
    storage.setItem(storageKey(userId), JSON.stringify(pending));
    return true;
  } catch {
    return false;
  }
}

/** Carrega e valida a partida pendente; dados ausentes/corrompidos retornam null. */
export function loadPendingMatch(
  storage: HouseOutboxStorage,
  userId: string,
): PendingHouseMatch | null {
  try {
    const serialized = storage.getItem(storageKey(userId));
    if (!serialized) return null;
    const parsed: unknown = JSON.parse(serialized);
    if (!isValidPendingMatch(parsed)) return null;

    return {
      version: 1,
      matchId: parsed.matchId,
      baseline: parsed.baseline.map(copyStack),
      batches: parsed.batches.map((batch) => ({
        opId: batch.opId,
        delta: batch.delta.map((entry) => ({ ...entry })),
      })),
      confirmedOpIds: [...parsed.confirmedOpIds],
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

/** Remove a partida pendente. Retorna false se o storage falhar. */
export function clearPendingMatch(storage: HouseOutboxStorage, userId: string): boolean {
  try {
    storage.removeItem(storageKey(userId));
    return true;
  } catch {
    return false;
  }
}

export function markBatchConfirmed(
  pending: PendingHouseMatch,
  opId: string,
): PendingHouseMatch {
  if (pending.confirmedOpIds.includes(opId)) return pending;
  return {
    ...pending,
    baseline: pending.baseline.map(copyStack),
    batches: pending.batches.map((batch) => ({
      opId: batch.opId,
      delta: batch.delta.map((entry) => ({ ...entry })),
    })),
    confirmedOpIds: [...pending.confirmedOpIds, opId],
  };
}

export function getUnconfirmedBatches(
  pending: PendingHouseMatch,
): PendingHouseBatch[] {
  const confirmed = new Set(pending.confirmedOpIds);
  return pending.batches
    .filter((batch) => !confirmed.has(batch.opId))
    .map((batch) => ({
      opId: batch.opId,
      delta: batch.delta.map((entry) => ({ ...entry })),
    }));
}

export function isFullyConfirmed(pending: PendingHouseMatch): boolean {
  return pending.batches.every((batch) => pending.confirmedOpIds.includes(batch.opId));
}
