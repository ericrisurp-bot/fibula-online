import type { DuoPlayerDeathReason } from './protocol';

export type DuoCycleParticipant = {
  userId: string;
  alive: boolean;
  completedNight: number | null;
};

export type DuoCycleStatus = 'playing' | 'finished';

export type DuoCycleSnapshot = {
  status: DuoCycleStatus;
  currentNight: number;
  participants: readonly DuoCycleParticipant[];
  waitingForPlayers: readonly string[];
};

export type DuoCycleTransition = {
  accepted: boolean;
  changed: boolean;
  nightReleased: boolean;
  sessionFinished: boolean;
  snapshot: DuoCycleSnapshot;
};

type DuoCycleSyncOptions = {
  participantIds: readonly [string, string];
  firstNight?: number;
};

/**
 * Coordinates only the two end-of-night facts for independent local worlds.
 *
 * This class has no network, Supabase, timer, browser, or GameEngine dependency.
 * A future transport adapter may deliver the same participant events to both
 * clients; callers decide when to invoke GameEngine.releaseCooperativeNight().
 */
export class DuoCycleSync {
  private readonly participantIds: readonly [string, string];
  private readonly participants = new Map<string, DuoCycleParticipant>();
  private currentNight: number;
  private status: DuoCycleStatus = 'playing';

  constructor(options: DuoCycleSyncOptions) {
    const [firstId, secondId] = options.participantIds;
    if (!firstId?.trim() || !secondId?.trim() || firstId === secondId) {
      throw new Error('DuoCycleSync exige dois participantes distintos.');
    }

    const firstNight = options.firstNight ?? 1;
    if (!Number.isSafeInteger(firstNight) || firstNight < 1) {
      throw new RangeError('A primeira noite deve ser um inteiro positivo.');
    }

    this.participantIds = [firstId, secondId];
    this.currentNight = firstNight;
    for (const userId of this.participantIds) {
      this.participants.set(userId, {
        userId,
        alive: true,
        completedNight: null,
      });
    }
  }

  getSnapshot(): DuoCycleSnapshot {
    const participants = this.participantIds.map(userId => {
      const participant = this.participants.get(userId)!;
      return { ...participant };
    });
    const waitingForPlayers = participants
      .filter(participant => participant.alive && participant.completedNight !== this.currentNight)
      .map(participant => participant.userId);

    return {
      status: this.status,
      currentNight: this.currentNight,
      participants,
      waitingForPlayers,
    };
  }

  /** Record the local or received "terminei" event for the current night. */
  reportNightComplete(userId: string, nightNumber: number): DuoCycleTransition {
    if (!this.canAcceptEvent(userId, nightNumber)) return this.ignoredTransition();

    const participant = this.participants.get(userId)!;
    if (!participant.alive || participant.completedNight === nightNumber) {
      return this.ignoredTransition();
    }

    participant.completedNight = nightNumber;
    return this.resolveNight();
  }

  /** Record a one-time death or connection-loss event. */
  reportPlayerDeath(userId: string, reason: DuoPlayerDeathReason, nightNumber = this.currentNight): DuoCycleTransition {
    if (!this.canAcceptEvent(userId, nightNumber)) return this.ignoredTransition();
    if (reason !== 'defeated' && reason !== 'abandoned' && reason !== 'disconnected') {
      return this.ignoredTransition();
    }

    const participant = this.participants.get(userId)!;
    if (!participant.alive) return this.ignoredTransition();

    participant.alive = false;
    if ([...this.participants.values()].every(item => !item.alive)) {
      this.status = 'finished';
      return this.transition(true, false, false, true);
    }

    // A death changes the next allocation, never the horde already in progress.
    // If the survivor had already cleared this night, it can now be released.
    return this.resolveNight(true);
  }

  private canAcceptEvent(userId: string, nightNumber: number): boolean {
    return this.status === 'playing'
      && this.participants.has(userId)
      && Number.isSafeInteger(nightNumber)
      && nightNumber === this.currentNight;
  }

  private resolveNight(changed = true): DuoCycleTransition {
    const living = this.participantIds
      .map(userId => this.participants.get(userId)!)
      .filter(participant => participant.alive);
    const released = living.length > 0
      && living.every(participant => participant.completedNight === this.currentNight);

    if (released) {
      this.currentNight += 1;
      for (const participant of this.participants.values()) {
        participant.completedNight = null;
      }
    }

    return this.transition(true, changed, released, false);
  }

  private ignoredTransition(): DuoCycleTransition {
    return this.transition(false, false, false, this.status === 'finished');
  }

  private transition(
    accepted: boolean,
    changed: boolean,
    nightReleased: boolean,
    sessionFinished: boolean,
  ): DuoCycleTransition {
    return {
      accepted,
      changed,
      nightReleased,
      sessionFinished,
      snapshot: this.getSnapshot(),
    };
  }
}
