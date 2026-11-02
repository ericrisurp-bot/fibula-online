import type { SupabaseClient } from '@supabase/supabase-js';

export type DuoCycleServerState = {
  match_id: string;
  status: 'playing' | 'finished';
  current_night: number;
  cooperative_nights: number;
  player_status: 'alive' | 'dead' | 'disconnected';
  horde_target: number;
};

type ReportStatus = 'finished' | 'dead';
type StateHandler = (state: DuoCycleServerState) => void;
type ErrorHandler = (error: unknown) => void;

/**
 * Server-backed transport for the Duo night barrier.
 *
 * Realtime carries only a small invalidation signal. The authenticated RPC is
 * always the source of truth; no world, combat, inventory, or position data is
 * sent between clients.
 */
export class DuoCycleTransport {
  private channel: any = null;
  private connecting: Promise<void> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatPending = false;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly matchId: string,
    private readonly userId: string,
    private readonly peerId: string,
    private readonly onState: StateHandler,
    private readonly onError: ErrorHandler = () => undefined,
  ) {
    if (!matchId || !userId || !peerId || userId === peerId) {
      throw new Error('A comunicação Duo exige uma partida e dois jogadores distintos.');
    }
  }

  async connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    this.connecting = this.connectChannel();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async connectChannel(): Promise<void> {
    await this.supabase.realtime.setAuth();
    const pairKey = [this.userId, this.peerId].sort().join(':');
    const channel = this.supabase.channel(`fibula:inbox:${pairKey}`, { config: { private: true } });
    channel.on('broadcast', { event: 'duo_cycle_signal' }, ({ payload }: { payload: unknown }) => {
      if (!payload || typeof payload !== 'object') return;
      const signal = payload as Record<string, unknown>;
      if (signal.from !== this.peerId || signal.to !== this.userId || signal.match_id !== this.matchId
        || !Number.isSafeInteger(signal.night_number)
        || (signal.report_status !== 'finished' && signal.report_status !== 'dead')) return;
      void this.refreshState().catch(this.onError);
    });
    this.channel = channel;
    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') resolve();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          reject(new Error('Não foi possível conectar a sincronização da partida Duo.'));
        }
      });
    });
    await this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.heartbeatPending) return;
      this.heartbeatPending = true;
      void this.sendHeartbeat()
        .catch(this.onError)
        .finally(() => { this.heartbeatPending = false; });
    }, 5_000);
  }

  private async sendHeartbeat(): Promise<void> {
    const { data, error } = await this.supabase.rpc('fibula_duo_match_heartbeat', {
      p_match_id: this.matchId,
    });
    if (error) throw error;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('O servidor retornou um heartbeat Duo inválido.');
    }
    this.applyServerState(data as Record<string, unknown>);
  }

  async reportNightComplete(nightNumber: number): Promise<void> {
    await this.report('finished', nightNumber);
  }

  async reportDeath(): Promise<void> {
    const state = await this.refreshState();
    if (state.status !== 'playing' || state.player_status !== 'alive') return;
    await this.report('dead', state.current_night);
  }

  private async report(reportStatus: ReportStatus, nightNumber: number): Promise<void> {
    if (!Number.isSafeInteger(nightNumber) || nightNumber < 1) {
      throw new Error('O número da noite informado ao servidor Duo é inválido.');
    }
    const { data, error } = await this.supabase.rpc('fibula_duo_report_night', {
      p_match_id: this.matchId,
      p_night_number: nightNumber,
      p_report_status: reportStatus,
    });
    if (error) throw error;
    if (!data || typeof data !== 'object' || Array.isArray(data)
      || (data as Record<string, unknown>).accepted !== true) {
      throw new Error('O servidor não confirmou o relato da noite Duo.');
    }
    await this.refreshState();
    const channel = this.channel;
    if (!channel) throw new Error('A comunicação da partida Duo foi encerrada.');
    const result = await channel.send({
      type: 'broadcast',
      event: 'duo_cycle_signal',
      payload: {
        from: this.userId,
        to: this.peerId,
        match_id: this.matchId,
        night_number: nightNumber,
        report_status: reportStatus,
      },
    });
    if (result !== 'ok') throw new Error('O servidor salvou seu relato, mas o aviso ao outro jogador não foi entregue.');
  }

  private async refreshState(): Promise<DuoCycleServerState> {
    const { data, error } = await this.supabase.rpc('fibula_duo_get_session_state', {
      p_match_id: this.matchId,
    });
    if (error) throw error;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('O servidor retornou um estado Duo inválido.');
    }
    return this.applyServerState(data as Record<string, unknown>);
  }

  private applyServerState(value: Record<string, unknown>): DuoCycleServerState {
    if (value.match_id !== this.matchId
      || (value.status !== 'playing' && value.status !== 'finished')
      || !Number.isSafeInteger(value.current_night) || (value.current_night as number) < 1
      || !Number.isSafeInteger(value.cooperative_nights) || (value.cooperative_nights as number) < 0
      || (value.player_status !== 'alive' && value.player_status !== 'dead' && value.player_status !== 'disconnected')
      || !Number.isSafeInteger(value.horde_target) || (value.horde_target as number) < 0) {
      throw new Error('O servidor retornou um estado Duo inconsistente.');
    }
    const state: DuoCycleServerState = {
      match_id: value.match_id as string,
      status: value.status as DuoCycleServerState['status'],
      current_night: value.current_night as number,
      cooperative_nights: value.cooperative_nights as number,
      player_status: value.player_status as DuoCycleServerState['player_status'],
      horde_target: value.horde_target as number,
    };
    this.onState(state);
    return state;
  }

  async disconnect(): Promise<void> {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    const channel = this.channel;
    this.channel = null;
    if (channel) await this.supabase.removeChannel(channel);
  }
}
