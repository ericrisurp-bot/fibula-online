import type { SupabaseClient } from '@supabase/supabase-js';

export type PersistedHouseStack = { itemId: string; quantity: number };
export type SoloMatchSummary = {
  matchId: string;
  kills: number;
  survivalNights: number;
};

const HOUSE_STORAGE_KEY = 'fibula-house-storage';
const HOUSE_STORAGE_DIRTY_KEY = 'fibula-house-storage-dirty';
const PENDING_MATCHES_KEY = 'fibula-pending-solo-matches';

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
    await client.from('fibula_profiles').upsert(
      { user_id: userId },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
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

function readPendingMatches(): SoloMatchSummary[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(PENDING_MATCHES_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is SoloMatchSummary =>
      !!item && typeof item.matchId === 'string'
      && Number.isSafeInteger(item.kills) && item.kills >= 0
      && Number.isSafeInteger(item.survivalNights) && item.survivalNights >= 0,
    );
  } catch {
    return [];
  }
}

export function queueSoloMatchSummary(summary: SoloMatchSummary): void {
  if (typeof window === 'undefined') return;
  const pending = readPendingMatches();
  if (pending.some(item => item.matchId === summary.matchId)) return;
  try {
    window.localStorage.setItem(PENDING_MATCHES_KEY, JSON.stringify([...pending, summary]));
  } catch {
    // Sem armazenamento local, a próxima sincronização ainda pode ocorrer nesta sessão.
  }
}

export async function flushPendingSoloMatchSummaries(
  client: SupabaseClient,
): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return;
  const pending = readPendingMatches();
  const remaining: SoloMatchSummary[] = [];
  for (const summary of pending) {
    try {
      const { error } = await client.rpc('fibula_sync_solo_match', {
        p_match_id: summary.matchId,
        p_kills: summary.kills,
        p_survival_nights: summary.survivalNights,
      });
      if (error) remaining.push(summary);
    } catch {
      remaining.push(summary);
    }
  }
  try { window.localStorage.setItem(PENDING_MATCHES_KEY, JSON.stringify(remaining)); } catch { /* Fila local indisponível. */ }
}
