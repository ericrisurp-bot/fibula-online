import type { ClassId } from './config';
import type { GameSnapshot } from './engine';

export const DUO_PROTOCOL_VERSION = 1 as const;
export const DUO_MAX_PLAYERS = 2 as const;

export type DuoRoomPhase = 'lobby' | 'starting' | 'playing' | 'finished';

export type DuoParticipant = {
  userId: string;
  displayName: string;
  classId: ClassId;
  ready: boolean;
};

export type DuoRoomDescriptor = {
  roomId: string;
  hostId: string;
  phase: DuoRoomPhase;
  participants: DuoParticipant[];
};

export type DuoPlayerState = {
  userId: string;
  displayName: string;
  classId: ClassId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  nextXp: number;
  facingX: number;
  facingY: number;
  moving: boolean;
  dead: boolean;
};

export type DuoPlayerInput = {
  moveX: number;
  moveY: number;
  heldKeys: string[];
};

export type DuoWorldSnapshot = Omit<GameSnapshot, 'player'> & {
  players: DuoPlayerState[];
};

export type DuoMessageEnvelope = {
  protocol: typeof DUO_PROTOCOL_VERSION;
  roomId: string;
  matchId: string;
  senderId: string;
  sequence: number;
  sentAt: number;
};

export type DuoRoomMessage =
  | (DuoMessageEnvelope & {
      type: 'lobby_update';
      room: DuoRoomDescriptor;
    })
  | (DuoMessageEnvelope & {
      type: 'ready_changed';
      userId: string;
      ready: boolean;
    })
  | (DuoMessageEnvelope & {
      type: 'match_start';
      seed: number;
      startedAt: number;
    })
  | (DuoMessageEnvelope & {
      type: 'player_input';
      input: DuoPlayerInput;
    })
  | (DuoMessageEnvelope & {
      type: 'world_snapshot';
      tick: number;
      state: DuoWorldSnapshot;
    })
  | (DuoMessageEnvelope & {
      type: 'player_left';
      reason: 'voluntary' | 'disconnected' | 'defeated';
    });

const ALLOWED_KEYS = new Set([
  't', 'b', 'q', 'e', ' ', 'r', '1', '2', '3', '4',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isClassId = (value: unknown): value is ClassId =>
  value === 'guerreiro' || value === 'mago' || value === 'arqueiro' || value === 'druida';

/** Validates client input before it is applied by the room host. */
export function isDuoPlayerInput(value: unknown): value is DuoPlayerInput {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.moveX) || !isFiniteNumber(value.moveY)) return false;
  if (Math.abs(value.moveX) > 1 || Math.abs(value.moveY) > 1) return false;
  if (!Array.isArray(value.heldKeys) || value.heldKeys.length > ALLOWED_KEYS.size) return false;
  return value.heldKeys.every(key => typeof key === 'string' && ALLOWED_KEYS.has(key));
}

function isDuoPlayerState(value: unknown): value is DuoPlayerState {
  if (!isRecord(value)) return false;
  return typeof value.userId === 'string'
    && value.userId.length > 0
    && typeof value.displayName === 'string'
    && isClassId(value.classId)
    && ['x', 'y', 'hp', 'maxHp', 'level', 'xp', 'nextXp', 'facingX', 'facingY'].every(key => isFiniteNumber(value[key]))
    && typeof value.moving === 'boolean'
    && typeof value.dead === 'boolean';
}

/**
 * Validates the multiplayer-specific portion of a host snapshot.
 * The complete world payload is typed at compile time; transport payloads
 * must still be treated as untrusted at runtime.
 */
export function isDuoWorldSnapshot(value: unknown): value is DuoWorldSnapshot {
  if (!isRecord(value) || !Array.isArray(value.players)) return false;
  if (value.players.length !== DUO_MAX_PLAYERS || !value.players.every(isDuoPlayerState)) return false;
  return isFiniteNumber(value.elapsed)
    && isFiniteNumber(value.phaseElapsed)
    && (value.dayNight === 'day' || value.dayNight === 'night' || value.dayNight === 'dawn')
    && Array.isArray(value.enemies)
    && Array.isArray(value.trees)
    && Array.isArray(value.rocks)
    && Array.isArray(value.cottonPlants);
}

/** Rejects stale or out-of-order packets for a sender within one room. */
export function isNewerDuoSequence(sequence: number, previousSequence: number): boolean {
  return Number.isSafeInteger(sequence) && sequence > previousSequence;
}
