import { useEffect, useRef, useState, type FormEvent } from 'react';
import { fibulaSupabase } from '../auth/supabase';
import { useArenaAuth } from '../auth/AuthGate';
import { CONFIG, type ClassId, type WeaponId } from '../game/config';
import { drawLadino } from '../game/ladino';
import { drawFloatingWeapon } from '../game/weapons';

type PlayerProfile = {
  user_id: string;
  display_name: string | null;
  age: number | null;
  sex: 'masculino' | 'feminino' | 'outro' | null;
  main_character: ClassId | null;
  avatar_character: ClassId;
  level: number;
  kills: number;
  attributes: Record<string, number>;
  attribute_gain_per_level: number;
  highest_survival_level: number;
  highest_pd: number;
  created_at: string;
};

type Props = {
  userId: string;
  isOwner: boolean;
  currentCharacter: ClassId;
  avatarCharacter: ClassId;
  level: number;
  kills: number;
  attributes: Record<string, number>;
  onAvatarChange: (avatar: ClassId) => void;
  onClose: () => void;
};

const CLASS_INFO: Record<ClassId, { name: string; icon: string; color: string }> = {
  guerreiro: { name: 'Guerreiro', icon: '⚔️', color: '#c94f60' },
  mago: { name: 'Mago', icon: '🔮', color: '#9065d6' },
  arqueiro: { name: 'Arqueiro', icon: '🏹', color: '#c99a2e' },
  druida: { name: 'Druida', icon: '🌿', color: '#4fae6b' },
};
const CLASS_WEAPONS: Record<ClassId, WeaponId> = {
  guerreiro: 'espada', mago: 'cajado', arqueiro: 'arco', druida: 'bastao',
};
const CLASS_IDS: ClassId[] = ['guerreiro', 'mago', 'arqueiro', 'druida'];
const PROFILE_FIELDS = 'user_id,display_name,age,sex,main_character,avatar_character,level,kills,attributes,attribute_gain_per_level,highest_survival_level,highest_pd,created_at';

function getProfileErrorMessage(cause: unknown, action: 'carregar' | 'salvar'): string {
  if (cause && typeof cause === 'object') {
    const error = cause as { code?: unknown; message?: unknown; details?: unknown };
    const code = typeof error.code === 'string' ? error.code : '';
    const message = typeof error.message === 'string' ? error.message : '';
    const details = typeof error.details === 'string' ? error.details : '';
    if (code === 'PGRST205' || code === '42P01') return 'A estrutura do perfil não está disponível no Supabase do Fíbula.';
    if (code === '42501' || code === 'PGRST301' || code === '401') return 'O Supabase recusou o acesso. Verifique a integração Arena e as políticas RLS.';
    if (message) return [message, details].filter(Boolean).join(' — ');
  }
  return cause instanceof Error ? cause.message : `Não foi possível ${action} o perfil.`;
}

export default function PlayerProfileModal({
  userId, isOwner, currentCharacter, avatarCharacter, level, kills, attributes, onAvatarChange, onClose,
}: Props) {
  const { session } = useArenaAuth();
  const canEdit = isOwner && session.user.sub === userId;
  const avatarCanvasRef = useRef<HTMLCanvasElement>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<ClassId>(avatarCharacter);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (canEdit) setSelectedAvatar(avatarCharacter);
  }, [avatarCharacter, canEdit]);

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
          .from('fibula_profiles').select(PROFILE_FIELDS).eq('user_id', userId).maybeSingle();
        if (queryError) throw queryError;
        if (!data && canEdit) {
          const { error: insertError } = await fibulaSupabase.from('fibula_profiles').upsert(
            { user_id: userId, main_character: currentCharacter, level, kills, attributes },
            { onConflict: 'user_id', ignoreDuplicates: true },
          );
          if (insertError) throw insertError;
          const { data: created, error: reloadError } = await fibulaSupabase
            .from('fibula_profiles').select(PROFILE_FIELDS).eq('user_id', userId).single();
          if (reloadError) throw reloadError;
          if (active) setProfile(created as PlayerProfile);
        } else if (data && canEdit) {
          const { data: refreshed, error: refreshError } = await fibulaSupabase
            .from('fibula_profiles')
            .update({ main_character: currentCharacter, level, kills, attributes, updated_at: new Date().toISOString() })
            .eq('user_id', userId).select(PROFILE_FIELDS).single();
          if (refreshError) throw refreshError;
          if (active) setProfile(refreshed as PlayerProfile);
        } else if (active) {
          setProfile(data as PlayerProfile | null);
        }
      } catch (cause) {
        if (active) setError(getProfileErrorMessage(cause, 'carregar'));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [userId, canEdit, currentCharacter, level, kills]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? '');
    setAge(profile.age === null ? '' : String(profile.age));
    setSex(profile.sex ?? '');
    setSelectedAvatar(profile.avatar_character ?? 'guerreiro');
  }, [profile]);

  const saveIdentity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fibulaSupabase || !canEdit || !profile) return;
    const cleanName = displayName.trim().replace(/\s+/g, ' ');
    const parsedAge = age.trim() ? Number(age) : null;
    if (profile.display_name === null && (cleanName.length < 3 || cleanName.length > 20)) {
      setError('O nome precisa ter entre 3 e 20 caracteres.');
      return;
    }
    if (profile.age === null && parsedAge === null) {
      setError('Informe sua idade para concluir o perfil.');
      return;
    }
    if (profile.age === null && parsedAge !== null && (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120)) {
      setError('Informe uma idade válida entre 1 e 120 anos.');
      return;
    }
    if (profile.sex === null && !sex) {
      setError('Selecione uma opção para o campo sexo.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (profile.display_name === null) changes.display_name = cleanName;
      if (profile.age === null) changes.age = parsedAge;
      if (profile.sex === null) changes.sex = sex || null;
      const { data, error: updateError } = await fibulaSupabase
        .from('fibula_profiles').update(changes).eq('user_id', userId).select(PROFILE_FIELDS).single();
      if (updateError) throw updateError;
      setProfile(data as PlayerProfile);
      setEditing(false);
    } catch (cause) {
      setError(getProfileErrorMessage(cause, 'salvar'));
    } finally {
      setSaving(false);
    }
  };

  const saveAvatar = async (avatar: ClassId) => {
    if (!fibulaSupabase || !canEdit || !profile || savingAvatar) return;
    setSelectedAvatar(avatar);
    setSavingAvatar(true);
    setError('');
    try {
      const { data, error: updateError } = await fibulaSupabase
        .from('fibula_profiles').update({ avatar_character: avatar, updated_at: new Date().toISOString() })
        .eq('user_id', userId).select(PROFILE_FIELDS).single();
      if (updateError) throw updateError;
      setProfile(data as PlayerProfile);
      onAvatarChange(avatar);
    } catch (cause) {
      setSelectedAvatar(profile.avatar_character ?? 'guerreiro');
      setError(getProfileErrorMessage(cause, 'salvar'));
    } finally {
      setSavingAvatar(false);
    }
  };

  useEffect(() => {
    const canvas = avatarCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || 76;
    const height = canvas.clientHeight || 76;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const radius = CONFIG.player.radius;
    ctx.save();
    ctx.translate(width / 2, height * 0.78);
    ctx.scale(Math.min(width / 44, height / 58), Math.min(width / 44, height / 58));
    drawLadino(ctx, selectedAvatar, radius, { walking: false, phase: 0, breath: 0, carry: false, direction: 'front' });
    drawFloatingWeapon(ctx, CLASS_WEAPONS[profile?.main_character ?? currentCharacter], radius, {
      time: 0, facingX: 1, moving: false, hasEnemies: false, hasTarget: false,
      aimAngle: -Math.PI / 2, carried: false, swingTimer: 0, swingAngle: 0,
      forceVisible: true, preferredSide: -1,
    });
    ctx.restore();
  }, [selectedAvatar, currentCharacter, profile?.main_character]);

  const createdAt = profile?.created_at ? new Date(profile.created_at) : null;
  const identityIncomplete = !!profile && (profile.display_name === null || profile.age === null || profile.sex === null);
  const canCompleteIdentity = canEdit && identityIncomplete;
  const accountDays = createdAt ? Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86_400_000)) : 0;
  const avatarInfo = CLASS_INFO[selectedAvatar];

  return <div className="player-profile-backdrop" onClick={onClose}>
    <section className="player-profile-modal" role="dialog" aria-modal="true" aria-labelledby="player-profile-title" onClick={event => event.stopPropagation()}>
      <header className="player-profile-header">
        <div><span>IDENTIDADE DO FÍBULA ONLINE</span><h2 id="player-profile-title">Perfil do jogador</h2></div>
        <button type="button" className="player-profile-close" aria-label="Fechar perfil" onClick={onClose}>×</button>
      </header>
      {loading ? <p className="player-profile-message">Carregando perfil...</p> : !profile ? <p className="player-profile-message">{error || 'Este jogador ainda não criou um perfil.'}</p> : <>
        <div className="player-profile-content">
          <div className={`player-profile-hero class-${selectedAvatar}`}>
            <div className={`player-profile-avatar class-${selectedAvatar}`}><canvas ref={avatarCanvasRef} className="player-profile-avatar-canvas" aria-label={`Avatar: ${avatarInfo.name}`} /></div>
            <div><span>AVATAR DO PERFIL</span><h3>{profile.display_name || 'Nome ainda não escolhido'}</h3><p>{avatarInfo.name} · Nível {profile.level}</p></div>
          </div>
          <section className="player-profile-avatar-picker" aria-label="Escolher avatar">
            <div><strong>Seu avatar</strong><small>Independente da classe usada na partida</small></div>
            <div className="player-profile-avatar-options">
              {CLASS_IDS.map(classId => <button key={classId} type="button" disabled={!canEdit || savingAvatar} aria-pressed={selectedAvatar === classId}
                className={`player-profile-avatar-choice class-${classId}${selectedAvatar === classId ? ' selected' : ''}`}
                onClick={() => void saveAvatar(classId)}>
                <span aria-hidden="true">{CLASS_INFO[classId].icon}</span><b>{CLASS_INFO[classId].name}</b>
              </button>)}
            </div>
            {savingAvatar && <small role="status">Salvando avatar...</small>}
          </section>
          {editing && canEdit ? <form className="player-profile-form" onSubmit={saveIdentity}>
            {profile.display_name === null && <label>Nome de jogador<input value={displayName} onChange={event => setDisplayName(event.target.value)} minLength={3} maxLength={20} placeholder="Escolha seu nome" required /></label>}
            {profile.age === null && <label>Idade <small>(não poderá ser alterada depois)</small><input type="number" min="1" max="120" value={age} onChange={event => setAge(event.target.value)} placeholder="Sua idade" required /></label>}
            {profile.sex === null && <label>Sexo <small>(não poderá ser alterado depois)</small><select value={sex} onChange={event => setSex(event.target.value)} required><option value="">Selecione</option><option value="masculino">Masculino</option><option value="feminino">Feminino</option><option value="outro">Outro</option></select></label>}
            <div className="player-profile-actions"><button type="button" className="secondary" onClick={() => { setEditing(false); setError(''); }}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar dados'}</button></div>
          </form> : <>
            <div className="player-profile-details">
              <div><span>IDADE</span><strong>{profile.age ? `${profile.age} anos` : 'Não informada'}</strong></div>
              <div><span>SEXO</span><strong>{profile.sex ? profile.sex.charAt(0).toUpperCase() + profile.sex.slice(1) : 'Não informado'}</strong></div>
              <div><span>CONTA NO FÍBULA DESDE</span><strong>{createdAt ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(createdAt) : '—'}</strong><small>{createdAt ? `Há ${accountDays} dias` : ''}</small></div>
              <div><span>ELIMINAÇÕES</span><strong>{profile.kills}</strong></div>
              <div><span>ATRIBUTOS POR NÍVEL</span><strong>{profile.attribute_gain_per_level}</strong></div>
              <div><span>RECORDE DE SOBREVIVÊNCIA</span><strong>Nível {profile.highest_survival_level}</strong></div>
              <div><span>MAIOR PD</span><strong>{profile.highest_pd}</strong></div>
            </div>
            <section className="player-profile-attributes"><h4>Atributos do personagem</h4><div>
              {Object.entries(profile.attributes ?? {}).map(([key, value]) => <div key={key}><span>{key}</span><strong>{Number(value).toFixed(1)}</strong></div>)}
              {!Object.keys(profile.attributes ?? {}).length && <small>Os atributos aparecerão conforme o personagem evoluir.</small>}
            </div></section>
            {canCompleteIdentity && <button type="button" className="player-profile-edit" onClick={() => { setEditing(true); setError(''); }}>{profile.display_name ? 'Completar dados do perfil' : 'Criar meu perfil'}</button>}
          </>}
          {error && <p className="player-profile-error" role="alert">{error}</p>}
        </div>
      </>}
      <footer className="player-profile-footer"><span>Nome, idade e sexo ficam bloqueados depois de definidos. O avatar pode ser trocado quando quiser.</span></footer>
    </section>
  </div>;
}
