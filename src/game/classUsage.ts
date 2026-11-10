import type { ClassId } from './config';

export type ClassUsageStats = { seconds: number; damage: number; kills: number };
export type MatchClassUsage = Record<ClassId, ClassUsageStats>;
export type ClassUsageRecord = { total: MatchClassUsage; last: MatchClassUsage | null };

const STORAGE_PREFIX = 'fibula-class-usage-v1:';
const CLASS_IDS: ClassId[] = ['guerreiro', 'mago', 'arqueiro', 'druida'];
const MAX_SAFE_VALUE = Number.MAX_SAFE_INTEGER;

function emptyUsage(): MatchClassUsage {
  return {
    guerreiro: { seconds: 0, damage: 0, kills: 0 },
    mago: { seconds: 0, damage: 0, kills: 0 },
    arqueiro: { seconds: 0, damage: 0, kills: 0 },
    druida: { seconds: 0, damage: 0, kills: 0 },
  };
}

function safeMetric(value: unknown, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_SAFE_VALUE) return 0;
  if (integer && !Number.isSafeInteger(value)) return 0;
  return value;
}

function sanitizeUsage(value: unknown): MatchClassUsage {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const clean = emptyUsage();
  for (const classId of CLASS_IDS) {
    const raw = source[classId];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const stats = raw as Record<string, unknown>;
    clean[classId] = {
      seconds: safeMetric(stats.seconds),
      damage: safeMetric(stats.damage),
      kills: safeMetric(stats.kills, true),
    };
  }
  return clean;
}

function sanitizeRecord(value: unknown): ClassUsageRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { total: emptyUsage(), last: null };
  }
  const record = value as Record<string, unknown>;
  return {
    total: sanitizeUsage(record.total),
    last: record.last === null || record.last === undefined ? null : sanitizeUsage(record.last),
  };
}

function safeSum(left: number, right: number, integer = false): number {
  const sum = left + right;
  if (!Number.isFinite(sum) || sum > MAX_SAFE_VALUE) return MAX_SAFE_VALUE;
  return integer ? Math.floor(sum) : sum;
}

export function readClassUsage(userId: string): ClassUsageRecord {
  const empty = { total: emptyUsage(), last: null };
  if (!userId || typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + userId);
    if (!raw) return empty;
    return sanitizeRecord(JSON.parse(raw));
  } catch {
    return empty;
  }
}

export function recordClassUsage(userId: string, matchUsage: MatchClassUsage): ClassUsageRecord {
  const previous = readClassUsage(userId);
  const match = sanitizeUsage(matchUsage);
  const next: ClassUsageRecord = {
    total: emptyUsage(),
    last: match,
  };
  for (const classId of CLASS_IDS) {
    next.total[classId] = {
      seconds: safeSum(previous.total[classId].seconds, match[classId].seconds),
      damage: safeSum(previous.total[classId].damage, match[classId].damage),
      kills: safeSum(previous.total[classId].kills, match[classId].kills, true),
    };
  }
  if (!userId || typeof window === 'undefined') return previous;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(next));
    return next;
  } catch {
    return previous;
  }
}
