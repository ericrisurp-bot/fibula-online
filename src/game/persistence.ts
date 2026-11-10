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


export async function reportHighestPd(client: SupabaseClient, pd: number): Promise<number | null> {
  if (!Number.isSafeInteger(pd) || pd <= 0 || pd > 3000) return null;
  try {
    const { data, error } = await client.rpc('fibula_report_pd', { p_pd: pd });
    if (error || typeof data !== 'number' || !Number.isSafeInteger(data)) return null;
    return data;
  } catch {
    return null;
  }
}
