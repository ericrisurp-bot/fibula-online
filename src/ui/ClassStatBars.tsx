import { useEffect, useRef } from 'react';
import { ATTRIBUTE_USAGE, getDamageMultiplier, getPlayerAttributes } from '../game/attributes';
import { drawLadino } from '../game/ladino';
import { CONFIG, type ClassId, type WeaponId } from '../game/config';

const CLASS_IDS: ClassId[] = ['guerreiro', 'mago', 'arqueiro', 'druida'];
const CLASS_WEAPONS: Record<ClassId, WeaponId> = { guerreiro: 'espada', mago: 'cajado', arqueiro: 'arco', druida: 'bastao' };

export const CLASS_STAT_ICONS = { hp: '❤️', damage: '⚔️', attackSpeed: '⚡', mobility: '👢' } as const;
export const CLASS_STORIES: Record<ClassId, string> = {
  guerreiro: 'Curta distância, armadura pesada e nenhum medo de apanhar. O guerreiro resolve tudo de frente: entra no meio da horda, segura a pancada e responde com a espada, empurrando quem chegar perto. Para ele, a melhor tática é ser o último a ficar de pé.',
  mago: 'Frágil no corpo, devastador na mente. O mago prefere ficar longe da pancadaria e deixar o cajado trabalhar: a cada quarto disparo, uma explosão varre o grupo inteiro. Se o inimigo chegar perto, algo deu errado, mas até lá ele já fez muito estrago.',
  arqueiro: 'Veloz e sempre em movimento, o arqueiro nunca briga de perto. Mantém a distância e resolve tudo com uma flecha, ou com várias: elas atravessam os inimigos. Quando o fôlego aperta, recupera um pouco de vida entre os disparos.',
  druida: 'Guardião do mato, o druida não corre atrás da vitória: deixa a natureza trabalhar. Retarda quem avança, envenena quem insiste e ataca de longe com seu cajado. Quando o inimigo percebe, já está devagar, doente e cercado.',
};
const CLASS_LABELS: Record<ClassId, string> = { guerreiro: 'Guerreiro', mago: 'Mago', arqueiro: 'Arqueiro', druida: 'Druida' };
const DUEL_DEFINITIONS = [
  { key: 'damage', left: 'Dano físico', leftIcon: '⚔️', right: 'Dano mágico', rightIcon: '✨' },
  { key: 'survival', left: 'Sobrevivência', leftIcon: '❤️', right: 'Mobilidade', rightIcon: '👢' },
  { key: 'armor', left: 'Armadura', leftIcon: '🛡️', right: 'Vel. de ataque', rightIcon: '⚡' },
] as const;
type DuelKey = typeof DUEL_DEFINITIONS[number]['key'];
type DuelShare = { left: number; right: number };
export type ClassDuelPercentages = Record<ClassId, Record<DuelKey, DuelShare>>;

// O orbe de cura do Druida vale 14 HP; killEnemy() no engine confirma esse valor.
const DRUID_HEALING_ORB_VALUE = 14;

function getRawDuelValues() {
  const multipliers = CONFIG.attributes.classMultipliers;
  const physicalDamage = (id: ClassId) => ATTRIBUTE_USAGE[id].forca * multipliers[id].forca + ATTRIBUTE_USAGE[id].destreza * multipliers[id].destreza;
  const magicalDamage = (id: ClassId) => ATTRIBUTE_USAGE[id].inteligencia * multipliers[id].inteligencia;
  const mobility = (id: ClassId) => (multipliers[id].velocidadeMovimento + multipliers[id].esquiva) / 2;
  const defensiveBase = (id: ClassId) => (multipliers[id].vida + multipliers[id].armadura) / 2;
  // Cura simples por ação: Druida cura por acertos básicos e orbes; Arqueiro por flechas.
  const healingRate = (id: ClassId) => id === 'druida'
    ? CONFIG.druidHeal.basicHitAmount / CONFIG.druidHeal.basicHitsPerHeal + DRUID_HEALING_ORB_VALUE / CONFIG.druidHeal.killsPerOrb
    : id === 'arqueiro' ? CONFIG.archerHeal.amount / CONFIG.archerHeal.arrowsPerHeal : 0;
  const maxHealing = Math.max(...CLASS_IDS.map(healingRate));
  const maxDefense = Math.max(...CLASS_IDS.map(defensiveBase));
  const survival = (id: ClassId) => defensiveBase(id) + (maxHealing > 0 ? healingRate(id) / maxHealing * maxDefense * 0.25 : 0);
  return Object.fromEntries(CLASS_IDS.map(id => [id, {
    physicalDamage: physicalDamage(id), magicalDamage: magicalDamage(id), survival: survival(id), mobility: mobility(id),
    armor: multipliers[id].armadura, attackSpeed: multipliers[id].velocidadeAtaque,
  }])) as Record<ClassId, { physicalDamage: number; magicalDamage: number; survival: number; mobility: number; armor: number; attackSpeed: number }>;
}
function normalizedValue(values: Record<ClassId, number>, id: ClassId) {
  const best = Math.max(...CLASS_IDS.map(classId => values[classId]));
  return best > 0 ? values[id] / best : 0;
}
/** Normaliza cada lado pelo melhor valor entre classes e divide a barra em 100%. */
export function deriveClassDuelPercentages(): ClassDuelPercentages {
  const raw = getRawDuelValues();
  const valuesFor = (key: keyof typeof raw.guerreiro) =>
    Object.fromEntries(CLASS_IDS.map(id => [id, raw[id][key]])) as Record<ClassId, number>;
  const keys = {
    physicalDamage: valuesFor('physicalDamage'), magicalDamage: valuesFor('magicalDamage'),
    survival: valuesFor('survival'), mobility: valuesFor('mobility'),
    armor: valuesFor('armor'), attackSpeed: valuesFor('attackSpeed'),
  };
  const duel = (leftKey: keyof typeof keys, rightKey: keyof typeof keys, id: ClassId): DuelShare => {
    const left = normalizedValue(keys[leftKey], id), right = normalizedValue(keys[rightKey], id), total = left + right;
    if (total === 0) return { left: 50, right: 50 };
    const leftPercent = Math.round(left / total * 100);
    return { left: leftPercent, right: 100 - leftPercent };
  };
  return Object.fromEntries(CLASS_IDS.map(id => [id, {
    damage: duel('physicalDamage', 'magicalDamage', id), survival: duel('survival', 'mobility', id), armor: duel('armor', 'attackSpeed', id),
  }])) as ClassDuelPercentages;
}

export function ClassFace({ classId, size = 36 }: { classId: ClassId; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(32, 66);
    drawLadino(ctx, classId, 30, { walking: false, phase: 0, breath: 0, carry: false, direction: 'front' });
    ctx.restore();
  }, [classId]);
  return <canvas ref={canvasRef} className={`class-face class-face-${classId}`} width={64} height={64} style={{ width: size, height: size }} role="img" aria-label={`Rosto do personagem ${CLASS_LABELS[classId]}`} />;
}

function PreferenceStar({ active, kind, label, onClick }: { active: boolean; kind: 'primary' | 'secondary'; label: string; onClick: () => void }) {
  return <button type="button" className={`class-preference-star ${kind}${active ? ' is-active' : ''}`} aria-pressed={active} aria-label={label} onClick={onClick}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.8 5.7 6.3.9-4.55 4.43 1.08 6.27L12 17.14l-5.63 2.96 1.08-6.27L2.9 9.4l6.3-.9L12 2.8Z" /></svg>
  </button>;
}

export default function ClassStatBars({ classId, preferences, onPreferencesChange }: {
  classId: ClassId; preferences: [ClassId | null, ClassId | null]; onPreferencesChange: (next: [ClassId | null, ClassId | null]) => void;
}) {
  const weapon = CONFIG.weapons[CLASS_WEAPONS[classId]];
  const attributes = getPlayerAttributes(classId, 0);
  // At level zero these resolve to the same CONFIG.player base values shown in the former profile.
  const initialMobility = CONFIG.player.speed + (attributes.velocidadeMovimento - CONFIG.attributes.baseValue) * CONFIG.attributes.effectPerPointGained.velocidadeMovimento;
  const initialDamage = weapon.damage * getDamageMultiplier(classId, 0);
  const stats = [
    { key: 'hp', icon: CLASS_STAT_ICONS.hp, label: 'HP inicial', value: CONFIG.attributes.classStartHealth[classId].toString() },
    { key: 'damage', icon: CLASS_STAT_ICONS.damage, label: 'Dano inicial', value: initialDamage.toFixed(0) },
    { key: 'attackSpeed', icon: CLASS_STAT_ICONS.attackSpeed, label: 'Vel. de ataque', value: weapon.attackSpeed.toFixed(2) },
    
    { key: 'mobility', icon: CLASS_STAT_ICONS.mobility, label: 'Vel. movimento', value: initialMobility.toFixed(0) },
  ];
  const duels = deriveClassDuelPercentages()[classId];
  const setPreference = (slot: 0 | 1) => onPreferencesChange(preferences[slot] === classId
    ? (slot === 0 ? [null, preferences[1]] : [preferences[0], null])
    : (slot === 0 ? [classId, preferences[1] === classId ? null : preferences[1]] : [preferences[0] === classId ? null : preferences[0], classId]));

  return <div className={`class-page-content class-${classId}`}>
    <section className="class-initial-stats" aria-label="Status iniciais">
      {stats.map(stat => <article className="class-initial-stat" key={stat.key}><span className="class-initial-stat-icon" aria-hidden="true">{stat.icon}</span><span className="class-initial-stat-label">{stat.label}</span><strong>{stat.value}</strong></article>)}
    </section>
    <section className="class-duels" aria-label="Duelos de atributos">
      {DUEL_DEFINITIONS.map(def => {
        const share = duels[def.key], leftWins = share.left >= share.right;
        return <article className="class-duel" key={def.key}>
          <div className="class-duel-labels">
            <span className={leftWins ? 'duel-side-winner' : 'duel-side-loser'}><i aria-hidden="true">{def.leftIcon}</i>{def.left}</span>
            <strong>{share.left}% <small>×</small> {share.right}%</strong>
            <span className={!leftWins ? 'duel-side-winner' : 'duel-side-loser'}>{def.right}<i aria-hidden="true">{def.rightIcon}</i></span>
          </div>
          <div className="class-duel-track" role="img" aria-label={`${def.left} ${share.left} por cento; ${def.right} ${share.right} por cento`}>
            <span className={`class-duel-left ${leftWins ? 'is-winner' : 'is-loser'}`} style={{width:`${share.left}%`}}/><span className={`class-duel-right ${!leftWins ? 'is-winner' : 'is-loser'}`} style={{width:`${share.right}%`}}/>
          </div>
        </article>;
      })}
    </section>
    <section className="class-preferences" aria-label="Preferência da classe"><h3>Preferência</h3><div className="class-preference-options">
      <div><PreferenceStar kind="primary" active={preferences[0] === classId} label={`Definir ${CLASS_LABELS[classId]} como principal`} onClick={() => setPreference(0)}/><span>Principal</span></div>
      <div><PreferenceStar kind="secondary" active={preferences[1] === classId} label={`Definir ${CLASS_LABELS[classId]} como secundária`} onClick={() => setPreference(1)}/><span>Secundária</span></div>
    </div></section>
    <blockquote className="class-story-card"><span className="class-story-quote" aria-hidden="true">“</span><p>{CLASS_STORIES[classId]}</p></blockquote>
  </div>;
}
