import { BALANCE_VERSION, type ClassId } from './config';

export type MatchStatsPlatform = 'android' | 'web' | 'other';
export type MatchStatsEndReason = 'death' | 'exit';

export type MatchStatsPayload = {
  class: ClassId;
  balanceVersion: string;
  endedBy: MatchStatsEndReason;
  nights: number;
  kills: number;
  platform: MatchStatsPlatform;
  matchLevel: number;
  armor: number;
  maxHp: number;
};

const VALID_CLASSES: readonly ClassId[] = ['guerreiro', 'mago', 'arqueiro', 'druida'];

export function isValidMatchStatsPayload(value: unknown): value is MatchStatsPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.class === 'string' && VALID_CLASSES.includes(payload.class as ClassId)
    && typeof payload.balanceVersion === 'string'
    && /^[a-z0-9._-]{1,40}$/.test(payload.balanceVersion)
    && (payload.endedBy === 'death' || payload.endedBy === 'exit')
    && Number.isSafeInteger(payload.nights) && (payload.nights as number) >= 0
    && Number.isSafeInteger(payload.kills) && (payload.kills as number) >= 0
    && (payload.platform === 'android' || payload.platform === 'web' || payload.platform === 'other')
    && Number.isSafeInteger(payload.matchLevel) && (payload.matchLevel as number) >= 0
    && Number.isSafeInteger(payload.armor) && (payload.armor as number) >= 0
    && Number.isSafeInteger(payload.maxHp) && (payload.maxHp as number) >= 0
    && JSON.stringify(value).length < 2000;
}

export function buildMatchStatsPayload(input: {
  classId: ClassId;
  endedBy: MatchStatsEndReason;
  nights: number;
  kills: number;
  platform: MatchStatsPlatform;
  matchLevel: number;
  armor: number;
  maxHp: number;
}): MatchStatsPayload | null {
  if (!VALID_CLASSES.includes(input.classId)
    || !Number.isFinite(input.nights) || input.nights < 0
    || !Number.isFinite(input.kills) || input.kills < 0
    || !Number.isFinite(input.matchLevel) || input.matchLevel < 0
    || !Number.isFinite(input.armor) || input.armor < 0
    || !Number.isFinite(input.maxHp) || input.maxHp < 0) return null;

  const payload: MatchStatsPayload = {
    class: input.classId,
    balanceVersion: BALANCE_VERSION,
    endedBy: input.endedBy,
    nights: Math.trunc(input.nights),
    kills: Math.trunc(input.kills),
    platform: input.platform,
    matchLevel: Math.trunc(input.matchLevel),
    armor: Math.round(input.armor),
    maxHp: Math.round(input.maxHp),
  };
  return isValidMatchStatsPayload(payload) ? payload : null;
}
