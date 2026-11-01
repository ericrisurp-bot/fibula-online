import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
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
type Props = { userId: string; onClose: () => void };

const AVATARS = {
  guerreiro: { label: 'Guerreiro', icon: '⚔️' },
  mago: { label: 'Mago', icon: '🔮' },
  arqueiro: { label: 'Arqueiro', icon: '🏹' },
  druida: { label: 'Druida', icon: '🌿' },
} as const;

export default function FriendsModal({ userId, onClose }: Props) {
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, FriendProfile>>({});
  const [searchName, setSearchName] = useState('');
  const [searching, setSearching] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
      const ids = [...new Set(rows.flatMap(row => [row.sender_id, row.receiver_id]).filter(id => id !== userId))];
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
      <div className="lobby-friend-identity">
        <strong>{profile?.display_name || 'Jogador sem nome'}</strong>
        <small>{mode === 'friend' ? avatar.label : mode === 'incoming' ? 'Enviou um convite' : 'Convite enviado · aguardando'}</small>
      </div>
      {mode === 'incoming' && <div className="lobby-friend-actions">
        <button type="button" disabled={actingId === request.id} onClick={() => void answerRequest(request, 'accepted')}>Aceitar</button>
        <button type="button" className="secondary" disabled={actingId === request.id} onClick={() => void answerRequest(request, 'declined')}>Recusar</button>
      </div>}
      {mode === 'outgoing' && <span className="lobby-friend-pending">Pendente</span>}
    </article>;
  };

  return <div className="lobby-friends-backdrop" onClick={onClose}>
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
            <button type="submit" disabled={searching || searchName.trim().length < 3}>{searching ? 'Buscando...' : 'Enviar convite'}</button></div>
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
  </div>;
}
