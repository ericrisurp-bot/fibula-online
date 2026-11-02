import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { fibulaSupabase } from '../auth/supabase';
import { createDuoRoom, duoHeartbeat, getMyDuoRoom, joinDuoRoom, leaveDuoRoom, listDuoInvites, setDuoReady } from './duoRooms';

type RequestStatus = 'pending' | 'accepted' | 'declined';
type FriendRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: RequestStatus;
  created_at: string;
};
type FriendProfile = {
  user_id: string;
  display_name: string | null;
  avatar_character: 'guerreiro' | 'mago' | 'arqueiro' | 'druida';
  age: number | null;
  sex: string | null;
};
type DuoRole = 'host' | 'guest';
type DuoStatus = 'connecting' | 'connected';
type DuoPeer = { roomId: string; matchId: string | null; friendId: string; friendName: string; avatarCharacter: FriendProfile['avatar_character']; classId: FriendProfile['avatar_character']; displayName: string; role: DuoRole; status: DuoStatus; selfReady: boolean; peerReady: boolean };
type Props = {
  userId: string;
  myClassId: FriendProfile['avatar_character'];
  myDisplayName: string;
  open: boolean;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onLobbyChange: (peer: DuoPeer | null, leave?: (() => void) | null, toggleReady?: (() => void) | null) => void;
  onLobbyConnected: () => void;
  onLobbyNotice: (message: string) => void;
};

const AVATARS = {
  guerreiro: { label: 'Guerreiro', icon: '⚔️' },
  mago: { label: 'Mago', icon: '🔮' },
  arqueiro: { label: 'Arqueiro', icon: '🏹' },
  druida: { label: 'Druida', icon: '🌿' },
} as const;

export default function FriendsModal({ userId, myClassId, myDisplayName, open, onClose, onOpenProfile, onLobbyChange, onLobbyConnected, onLobbyNotice }: Props) {
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, FriendProfile>>({});
  const [searchName, setSearchName] = useState('');
  const [searching, setSearching] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [onlineFriends, setOnlineFriends] = useState<string[]>([]);
  const [lobbyInvite, setLobbyInvite] = useState<{ room_id: string; from: string; sender_name: string } | null>(null);
  const [activeDuo, setActiveDuo] = useState<DuoPeer | null>(null);
  const dismissedInvitesRef = useRef<Set<string>>(new Set());
  const hasRestoredDuoRef = useRef(false);
  const lobbyRef = useRef<DuoPeer | null>(null);
  const inboxChannels = useRef<Map<string, any>>(new Map());
  const [connectedInboxFriends, setConnectedInboxFriends] = useState<string[]>([]);
  const profilesRef = useRef(profiles);
  const identityRef = useRef({ myClassId, myDisplayName });
  const onLobbyChangeRef = useRef(onLobbyChange);
  const onLobbyConnectedRef = useRef(onLobbyConnected);
  const onLobbyNoticeRef = useRef(onLobbyNotice);
  const friendIdsRef = useRef<string[]>([]);
  profilesRef.current = profiles;
  identityRef.current = { myClassId, myDisplayName };
  onLobbyChangeRef.current = onLobbyChange;
  onLobbyConnectedRef.current = onLobbyConnected;
  onLobbyNoticeRef.current = onLobbyNotice;
  const publishLobby = () => {
    const current = lobbyRef.current;
    const next = current ? { ...current } : null;
    setActiveDuo(next);
    onLobbyChangeRef.current(next, current ? leaveLobby : null, current ? toggleReady : null);
  };
  const clearLobby = () => {
    lobbyRef.current = null;
    setActiveDuo(null);
    onLobbyChangeRef.current(null);
  };
  const validClassId = (value: unknown): FriendProfile['avatar_character'] =>
    value === 'guerreiro' || value === 'mago' || value === 'arqueiro' || value === 'druida' ? value : 'guerreiro';
  const ownReadyPayload = (friendId: string) => ({
    from: userId,
    to: friendId,
    classId: identityRef.current.myClassId,
    displayName: profilesRef.current[userId]?.display_name || identityRef.current.myDisplayName || 'Jogador',
  });

  const load = useCallback(async () => {
    if (!fibulaSupabase) {
      setError('O banco de dados do Fíbula não está configurado neste ambiente.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, error: requestError } = await fibulaSupabase
        .from('fibula_friend_requests')
        .select('id,sender_id,receiver_id,status,created_at')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false });
      if (requestError) throw requestError;
      const rows = (data ?? []) as FriendRequest[];
      setRequests(rows);
      const ids = [...new Set([...rows.flatMap(row => [row.sender_id, row.receiver_id]), userId])];
      if (ids.length) {
        const { data: profileRows, error: profileError } = await fibulaSupabase
          .from('fibula_profiles')
          .select('user_id,display_name,avatar_character,age,sex')
          .in('user_id', ids);
        if (profileError) throw profileError;
        setProfiles(Object.fromEntries(((profileRows ?? []) as FriendProfile[]).map(profile => [profile.user_id, profile])));
      } else {
        setProfiles({});
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar sua lista de amigos.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const accepted = useMemo(() => requests.filter(row => row.status === 'accepted'), [requests]);
  const incoming = useMemo(() => requests.filter(row => row.status === 'pending' && row.receiver_id === userId), [requests, userId]);
  const outgoing = useMemo(() => requests.filter(row => row.status === 'pending' && row.sender_id === userId), [requests, userId]);
  const friendIds = useMemo(() => [...new Set(accepted.map(row => row.sender_id === userId ? row.receiver_id : row.sender_id))], [accepted, userId]);
  const friendIdsKey = friendIds.join('|');

  const notify = (message: string) => {
    setNotice(message);
    onLobbyNoticeRef.current(message);
  };

  const loadPeerProfile = async (friendId: string): Promise<FriendProfile | null> => {
    const cached = profilesRef.current[friendId];
    if (cached) return cached;
    if (!fibulaSupabase) return null;
    const { data, error: profileError } = await fibulaSupabase
      .from('fibula_profiles')
      .select('user_id,display_name,avatar_character,age,sex')
      .eq('user_id', friendId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!data) return null;
    const profile = data as FriendProfile;
    setProfiles(current => ({ ...current, [friendId]: profile }));
    profilesRef.current = { ...profilesRef.current, [friendId]: profile };
    return profile;
  };

  const refreshDuoRoom = async (restore = false) => {
    const room = await getMyDuoRoom();
    const current = lobbyRef.current;
    if (!room) {
      if (current) {
        clearLobby();
        notify('O Duo foi encerrado.');
      }
      return;
    }
    if (room.phase !== 'lobby') {
      clearLobby();
      notify('O Duo foi encerrado.');
      return;
    }
    const self = room.participants.find(participant => participant.user_id === userId);
    if (!self) throw new Error('Sua conta não consta entre os participantes da sala Duo.');
    const other = room.participants.find(participant => participant.user_id !== userId);
    let invitedUserId = current?.roomId === room.id ? current.friendId : null;
    let invitationLookupError: string | null = null;
    if (!other && !invitedUserId && self.role === 'host' && fibulaSupabase) {
      try {
        const { data: invitation, error: invitationError } = await fibulaSupabase
          .from('fibula_duo_rooms')
          .select('invited_user_id')
          .eq('id', room.id)
          .maybeSingle();
        if (invitationError) throw invitationError;
        invitedUserId = typeof invitation?.invited_user_id === 'string' ? invitation.invited_user_id : null;
      } catch (cause) {
        invitationLookupError = cause instanceof Error ? cause.message : 'Não foi possível consultar o convite criado.';
      }
    }
    const friendId = other?.user_id ?? invitedUserId;
    if (!friendId) {
      let leaveError: string | null = null;
      try {
        await leaveDuoRoom(room.id);
      } catch (cause) {
        leaveError = cause instanceof Error ? cause.message : 'Falha ao encerrar a sala órfã.';
      }
      clearLobby();
      notify('A sala Duo sem convidado não pôde ser restaurada porque não foi possível recuperar o amigo convidado. ' + (leaveError ? `Falha ao encerrar: ${leaveError}` : invitationLookupError ? `Consulta do convite: ${invitationLookupError}. A sala foi encerrada para evitar ficar órfã.` : 'A sala foi encerrada para evitar ficar órfã.'));
      return;
    }
    if (!friendIdsRef.current.includes(friendId)) {
      await leaveDuoRoom(room.id);
      clearLobby();
      notify('A sala Duo foi encerrada porque o outro participante não é mais um amigo aceito.');
      return;
    }
    const profile = await loadPeerProfile(friendId);
    const previous = lobbyRef.current;
    const peer: DuoPeer = {
      roomId: room.id,
      matchId: room.match_id,
      friendId,
      friendName: previous?.friendId === friendId ? previous.friendName : profile?.display_name || 'Amigo',
      displayName: previous?.friendId === friendId ? previous.displayName : profile?.display_name || 'Amigo',
      avatarCharacter: previous?.friendId === friendId ? previous.avatarCharacter : validClassId(profile?.avatar_character),
      classId: previous?.friendId === friendId ? previous.classId : validClassId(profile?.avatar_character),
      role: self.role,
      status: other ? 'connected' : 'connecting',
      selfReady: self.ready,
      peerReady: other?.ready ?? false,
    };
    lobbyRef.current = peer;
    publishLobby();
    if (peer.status === 'connected' && previous?.status !== 'connected') {
      setError('');
      onLobbyConnectedRef.current();
    }
    if (restore) setNotice('');
  };

  const refreshDuoInvites = async () => {
    if (lobbyRef.current) return;
    const invites = await listDuoInvites();
    const acceptedFriends = friendIdsRef.current;
    const invite = invites.find(item => acceptedFriends.includes(item.host_id) && !dismissedInvitesRef.current.has(item.room_id));
    if (!invite) {
      setLobbyInvite(null);
      return;
    }
    const profile = await loadPeerProfile(invite.host_id);
    setLobbyInvite({ room_id: invite.room_id, from: invite.host_id, sender_name: profile?.display_name || 'Seu amigo' });
  };

  async function leaveLobby() {
    const current = lobbyRef.current;
    if (!current) return;
    try {
      await leaveDuoRoom(current.roomId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível sair da sala Duo.');
      return;
    }
    clearLobby();
    setLobbyInvite(null);
    setError('');
    setNotice('');
    const channel = inboxChannels.current.get(current.friendId);
    if (channel) {
      try {
        const result = await channel.send({ type: 'broadcast', event: 'duo_left', payload: { from: userId, to: current.friendId, room_id: current.roomId } });
        if (result !== 'ok') setError('Você saiu da sala, mas o aviso ao outro jogador não foi entregue.');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Você saiu da sala, mas o aviso ao outro jogador falhou.');
      }
    }
  }

  async function toggleReady() {
    const current = lobbyRef.current;
    if (!current || current.status !== 'connected' || current.role !== 'guest') return;
    const previousReady = current.selfReady;
    const nextReady = !previousReady;
    current.selfReady = nextReady;
    publishLobby();
    try {
      await setDuoReady(current.roomId, nextReady);
      await refreshDuoRoom();
    } catch (cause) {
      if (lobbyRef.current?.roomId === current.roomId) {
        current.selfReady = previousReady;
        publishLobby();
      }
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar sua prontidão.');
      return;
    }
    const channel = inboxChannels.current.get(current.friendId);
    if (channel) {
      try {
        const result = await channel.send({ type: 'broadcast', event: 'duo_ready_state', payload: { from: userId, to: current.friendId, room_id: current.roomId, ready: nextReady } });
        if (result !== 'ok') setError('Prontidão salva, mas o aviso imediato ao anfitrião não foi entregue.');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Prontidão salva, mas o aviso imediato ao anfitrião falhou.');
      }
    }
  }

  const applyPeerIdentity = (friendId: string, payload: any) => {
    const current = lobbyRef.current;
    if (!current || current.friendId !== friendId) return;
    current.classId = validClassId(payload?.classId);
    current.avatarCharacter = current.classId;
    current.displayName = typeof payload?.displayName === 'string' && payload.displayName.trim()
      ? payload.displayName.trim()
      : current.friendName;
    current.friendName = current.displayName;
    publishLobby();
  };

  useEffect(() => {
    friendIdsRef.current = friendIds;
  }, [friendIdsKey]);

  useEffect(() => {
    if (loading || hasRestoredDuoRef.current) return;
    hasRestoredDuoRef.current = true;
    let active = true;
    const restore = async () => {
      try {
        await refreshDuoRoom(true);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível restaurar a sala Duo.');
      }
    };
    void restore();
    return () => { active = false; };
  }, [userId, loading]);

  useEffect(() => {
    if (!activeDuo?.roomId) return;
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (!active || refreshing || !lobbyRef.current) return;
      refreshing = true;
      try {
        await refreshDuoRoom();
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a sala Duo.');
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 3000);
    return () => { active = false; clearInterval(interval); };
  }, [activeDuo?.roomId]);

  useEffect(() => {
    if (!activeDuo?.roomId) return;
    let active = true;
    let sending = false;
    const heartbeat = async () => {
      if (!active || sending || !lobbyRef.current || lobbyRef.current.roomId !== activeDuo.roomId) return;
      sending = true;
      try {
        await duoHeartbeat(activeDuo.roomId);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Não foi possível manter a sala Duo ativa.';
        if (active && message === 'Você não participa desta sala.') {
          clearLobby();
          notify('O Duo foi encerrado.');
        } else if (active) {
          setError(message);
        }
      } finally {
        sending = false;
      }
    };
    const interval = setInterval(() => { void heartbeat(); }, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [activeDuo?.roomId]);

  useEffect(() => {
    if (activeDuo?.roomId) return;
    let active = true;
    let loadingInvites = false;
    const refresh = async () => {
      if (!active || loadingInvites || lobbyRef.current) return;
      loadingInvites = true;
      try {
        await refreshDuoInvites();
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar convites Duo.');
      } finally {
        loadingInvites = false;
      }
    };
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 10000);
    return () => { active = false; clearInterval(interval); };
  }, [activeDuo?.roomId, friendIdsKey]);

  useEffect(() => {
    const supabase = fibulaSupabase;
    if (!supabase) return;
    let active = true;
    const channels = new Map<string, any>();
    const start = async () => {
      await supabase.realtime.setAuth();
      if (!active) return;
      const subscriptions = friendIds.map(friendId => new Promise<void>((resolve, reject) => {
        const pairKey = [userId, friendId].sort().join(':');
        const inbox = supabase.channel(`fibula:inbox:${pairKey}`, { config: { private: true } });
        const validPeerEvent = (payload: any) =>
          active && payload?.from === friendId && payload?.to === userId;
        inbox.on('broadcast', { event: 'lobby_invite' }, ({ payload }) => {
          if (!validPeerEvent(payload) || typeof payload?.room_id !== 'string') return;
          void refreshDuoInvites().catch(cause => setError(cause instanceof Error ? cause.message : 'Não foi possível conferir o convite Duo.'));
        });
        inbox.on('broadcast', { event: 'lobby_invite_response' }, ({ payload }) => {
          if (!validPeerEvent(payload) || typeof payload?.accepted !== 'boolean') return;
          if (lobbyRef.current?.role === 'host' && lobbyRef.current.friendId === friendId) {
            void refreshDuoRoom().catch(cause => setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a sala Duo.'));
            if (!payload.accepted) notify('Seu convite de Duo foi recusado.');
          }
        });
        const refreshOnDuoSignal = () => {
          if (!validPeerEvent({ from: friendId, to: userId })) return;
          void refreshDuoRoom().catch(cause => setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a sala Duo.'));
        };
        inbox.on('broadcast', { event: 'duo_ready' }, ({ payload }) => {
          if (!validPeerEvent(payload) || lobbyRef.current?.friendId !== friendId) return;
          applyPeerIdentity(friendId, payload);
          refreshOnDuoSignal();
          void inbox.send({ type: 'broadcast', event: 'duo_ready_ack', payload: ownReadyPayload(friendId) }).catch(cause => setError(cause instanceof Error ? cause.message : 'Não foi possível enviar confirmação Duo.'));
        });
        inbox.on('broadcast', { event: 'duo_ready_ack' }, ({ payload }) => {
          if (!validPeerEvent(payload) || lobbyRef.current?.friendId !== friendId) return;
          applyPeerIdentity(friendId, payload);
          refreshOnDuoSignal();
        });
        inbox.on('broadcast', { event: 'duo_ready_state' }, ({ payload }) => {
          if (!validPeerEvent(payload) || lobbyRef.current?.friendId !== friendId) return;
          refreshOnDuoSignal();
        });
        inbox.on('broadcast', { event: 'duo_left' }, ({ payload }) => {
          if (!validPeerEvent(payload) || lobbyRef.current?.friendId !== friendId) return;
          refreshOnDuoSignal();
        });
        channels.set(friendId, inbox);
        inboxChannels.current.set(friendId, inbox);
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          if (error) reject(error); else resolve();
        };
        inbox.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            if (active) setConnectedInboxFriends(current => [...new Set([...current, friendId])]);
            finish();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (active) {
              setConnectedInboxFriends(current => current.filter(id => id !== friendId));
              setError(err?.message || `Falha ao conectar o canal de convites de ${profilesRef.current[friendId]?.display_name || 'um amigo'} (${status}).`);
            }
            finish(new Error(err?.message || `Falha ao conectar canal de convites (${status}).`));
          }
        });
      }));
      const results = await Promise.allSettled(subscriptions);
      results.forEach((result, index) => {
        if (result.status === 'rejected' && active) {
          const friendId = friendIds[index];
          setConnectedInboxFriends(current => current.filter(id => id !== friendId));
        }
      });
    };
    setConnectedInboxFriends([]);
    inboxChannels.current.clear();
    void start().catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível conectar ao serviço de convites.');
    });
    return () => {
      active = false;
      inboxChannels.current.clear();
      channels.forEach(channel => void supabase.removeChannel(channel));
    };
  }, [userId, friendIdsKey]);

  const sendLobbyInvite = async (friendId: string) => {
    if (lobbyRef.current) {
      setError('Saia do Duo atual antes de convidar outra pessoa.');
      return;
    }
    if (!fibulaSupabase || !onlineFriends.includes(friendId)) return;
    const channel = inboxChannels.current.get(friendId);
    try {
      setError('');
      const roomId = await createDuoRoom(friendId);
      const peer: DuoPeer = {
        roomId, matchId: null, friendId,
        friendName: profilesRef.current[friendId]?.display_name || 'Seu amigo',
        displayName: profilesRef.current[friendId]?.display_name || 'Seu amigo',
        avatarCharacter: validClassId(profilesRef.current[friendId]?.avatar_character),
        classId: validClassId(profilesRef.current[friendId]?.avatar_character),
        role: 'host', status: 'connecting', selfReady: false, peerReady: false,
      };
      lobbyRef.current = peer;
      publishLobby();
      setNotice(`Convite enviado para ${peer.friendName}. Aguardando resposta.`);
      try {
        if (!channel || !connectedInboxFriends.includes(friendId)) throw new Error('Canal de aviso indisponível.');
        const result = await channel.send({
          type: 'broadcast', event: 'lobby_invite',
          payload: {
            room_id: roomId, from: userId, to: friendId,
            sender_name: profilesRef.current[userId]?.display_name || myDisplayName || 'Seu amigo',
            target_name: peer.friendName,
          },
        });
        if (result !== 'ok') setError('O convite foi salvo no servidor, mas o aviso imediato não foi entregue. O amigo ainda poderá recebê-lo pela lista de convites.');
      } catch {
        setNotice('O convite foi salvo no servidor. O amigo poderá recebê-lo pela lista de convites.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a sala Duo.');
    }
  };

  const answerLobbyInvite = async (accepted: boolean) => {
    if (accepted && lobbyRef.current) {
      setError('Saia do Duo atual antes de aceitar outro convite.');
      return;
    }
    if (!lobbyInvite) return;
    const invite = lobbyInvite;
    const channel = inboxChannels.current.get(invite.from);
    if (!accepted) {
      dismissedInvitesRef.current.add(invite.room_id);
      setLobbyInvite(null);
      if (channel) {
        try {
          const result = await channel.send({ type: 'broadcast', event: 'lobby_invite_response', payload: { from: userId, to: invite.from, accepted: false } });
          if (result !== 'ok') setError('Convite fechado localmente, mas o aviso de recusa não foi entregue.');
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Não foi possível avisar que o convite foi recusado.');
        }
      }
      return;
    }
    try {
      dismissedInvitesRef.current.add(invite.room_id);
      const roomId = await joinDuoRoom(invite.room_id);
      const profile = await loadPeerProfile(invite.from);
      const peer: DuoPeer = {
        roomId, matchId: null, friendId: invite.from,
        friendName: profile?.display_name || invite.sender_name || 'Seu amigo',
        displayName: profile?.display_name || invite.sender_name || 'Seu amigo',
        avatarCharacter: validClassId(profile?.avatar_character),
        classId: validClassId(profile?.avatar_character),
        role: 'guest', status: 'connecting', selfReady: false, peerReady: false,
      };
      lobbyRef.current = peer;
      publishLobby();
      setLobbyInvite(null);
      if (channel) {
        try {
          const result = await channel.send({ type: 'broadcast', event: 'lobby_invite_response', payload: { from: userId, to: invite.from, accepted: true } });
          if (result !== 'ok') setError('Você entrou na sala, mas o aviso imediato ao anfitrião não foi entregue.');
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Você entrou na sala, mas o aviso imediato ao anfitrião falhou.');
        }
        try {
          const readyResult = await channel.send({ type: 'broadcast', event: 'duo_ready', payload: ownReadyPayload(invite.from) });
          if (readyResult !== 'ok') setError('Você entrou na sala, mas não foi possível enviar seu nome e classe ao anfitrião.');
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Você entrou na sala, mas não foi possível enviar seu nome e classe ao anfitrião.');
        }
      } else {
        setError('Você entrou na sala, mas o canal de aviso com o anfitrião está indisponível.');
      }
      await refreshDuoRoom();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar na sala Duo.');
    }
  };

  const sendRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fibulaSupabase || searching) return;
    const name = searchName.trim().replace(/\s+/g, ' ');
    if (name.length < 3) {
      setError('Digite o nome completo do jogador (mínimo de 3 caracteres).');
      return;
    }
    setSearching(true);
    setError('');
    setNotice('');
    try {
      const { data: target, error: lookupError } = await fibulaSupabase
        .from('fibula_profiles')
        .select('user_id,display_name')
        .ilike('display_name', name)
        .neq('user_id', userId)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!target) {
        setError('Não encontrei um jogador com esse nome. Confira a escrita.');
        return;
      }
      const existing = requests.find(row =>
        ((row.sender_id === userId && row.receiver_id === target.user_id)
          || (row.sender_id === target.user_id && row.receiver_id === userId))
        && (row.status === 'pending' || row.status === 'accepted'),
      );
      if (existing?.status === 'accepted') {
        setError('Vocês já são amigos.');
        return;
      }
      if (existing?.status === 'pending') {
        setError(existing.sender_id === userId ? 'O convite já foi enviado e aguarda resposta.' : 'Esse jogador já enviou um convite para você. Veja os pedidos recebidos.');
        return;
      }
      const { error: insertError } = await fibulaSupabase.from('fibula_friend_requests').insert({
        sender_id: userId,
        receiver_id: target.user_id,
        status: 'pending',
      });
      if (insertError) throw insertError;
      setSearchName('');
      setNotice(`Convite enviado para ${target.display_name}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o convite.');
    } finally {
      setSearching(false);
    }
  };

  const answerRequest = async (request: FriendRequest, status: 'accepted' | 'declined') => {
    if (!fibulaSupabase || actingId) return;
    setActingId(request.id);
    setError('');
    setNotice('');
    try {
      const { error: updateError } = await fibulaSupabase.from('fibula_friend_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', request.id)
        .eq('receiver_id', userId)
        .eq('status', 'pending');
      if (updateError) throw updateError;
      setNotice(status === 'accepted' ? 'Convite aceito. Jogador adicionado aos seus amigos.' : 'Convite recusado.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível responder ao convite.');
    } finally {
      setActingId(null);
    }
  };

  const friendCard = (request: FriendRequest, mode: 'friend' | 'incoming' | 'outgoing') => {
    const otherId = request.sender_id === userId ? request.receiver_id : request.sender_id;
    const profile = profiles[otherId];
    const avatar = AVATARS[profile?.avatar_character ?? 'guerreiro'];
    return <article className="lobby-friend-card" key={request.id}>
      <span className={`lobby-friend-avatar class-${profile?.avatar_character ?? 'guerreiro'}`} aria-hidden="true">{avatar.icon}</span>
      {mode === 'friend' && <span className={`lobby-friend-online-dot ${onlineFriends.includes(otherId) ? 'online' : ''}`} aria-label={onlineFriends.includes(otherId) ? 'Online' : 'Offline'} />}
      <button type="button" className="lobby-friend-profile" onClick={() => onOpenProfile(otherId)} aria-label={`Ver perfil de ${profile?.display_name || 'jogador'}`}>
        <span className="lobby-friend-identity"><strong>{profile?.display_name || 'Jogador sem nome'}</strong><small>{mode === 'friend' ? avatar.label : mode === 'incoming' ? 'Enviou um convite' : 'Convite enviado · aguardando'}</small></span>
      </button>
      {mode === 'friend' && <div className="lobby-friend-actions">{onlineFriends.includes(otherId) ? <button type="button" disabled={Boolean(activeDuo)} onClick={() => void sendLobbyInvite(otherId)}>Convidar</button> : <span className="lobby-friend-pending">Offline</span>}</div>}
      {mode === 'incoming' && <div className="lobby-friend-actions">
        <button type="button" disabled={actingId === request.id} onClick={() => void answerRequest(request, 'accepted')}>Aceitar</button>
        <button type="button" className="secondary" disabled={actingId === request.id} onClick={() => void answerRequest(request, 'declined')}>Recusar</button>
      </div>}
      {mode === 'outgoing' && <span className="lobby-friend-pending">Pendente</span>}
    </article>;
  };

  return <>{open && <div className="lobby-friends-backdrop" onClick={onClose}>
    <section className="lobby-friends-modal" role="dialog" aria-modal="true" aria-labelledby="lobby-friends-title" onClick={event => event.stopPropagation()}>
      <header className="lobby-friends-header">
        <div><span>SUA COMUNIDADE</span><h2 id="lobby-friends-title">Amigos</h2></div>
        <div className="lobby-friends-count">{accepted.length} amigos</div>
        <button type="button" className="lobby-friends-close" aria-label="Fechar amigos" onClick={onClose}>×</button>
      </header>
      <div className="lobby-friends-content">
        <form className="lobby-friends-search" onSubmit={sendRequest}>
          <label htmlFor="friend-search-name">Adicionar amigo pelo nome de jogador</label>
          <div><input id="friend-search-name" value={searchName} onChange={event => setSearchName(event.target.value)} minLength={3} maxLength={20} placeholder="Digite o nome exato" />
            <button type="submit" disabled={searching || searchName.trim().length < 3}>{searching ? 'Buscando...' : 'Enviar pedido'}</button></div>
        </form>
        {error && <p className="lobby-friends-feedback error" role="alert">{error}</p>}
        {notice && <p className="lobby-friends-feedback" role="status">{notice}</p>}
        {loading ? <p className="lobby-friends-empty">Carregando amigos...</p> : <>
          {incoming.length > 0 && <section className="lobby-friends-section"><h3>Convites recebidos <span>{incoming.length}</span></h3>{incoming.map(row => friendCard(row, 'incoming'))}</section>}
          <section className="lobby-friends-section"><h3>Seus amigos</h3>
            {accepted.length ? accepted.map(row => friendCard(row, 'friend')) : <div className="lobby-friends-empty" role="status"><span aria-hidden="true">♡</span><strong>Você ainda não tem amigos</strong><p>Envie um convite usando o nome de jogador.</p></div>}
          </section>
          {outgoing.length > 0 && <section className="lobby-friends-section"><h3>Convites enviados <span>{outgoing.length}</span></h3>{outgoing.map(row => friendCard(row, 'outgoing'))}</section>}
        </>}
      </div>
    </section>
  </div>}
    {lobbyInvite && !activeDuo && <div className="duo-lobby-invite-toast" role="dialog"><strong>{lobbyInvite.sender_name || 'Seu amigo'} convidou você para o lobby</strong><div><button type="button" onClick={() => void answerLobbyInvite(true)}>Aceitar</button><button type="button" className="secondary" onClick={() => void answerLobbyInvite(false)}>Recusar</button></div></div>}
  </>;
}
