import { useEffect, useRef } from 'react';
import { ATTRIBUTE_USAGE, getDamageMultiplier } from '../game/attributes';
import { drawLadino } from '../game/ladino';
import { CONFIG, type ClassId, type WeaponId } from '../game/config';

const CLASS_IDS: ClassId[] = ['guerreiro', 'mago', 'arqueiro', 'druida'];
const CLASS_WEAPONS: Record<ClassId, WeaponId> = { guerreiro: 'espada', mago: 'cajado', arqueiro: 'arco', druida: 'bastao' };

export const CLASS_STAT_ICONS = { hp: '❤️', damage: '⚔️', attackSpeed: '⚡', armor: '🛡️', mobility: '🥾', damagePerSecond: '💥', enemiesPerSecond: '👾', hits: '🛡️', range: '🎯' } as const;
export const CLASS_STORIES: Record<ClassId, string> = {
  guerreiro: 'A linha de frente de Fíbula. A espada resolve o combate de perto, enquanto a maior reserva de vida e a armadura ajudam a segurar a horda quando o cerco fecha.',
  mago: 'O poder arcano vem de longe: o cajado mantém a pressão e cada quarto disparo explode. Sua força é enorme, mas sua defesa exige distância e posicionamento.',
  arqueiro: 'Precisão e movimento. As flechas alcançam longe e atravessam a linha de inimigos; sequências de acertos devolvem vida para continuar sempre em movimento.',
  druida: 'A natureza luta ao seu lado. O cajado mantém distância, enquanto lentidão, veneno e cura sustentam o combate por mais tempo.'
};
const CLASS_LABELS: Record<ClassId, string> = { guerreiro: 'Guerreiro', mago: 'Mago', arqueiro: 'Arqueiro', druida: 'Druida' };
const DUEL_DEFINITIONS = [
  { key: 'damage', left: 'Dano físico', leftIcon: '⚔️', right: 'Dano mágico', rightIcon: '✨' },
  { key: 'survival', left: 'Sobrevivência', leftIcon: '❤️', right: 'Mobilidade', rightIcon: '🥾' },
  { key: 'armor', left: 'Armadura', leftIcon: '🛡️', right: 'Alcance', rightIcon: '🎯' },
] as const;
type DuelKey = typeof DUEL_DEFINITIONS[number]['key'];
type DuelShare = { left: number; right: number };
export type ClassDuelPercentages = Record<ClassId, Record<DuelKey, DuelShare>>;

// O orbe de cura do Druida vale 14 HP; killEnemy() no engine confirma esse valor.
const DRUID_HEALING_ORB_VALUE = 14;

const BASE_LEVEL = 0;
const FIRST_NIGHT = 1;

export type ComputedClassStats = {
  damagePerSecond: number;
  enemiesPerSecond: number;
  hitsToSurvive: number;
  range: number;
};

/** Estatísticas de combate da classe no nível zero, sem equipamento ou bônus de arsenal. */
export function computeClassStats(classId: ClassId): ComputedClassStats {
  const weapon = CONFIG.weapons[CLASS_WEAPONS[classId]];
  const playerAttributes = getPlayerAttributes(classId, BASE_LEVEL);
  const initialDamage = weapon.damage * getDamageMultiplier(classId, BASE_LEVEL);
  const attacksPerSecond = weapon.attackSpeed;
  const damagePerSecond = initialDamage * attacksPerSecond;

  const firstNightEnemyHealth = CONFIG.enemy.health
    + (FIRST_NIGHT - 1) * CONFIG.enemy.healthPerWave;
  const firstNightContactDamage = CONFIG.enemy.contactDamage
    + Math.floor((FIRST_NIGHT - 1) / CONFIG.enemy.contactDamageEveryWaves) * CONFIG.enemy.contactDamageIncrease;
  const levelZeroArmor = (playerAttributes.armadura - CONFIG.attributes.baseValue) * CONFIG.attributes.effectPerPointGained.armadura;
  const damageTakenPerHit = Math.max(1, Math.round(
    firstNightContactDamage - CONFIG.player.armor - levelZeroArmor,
  ));
  const initialHealth = CONFIG.attributes.classStartHealth[classId];

  return {
    damagePerSecond,
    enemiesPerSecond: firstNightEnemyHealth > 0 ? damagePerSecond / firstNightEnemyHealth : 0,
    hitsToSurvive: Math.floor(initialHealth / damageTakenPerHit),
    range: weapon.range,
  };
}

function getRawDuelValues() {
  const multipliers = CONFIG.attributes.classMultipliers;
  const physicalDamage = (id: ClassId) => ATTRIBUTE_USAGE[id].forca * multipliers[id].forca + ATTRIBUTE_USAGE[id].destreza * multipliers[id].destreza;
  const magicalDamage = (id: ClassId) => ATTRIBUTE_USAGE[id].inteligencia * multipliers[id].inteligencia;
  const mobility = (id: ClassId) => (CONFIG.player.classSpeed[id] / CONFIG.player.speed + multipliers[id].esquiva) / 2;
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
    armor: multipliers[id].armadura, range: CONFIG.weapons[CLASS_WEAPONS[id]].range,
  }])) as Record<ClassId, { physicalDamage: number; magicalDamage: number; survival: number; mobility: number; armor: number; range: number }>;
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
    armor: valuesFor('armor'), range: valuesFor('range'),
  };
  const duel = (leftKey: keyof typeof keys, rightKey: keyof typeof keys, id: ClassId): DuelShare => {
    const left = normalizedValue(keys[leftKey], id), right = normalizedValue(keys[rightKey], id), total = left + right;
    if (total === 0) return { left: 50, right: 50 };
    const leftPercent = Math.round(left / total * 100);
    return { left: leftPercent, right: 100 - leftPercent };
  };
  return Object.fromEntries(CLASS_IDS.map(id => [id, {
    damage: duel('physicalDamage', 'magicalDamage', id), survival: duel('survival', 'mobility', id), armor: duel('armor', 'range', id),
  }])) as ClassDuelPercentages;
}

export function ClassFace({ classId, size = 36 }: { classId: ClassId; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#fffdf8';
    ctx.fillRect(0, 0, size, size);
    // Usa o mesmo Ladino encapuzado renderizado no perfil, mantendo a silhueta oficial
    // e variando somente a paleta de cada classe.
    ctx.translate(size / 2, size * 1.05);
    drawLadino(ctx, classId, 16, { walking: false, phase: 0, breath: 0, carry: false, direction: 'front' });
    ctx.restore();
  }, [classId, size]);
  return <canvas
    ref={canvasRef}
    className={`class-face class-face-${classId}`}
    width={size}
    height={size}
    role="img"
    aria-label={`Rosto do personagem ${CLASS_LABELS[classId]}`}
  />;
}

function PreferenceStar({ active, kind, label, onClick }: { active: boolean; kind: 'primary' | 'secondary'; label: string; onClick: () => void }) {
  return <button type="button" className={`class-preference-star ${kind}${active ? ' is-active' : ''}`} aria-pressed={active} aria-label={label} onClick={onClick}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.8 5.7 6.3.9-4.55 4.43 1.08 6.27L12 17.14l-5.63 2.96 1.08-6.27L2.9 9.4l6.3-.9L12 2.8Z" /></svg>
  </button>;
}

export function ClassDuelBars({ classId }: { classId: ClassId }) {
  const duels = deriveClassDuelPercentages()[classId];
  return <section className="class-duels" aria-label={`Comparativos de atributos: ${CLASS_LABELS[classId]}`}>
    {DUEL_DEFINITIONS.map(def => {
      const share = duels[def.key];
      return <article className="class-duel" key={def.key}>
        <div className="class-duel-labels">
          <span className={share.left > share.right ? 'duel-side-winner' : 'duel-side-loser'}><i aria-hidden="true">{def.leftIcon}</i><span>{def.left}</span><b>{share.left}%</b></span>
          <span className={share.right > share.left ? 'duel-side-winner' : 'duel-side-loser'}><i aria-hidden="true">{def.rightIcon}</i><span>{def.right}</span><b>{share.right}%</b></span>
        </div>
        <div className="class-duel-track" role="img" aria-label={`${def.left} ${share.left} por cento; ${def.right} ${share.right} por cento`}>
          <span className={`class-duel-left ${share.left > share.right ? 'is-winner' : 'is-loser'}`} style={{width:`${share.left}%`}}/><span className={`class-duel-right ${share.right > share.left ? 'is-winner' : 'is-loser'}`} style={{width:`${share.right}%`}}/><i className="class-duel-divider" style={{left:`${share.left}%`}} aria-hidden="true" />
        </div>
      </article>;
    })}
  </section>;
}
export default function ClassStatBars({ classId, preferences, onPreferencesChange }: {
  classId: ClassId; preferences: [ClassId | null, ClassId | null]; onPreferencesChange: (next: [ClassId | null, ClassId | null]) => void;
}) {
  const weapon = CONFIG.weapons[CLASS_WEAPONS[classId]];
  const initialMobility = CONFIG.player.classSpeed[classId];
  const initialDamage = weapon.damage * getDamageMultiplier(classId, 0);
  const stats = [
    { key: 'hp', icon: CLASS_STAT_ICONS.hp, label: 'HP inicial', value: CONFIG.attributes.classStartHealth[classId].toString() },
    { key: 'damage', icon: CLASS_STAT_ICONS.damage, label: 'Dano inicial', value: initialDamage.toFixed(0) },
    { key: 'attackSpeed', icon: CLASS_STAT_ICONS.attackSpeed, label: 'Ataques/s', value: weapon.attackSpeed.toFixed(2) },
    { key: 'mobility', icon: CLASS_STAT_ICONS.mobility, label: 'Vel. de movimento', value: initialMobility.toFixed(0) },
  ];
  const computedStats = computeClassStats(classId);
  const computedStatCards = [
    { key: 'damagePerSecond', icon: CLASS_STAT_ICONS.damagePerSecond, label: 'Dano por segundo', value: computedStats.damagePerSecond.toFixed(1) },
    { key: 'enemiesPerSecond', icon: CLASS_STAT_ICONS.enemiesPerSecond, label: 'Inimigos/s (1 alvo)', value: computedStats.enemiesPerSecond.toFixed(2) },
    { key: 'hits', icon: CLASS_STAT_ICONS.hits, label: 'Aguenta (golpes)', value: computedStats.hitsToSurvive.toString() },
    { key: 'range', icon: CLASS_STAT_ICONS.range, label: 'Alcance', value: computedStats.range.toFixed(0) },
  ];
  const setPreference = (slot: 0 | 1) => onPreferencesChange(preferences[slot] === classId
    ? (slot === 0 ? [null, preferences[1]] : [preferences[0], null])
    : (slot === 0 ? [classId, preferences[1] === classId ? null : preferences[1]] : [preferences[0] === classId ? null : preferences[0], classId]));

  return <div className={`class-page-content class-${classId}`}>
    <section className="class-initial-stats" aria-label="Status iniciais">
      {stats.map(stat => <article className="class-initial-stat" key={stat.key}><span className="class-initial-stat-icon" aria-hidden="true">{stat.icon}</span><span className="class-initial-stat-label">{stat.label}</span><strong>{stat.value}</strong></article>)}
    </section>
    <ClassDuelBars classId={classId} />
    <section className="class-preferences" aria-label="Preferência da classe"><h3>Preferência</h3><div className="class-preference-options">
      <div><PreferenceStar kind="primary" active={preferences[0] === classId} label={`Definir ${CLASS_LABELS[classId]} como principal`} onClick={() => setPreference(0)}/><span>Principal</span></div>
      <div><PreferenceStar kind="secondary" active={preferences[1] === classId} label={`Definir ${CLASS_LABELS[classId]} como secundária`} onClick={() => setPreference(1)}/><span>Secundária</span></div>
    </div></section>
    <blockquote className="class-story-card"><span className="class-story-quote" aria-hidden="true">“</span><p>{CLASS_STORIES[classId]}</p></blockquote>
    <section className="class-computed-stats" aria-label="Estatísticas">
      <h3>Estatísticas</h3>
      <div className="class-computed-stat-grid">
        {computedStatCards.map(stat => <article className="class-computed-stat" key={stat.key}>
          <span className="class-computed-stat-icon" aria-hidden="true">{stat.icon}</span>
          <span className="class-computed-stat-label">{stat.label}</span>
          <strong>{stat.value}</strong>
        </article>)}
      </div>
    </section>
  </div>;
}
