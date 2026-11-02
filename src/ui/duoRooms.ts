import { fibulaSupabase } from '../auth/supabase';

export type DuoRoomRole = 'host' | 'guest';
export type DuoRoomPhase = 'lobby' | 'starting' | 'playing' | 'finished' | 'cancelled';

export type DuoRoomParticipant = {
  user_id: string;
  role: DuoRoomRole;
  ready: boolean;
};

export type DuoRoom = {
  id: string;
  host_id: string;
  guest_id: string | null;
  phase: DuoRoomPhase;
  match_id: string | null;
  match_seed: number | null;
  participants: DuoRoomParticipant[];
};

export type DuoInvite = {
  room_id: string;
  host_id: string;
  created_at: string;
};

function getClient() {
  if (!fibulaSupabase) throw new Error('O banco de dados do Fíbula não está configurado neste ambiente.');
  return fibulaSupabase;
}

function throwRpcError(error: { message?: string } | null) {
  if (error) throw new Error(error.message || 'Não foi possível concluir a operação Duo.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isDuoRoomParticipant(value: unknown): value is DuoRoomParticipant {
  return isRecord(value)
    && typeof value.user_id === 'string'
    && value.user_id.length > 0
    && (value.role === 'host' || value.role === 'guest')
    && typeof value.ready === 'boolean';
}

function parseDuoRoom(value: unknown): DuoRoom | null {
  if (value === null) return null;
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.host_id !== 'string'
    || !isNullableString(value.guest_id)
    || !['lobby', 'starting', 'playing', 'finished', 'cancelled'].includes(String(value.phase))
    || !isNullableString(value.match_id)
    || !(value.match_seed === null || (typeof value.match_seed === 'number' && Number.isFinite(value.match_seed)))
    || !Array.isArray(value.participants)
    || !value.participants.every(isDuoRoomParticipant)) {
    throw new Error('O servidor retornou dados inválidos para a sala Duo.');
  }
  return value as DuoRoom;
}

export async function createDuoRoom(friendId: string): Promise<string> {
  const { data, error } = await getClient().rpc('fibula_create_duo_room', { p_friend_id: friendId });
  throwRpcError(error);
  if (typeof data !== 'string' || !data) throw new Error('O servidor não retornou o identificador da sala Duo.');
  return data;
}

export async function joinDuoRoom(roomId: string): Promise<string> {
  const { data, error } = await getClient().rpc('fibula_join_duo_room', { p_room_id: roomId });
  throwRpcError(error);
  if (typeof data !== 'string' || !data) throw new Error('O servidor não retornou o identificador da sala Duo.');
  return data;
}

export async function setDuoReady(roomId: string, ready: boolean): Promise<boolean> {
  const { data, error } = await getClient().rpc('fibula_set_duo_ready', { p_room_id: roomId, p_ready: ready });
  throwRpcError(error);
  if (typeof data !== 'boolean') throw new Error('O servidor retornou uma resposta inválida para a prontidão Duo.');
  return data;
}

export async function leaveDuoRoom(roomId: string): Promise<boolean> {
  const { data, error } = await getClient().rpc('fibula_leave_duo_room', { p_room_id: roomId });
  throwRpcError(error);
  if (typeof data !== 'boolean') throw new Error('O servidor retornou uma resposta inválida ao sair da sala Duo.');
  return data;
}

export async function duoHeartbeat(roomId: string): Promise<boolean> {
  const { data, error } = await getClient().rpc('fibula_duo_heartbeat', { p_room_id: roomId });
  throwRpcError(error);
  if (typeof data !== 'boolean') throw new Error('O servidor retornou uma resposta inválida no heartbeat Duo.');
  return data;
}

export async function listDuoInvites(): Promise<DuoInvite[]> {
  const { data, error } = await getClient().rpc('fibula_list_duo_invites');
  throwRpcError(error);
  if (!Array.isArray(data)) throw new Error('O servidor retornou uma lista de convites Duo inválida.');
  return data as DuoInvite[];
}

export async function getMyDuoRoom(): Promise<DuoRoom | null> {
  const { data, error } = await getClient().rpc('fibula_get_my_duo_room');
  throwRpcError(error);
  return parseDuoRoom(data);
}
