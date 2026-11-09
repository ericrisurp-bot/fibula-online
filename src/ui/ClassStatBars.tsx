import { ATTRIBUTE_USAGE } from '../game/attributes';
import { CONFIG, type ClassId } from '../game/config';

export type ClassStatKey = 'vida' | 'danoFisico' | 'danoMagico' | 'mobilidade' | 'sobrevivencia';
export type ClassStat = { key: ClassStatKey; label: string; percent: number };
export type ClassStatPercentages = Record<ClassId, ClassStat[]>;

const CLASS_IDS: ClassId[] = ['guerreiro', 'mago', 'arqueiro', 'druida'];
// Engine.killEnemy creates healing orbs worth 14 HP for the druid.
const DRUID_HEALING_ORB_VALUE = 14;

/**
 * Converts the configured class growth multipliers into relative comparison bars.
 * Survival adds a capped healing contribution: the best configured self-heal rate
 * contributes 25% of the strongest raw life/armor score. Druid rate combines
 * healing per basic hit and per kill; archer rate is healing per arrow.
 */
export function deriveClassStatPercentages(): ClassStatPercentages {
  const multipliers = CONFIG.attributes.classMultipliers;
  const physicalDamage = (classId: ClassId) =>
    ATTRIBUTE_USAGE[classId].forca * multipliers[classId].forca
    + ATTRIBUTE_USAGE[classId].destreza * multipliers[classId].destreza;
  const magicalDamage = (classId: ClassId) =>
    ATTRIBUTE_USAGE[classId].inteligencia * multipliers[classId].inteligencia;
  const mobility = (classId: ClassId) =>
    (multipliers[classId].velocidadeMovimento + multipliers[classId].esquiva) / 2;
  const defensiveBase = (classId: ClassId) =>
    (multipliers[classId].vida * ATTRIBUTE_USAGE[classId].vida
      + multipliers[classId].armadura * ATTRIBUTE_USAGE[classId].armadura) / 2;

  const healingRate = (classId: ClassId) => {
    if (classId === 'druida') {
      return CONFIG.druidHeal.basicHitAmount / CONFIG.druidHeal.basicHitsPerHeal
        + DRUID_HEALING_ORB_VALUE / CONFIG.druidHeal.killsPerOrb;
    }
    if (classId === 'arqueiro') {
      return CONFIG.archerHeal.amount / CONFIG.archerHeal.arrowsPerHeal;
    }
    return 0;
  };
  const maxHealingRate = Math.max(...CLASS_IDS.map(healingRate));
  const maxDefensiveBase = Math.max(...CLASS_IDS.map(defensiveBase));
  const survival = (classId: ClassId) =>
    defensiveBase(classId)
    + (maxHealingRate > 0 ? healingRate(classId) / maxHealingRate * maxDefensiveBase * 0.25 : 0);

  const raw: Record<ClassId, Record<ClassStatKey, number>> = Object.fromEntries(
    CLASS_IDS.map(classId => [classId, {
      vida: multipliers[classId].vida,
      danoFisico: physicalDamage(classId),
      danoMagico: magicalDamage(classId),
      mobilidade: mobility(classId),
      sobrevivencia: survival(classId),
    }]),
  ) as Record<ClassId, Record<ClassStatKey, number>>;

  const definitions: { key: ClassStatKey; label: string }[] = [
    { key: 'vida', label: 'Vida' },
    { key: 'danoFisico', label: 'Dano físico' },
    { key: 'danoMagico', label: 'Dano mágico' },
    { key: 'mobilidade', label: 'Mobilidade' },
    { key: 'sobrevivencia', label: 'Sobrevivência' },
  ];

  return Object.fromEntries(CLASS_IDS.map(classId => [classId, definitions.map(({ key, label }) => {
    const best = Math.max(...CLASS_IDS.map(id => raw[id][key]));
    return { key, label, percent: best > 0 ? Math.round(raw[classId][key] / best * 100) : 0 };
  })])) as ClassStatPercentages;
}

export default function ClassStatBars({ classId }: { classId: ClassId }) {
  const stats = deriveClassStatPercentages()[classId];
  return <div className="class-stat-bars" aria-label="Comparação relativa entre as quatro classes">
    {stats.map(stat => <div className="class-stat-row" key={stat.key}>
      <span className="class-stat-label">{stat.label}</span>
      <div className="class-stat-track" aria-hidden="true">
        <span className="class-stat-fill" style={{ width: stat.percent > 0 ? `${Math.max(2, stat.percent)}%` : '0%' }} />
      </div>
      <strong className="class-stat-percent">{stat.percent}%</strong>
    </div>)}
  </div>;
}
