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
type Props = { userId: string; open: boolean; onClose: () => void; onOpenProfile: (userId: string) => void };

const AVATARS = {
  guerreiro: { label: 'Guerreiro', icon: '⚔️' },
  mago: { label: 'Mago', icon: '🔮' },
  arqueiro: { label: 'Arqueiro', icon: '🏹' },
  druida: { label: 'Druida', icon: '🌿' },
} as const;

export default function FriendsModal({ userId, open, onClose, onOpenProfile }: Props) {
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
  const [lobby, setLobby] = useState<any>(null);
  const [lobbyMembers, setLobbyMembers] = useState<string[]>([]);
  const [lobbyStatus, setLobbyStatus] = useState<'connecting' | 'waiting' | 'connected'>('connecting');
  const lobbyChannel = useRef<any>(null);
  const pendingInvite = useRef<any>(null);
  const inboxChannels = useRef<Map<string, any>>(new Map());
  const [connectedInboxFriends, setConnectedInboxFriends] = useState<string[]>([]);

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

  const joinLobby = async (roomTopic: string, friendId: string, friendName: string) => {
    if (!fibulaSupabase) return;
    if (lobbyChannel.current) await fibulaSupabase.removeChannel(lobbyChannel.current);
    const channel = fibulaSupabase.channel(roomTopic, { config: { private: true, presence: { key: userId } } });
    const syncMembers = () => {
      const state = channel.presenceState() as Record<string, Array<{ user_id?: string; display_name?: string }>>;
      const presences = Object.values(state).flat();
      const names = presences.map(member => member.user_id === userId ? 'Você' : friendName);
      // Keep the local player visible even if the initial presence sync arrives
      // before the server has propagated this client's track payload.
      setLobbyMembers(current => [...new Set([...names, ...(current.includes('Você') ? ['Você'] : [])])]);
      setLobbyStatus(presences.some(member => member.user_id === friendId) ? 'connected' : 'waiting');
    };
    channel.on('presence', { event: 'sync' }, syncMembers);
    channel.on('presence', { event: 'join' }, syncMembers);
    channel.on('presence', { event: 'leave' }, syncMembers);
    channel.on('broadcast', { event: 'duo_ready' }, ({ payload }) => {
      if (payload?.from !== friendId) return;
      setLobbyMembers(current => [...new Set([...current, 'Você', friendName])]);
      setLobbyStatus('connected');
    });
    channel.on('broadcast', { event: 'duo_left' }, ({ payload }) => {
      if (payload?.from !== friendId) return;
      setLobbyMembers(current => current.filter(name => name !== friendName));
      setLobbyStatus('waiting');
    });
    lobbyChannel.current = channel;
    setLobby({ roomTopic, friendId, friendName });
    setLobbyMembers([]);
    setLobbyStatus('connecting');
    try {
      await fibulaSupabase.realtime.setAuth();
      await new Promise<void>((resolve, reject) => channel.subscribe(status => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          reject(new Error('Não foi possível conectar ao canal do Lobby Duo.'));
        }
      }));
      const trackResult = await channel.track({ user_id: userId, display_name: profiles[userId]?.display_name || 'Jogador' });
      if (trackResult !== 'ok') throw new Error(`O Realtime não confirmou sua presença no Lobby Duo (${String(trackResult)}).`);
      setLobbyMembers(current => [...new Set([...current, 'Você'])]);
      setLobbyStatus('waiting');
      // Broadcast readiness as a second signal; presence remains the source of
      // truth for join/leave and the event is scoped to this accepted friend pair.
      // Reconcile the initial snapshot before sending the peer-ready signal.
      syncMembers();
      const readyResult = await channel.send({
        type: 'broadcast',
        event: 'duo_ready',
        payload: { from: userId, display_name: profiles[userId]?.display_name || 'Jogador' },
      });
      if (readyResult !== 'ok') {
        // Presence join/sync events remain authoritative if the auxiliary signal fails.
        setLobbyStatus('waiting');
      }
    } catch (cause) {
      await fibulaSupabase.removeChannel(channel);
      lobbyChannel.current = null;
      setLobby(null);
      setLobbyMembers([]);
      setLobbyStatus('connecting');
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
      for (const friendId of friendIds) {
        const pairKey = [userId, friendId].sort().join(':');
        const inbox = supabase.channel(`fibula:inbox:${pairKey}`, { config: { private: true } });
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
            void joinLobby(pending.room_topic, pending.to, pending.target_name);
          } else if (payload.status === 'declined') {
            pendingInvite.current = null;
            setNotice('Seu convite de lobby foi recusado.');
          }
        });
        channels.set(friendId, inbox);
        inboxChannels.current.set(friendId, inbox);
        await new Promise<void>((resolve, reject) => {
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
                setError(err?.message || `Falha ao conectar o canal de convites de ${profiles[friendId]?.display_name || 'um amigo'} (${status}).`);
              }
              finish(new Error(err?.message || `Falha ao conectar canal de convites (${status}).`));
            }
          });
        });
      }
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
    if (!fibulaSupabase || !onlineFriends.includes(friendId) || pendingInvite.current) return;
    const roomTopic = `fibula:duo:${[userId, friendId].sort().join(':')}`;
    const invite = { invite_id: crypto.randomUUID(), from: userId, to: friendId, room_topic: roomTopic, sender_name: profiles[userId]?.display_name || 'Seu amigo', target_name: profiles[friendId]?.display_name || 'Seu amigo' };
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
      if (status === 'accepted') void joinLobby(invite.room_topic, invite.from, invite.sender_name || 'Seu amigo');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível responder ao convite.');
    }
  };

  const leaveLobby = async () => {
    if (fibulaSupabase && lobbyChannel.current) {
      try { await lobbyChannel.current.send({ type: 'broadcast', event: 'duo_left', payload: { from: userId } }); } catch { /* Presence leave remains authoritative. */ }
      await fibulaSupabase.removeChannel(lobbyChannel.current);
    }
    lobbyChannel.current = null;
    setLobby(null);
    setLobbyMembers([]);
    setLobbyStatus('connecting');
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
    {lobby && <div className="duo-lobby-backdrop"><section className="duo-lobby-modal" role="dialog" aria-modal="true"><header><strong>Lobby Duo</strong><button type="button" onClick={() => void leaveLobby()}>×</button></header><p>Vocês estão no mesmo lobby compartilhado.</p><div className="duo-lobby-members">{lobbyMembers.map((name, index) => <span key={index}>{name}</span>)}{lobbyStatus === 'connecting' && !lobbyMembers.length && <span>Conectando ao lobby...</span>}{lobbyStatus === 'waiting' && <span>Aguardando seu amigo entrar...</span>}{lobbyStatus === 'connected' && <span>Lobby conectado!</span>}</div><button type="button" onClick={() => void leaveLobby()}>Sair do lobby</button></section></div>}
  </>;
}
