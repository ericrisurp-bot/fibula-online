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

export function getPlayerAttributes(classId: ClassId, level: number): PlayerAttributes {
  const { baseValue, gainPerLevel, classMultipliers } = CONFIG.attributes;
  const multipliers = classMultipliers[classId];
  const gainedLevels = Math.max(0, level) * gainPerLevel;

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

// Força, resistência mágica, inteligência, alcance e área existem na estrutura, mas ainda não afetam o jogo.
export function getDamageMultiplier(classId: ClassId, level: number): number {
  const { baseValue, gainPerLevel, classMultipliers, archerDamageWeights } = CONFIG.attributes;
  const multipliers = classMultipliers[classId];
  const gainedLevels = Math.max(0, level) * gainPerLevel;
  let damageAttributeValue: number;

  if (classId === 'guerreiro') {
    damageAttributeValue = baseValue + gainedLevels * multipliers.forca;
  } else if (classId === 'mago' || classId === 'druida') {
    damageAttributeValue = baseValue + gainedLevels * multipliers.inteligencia;
  } else {
    const destreza = baseValue + gainedLevels * multipliers.destreza;
    const forca = baseValue + gainedLevels * multipliers.forca;
    damageAttributeValue = destreza * archerDamageWeights.destreza + forca * archerDamageWeights.forca;
  }

  return damageAttributeValue / baseValue;
}

export function getAttributeEffectPerLevel(classId: ClassId, level: number, attribute: EffectAttribute): number {
  const current = getPlayerAttributes(classId, level)[attribute];
  const previous = getPlayerAttributes(classId, Math.max(0, level - 1))[attribute];
  return (current - previous) * CONFIG.attributes.effectPerPointGained[attribute];
}

export function getAttributeBonus(classId: ClassId, level: number, attribute: EffectAttribute): number {
  let total = 0;
  for (let currentLevel = 1; currentLevel <= Math.max(0, level); currentLevel++) {
    total += getAttributeEffectPerLevel(classId, currentLevel, attribute);
  }
  return total;
}
