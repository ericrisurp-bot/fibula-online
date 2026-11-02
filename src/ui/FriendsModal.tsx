import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { fibulaSupabase } from '../auth/supabase';

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
type DuoPeer = { friendId: string; friendName: string; avatarCharacter: FriendProfile['avatar_character']; classId: FriendProfile['avatar_character']; displayName: string; role: DuoRole; status: DuoStatus; selfReady: boolean; peerReady: boolean };
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
  const [lobbyInvite, setLobbyInvite] = useState<any>(null);
  const lobbyRef = useRef<DuoPeer | null>(null);
  const pendingInvite = useRef<any>(null);
  const inboxChannels = useRef<Map<string, any>>(new Map());
  const [connectedInboxFriends, setConnectedInboxFriends] = useState<string[]>([]);
  const profilesRef = useRef(profiles);
  const identityRef = useRef({ myClassId, myDisplayName });
  const onLobbyChangeRef = useRef(onLobbyChange);
  const onLobbyConnectedRef = useRef(onLobbyConnected);
  const onLobbyNoticeRef = useRef(onLobbyNotice);
  const handshakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPeerEventAtRef = useRef(0);
  profilesRef.current = profiles;
  identityRef.current = { myClassId, myDisplayName };
  onLobbyChangeRef.current = onLobbyChange;
  onLobbyConnectedRef.current = onLobbyConnected;
  onLobbyNoticeRef.current = onLobbyNotice;
  const clearDuoTimers = () => {
    if (handshakeTimeoutRef.current) clearTimeout(handshakeTimeoutRef.current);
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    handshakeTimeoutRef.current = null;
    heartbeatIntervalRef.current = null;
    lastPeerEventAtRef.current = 0;
  };
  const publishLobby = () => {
    const current = lobbyRef.current;
    onLobbyChangeRef.current(current ? { ...current } : null, current ? leaveLobby : null, current ? toggleReady : null);
  };
  const clearLobby = () => {
    clearDuoTimers();
    lobbyRef.current = null;
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

  async function leaveLobby() {
    const currentLobby = lobbyRef.current;
    clearLobby();
    if (currentLobby) {
      const channel = inboxChannels.current.get(currentLobby.friendId);
      if (channel) {
        try {
          await channel.send({ type: 'broadcast', event: 'duo_left', payload: { from: userId, to: currentLobby.friendId } });
        } catch { /* The local lobby still closes if the peer is disconnected. */ }
      }
    }
  }

  async function toggleReady() {
    const currentLobby = lobbyRef.current;
    if (!currentLobby || currentLobby.status !== 'connected' || currentLobby.role !== 'guest') return;
    const nextReady = !currentLobby.selfReady;
    currentLobby.selfReady = nextReady;
    publishLobby();
    const channel = inboxChannels.current.get(currentLobby.friendId);
    if (!channel) return;
    const result = await channel.send({
      type: 'broadcast',
      event: 'duo_ready_state',
      payload: { from: userId, to: currentLobby.friendId, ready: nextReady },
    });
    if (result !== 'ok' && lobbyRef.current?.friendId === currentLobby.friendId) {
      currentLobby.selfReady = !nextReady;
      publishLobby();
      setError('Não foi possível atualizar sua prontidão.');
    }
  }

  const startHeartbeat = (friendId: string, channel: any) => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    lastPeerEventAtRef.current = Date.now();
    heartbeatIntervalRef.current = setInterval(() => {
      const current = lobbyRef.current;
      if (!current || current.friendId !== friendId || current.status !== 'connected') return;
      if (Date.now() - lastPeerEventAtRef.current >= 15000) {
        clearLobby();
        const message = `A conexão com ${current.friendName} foi encerrada.`;
        setNotice(message);
        onLobbyNoticeRef.current(message);
        return;
      }
      void channel.send({ type: 'broadcast', event: 'duo_ping', payload: { from: userId, to: friendId } });
    }, 5000);
  };

  const markConnected = (friendId: string, payload: any, channel: any, acknowledge: boolean) => {
    const current = lobbyRef.current;
    if (!current || current.friendId !== friendId) return;
    lastPeerEventAtRef.current = Date.now();
    current.classId = validClassId(payload?.classId);
    current.avatarCharacter = current.classId;
    current.displayName = typeof payload?.displayName === 'string' && payload.displayName.trim() ? payload.displayName.trim() : current.friendName;
    current.friendName = current.displayName;
    current.status = 'connected';
    if (handshakeTimeoutRef.current) clearTimeout(handshakeTimeoutRef.current);
    handshakeTimeoutRef.current = null;
    publishLobby();
    setError('');
    onLobbyConnectedRef.current();
    startHeartbeat(friendId, channel);
    if (acknowledge) {
      void channel.send({ type: 'broadcast', event: 'duo_ready_ack', payload: ownReadyPayload(friendId) });
    }
  };

  const joinLobby = async (_roomTopic: string, friendId: string, friendName: string, role: DuoRole) => {
    const channel = inboxChannels.current.get(friendId);
    if (!channel) {
      setError('O canal privado entre vocês ainda não está conectado. Tente novamente em instantes.');
      return;
    }
    clearDuoTimers();
    const peer: DuoPeer = {
      friendId, friendName, displayName: friendName, avatarCharacter: 'guerreiro', classId: 'guerreiro',
      role, status: 'connecting', selfReady: false, peerReady: false,
    };
    lobbyRef.current = peer;
    publishLobby();
    setError('');
    setNotice('');
    handshakeTimeoutRef.current = setTimeout(() => {
      if (lobbyRef.current?.friendId !== friendId || lobbyRef.current.status !== 'connecting') return;
      clearLobby();
      const message = `Não foi possível conectar com ${friendName}.`;
      setError(message);
      onLobbyNoticeRef.current(message);
    }, 8000);
    try {
      const result = await channel.send({ type: 'broadcast', event: 'duo_ready', payload: ownReadyPayload(friendId) });
      if (result !== 'ok') throw new Error(`O Realtime recusou a entrada no Lobby Duo (resultado: ${String(result)}).`);
    } catch (cause) {
      if (lobbyRef.current?.friendId === friendId) clearLobby();
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar no lobby compartilhado.');
    }
  };

  useEffect(() => {
    const supabase = fibulaSupabase;
    if (!supabase) return;
    let active = true;
    const channels: any[] = [];
    const start = async () => {
      await supabase.realtime.setAuth();
      for (const friendId of friendIds) {
        // Each pair shares one private channel, so both clients publish presence
        // to the exact same topic and can see one another online.
        const pairKey = [userId, friendId].sort().join(':');
        const channel = supabase.channel(`fibula:presence:${pairKey}`, { config: { private: true, presence: { key: userId } } });
        const sync = () => {
          if (!active) return;
          const presences = Object.values(channel.presenceState()).flat() as Array<{ user_id?: string }>;
          const online = presences.some(member => member.user_id === friendId);
          setOnlineFriends(current => online ? [...new Set([...current, friendId])] : current.filter(id => id !== friendId));
        };
        channel.on('presence', { event: 'sync' }, sync);
        channel.subscribe(status => {
          if (status === 'SUBSCRIBED') {
            void channel.track({ user_id: userId });
            sync();
          }
        });
        channels.push(channel);
      }
    };
    setOnlineFriends([]);
    void start().catch(() => setOnlineFriends([]));
    return () => { active = false; channels.forEach(channel => void supabase.removeChannel(channel)); };
  }, [userId, friendIdsKey]);

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
        const validPeerEvent = (payload: any) => {
          const current = lobbyRef.current;
          if (!active || payload?.from !== friendId || payload?.to !== userId || current?.friendId !== friendId) return false;
          lastPeerEventAtRef.current = Date.now();
          return true;
        };
        inbox.on('broadcast', { event: 'lobby_invite' }, ({ payload }) => {
          if (!active || payload?.to !== userId || payload?.from !== friendId) return;
          setLobbyInvite(payload);
          setError('');
        });
        inbox.on('broadcast', { event: 'lobby_invite_response' }, ({ payload }) => {
          if (!active || payload?.to !== userId || payload?.from !== friendId || payload?.invite_id !== pendingInvite.current?.invite_id) return;
          if (payload.status === 'accepted') {
            const pending = pendingInvite.current;
            pendingInvite.current = null;
            void joinLobby(pending.room_topic, pending.to, pending.target_name, 'host');
          } else if (payload.status === 'declined') {
            pendingInvite.current = null;
            setNotice('Seu convite de lobby foi recusado.');
          }
        });
        inbox.on('broadcast', { event: 'duo_ready' }, ({ payload }) => {
          if (!validPeerEvent(payload)) return;
          markConnected(friendId, payload, inbox, true);
        });
        inbox.on('broadcast', { event: 'duo_ready_ack' }, ({ payload }) => {
          if (!validPeerEvent(payload)) return;
          markConnected(friendId, payload, inbox, false);
        });
        inbox.on('broadcast', { event: 'duo_ping' }, ({ payload }) => {
          const current = lobbyRef.current;
          if (!validPeerEvent(payload) || current?.status !== 'connected') return;
        });
        inbox.on('broadcast', { event: 'duo_ready_state' }, ({ payload }) => {
          const current = lobbyRef.current;
          if (!validPeerEvent(payload) || current?.status !== 'connected' || typeof payload.ready !== 'boolean') return;
          current.peerReady = payload.ready;
          publishLobby();
        });
        inbox.on('broadcast', { event: 'duo_left' }, ({ payload }) => {
          if (!validPeerEvent(payload)) return;
          clearLobby();
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
      clearDuoTimers();
      inboxChannels.current.clear();
      channels.forEach(channel => void supabase.removeChannel(channel));
    };
  }, [userId, friendIdsKey]);

  const sendLobbyInvite = async (friendId: string) => {
    if (!fibulaSupabase || !onlineFriends.includes(friendId) || pendingInvite.current) return;
    const roomTopic = `fibula:duo:${[userId, friendId].sort().join(':')}`;
    const invite = { invite_id: crypto.randomUUID(), from: userId, to: friendId, room_topic: roomTopic, sender_name: profilesRef.current[userId]?.display_name || 'Seu amigo', target_name: profilesRef.current[friendId]?.display_name || 'Seu amigo', role: 'host' as const };
    const channel = inboxChannels.current.get(friendId);
    if (!channel || !connectedInboxFriends.includes(friendId)) {
      setError('O canal de convites ainda não está conectado. Feche e abra a lista de amigos para tentar novamente.');
      return;
    }
    try {
      setError('');
      pendingInvite.current = invite;
      const result = await channel.send({ type: 'broadcast', event: 'lobby_invite', payload: invite });
      if (result !== 'ok') throw new Error(`O Realtime recusou o envio do convite (resultado: ${String(result)}).`);
      setNotice(`Convite enviado para ${invite.target_name}. Aguardando resposta.`);
    } catch (cause) {
      pendingInvite.current = null;
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o convite.');
    }
  };

  const answerLobbyInvite = async (status: 'accepted' | 'declined') => {
    if (!fibulaSupabase || !lobbyInvite) return;
    const invite = lobbyInvite;
    const channel = inboxChannels.current.get(invite.from);
    if (!channel || !connectedInboxFriends.includes(invite.from)) {
      setError('O canal de convites ainda não está conectado. Não foi possível responder.');
      return;
    }
    try {
      setError('');
      const result = await channel.send({ type: 'broadcast', event: 'lobby_invite_response', payload: { invite_id: invite.invite_id, from: userId, to: invite.from, status } });
      if (result !== 'ok') throw new Error(`O Realtime recusou a resposta (resultado: ${String(result)}).`);
      setLobbyInvite(null);
      if (status === 'accepted') void joinLobby(invite.room_topic, invite.from, invite.sender_name || 'Seu amigo', 'guest');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível responder ao convite.');
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
      {mode === 'friend' && <div className="lobby-friend-actions">{onlineFriends.includes(otherId) ? <button type="button" disabled={Boolean(pendingInvite.current) || !connectedInboxFriends.includes(otherId)} onClick={() => void sendLobbyInvite(otherId)}>{connectedInboxFriends.includes(otherId) ? 'Convidar' : 'Conectando...'}</button> : <span className="lobby-friend-pending">Offline</span>}</div>}
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
    {lobbyInvite && <div className="duo-lobby-invite-toast" role="dialog"><strong>{lobbyInvite.sender_name || 'Seu amigo'} convidou você para o lobby</strong><div><button type="button" onClick={() => void answerLobbyInvite('accepted')}>Aceitar</button><button type="button" className="secondary" onClick={() => void answerLobbyInvite('declined')}>Recusar</button></div></div>}
  </>;
}
