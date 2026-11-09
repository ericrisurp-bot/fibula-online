import { ATTRIBUTE_USAGE, getDamageMultiplier, getPlayerAttributes } from '../game/attributes';
import { CONFIG, type ClassId, type WeaponId } from '../game/config';

const CLASS_IDS: ClassId[] = ['guerreiro', 'mago', 'arqueiro', 'druida'];
const CLASS_WEAPONS: Record<ClassId, WeaponId> = { guerreiro: 'espada', mago: 'cajado', arqueiro: 'arco', druida: 'bastao' };

export const CLASS_STAT_ICONS = { hp: '❤️', damage: '⚔️', attackSpeed: '⚡', armor: '🛡️', mobility: '👢', damagePerSecond: '💥', enemiesPerSecond: '👾', hits: '🛡️', range: '🎯' } as const;
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
  return <svg className={`class-face class-face-${classId}`} viewBox="0 0 64 64" width={size} height={size}
    role="img" aria-label={`Rosto do personagem ${CLASS_LABELS[classId]}`}>
    <circle className="class-face-background" cx="32" cy="32" r="31" />
    <path d="M12 35c0-3 2-5 5-5h30c3 0 5 2 5 5v8H12z" fill="#9a6248" opacity=".28" />
    <path d="M13 33c-3-2-5 1-4 5 1 4 4 5 7 3M51 33c3-2 5 1 4 5-1 4-4 5-7 3" fill="#d99e79" stroke="#85543f" strokeWidth="1.5" />
    <path d="M18 29c0-12 6-19 14-19s14 7 14 19v12c0 10-7 17-14 17s-14-7-14-17z" fill="#efc39f" stroke="#85543f" strokeWidth="1.5" />
    <path d="M22 34q3-3 7 0M35 34q3-3 7 0" fill="none" stroke="#49362f" strokeWidth="2" strokeLinecap="round" />
    <circle cx="26" cy="38" r="1.8" fill="#302923" /><circle cx="38" cy="38" r="1.8" fill="#302923" />
    <path d="M28 47q4 3 8 0" fill="none" stroke="#9a5149" strokeWidth="1.8" strokeLinecap="round" />
    {classId === 'guerreiro' && <>
      <path d="M15 29 17 17q15-13 30 0l2 12-7-4-10 2-10-2z" fill="#9ba5ae" stroke="#46515b" strokeWidth="2" />
      <path d="M17 22q15-8 30 0v6H17z" fill="#d4dbe0" stroke="#59636c" strokeWidth="1.5" />
      <path d="M30 17q-8-13 1-15 7 4 4 15z" fill="#c63c3c" stroke="#862525" strokeWidth="1.5" />
      <path d="M18 28h28" stroke="#d8b35d" strokeWidth="3" strokeLinecap="round" />
    </>}
    {classId === 'mago' && <>
      <path d="M14 25 29 3q3-5 6 0l15 22q-13-5-36 0z" fill="#7548b7" stroke="#4d2e80" strokeWidth="2" />
      <path d="M23 18q9-5 18 0" fill="none" stroke="#b99be9" strokeWidth="2" />
      <path d="m32 7 1.8 4 4.2.6-3 2.9.7 4.2-3.7-2-3.7 2 .7-4.2-3-2.9 4.2-.6z" fill="#f7d66c" stroke="#9d7426" strokeWidth=".7" />
      <path d="M17 26q15-6 30 0" fill="none" stroke="#c8a6f5" strokeWidth="3" />
    </>}
    {classId === 'arqueiro' && <>
      <path d="M11 34q-1-23 21-28 22 5 21 28l-8-5-4-10-9 7-10-6-4 13z" fill="#d7a83e" stroke="#8b6418" strokeWidth="2" />
      <path d="M39 13q14-12 13-4-4 8-13 12" fill="#f3d46e" stroke="#9c741e" strokeWidth="1.5" />
      <path d="M17 29q15-7 30 0" fill="none" stroke="#f7e1a0" strokeWidth="2" />
    </>}
    {classId === 'druida' && <>
      <path d="M14 28q-4-11 8-13 1-12 11-7 10-7 13 5 10 5 4 17l-8-5-10 2-10-2z" fill="#4c984d" stroke="#286b35" strokeWidth="2" />
      <path d="M17 18q-1-12 8-9 4 5-8 9M31 13q-1-13 8-9 4 7-8 9M43 18q5-10 10-4 1 7-10 4" fill="#8bc66b" stroke="#397b3d" strokeWidth="1.3" />
      <circle cx="32" cy="17" r="3" fill="#e5c96a" stroke="#9b7a2b" strokeWidth="1" />
    </>}
    <circle className="class-face-ring" cx="32" cy="32" r="30.5" />
  </svg>;
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
  const initialArmor = CONFIG.player.armor
    + (attributes.armadura - CONFIG.attributes.baseValue) * CONFIG.attributes.effectPerPointGained.armadura;
  const stats = [
    { key: 'hp', icon: CLASS_STAT_ICONS.hp, label: 'HP inicial', value: CONFIG.attributes.classStartHealth[classId].toString() },
    { key: 'damage', icon: CLASS_STAT_ICONS.damage, label: 'Dano inicial', value: initialDamage.toFixed(0) },
    { key: 'attackSpeed', icon: CLASS_STAT_ICONS.attackSpeed, label: 'Vel. de ataque', value: weapon.attackSpeed.toFixed(2) },
    { key: 'armor', icon: CLASS_STAT_ICONS.armor, label: 'Armadura', value: initialArmor.toFixed(1) },
    { key: 'mobility', icon: CLASS_STAT_ICONS.mobility, label: 'Vel. de movimento', value: initialMobility.toFixed(0) },
  ];
  const duels = deriveClassDuelPercentages()[classId];
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
    <section className="class-duels" aria-label="Duelos de atributos">
      {DUEL_DEFINITIONS.map(def => {
        const share = duels[def.key];
        return <article className="class-duel" key={def.key}>
          <div className="class-duel-labels">
            <span className={share.left > share.right ? 'duel-side-winner' : 'duel-side-loser'}><i aria-hidden="true">{def.leftIcon}</i>{def.left}</span>
            <span className={share.right > share.left ? 'duel-side-winner' : 'duel-side-loser'}>{def.right}<i aria-hidden="true">{def.rightIcon}</i></span>
          </div>
          <div className="class-duel-track" role="img" aria-label={`${def.left} ${share.left} por cento; ${def.right} ${share.right} por cento`}>
            <span className={`class-duel-left ${share.left > share.right ? 'is-winner' : 'is-loser'}`} style={{width:`${share.left}%`}}/><span className={`class-duel-right ${share.right > share.left ? 'is-winner' : 'is-loser'}`} style={{width:`${share.right}%`}}/><i className="class-duel-divider" style={{left:`${share.left}%`}} aria-hidden="true" />
          </div>
          <div className="class-duel-percentages" aria-hidden="true">
            <strong className={share.left > share.right ? 'is-winner' : ''}>{share.left}%</strong>
            <strong className={share.right > share.left ? 'is-winner' : ''}>{share.right}%</strong>
          </div>
        </article>;
      })}
    </section>
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
