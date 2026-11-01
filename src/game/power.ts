import { CONFIG, type ClassId } from './config';
import { ATTRIBUTE_USAGE, getAttributeBonus, getDamageMultiplier, type AttributeKey, type EffectAttribute } from './attributes';

// Referências fixas do PD: cada capacidade vale 100 pontos quando está exatamente na referência.
// São os pontos de calibração do balanceamento; mudar uma delas muda o PD de todas as classes.
export const POWER_REFERENCE = {
  vida: 125,
  armadura: 12,
  esquiva: 1.04,
  velocidadeAtaque: 1.3,
  velocidadeMovimento: 145,
  dano: 16,
} as const;

export type PowerPart = keyof typeof POWER_REFERENCE;
export type PowerBreakdown = { total: number; parts: Record<PowerPart, number> };

// Atributos que já têm uma capacidade no PD. Um atributo usado por alguma classe e fora desta lista
// ainda não soma no PD; findUncoveredAttributes() acusa isso para o relatório.
const COVERED_ATTRIBUTES: Record<AttributeKey, boolean> = {
  vida: true, forca: true, armadura: true, resistenciaMagica: false, inteligencia: true, destreza: true,
  velocidadeMovimento: true, velocidadeAtaque: true, alcanceAtaque: false, esquiva: true, areaAtaque: false,
};

const WEAPON_BY_CLASS = { guerreiro: 'espada', mago: 'cajado', arqueiro: 'arco', druida: 'bastao' } as const;

function usedBonus(classId: ClassId, level: number, attribute: EffectAttribute): number {
  return ATTRIBUTE_USAGE[classId][attribute] * getAttributeBonus(classId, level, attribute);
}

export function getClassPower(classId: ClassId, level: number): PowerBreakdown {
  const weapon = CONFIG.weapons[WEAPON_BY_CLASS[classId]];
  const stats: Record<PowerPart, number> = {
    vida: CONFIG.attributes.classStartHealth[classId] + usedBonus(classId, level, 'vida'),
    armadura: CONFIG.player.armor + usedBonus(classId, level, 'armadura'),
    esquiva: 1 / (1 - Math.min(0.35, CONFIG.player.dodge + usedBonus(classId, level, 'esquiva'))),
    velocidadeAtaque: weapon.attackSpeed * (1 + usedBonus(classId, level, 'velocidadeAtaque')),
    velocidadeMovimento: CONFIG.player.speed + usedBonus(classId, level, 'velocidadeMovimento'),
    dano: weapon.damage * getDamageMultiplier(classId, level),
  };
  const parts = {} as Record<PowerPart, number>;
  let total = 0;
  for (const part of Object.keys(POWER_REFERENCE) as PowerPart[]) {
    parts[part] = 100 * stats[part] / POWER_REFERENCE[part];
    total += parts[part];
  }
  return { total, parts };
}

export function findUncoveredAttributes(): { classId: ClassId; attribute: AttributeKey }[] {
  const found: { classId: ClassId; attribute: AttributeKey }[] = [];
  for (const classId of Object.keys(ATTRIBUTE_USAGE) as ClassId[]) {
    for (const attribute of Object.keys(ATTRIBUTE_USAGE[classId]) as AttributeKey[]) {
      if (ATTRIBUTE_USAGE[classId][attribute] > 0 && !COVERED_ATTRIBUTES[attribute]) found.push({ classId, attribute });
    }
  }
  return found;
}
