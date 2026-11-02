export const DUO_PROTOCOL_VERSION = 2 as const;
export const DUO_MAX_PLAYERS = 2 as const;

export type DuoRoomPhase = 'lobby' | 'starting' | 'playing' | 'finished' | 'cancelled';

export type DuoMessageEnvelope = {
  protocol: typeof DUO_PROTOCOL_VERSION;
  roomId: string;
  matchId: string;
  senderId: string;
  sequence: number;
  sentAt: number;
};

export type DuoPlayerDeathReason = 'defeated' | 'abandoned' | 'disconnected';

/**
 * One small event sent when this client's local horde has been cleared.
 * It contains no position, inventory, combat, enemy, or world snapshot data.
 */
export type DuoNightCompleteMessage = DuoMessageEnvelope & {
  type: 'night_complete';
  nightNumber: number;
  alive: true;
  hordeCleared: true;
};

/** A one-time event; the new pressure allocation takes effect next night. */
export type DuoPlayerDiedMessage = DuoMessageEnvelope & {
  type: 'player_died';
  nightNumber: number;
  reason: DuoPlayerDeathReason;
};

export type DuoRoomMessage = DuoNightCompleteMessage | DuoPlayerDiedMessage;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isPositiveSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && typeof value === 'number' && value > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Validates the minimal event envelope and payload before processing it. */
export function isDuoRoomMessage(value: unknown): value is DuoRoomMessage {
  if (!isRecord(value)
    || value.protocol !== DUO_PROTOCOL_VERSION
    || !isNonEmptyString(value.roomId)
    || !isNonEmptyString(value.matchId)
    || !isNonEmptyString(value.senderId)
    || !isPositiveSafeInteger(value.sequence)
    || !isFiniteNumber(value.sentAt)
    || !isPositiveSafeInteger(value.nightNumber)) return false;

  if (value.type === 'night_complete') {
    return value.alive === true && value.hordeCleared === true;
  }

  if (value.type === 'player_died') {
    return value.reason === 'defeated'
      || value.reason === 'abandoned'
      || value.reason === 'disconnected';
  }

  return false;
}

/** Rejects duplicate or out-of-order packets from one sender in one match. */
export function isNewerDuoSequence(sequence: number, previousSequence: number): boolean {
  return Number.isSafeInteger(sequence) && sequence > previousSequence;
}
