import type { DuoPlayerDeathReason } from './protocol';
import type { GameEngine, GameEngineOptions } from '../engine';
import { DuoCycleSync, type DuoCycleTransition } from './DuoCycleSync';

/**
 * Adapta eventos de coordenação Duo ao gate de um único motor local.
 *
 * A instância recebe eventos do parceiro por chamadas explícitas do futuro
 * transporte. Ela não cria rede, não compartilha mundos e não sincroniza
 * automaticamente outra instância do jogo.
 */
export class DuoCycleEngineBridge {
  private engine: Pick<GameEngine, 'releaseCooperativeNight'> | null = null;

  constructor(
    private readonly sync: DuoCycleSync,
    private readonly localUserId: string,
  ) {
    if (!sync.getSnapshot().participants.some(player => player.userId === localUserId)) {
      throw new Error('O jogador local não pertence à sessão DuoCycleSync.');
    }
  }

  /** Opções para criar somente o GameEngine deste cliente. */
  get engineOptions(): NonNullable<GameEngineOptions['cooperative']> {
    return {
      waitForNightRelease: true,
      onNightComplete: nightNumber => {
        this.apply(this.sync.reportNightComplete(this.localUserId, nightNumber));
      },
    };
  }

  /** Conecta a ponte ao motor local depois de construí-lo. */
  attachEngine(engine: Pick<GameEngine, 'releaseCooperativeNight'>): void {
    if (this.engine && this.engine !== engine) {
      throw new Error('A ponte Duo já está conectada a um motor local.');
    }
    this.engine = engine;
  }

  /** Entrega à coordenação uma conclusão recebida do parceiro. */
  reportPartnerNightComplete(userId: string, nightNumber: number): DuoCycleTransition {
    if (userId === this.localUserId) return this.sync.reportNightComplete(userId, nightNumber);
    return this.apply(this.sync.reportNightComplete(userId, nightNumber));
  }

  /** Entrega morte/queda recebida do fluxo local ou do futuro transporte. */
  reportPlayerDeath(
    userId: string,
    reason: DuoPlayerDeathReason,
    nightNumber?: number,
  ): DuoCycleTransition {
    return this.apply(this.sync.reportPlayerDeath(userId, reason, nightNumber));
  }

  getSnapshot() {
    return this.sync.getSnapshot();
  }

  private apply(transition: DuoCycleTransition): DuoCycleTransition {
    if (transition.nightReleased) {
      this.engine?.releaseCooperativeNight();
    }
    return transition;
  }
}
