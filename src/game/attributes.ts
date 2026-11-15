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
export type AttributeBaseBonuses = Partial<Record<AttributeKey, number>>;

export function getPlayerAttributes(classId: ClassId, level: number, pointsPerLevel = 1, baseBonuses: AttributeBaseBonuses = {}): PlayerAttributes {
  const { baseValue, gainPerLevel, classMultipliers } = CONFIG.attributes;
  const multipliers = classMultipliers[classId];
  const gainedLevels = Math.max(0, level) * gainPerLevel * Math.max(1, pointsPerLevel);
  const levelGain = (key: AttributeKey) => CONFIG.rulesV2.enabled && key !== 'vida' ? 0 : gainedLevels * multipliers[key];
  const base = (key: AttributeKey) => baseValue + (ATTRIBUTE_USAGE[classId][key] > 0 ? baseBonuses[key] ?? 0 : 0);

  return {
    vida: base('vida') + levelGain('vida'),
    forca: base('forca') + levelGain('forca'),
    armadura: base('armadura') + levelGain('armadura'),
    resistenciaMagica: base('resistenciaMagica') + levelGain('resistenciaMagica'),
    inteligencia: base('inteligencia') + levelGain('inteligencia'),
    destreza: base('destreza') + levelGain('destreza'),
    velocidadeMovimento: base('velocidadeMovimento') + levelGain('velocidadeMovimento'),
    velocidadeAtaque: base('velocidadeAtaque') + levelGain('velocidadeAtaque') * ATTRIBUTE_USAGE[classId].velocidadeAtaque,
    alcanceAtaque: base('alcanceAtaque') + levelGain('alcanceAtaque'),
    esquiva: base('esquiva') + levelGain('esquiva'),
    areaAtaque: base('areaAtaque') + levelGain('areaAtaque'),
  };
}

// Quanto de cada atributo a classe usa de verdade: 0 = não usa (não soma no PD), 1 = usa por inteiro.
// Nos atributos de dano (força, inteligência, destreza) os fatores de cada classe somam 1.
// Quando uma classe passar a usar um atributo, é só mudar o valor aqui; o dano e o PD acompanham.
export const ATTRIBUTE_USAGE: Record<ClassId, Record<AttributeKey, number>> = {
  guerreiro: { vida: 1, forca: 1, armadura: 1, resistenciaMagica: 0, inteligencia: 0, destreza: 0, velocidadeMovimento: 1, velocidadeAtaque: 0, alcanceAtaque: 0, esquiva: 1, areaAtaque: 0 },
  mago: { vida: 1, forca: 0, armadura: 1, resistenciaMagica: 0, inteligencia: 1, destreza: 0, velocidadeMovimento: 1, velocidadeAtaque: 0, alcanceAtaque: 0, esquiva: 1, areaAtaque: 0 },
  arqueiro: { vida: 1, forca: CONFIG.attributes.archerDamageWeights.forca, armadura: 1, resistenciaMagica: 0, inteligencia: 0, destreza: CONFIG.attributes.archerDamageWeights.destreza, velocidadeMovimento: 1, velocidadeAtaque: 0, alcanceAtaque: 0, esquiva: 1, areaAtaque: 0 },
  druida: { vida: 1, forca: 0, armadura: 1, resistenciaMagica: 0, inteligencia: 1, destreza: 0, velocidadeMovimento: 1, velocidadeAtaque: 0, alcanceAtaque: 0, esquiva: 1, areaAtaque: 0 },
};

const DAMAGE_ATTRIBUTES = ['forca', 'inteligencia', 'destreza'] as const;

/** Converte o antigo ganho de ritmo de ataque por nível em dano proporcional,
 * preservando dano por segundo enquanto o intervalo de ataque fica fixo.
 */
export function getAttackSpeedCompensationMultiplier(classId: ClassId, level: number, pointsPerLevel = 1): number {
  const { gainPerLevel, classMultipliers, effectPerPointGained } = CONFIG.attributes;
  const oldAttackSpeedFactor = 1 + Math.max(0, level) * gainPerLevel * Math.max(1, pointsPerLevel)
    * classMultipliers[classId].velocidadeAtaque * effectPerPointGained.velocidadeAtaque;
  return oldAttackSpeedFactor;
}

export function getDamageMultiplier(classId: ClassId, level: number, pointsPerLevel = 1, baseBonuses: AttributeBaseBonuses = {}): number {
  const { baseValue, gainPerLevel, classMultipliers } = CONFIG.attributes;
  const multipliers = classMultipliers[classId];
  const usage = ATTRIBUTE_USAGE[classId];
  const gainedLevels = Math.max(0, level) * gainPerLevel * Math.max(1, pointsPerLevel);
  const damageAttributeValue = DAMAGE_ATTRIBUTES.reduce((sum, key) => sum + usage[key] * (baseValue + (usage[key] > 0 ? baseBonuses[key] ?? 0 : 0) + (CONFIG.rulesV2.enabled ? 0 : gainedLevels * multipliers[key])), 0);

  // Na v2 o dano não progride por nível e não usa a compensação de velocidade de ataque.
  if (CONFIG.rulesV2.enabled) return damageAttributeValue / baseValue;
  // O fator compensa exatamente o multiplicador de ataques/s removido do motor.
  return (damageAttributeValue / baseValue) * getAttackSpeedCompensationMultiplier(classId, level, pointsPerLevel);
}

export function getAttributeEffectPerLevel(classId: ClassId, level: number, attribute: EffectAttribute, pointsPerLevel = 1): number {
  const current = getPlayerAttributes(classId, level, pointsPerLevel)[attribute];
  const previous = getPlayerAttributes(classId, Math.max(0, level - 1), pointsPerLevel)[attribute];
  return (current - previous) * CONFIG.attributes.effectPerPointGained[attribute];
}

/** Converte um bônus temporário aplicado ao atributo-base em seu efeito de jogo,
 * preservando a escala de progressão por nível e classe.
 */
/** Efeito direto de pontos adicionados ao valor-base, sem aplicar novamente o multiplicador de classe/nível. */
export function getAttributeBaseValueEffect(attribute: EffectAttribute, baseBonus: number): number {
  if (!Number.isFinite(baseBonus) || baseBonus <= 0) return 0;
  return baseBonus * CONFIG.attributes.effectPerPointGained[attribute];
}

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
  const levelScale = CONFIG.rulesV2.enabled ? 1 : 1 + gainedLevels * classMultipliers[classId][attribute] / baseValue;
  return baseBonus * levelScale * effectPerPointGained[attribute];
}

export function getAccountMultiplier(accountLevel: number): number {
  // reservada: +2,5% por nível da conta (jabuticaba), ainda NÃO ativado
  void accountLevel;
  return 1;
}

export function getAccountPointsPerLevel(accountLevel: number): number {
  return CONFIG.rulesV2.enabled ? getAccountMultiplier(accountLevel) : 1 + Math.max(0, accountLevel) * 0.05;
}

export function getAttributeBonus(classId: ClassId, level: number, attribute: EffectAttribute, pointsPerLevel = 1): number {
  let total = 0;
  for (let currentLevel = 1; currentLevel <= Math.max(0, level); currentLevel++) {
    total += getAttributeEffectPerLevel(classId, currentLevel, attribute, pointsPerLevel);
  }
  return total;
}
