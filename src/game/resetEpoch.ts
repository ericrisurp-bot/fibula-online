import type { SupabaseClient } from '@supabase/supabase-js';
import { clearProficiencyStorage } from './proficiencyStorage';
import { discardPendingProficiencyBuffer } from './proficiencyBuffer';

export const RESET_EPOCH_STORAGE_PREFIX = 'fibula-reset-epoch:';

export const RESET_EPOCH_PRESERVED_LOCAL_STORAGE_KEYS = [
  'fibula-arena-oauth-session',
  'fibula-arena-oauth-state',
  'fibula-arena-oauth-verifier',
  'fibula-audio-volume',
  'fibula-audio-muted',
  'fibula-interface-scale',
  'fibula-game-zoom',
  'fibula-adventurer-guide-enabled',
] as const;

export const RESET_EPOCH_PRESERVED_LOCAL_STORAGE_PREFIXES = [
  RESET_EPOCH_STORAGE_PREFIX,
] as const;

export const RESET_EPOCH_LOCAL_STORAGE_PREFIX = 'fibula-';

export async function fetchResetEpoch(client: SupabaseClient): Promise<number | undefined> {
  try {
    const { data, error } = await client.rpc('fibula_get_reset_epoch');
    if (error || !Number.isSafeInteger(data) || (data as number) < 0) return undefined;
    return data as number;
  } catch {
    return undefined;
  }
}

export function readLocalResetEpoch(userId: string): number | undefined {
  if (!userId.trim()) return undefined;
  try {
    const value = window.localStorage.getItem(`${RESET_EPOCH_STORAGE_PREFIX}${userId}`);
    if (value === null) return undefined;
    const epoch = Number(value);
    return Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : undefined;
  } catch {
    return undefined;
  }
}

export function writeLocalResetEpoch(userId: string, epoch: number): void {
  if (!userId.trim() || !Number.isSafeInteger(epoch) || epoch < 0) return;
  try {
    window.localStorage.setItem(`${RESET_EPOCH_STORAGE_PREFIX}${userId}`, String(epoch));
  } catch {
    // A próxima abertura tentará novamente se o marcador não puder ser gravado.
  }
}

function isPreservedResetEpochKey(key: string): boolean {
  return RESET_EPOCH_PRESERVED_LOCAL_STORAGE_KEYS.includes(
    key as (typeof RESET_EPOCH_PRESERVED_LOCAL_STORAGE_KEYS)[number],
  ) || RESET_EPOCH_PRESERVED_LOCAL_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix));
}

/** Remove progresso local, preservando sessão Arena, preferências do aparelho e épocas. */
export async function clearLocalGameProgress(): Promise<void> {
  let storageFailure: unknown;
  try {
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(RESET_EPOCH_LOCAL_STORAGE_PREFIX) && !isPreservedResetEpochKey(key)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      try {
        storage.removeItem(key);
      } catch (error) {
        storageFailure ??= error;
      }
    }
  } catch (error) {
    storageFailure ??= error;
  }

  await discardPendingProficiencyBuffer();
  await clearProficiencyStorage();
  if (storageFailure) {
    throw new Error('Não foi possível limpar todas as chaves locais de progresso.', { cause: storageFailure });
  }
}
