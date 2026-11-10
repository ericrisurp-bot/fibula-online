export type MatchHistoryEntry = { days: number; kills: number; at: string };

const HISTORY_PREFIX = 'fibula-match-history-v1:';
const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function readMatchHistory(userId: string): MatchHistoryEntry[] {
  if (!userId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_PREFIX + userId);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): MatchHistoryEntry[] => {
      if (!item || typeof item !== 'object') return [];
      const entry = item as Record<string, unknown>;
      if (!isNonNegativeInteger(entry.days) || !isNonNegativeInteger(entry.kills)
        || typeof entry.at !== 'string' || !entry.at || !Number.isFinite(Date.parse(entry.at))) return [];
      return [{ days: entry.days, kills: entry.kills, at: entry.at }];
    }).slice(0, 10);
  } catch {
    return [];
  }
}

export function recordMatch(
  userId: string,
  match: MatchHistoryEntry,
): MatchHistoryEntry[] {
  if (!userId || !isNonNegativeInteger(match.days) || !isNonNegativeInteger(match.kills)
    || typeof match.at !== 'string' || !match.at || !Number.isFinite(Date.parse(match.at))) {
    return readMatchHistory(userId);
  }
  try {
    const history = [{ days: match.days, kills: match.kills, at: match.at }, ...readMatchHistory(userId)].slice(0, 10);
    window.localStorage.setItem(HISTORY_PREFIX + userId, JSON.stringify(history));
    return history;
  } catch {
    return readMatchHistory(userId);
  }
}
