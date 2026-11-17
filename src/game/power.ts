import { CONFIG, type ClassId } from './config';
import { ATTRIBUTE_USAGE, getAttributeBaseValueEffect, getAttributeBonus, getDamageMultiplier, type AttributeKey, type EffectAttribute } from './attributes';
import { WEAPON_ACTIVE_ATTRIBUTES, WEAPON_CLASS_BY_MODEL, WEAPON_CORE_POINTS_PER_VALUE, type EquippedWeapon } from './weapons';
import type { ArmorBonuses } from './armorEquipment';

// Referências fixas do PD: cada capacidade vale 100 pontos quando está exatamente na referência.
// São os pontos de calibração do balanceamento; mudar uma delas muda o PD de todas as classes.
export const POWER_REFERENCE = {
  vida: 125,
  armadura: 12,
  esquiva: 1.04,
  velocidadeMovimento: 145,
  dano: 16,
} as const;

export type PowerPart = keyof typeof POWER_REFERENCE;
export type PowerBreakdown = { total: number; parts: Record<PowerPart, number> };

// Atributos que já têm uma capacidade no PD. Um atributo usado por alguma classe e fora desta lista
// ainda não soma no PD; findUncoveredAttributes() acusa isso para o relatório.
const COVERED_ATTRIBUTES: Record<AttributeKey, boolean> = {
  vida: true, forca: true, armadura: true, resistenciaMagica: false, inteligencia: true, destreza: true,
  velocidadeMovimento: true, velocidadeAtaque: false, alcanceAtaque: false, esquiva: true, areaAtaque: false,
};

const WEAPON_BY_CLASS = { guerreiro: 'espada', mago: 'cajado', arqueiro: 'arco', druida: 'bastao' } as const;

function usedBonus(classId: ClassId, level: number, attribute: EffectAttribute, pointsPerLevel = 1): number {
  return ATTRIBUTE_USAGE[classId][attribute] * getAttributeBonus(classId, level, attribute, pointsPerLevel);
}

export function getClassPower(classId: ClassId, level: number, pointsPerLevel = 1, baseBonuses: AttributeBaseBonuses = {}): PowerBreakdown {
  const weapon = CONFIG.weapons[WEAPON_BY_CLASS[classId]];
  const stats: Record<PowerPart, number> = {
    vida: CONFIG.attributes.classStartHealth[classId] + usedBonus(classId, level, 'vida', pointsPerLevel),
    armadura: CONFIG.player.armor + usedBonus(classId, level, 'armadura', pointsPerLevel),
    esquiva: 1 / (1 - Math.min(0.35, (CONFIG.rulesV2.enabled ? CONFIG.player.classDodge[classId] : CONFIG.player.dodge)
      + usedBonus(classId, level, 'esquiva', pointsPerLevel))),
    velocidadeMovimento: CONFIG.player.classSpeed[classId],
    dano: weapon.damage * getDamageMultiplier(classId, level, pointsPerLevel, baseBonuses),
  };
  const parts = {} as Record<PowerPart, number>;
  let total = 0;
  for (const part of Object.keys(POWER_REFERENCE) as PowerPart[]) {
    parts[part] = 100 * stats[part] / POWER_REFERENCE[part];
    total += parts[part];
  }
  return { total, parts };
}


// Equipamento é aberto para receber armadura/acessórios em etapas futuras.
export type ArmedClassPowerEquipment = {
  weapon?: EquippedWeapon | null;
  armorBonuses?: ArmorBonuses | null;
  accessoryBonuses?: AttributeBaseBonuses | null;
  [slot: string]: unknown;
};



function addEquipmentBonusesToPower(
  base: PowerBreakdown,
  classId: ClassId,
  level: number,
  pointsPerLevel: number,
  armorBonuses: ArmorBonuses | null,
  accessoryBonuses: AttributeBaseBonuses,
): PowerBreakdown {
  const parts = { ...base.parts };
  parts.vida += 100 * ((armorBonuses?.vida ?? 0) + (accessoryBonuses.vida ?? 0)) / POWER_REFERENCE.vida;
  parts.armadura += 100 * ((armorBonuses?.armadura ?? 0)
    + getAttributeBaseValueEffect('armadura', accessoryBonuses.armadura ?? 0)) / POWER_REFERENCE.armadura;
  parts.velocidadeMovimento += 100 * ((armorBonuses?.mobilidade ?? 0)
    + getAttributeBaseValueEffect('velocidadeMovimento', accessoryBonuses.velocidadeMovimento ?? 0))
    / POWER_REFERENCE.velocidadeMovimento;
  const dodgeBeforeEquipment = CONFIG.player.classDodge[classId]
    + usedBonus(classId, level, 'esquiva', pointsPerLevel)
    + getAttributeBaseValueEffect('esquiva', accessoryBonuses.esquiva ?? 0);
  parts.esquiva = 100
    / (1 - Math.min(0.35, dodgeBeforeEquipment + (armorBonuses?.esquiva ?? 0)))
    / POWER_REFERENCE.esquiva;
  const total = (Object.values(parts) as number[]).reduce((sum, value) => sum + value, 0);
  return { total, parts };
}

export function getArmedClassPower(
  classId: ClassId,
  level: number,
  pointsPerLevel: number,
  equipment: ArmedClassPowerEquipment,
): PowerBreakdown {
  const weapon = equipment.weapon;
  const armorBonuses = CONFIG.rulesV2.enabled ? equipment.armorBonuses : null;
  const accessoryBonuses = equipment.accessoryBonuses ?? {};
  if (!weapon || WEAPON_CLASS_BY_MODEL[weapon.model] !== classId) {
    const basePower = getClassPower(classId, level, pointsPerLevel, accessoryBonuses);
    return armorBonuses || Object.keys(accessoryBonuses).length
      ? addEquipmentBonusesToPower(basePower, classId, level, pointsPerLevel, armorBonuses, accessoryBonuses)
      : basePower;
  }

  // Espelha o motor: bônus da arma só entram se o modelo estiver ativo para a classe
  // e se a classe realmente usar aquele atributo.
  const weaponBonuses: Partial<Record<AttributeKey, number>> = { ...accessoryBonuses };
  const activeAttributes = WEAPON_ACTIVE_ATTRIBUTES[weapon.model];
  for (const attribute of weapon.attributes) {
    if (!activeAttributes.includes(attribute.key) || ATTRIBUTE_USAGE[classId][attribute.key] <= 0
      || !COVERED_ATTRIBUTES[attribute.key]) continue;
    weaponBonuses[attribute.key] = (weaponBonuses[attribute.key] ?? 0)
      + attribute.value * WEAPON_CORE_POINTS_PER_VALUE;
  }

  const baseWeapon = CONFIG.weapons[WEAPON_BY_CLASS[classId]];
  const stats: Record<PowerPart, number> = {
    vida: CONFIG.attributes.classStartHealth[classId] + usedBonus(classId, level, 'vida', pointsPerLevel)
      + (armorBonuses?.vida ?? 0) + (accessoryBonuses.vida ?? 0),
    armadura: CONFIG.player.armor + usedBonus(classId, level, 'armadura', pointsPerLevel)
      + (CONFIG.rulesV2.enabled ? getAttributeBaseValueEffect('armadura', weaponBonuses.armadura ?? 0) : getAttributeBaseValueEffect('armadura', accessoryBonuses.armadura ?? 0))
      + (armorBonuses?.armadura ?? 0),
    esquiva: 1 / (1 - Math.min(0.35, (CONFIG.rulesV2.enabled ? CONFIG.player.classDodge[classId] : CONFIG.player.dodge)
      + usedBonus(classId, level, 'esquiva', pointsPerLevel)
      + (CONFIG.rulesV2.enabled ? getAttributeBaseValueEffect('esquiva', weaponBonuses.esquiva ?? 0) : getAttributeBaseValueEffect('esquiva', accessoryBonuses.esquiva ?? 0))
             + (armorBonuses?.esquiva ?? 0))),
    velocidadeMovimento: CONFIG.player.classSpeed[classId]
      + (armorBonuses?.mobilidade ?? 0)
       + getAttributeBaseValueEffect('velocidadeMovimento', CONFIG.rulesV2.enabled ? weaponBonuses.velocidadeMovimento ?? 0 : accessoryBonuses.velocidadeMovimento ?? 0),
    // O motor soma o dano-base da CONFIG ao dano armazenado na arma fabricada.
    dano: (baseWeapon.damage + weapon.damage) * getDamageMultiplier(classId, level, pointsPerLevel, weaponBonuses),
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
