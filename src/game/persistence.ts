import type { SupabaseClient } from '@supabase/supabase-js';

export type PersistedHouseStack = { itemId: string; quantity: number };
export type SoloMatchResult = {
  kills: number;
  survivalNights: number;
};

export const SOLO_MATCH_RULESET_VERSION = 'solo-v1';

const HOUSE_STORAGE_KEY = 'fibula-house-storage';
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

export async function loadHouseInventory(
  client: SupabaseClient,
  userId: string,
): Promise<{ inventory: PersistedHouseStack[]; source: 'cloud' | 'local' }> {
  try {
    // A sessão e o perfil são provisionados pela RPC segura ao iniciar a partida.
    // Não tente inserir o perfil durante a leitura do baú: o cliente não tem escrita
    // de progressão e essa tentativa fazia a leitura do armazenamento cair no fallback local.
    if (window.localStorage.getItem(HOUSE_STORAGE_DIRTY_KEY) === '1') {
      return { inventory: readLocalHouseInventory(), source: 'local' };
    }
    const { data, error } = await client
      .from('fibula_house_storage')
      .select('inventory')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const inventory = normalizeHouseInventory(data.inventory);
      try { window.localStorage.setItem(HOUSE_STORAGE_KEY, JSON.stringify(inventory)); } catch { /* Cache local indisponível. */ }
      return { inventory, source: 'cloud' };
    }
  } catch {
    // A partida solo continua usando o último estado local quando a internet/banco não responde.
    return { inventory: readLocalHouseInventory(), source: 'local' };
  }
  return { inventory: readLocalHouseInventory(), source: 'local' };
}

export async function syncHouseInventory(
  client: SupabaseClient,
  userId: string,
  inventory: PersistedHouseStack[],
): Promise<boolean> {
  const safeInventory = normalizeHouseInventory(inventory);
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    try { window.localStorage.setItem(HOUSE_STORAGE_DIRTY_KEY, '1'); } catch { /* Cache indisponível. */ }
    return false;
  }
  try {
    const { error } = await client.from('fibula_house_storage').upsert({
      user_id: userId,
      inventory: safeInventory,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) {
      window.localStorage.setItem(HOUSE_STORAGE_DIRTY_KEY, '1');
      return false;
    }
    window.localStorage.removeItem(HOUSE_STORAGE_DIRTY_KEY);
    return true;
  } catch {
    try { window.localStorage.setItem(HOUSE_STORAGE_DIRTY_KEY, '1'); } catch { /* Cache indisponível. */ }
    return false;
  }
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
