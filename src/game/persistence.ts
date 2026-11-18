import type { SupabaseClient } from '@supabase/supabase-js';

export type PersistedHouseStack = { itemId: string; quantity: number };
export type SoloMatchResult = {
  kills: number;
  survivalNights: number;
};

export const SOLO_MATCH_RULESET_VERSION = 'solo-v1';

const HOUSE_STORAGE_KEY = 'fibula-house-storage';
const HOUSE_STORAGE_CONFIRMED_KEY = 'fibula-house-storage-confirmed';
const HOUSE_STORAGE_DIRTY_KEY = 'fibula-house-storage-dirty';

function normalizeHouseInventory(value: unknown): PersistedHouseStack[] {
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, number>();
  for (const item of value) {
    if (!item || typeof item.itemId !== 'string' || !item.itemId.trim()
      || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) continue;
    merged.set(item.itemId, (merged.get(item.itemId) ?? 0) + item.quantity);
  }
  return Array.from(merged, ([itemId, quantity]) => ({ itemId, quantity })).slice(0, 50);
}

export type HouseDeltaEntry = { itemId: string; quantity: number };
export type HouseOutboxOperation = { opId: string; delta: HouseDeltaEntry[] };
export type HouseDeltaApplyResult =
  | { kind: 'ok'; inventory: PersistedHouseStack[]; applied: boolean; overflow: HouseDeltaEntry[]; shortfall: HouseDeltaEntry[] }
  | { kind: 'rejected'; message: string }
  | { kind: 'network' };

const HOUSE_OUTBOX_KEY = 'fibula-house-outbox';

function normalizeHouseDelta(value: unknown): HouseDeltaEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): HouseDeltaEntry[] => {
    if (!entry || typeof entry.itemId !== 'string' || entry.itemId.length < 1 || entry.itemId.length > 1000
      || !Number.isSafeInteger(entry.quantity) || entry.quantity === 0 || Math.abs(entry.quantity) > 999999) return [];
    return [{ itemId: entry.itemId, quantity: entry.quantity }];
  });
}

export function computeHouseDelta(before: unknown, after: unknown): HouseDeltaEntry[] {
  const beforeInventory = normalizeHouseInventory(before);
  const afterInventory = normalizeHouseInventory(after);
  const beforeByItem = new Map<string, number>(beforeInventory.map(item => [item.itemId, item.quantity] as const));
  const afterByItem = new Map<string, number>(afterInventory.map(item => [item.itemId, item.quantity] as const));
  const itemIds = new Set([...beforeByItem.keys(), ...afterByItem.keys()]);
  const delta: HouseDeltaEntry[] = [];
  for (const itemId of itemIds) {
    let remaining = (afterByItem.get(itemId) ?? 0) - (beforeByItem.get(itemId) ?? 0);
    while (remaining !== 0) {
      const quantity = Math.sign(remaining) * Math.min(Math.abs(remaining), 999999);
      delta.push({ itemId, quantity });
      remaining -= quantity;
    }
  }
  return delta;
}

export function readHouseOutbox(): HouseOutboxOperation[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(HOUSE_OUTBOX_KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.flatMap((entry): HouseOutboxOperation[] => {
      if (!entry || typeof entry.opId !== 'string' || !entry.opId) return [];
      const delta = normalizeHouseDelta(entry.delta);
      return delta.length > 0 && delta.length <= 100 ? [{ opId: entry.opId, delta }] : [];
    });
  } catch {
    return [];
  }
}

export function addHouseOutboxOperation(delta: HouseDeltaEntry[]): HouseOutboxOperation | null {
  if (typeof window === 'undefined' || delta.length < 1 || delta.length > 100
    || delta.some(entry => !entry || typeof entry.itemId !== 'string' || entry.itemId.length < 1
      || entry.itemId.length > 1000 || !Number.isSafeInteger(entry.quantity)
      || entry.quantity === 0 || Math.abs(entry.quantity) > 999999)) return null;
  try {
    const operation: HouseOutboxOperation = { opId: window.crypto.randomUUID(), delta: delta.map(entry => ({ ...entry })) };
    const outbox = readHouseOutbox();
    outbox.push(operation);
    window.localStorage.setItem(HOUSE_OUTBOX_KEY, JSON.stringify(outbox));
    return operation;
  } catch {
    return null;
  }
}

export function removeHouseOutboxOperation(opId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const outbox = readHouseOutbox().filter(operation => operation.opId !== opId);
    window.localStorage.setItem(HOUSE_OUTBOX_KEY, JSON.stringify(outbox));
  } catch {
    // A operação permanece na fila se o armazenamento local estiver indisponível.
  }
}

export async function applyHouseDelta(
  client: SupabaseClient,
  opId: string,
  delta: HouseDeltaEntry[],
): Promise<HouseDeltaApplyResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { kind: 'network' };
  try {
    const { data, error } = await client.rpc('fibula_house_apply_delta', {
      p_op_id: opId,
      p_delta: delta,
    });
    if (error) {
      return typeof error.code === 'string' && error.code.length > 0
        ? { kind: 'rejected', message: error.message || 'O servidor recusou a alteração do Baú.' }
        : { kind: 'network' };
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { kind: 'network' };
    const result = data as Record<string, unknown>;
    if (typeof result.applied !== 'boolean' || !Array.isArray(result.inventory)) return { kind: 'network' };
    return {
      kind: 'ok',
      inventory: normalizeHouseInventory(result.inventory),
      applied: result.applied,
      overflow: normalizeHouseDelta(result.overflow),
      shortfall: normalizeHouseDelta(result.shortfall),
    };
  } catch {
    return { kind: 'network' };
  }
}


export function readLocalHouseInventory(): PersistedHouseStack[] {
  if (typeof window === 'undefined') return [];
  try {
    return normalizeHouseInventory(JSON.parse(window.localStorage.getItem(HOUSE_STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function readConfirmedHouseInventory(): PersistedHouseStack[] {
  if (typeof window === 'undefined') return [];
  try {
    const confirmed = window.localStorage.getItem(HOUSE_STORAGE_CONFIRMED_KEY);
    if (confirmed !== null) return normalizeHouseInventory(JSON.parse(confirmed));
    // Compatibilidade: versões anteriores usavam o cache local como último
    // estado confirmado e marcavam explicitamente quando havia escrita pendente.
    return window.localStorage.getItem(HOUSE_STORAGE_DIRTY_KEY) === '1'
      ? []
      : readLocalHouseInventory();
  } catch {
    return [];
  }
}

export async function loadHouseInventory(
  client: SupabaseClient,
  userId: string,
): Promise<{ inventory: PersistedHouseStack[]; source: 'cloud' | 'local' }> {
  try {
    // A sessão e o perfil são provisionados pela RPC segura ao iniciar a partida.
    // Não tente inserir o perfil durante a leitura do baú: o cliente não tem escrita
    // de progressão e essa tentativa fazia a leitura do armazenamento cair no fallback local.
    const { data, error } = await client
      .from('fibula_house_storage')
      .select('inventory')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const inventory = normalizeHouseInventory(data.inventory);
      try {
        const serialized = JSON.stringify(inventory);
        window.localStorage.setItem(HOUSE_STORAGE_KEY, serialized);
        window.localStorage.setItem(HOUSE_STORAGE_CONFIRMED_KEY, serialized);
        window.localStorage.removeItem(HOUSE_STORAGE_DIRTY_KEY);
      } catch { /* Cache local indisponível. */ }
      return { inventory, source: 'cloud' };
    }
  } catch {
    // A partida solo continua usando o estado local quando a internet/banco não responde.
    return { inventory: readLocalHouseInventory(), source: 'local' };
  }
  if (window.localStorage.getItem(HOUSE_STORAGE_DIRTY_KEY) === '1') {
    try {
      window.localStorage.setItem(HOUSE_STORAGE_KEY, '[]');
      window.localStorage.setItem(HOUSE_STORAGE_CONFIRMED_KEY, '[]');
      window.localStorage.removeItem(HOUSE_STORAGE_DIRTY_KEY);
    } catch { /* Cache local indisponível. */ }
    return { inventory: [], source: 'cloud' };
  }
  return { inventory: readLocalHouseInventory(), source: 'local' };
}

export async function syncHouseInventory(
  client: SupabaseClient,
  userId: string,
  inventory: PersistedHouseStack[],
  options: { allowEmpty?: boolean } = {},
): Promise<boolean> {
  const safeInventory = normalizeHouseInventory(inventory);
  if (safeInventory.length === 0 && options.allowEmpty !== true) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    try { window.localStorage.setItem(HOUSE_STORAGE_DIRTY_KEY, '1'); } catch { /* Cache indisponível. */ }
    return false;
  }
  let error: { message: string } | null;
  try {
    const result = await client.from('fibula_house_storage').upsert({
      user_id: userId,
      inventory: safeInventory,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    error = result.error;
  } catch {
    try { window.localStorage.setItem(HOUSE_STORAGE_DIRTY_KEY, '1'); } catch { /* Cache indisponível. */ }
    return false;
  }
  if (error) {
    try { window.localStorage.setItem(HOUSE_STORAGE_DIRTY_KEY, '1'); } catch { /* Cache indisponível. */ }
    return false;
  }

  // A gravação remota já foi confirmada. Falha no cache local não deve
  // reclassificar uma gravação concluída como pendente.
  try {
    window.localStorage.setItem(HOUSE_STORAGE_CONFIRMED_KEY, JSON.stringify(safeInventory));
    window.localStorage.removeItem(HOUSE_STORAGE_DIRTY_KEY);
  } catch { /* O snapshot confirmado também fica protegido em memória no App. */ }
  return true;
}

export async function loadCloudHouseInventory(
  client: SupabaseClient,
  userId: string,
): Promise<PersistedHouseStack[]> {
  const { data, error } = await client
    .from('fibula_house_storage')
    .select('inventory')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const inventory = window.localStorage.getItem(HOUSE_STORAGE_DIRTY_KEY) === '1'
      ? []
      : readLocalHouseInventory();
    if (inventory.length > 0) {
      throw new Error('Seu baú ainda não foi sincronizado com o servidor. Entre no jogo e aguarde a sincronização.');
    }
    try {
      window.localStorage.setItem(HOUSE_STORAGE_KEY, '[]');
      window.localStorage.setItem(HOUSE_STORAGE_CONFIRMED_KEY, '[]');
      window.localStorage.removeItem(HOUSE_STORAGE_DIRTY_KEY);
    } catch { /* Cache local indisponível. */ }
    return [];
  }
  const inventory = normalizeHouseInventory(data.inventory);
  try {
    const serialized = JSON.stringify(inventory);
    window.localStorage.setItem(HOUSE_STORAGE_KEY, serialized);
    window.localStorage.setItem(HOUSE_STORAGE_CONFIRMED_KEY, serialized);
    window.localStorage.removeItem(HOUSE_STORAGE_DIRTY_KEY);
  } catch { /* Cache local indisponível. */ }
  return inventory;
}

export async function transferHouseStackToDuo(
  client: SupabaseClient,
  roomId: string,
  itemId: string,
  quantity: number,
): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('É necessário estar conectado para enviar itens pelo lobby.');
  }
  if (!roomId || !itemId || !Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error('Selecione um item e uma quantidade válida.');
  }
  const { data, error } = await client.rpc('fibula_duo_house_transfer', {
    p_room_id: roomId,
    p_item_id: itemId,
    p_quantity: quantity,
  });
  if (error) throw error;
  if (data !== true) throw new Error('O servidor não confirmou a transferência do item.');
}

export async function startSoloMatchSession(client: SupabaseClient): Promise<string> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('É necessário estar conectado para iniciar uma partida validada.');
  }
  const { data, error } = await client.rpc('fibula_start_solo_match');
  if (error) throw error;
  if (typeof data !== 'string' || !data) {
    throw new Error('O servidor não confirmou o início da partida.');
  }
  return data;
}

export async function abandonSoloMatchSession(
  client: SupabaseClient,
  sessionId: string,
): Promise<'accepted' | 'duplicate' | 'rejected'> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Sem conexão: o servidor não confirmou o abandono da partida.');
  }
  const { data, error } = await client.rpc('fibula_abandon_solo_match', {
    p_session_id: sessionId,
  });
  if (error) throw new Error(error.message || 'Não foi possível confirmar o abandono da partida.');
  if (data !== 'accepted' && data !== 'duplicate' && data !== 'rejected') {
    throw new Error('O servidor retornou uma resposta inválida para o abandono da partida.');
  }
  return data;
}

export async function finishSoloMatchSession(
  client: SupabaseClient,
  sessionId: string,
  result: SoloMatchResult,
): Promise<'accepted' | 'duplicate' | 'rejected'> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Sem conexão no encerramento; o resultado não foi validado nem salvo.');
  }
  const { data, error } = await client.rpc('fibula_finish_solo_match', {
    p_session_id: sessionId,
    p_kills: result.kills,
    p_survival_nights: result.survivalNights,
    p_ruleset_version: SOLO_MATCH_RULESET_VERSION,
  });
  if (error) throw error;
  if (data !== 'accepted' && data !== 'duplicate' && data !== 'rejected') {
    throw new Error('O servidor retornou uma resposta inválida para a partida.');
  }
  return data;
}


type SoloMatchResultOutboxEntry = {
  userId: string;
  sessionId: string;
  kills: number;
  survivalNights: number;
  createdAt: string;
};

const SOLO_MATCH_RESULT_OUTBOX_KEY = 'fibula-solo-match-result-outbox';

function isValidSoloMatchResultOutboxEntry(value: unknown): value is SoloMatchResultOutboxEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.userId === 'string' && entry.userId.length > 0
    && typeof entry.sessionId === 'string' && entry.sessionId.length > 0
    && Number.isSafeInteger(entry.kills) && (entry.kills as number) >= 0
    && Number.isSafeInteger(entry.survivalNights) && (entry.survivalNights as number) >= 0
    && typeof entry.createdAt === 'string' && Number.isFinite(Date.parse(entry.createdAt));
}

export function readSoloMatchResultOutbox(): SoloMatchResultOutboxEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(SOLO_MATCH_RESULT_OUTBOX_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter(isValidSoloMatchResultOutboxEntry) : [];
  } catch {
    return [];
  }
}

export function enqueueSoloMatchResult(
  userId: string,
  sessionId: string,
  result: SoloMatchResult,
  deathConfirmed: boolean,
): boolean {
  if (deathConfirmed !== true || typeof window === 'undefined' || !userId || !sessionId
    || !Number.isSafeInteger(result.kills) || result.kills < 0
    || !Number.isSafeInteger(result.survivalNights) || result.survivalNights < 0) return false;
  try {
    const outbox = readSoloMatchResultOutbox();
    const existing = outbox.find(entry => entry.userId === userId && entry.sessionId === sessionId);
    if (existing) {
      return existing.kills === result.kills && existing.survivalNights === result.survivalNights;
    }
    outbox.push({
      userId,
      sessionId,
      kills: result.kills,
      survivalNights: result.survivalNights,
      createdAt: new Date().toISOString(),
    });
    window.localStorage.setItem(SOLO_MATCH_RESULT_OUTBOX_KEY, JSON.stringify(outbox));
    return true;
  } catch {
    return false;
  }
}

export async function flushSoloMatchResultOutbox(
  client: SupabaseClient,
  userId: string,
): Promise<{ accepted: number; duplicate: number; rejected: number; pending: number }> {
  let accepted = 0;
  let duplicate = 0;
  let rejected = 0;
  const pending = readSoloMatchResultOutbox().filter(entry => entry.userId === userId);
  for (const entry of pending) {
    try {
      const result = await finishSoloMatchSession(client, entry.sessionId, {
        kills: entry.kills,
        survivalNights: entry.survivalNights,
      });
      if (result === 'accepted') accepted += 1;
      else if (result === 'duplicate') duplicate += 1;
      else rejected += 1;
      removeSoloMatchResultOutboxEntry(userId, entry.sessionId);
    } catch {
      // Falhas de rede ou respostas inesperadas mantêm o resultado para nova tentativa.
      break;
    }
  }
  return {
    accepted,
    duplicate,
    rejected,
    pending: readSoloMatchResultOutbox().filter(entry => entry.userId === userId).length,
  };
}

function removeSoloMatchResultOutboxEntry(userId: string, sessionId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const outbox = readSoloMatchResultOutbox().filter(entry =>
      entry.userId !== userId || entry.sessionId !== sessionId,
    );
    window.localStorage.setItem(SOLO_MATCH_RESULT_OUTBOX_KEY, JSON.stringify(outbox));
  } catch {
    // Se a confirmação não puder ser removida localmente, o retry será idempotente.
  }
}

export type PdLoadout = {
  primaryClass: string | null;
  secondaryClass: string | null;
  weapons: object;
  armors: object;
};

export async function savePdLoadout(client: SupabaseClient, loadout: PdLoadout): Promise<boolean> {
  try {
    const { data, error } = await client.rpc('fibula_save_pd_loadout', {
      p_primary_class: loadout.primaryClass,
      p_secondary_class: loadout.secondaryClass,
      p_weapons: loadout.weapons,
      p_armors: loadout.armors,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function reportHighestPd(client: SupabaseClient): Promise<number | null> {
  try {
    const { data, error } = await client.rpc('fibula_report_pd');
    if (error || typeof data !== 'number' || !Number.isSafeInteger(data)) return null;
    return data;
  } catch {
    return null;
  }
}
