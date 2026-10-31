import { useEffect, useState, type FormEvent } from 'react';
import { fibulaSupabase } from '../auth/supabase';
import type { ClassId } from '../game/config';

type PlayerProfile = {
  user_id: string;
  display_name: string | null;
  age: number | null;
  sex: 'masculino' | 'feminino' | 'outro' | null;
  main_character: ClassId | null;
  level: number;
  kills: number;
  attributes: Record<string, number>;
  created_at: string;
};

type Props = {
  userId: string;
  isOwner: boolean;
  currentCharacter: ClassId;
  level: number;
  kills: number;
  attributes: Record<string, number>;
  onClose: () => void;
};

const CLASS_INFO: Record<ClassId, { name: string; icon: string }> = {
  guerreiro: { name: 'Guerreiro', icon: '⚔️' },
  mago: { name: 'Mago', icon: '🔮' },
  arqueiro: { name: 'Arqueiro', icon: '🏹' },
  druida: { name: 'Druida', icon: '🌿' },
};

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

export default function PlayerProfileModal({
  userId, isOwner, currentCharacter, level, kills, attributes, onClose,
}: Props) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!fibulaSupabase) {
        setError('O banco de dados do Fíbula não está configurado neste ambiente.');
        setLoading(false);
        return;
      }
      try {
        const { data, error: queryError } = await fibulaSupabase
          .from('fibula_profiles')
          .select('user_id,display_name,age,sex,main_character,level,kills,attributes,created_at')
          .eq('user_id', userId)
          .maybeSingle();
        if (queryError) throw queryError;
        if (!data && isOwner) {
          const { error: insertError } = await fibulaSupabase
            .from('fibula_profiles')
            .upsert(
              { user_id: userId, main_character: currentCharacter, level, kills, attributes },
              { onConflict: 'user_id', ignoreDuplicates: true },
            );
          if (insertError) throw insertError;
          const { data: created, error: reloadError } = await fibulaSupabase
            .from('fibula_profiles')
            .select('user_id,display_name,age,sex,main_character,level,kills,attributes,created_at')
            .eq('user_id', userId)
            .single();
          if (reloadError) throw reloadError;
          if (active) setProfile(created as PlayerProfile);
        } else if (data && isOwner) {
          const { data: refreshed, error: refreshError } = await fibulaSupabase
            .from('fibula_profiles')
            .update({ main_character: currentCharacter, level, kills, attributes, updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .select('user_id,display_name,age,sex,main_character,level,kills,attributes,created_at')
            .single();
          if (refreshError) throw refreshError;
          if (active) setProfile(refreshed as PlayerProfile);
        } else if (active) {
          setProfile(data as PlayerProfile | null);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o perfil.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [userId, isOwner, currentCharacter, level, kills]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? '');
    setAge(profile.age === null ? '' : String(profile.age));
    setSex(profile.sex ?? '');
  }, [profile]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fibulaSupabase || !isOwner || !profile) return;
    const cleanName = displayName.trim().replace(/\s+/g, ' ');
    const parsedAge = age.trim() ? Number(age) : null;
    if (cleanName.length < 3 || cleanName.length > 20) {
      setError('O nome precisa ter entre 3 e 20 caracteres.');
      return;
    }
    if (parsedAge !== null && (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120)) {
      setError('Informe uma idade válida ou deixe o campo vazio.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data, error: updateError } = await fibulaSupabase
        .from('fibula_profiles')
        .update({
          display_name: cleanName,
          age: parsedAge,
          sex: sex || null,
          main_character: currentCharacter,
          level,
          kills,
          attributes,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .select('user_id,display_name,age,sex,main_character,level,kills,attributes,created_at')
        .single();
      if (updateError) throw updateError;
      setProfile(data as PlayerProfile);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o perfil.');
    } finally {
      setSaving(false);
    }
  };

  const character = profile?.main_character ? CLASS_INFO[profile.main_character] : CLASS_INFO[currentCharacter];
  const createdAt = profile?.created_at ? new Date(profile.created_at) : null;
  const accountDays = createdAt ? Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86_400_000)) : 0;

  return <div className="player-profile-backdrop" onClick={onClose}>
    <section className="player-profile-modal" role="dialog" aria-modal="true" aria-labelledby="player-profile-title" onClick={event => event.stopPropagation()}>
      <header className="player-profile-header">
        <div><span>IDENTIDADE DO FÍBULA ONLINE</span><h2 id="player-profile-title">Perfil do jogador</h2></div>
        <button type="button" className="player-profile-close" aria-label="Fechar perfil" onClick={onClose}>×</button>
      </header>
      {loading ? <p className="player-profile-message">Carregando perfil...</p> : !profile ? <p className="player-profile-message">{error || 'Este jogador ainda não criou um perfil.'}</p> : <>
        <div className="player-profile-content">
          <div className="player-profile-hero">
            <div className={`player-profile-avatar class-${profile.main_character ?? currentCharacter}`} aria-hidden="true">{character.icon}</div>
            <div><span>PERSONAGEM PRINCIPAL</span><h3>{profile.display_name || 'Nome ainda não escolhido'}</h3><p>{character.name} · Nível {profile.level}</p></div>
          </div>
          {editing && isOwner ? <form className="player-profile-form" onSubmit={save}>
            <label>Nome de jogador<input value={displayName} onChange={event => setDisplayName(event.target.value)} minLength={3} maxLength={20} placeholder="Escolha seu nome" required /></label>
            <label>Idade <small>(opcional)</small><input type="number" min="1" max="120" value={age} onChange={event => setAge(event.target.value)} placeholder="Não informado" /></label>
            <label>Sexo <small>(opcional)</small><select value={sex} onChange={event => setSex(event.target.value)}><option value="">Prefiro não informar</option><option value="masculino">Masculino</option><option value="feminino">Feminino</option><option value="outro">Outro</option></select></label>
            <div className="player-profile-actions"><button type="button" className="secondary" onClick={() => { setEditing(false); setError(''); }}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar perfil'}</button></div>
          </form> : <>
            <div className="player-profile-details">
              <div><span>IDADE</span><strong>{profile.age ? `${profile.age} anos` : 'Não informada'}</strong></div>
              <div><span>SEXO</span><strong>{profile.sex ? profile.sex.charAt(0).toUpperCase() + profile.sex.slice(1) : 'Não informado'}</strong></div>
              <div><span>CONTA NO FÍBULA DESDE</span><strong>{createdAt ? DATE_FORMAT.format(createdAt) : '—'}</strong><small>{createdAt ? `Há ${accountDays} dias` : ''}</small></div>
              <div><span>PROGRESSO</span><strong>Nível {profile.level} · {profile.kills} eliminações</strong></div>
            </div>
            <section className="player-profile-attributes"><h4>Atributos do personagem</h4><div>
              {Object.entries(profile.attributes ?? {}).map(([key, value]) => <div key={key}><span>{key}</span><strong>{Number(value).toFixed(1)}</strong></div>)}
              {!Object.keys(profile.attributes ?? {}).length && <small>Os atributos aparecerão conforme o personagem evoluir.</small>}
            </div></section>
            {isOwner && <button type="button" className="player-profile-edit" onClick={() => { setEditing(true); setError(''); }}>{profile.display_name ? 'Editar perfil' : 'Criar meu perfil'}</button>}
          </>}
          {error && <p className="player-profile-error" role="alert">{error}</p>}
        </div>
      </>}
      <footer className="player-profile-footer"><span>Conquistas e insígnias serão adicionadas em uma próxima etapa.</span></footer>
    </section>
  </div>;
}
