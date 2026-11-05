import { CONFIG, type ClassId } from './config';

export type AttributeKey =
  | 'vida'
  | 'forca'
  | 'armadura'
  | 'resistenciaMagica'
  | 'inteligencia'
  | 'destreza'
  | 'velocidadeMovimento'
  | 'velocidadeAtaque'
  | 'alcanceAtaque'
  | 'esquiva'
  | 'areaAtaque';

export type EffectAttribute = 'vida' | 'armadura' | 'velocidadeMovimento' | 'velocidadeAtaque' | 'esquiva';
export type PlayerAttributes = Record<AttributeKey, number>;

export function getPlayerAttributes(classId: ClassId, level: number, pointsPerLevel = 1): PlayerAttributes {
  const { baseValue, gainPerLevel, classMultipliers } = CONFIG.attributes;
  const multipliers = classMultipliers[classId];
  const gainedLevels = Math.max(0, level) * gainPerLevel * Math.max(1, pointsPerLevel);

  return {
    vida: baseValue + gainedLevels * multipliers.vida,
    forca: baseValue + gainedLevels * multipliers.forca,
    armadura: baseValue + gainedLevels * multipliers.armadura,
    resistenciaMagica: baseValue + gainedLevels * multipliers.resistenciaMagica,
    inteligencia: baseValue + gainedLevels * multipliers.inteligencia,
    destreza: baseValue + gainedLevels * multipliers.destreza,
    velocidadeMovimento: baseValue + gainedLevels * multipliers.velocidadeMovimento,
    velocidadeAtaque: baseValue + gainedLevels * multipliers.velocidadeAtaque,
    alcanceAtaque: baseValue + gainedLevels * multipliers.alcanceAtaque,
    esquiva: baseValue + gainedLevels * multipliers.esquiva,
    areaAtaque: baseValue + gainedLevels * multipliers.areaAtaque,
  };
}

// Quanto de cada atributo a classe usa de verdade: 0 = não usa (não soma no PD), 1 = usa por inteiro.
// Nos atributos de dano (força, inteligência, destreza) os fatores de cada classe somam 1.
// Quando uma classe passar a usar um atributo, é só mudar o valor aqui; o dano e o PD acompanham.
export const ATTRIBUTE_USAGE: Record<ClassId, Record<AttributeKey, number>> = {
  guerreiro: { vida: 1, forca: 1, armadura: 1, resistenciaMagica: 0, inteligencia: 0, destreza: 0, velocidadeMovimento: 1, velocidadeAtaque: 1, alcanceAtaque: 0, esquiva: 1, areaAtaque: 0 },
  mago: { vida: 1, forca: 0, armadura: 1, resistenciaMagica: 0, inteligencia: 1, destreza: 0, velocidadeMovimento: 1, velocidadeAtaque: 1, alcanceAtaque: 0, esquiva: 1, areaAtaque: 0 },
  arqueiro: { vida: 1, forca: CONFIG.attributes.archerDamageWeights.forca, armadura: 1, resistenciaMagica: 0, inteligencia: 0, destreza: CONFIG.attributes.archerDamageWeights.destreza, velocidadeMovimento: 1, velocidadeAtaque: 1, alcanceAtaque: 0, esquiva: 1, areaAtaque: 0 },
  druida: { vida: 1, forca: 0, armadura: 1, resistenciaMagica: 0, inteligencia: 1, destreza: 0, velocidadeMovimento: 1, velocidadeAtaque: 1, alcanceAtaque: 0, esquiva: 1, areaAtaque: 0 },
};

const DAMAGE_ATTRIBUTES = ['forca', 'inteligencia', 'destreza'] as const;

export function getDamageMultiplier(classId: ClassId, level: number, pointsPerLevel = 1): number {
  const { baseValue, gainPerLevel, classMultipliers } = CONFIG.attributes;
  const multipliers = classMultipliers[classId];
  const usage = ATTRIBUTE_USAGE[classId];
  const gainedLevels = Math.max(0, level) * gainPerLevel * Math.max(1, pointsPerLevel);
  const damageAttributeValue = DAMAGE_ATTRIBUTES.reduce((sum, key) => sum + usage[key] * (baseValue + gainedLevels * multipliers[key]), 0);

  return damageAttributeValue / baseValue;
}

export function getAttributeEffectPerLevel(classId: ClassId, level: number, attribute: EffectAttribute, pointsPerLevel = 1): number {
  const current = getPlayerAttributes(classId, level, pointsPerLevel)[attribute];
  const previous = getPlayerAttributes(classId, Math.max(0, level - 1), pointsPerLevel)[attribute];
  return (current - previous) * CONFIG.attributes.effectPerPointGained[attribute];
}

/** Converte um bônus temporário aplicado ao atributo-base em seu efeito de jogo,
 * preservando a escala de progressão por nível e classe.
 */
export function getAttributeBaseBonusEffect(
  classId: ClassId,
  level: number,
  attribute: EffectAttribute,
  baseBonus: number,
  pointsPerLevel = 1,
): number {
  if (!Number.isFinite(baseBonus) || baseBonus <= 0) return 0;
  const { baseValue, gainPerLevel, classMultipliers, effectPerPointGained } = CONFIG.attributes;
  const gainedLevels = Math.max(0, level) * gainPerLevel * Math.max(1, pointsPerLevel);
  const levelScale = 1 + gainedLevels * classMultipliers[classId][attribute] / baseValue;
  return baseBonus * levelScale * effectPerPointGained[attribute];
}

export function getAttributeBonus(classId: ClassId, level: number, attribute: EffectAttribute, pointsPerLevel = 1): number {
  let total = 0;
  for (let currentLevel = 1; currentLevel <= Math.max(0, level); currentLevel++) {
    total += getAttributeEffectPerLevel(classId, currentLevel, attribute, pointsPerLevel);
  }
  return total;
}
