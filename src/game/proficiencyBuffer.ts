import type { ProficiencyEvent, ProficiencyKey } from './engine';
import { recordProficiencyEvents } from './proficiencyStorage';

type AccountTotals = Partial<Record<ProficiencyKey, number>>;

// Compartilhado entre instâncias do efeito do engine: uma falha durante a troca
// de conta continua pendente e pode ser tentada pela instância seguinte.
const pendingByUser = new Map<string, AccountTotals>();
let flushInFlight: Promise<boolean> | null = null;
let activeBuffer: ProficiencyBuffer | null = null;
let resetDiscardInProgress = false;
let flushGeneration = 0;

function hasPendingTotals(): boolean {
  return Array.from(pendingByUser.values()).some(totals => Object.keys(totals).length > 0);
}

function mergeTotals(userId: string, totals: AccountTotals): void {
  const current = pendingByUser.get(userId) ?? {};
  for (const [rawKey, amount] of Object.entries(totals)) {
    const key = rawKey as ProficiencyKey;
    const merged = (current[key] ?? 0) + (amount ?? 0);
    if (!Number.isSafeInteger(merged)) {
      throw new Error('O acumulado em memória de proficiência excedeu o limite seguro.');
    }
    current[key] = merged;
  }
  pendingByUser.set(userId, current);
}

/**
 * Buffer em memória por conta. As gravações são serializadas e cada snapshot
 * é restaurado por soma se o IndexedDB falhar, preservando eventos novos.
 */
export class ProficiencyBuffer {
  private timer: number | null = null;
  private disposed = false;
  private listenersAttached = false;

  constructor(private readonly onStorageError: (error: unknown) => void) {
    activeBuffer = this;
    this.attachListeners();
    if (hasPendingTotals()) this.scheduleFlush();
  }

  add(userId: string, event: ProficiencyEvent): void {
    if (this.disposed) throw new Error('O buffer de proficiências já foi descartado.');
    if (typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Não é possível acumular proficiência sem uma conta identificada.');
    }
    if (!event || typeof event.key !== 'string'
      || !Number.isSafeInteger(event.amount) || event.amount <= 0) {
      throw new Error('Evento de proficiência inválido.');
    }

    mergeTotals(userId, { [event.key]: event.amount });
    this.scheduleFlush();
  }

  flush(): Promise<void> {
    if (resetDiscardInProgress) return Promise.resolve();
    if (flushInFlight) {
      return flushInFlight.then(async succeeded => {
        // Se a gravação em curso concluiu, drena também eventos acumulados durante ela.
        // Em caso de falha, mantém o snapshot restaurado para o próximo ciclo, sem loop imediato.
        if (succeeded && hasPendingTotals()) await this.flush();
      });
    }
    this.clearTimer();

    const snapshots = Array.from(pendingByUser.entries()).map(([userId, totals]) => ({
      userId,
      totals: { ...totals },
    }));
    for (const snapshot of snapshots) pendingByUser.delete(snapshot.userId);
    if (snapshots.length === 0) return Promise.resolve();

    const generation = flushGeneration;
    const work = (async () => {
      let succeeded = true;
      for (const snapshot of snapshots) {
        try {
          await recordProficiencyEvents(snapshot.userId, snapshot.totals);
        } catch (error) {
          succeeded = false;
          if (generation === flushGeneration && !resetDiscardInProgress) {
            try {
              // Soma sobre qualquer evento que chegou enquanto a transação estava aberta.
              mergeTotals(snapshot.userId, snapshot.totals);
            } catch (mergeError) {
              this.onStorageError(mergeError);
            }
            this.onStorageError(error);
          }
        }
      }
      return succeeded;
    })();

    flushInFlight = work.finally(() => {
      flushInFlight = null;
      // Se o efeito antigo foi descartado durante a gravação, a instância nova
      // assume o agendamento dos valores que precisaram ser restaurados.
      if (!resetDiscardInProgress && hasPendingTotals()) activeBuffer?.scheduleFlush();
    });
    return flushInFlight.then(() => undefined);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimer();
    await this.flush();
    this.detachListeners();
    if (activeBuffer === this) activeBuffer = null;
  }

  cancelScheduledFlushForReset(): void {
    this.clearTimer();
  }

  private readonly flushWhenHidden = () => {
    if (document.visibilityState === 'hidden') void this.flush();
  };

  private readonly flushOnPageHide = () => {
    void this.flush();
  };

  private attachListeners(): void {
    if (this.listenersAttached || typeof window === 'undefined' || typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', this.flushWhenHidden);
    window.addEventListener('pagehide', this.flushOnPageHide);
    this.listenersAttached = true;
  }

  private detachListeners(): void {
    if (!this.listenersAttached || typeof window === 'undefined' || typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', this.flushWhenHidden);
    window.removeEventListener('pagehide', this.flushOnPageHide);
    this.listenersAttached = false;
  }

  private scheduleFlush(): void {
    if (this.disposed || this.timer !== null || !hasPendingTotals()) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, 1500);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    window.clearTimeout(this.timer);
    this.timer = null;
  }
}

export async function discardPendingProficiencyBuffer(): Promise<void> {
  resetDiscardInProgress = true;
  flushGeneration += 1;
  pendingByUser.clear();
  activeBuffer?.cancelScheduledFlushForReset();
  const inFlight = flushInFlight;
  try {
    if (inFlight) await inFlight;
  } finally {
    // Uma falha do envio antigo não pode restaurar seu snapshot após o reset.
    pendingByUser.clear();
    resetDiscardInProgress = false;
  }
}

export function createProficiencyBuffer(
  onStorageError: (error: unknown) => void,
): ProficiencyBuffer {
  return new ProficiencyBuffer(onStorageError);
}
