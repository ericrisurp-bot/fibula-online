import type { ClassId } from './config';
import type { CoreRarity } from './cores';

export type ArmorPiece = 'capacete' | 'peitoral' | 'calca' | 'bota' | 'luva';
export type ArmorType = 'couro' | 'bronze';
export type ArmorAttribute = 'armadura' | 'vida' | 'mobilidade' | 'esquiva';
export type ArmorCoreEquipmentType = 'capacete' | 'peitoral' | 'leggings' | 'bota' | 'luva';
export type ArmorCoreAttributeKey = 'armadura' | 'vida' | 'velocidadeMovimento' | 'esquiva';

export const ARMOR_CORE_EQUIPMENT_TO_PIECE: Record<ArmorCoreEquipmentType, ArmorPiece> = {
  capacete: 'capacete',
  peitoral: 'peitoral',
  leggings: 'calca',
  bota: 'bota',
  luva: 'luva',
};

export const ARMOR_PIECE_TO_CORE_EQUIPMENT: Record<ArmorPiece, ArmorCoreEquipmentType> = {
  capacete: 'capacete',
  peitoral: 'peitoral',
  calca: 'leggings',
  bota: 'bota',
  luva: 'luva',
};

export const ARMOR_CORE_ATTRIBUTE_TO_ARMOR: Record<ArmorCoreAttributeKey, ArmorAttribute> = {
  armadura: 'armadura',
  vida: 'vida',
  velocidadeMovimento: 'mobilidade',
  esquiva: 'esquiva',
};

export const ARMOR_ATTRIBUTE_TO_CORE_ATTRIBUTE: Record<ArmorAttribute, ArmorCoreAttributeKey> = {
  armadura: 'armadura',
  vida: 'vida',
  mobilidade: 'velocidadeMovimento',
  esquiva: 'esquiva',
};

export const ARMOR_PIECE_ATTRIBUTES: Record<ArmorType, Record<ArmorPiece, readonly ArmorAttribute[]>> = {
  couro: {
    capacete: ['armadura', 'vida', 'mobilidade'],
    peitoral: ['armadura', 'vida', 'mobilidade'],
    calca: ['vida', 'mobilidade'],
    bota: ['mobilidade'],
    luva: ['armadura', 'esquiva', 'mobilidade'],
  },
  bronze: {
    capacete: ['armadura', 'vida'],
    peitoral: ['armadura', 'vida'],
    calca: ['vida', 'mobilidade'],
    bota: ['mobilidade'],
    luva: ['armadura', 'esquiva'],
  },
};

export function armorCoreAttributeKeys(equipmentType: ArmorCoreEquipmentType): ArmorCoreAttributeKey[] {
  const piece = ARMOR_CORE_EQUIPMENT_TO_PIECE[equipmentType];
  const keys: ArmorCoreAttributeKey[] = [];
  for (const type of ['couro', 'bronze'] as const) {
    for (const attribute of ARMOR_PIECE_ATTRIBUTES[type][piece]) {
      const key = ARMOR_ATTRIBUTE_TO_CORE_ATTRIBUTE[attribute];
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

export const ARMOR_BASE_VALUES: Record<ArmorType, Record<ArmorPiece, Partial<Record<ArmorAttribute, number>>>> = {
  couro: {
    capacete: { armadura: 0.8, vida: 12, mobilidade: 2 },
    peitoral: { armadura: 1.5, vida: 20, mobilidade: 3 },
    calca: { vida: 15, mobilidade: 6 },
    bota: { mobilidade: 12 },
    luva: { armadura: 0.6, esquiva: 0.02, mobilidade: 2 },
  },
  bronze: {
    capacete: { armadura: 1.5, vida: 20 },
    peitoral: { armadura: 2.5, vida: 35 },
    calca: { vida: 25, mobilidade: 3 },
    bota: { mobilidade: 6 },
    luva: { armadura: 1.0, esquiva: 0.02 },
  },
};

export const ARMOR_RARITY_FRACTION: Record<CoreRarity, number> = {
  normal: 0.2,
  common: 0.4,
  uncommon: 0.6,
  rare: 0.8,
  legendary: 1.0,
};

export const ARMOR_MAX_STARS: Record<CoreRarity, number> = {
  normal: 1,
  common: 2,
  uncommon: 3,
  rare: 4,
  legendary: 5,
};

export function armorStarMultiplier(stars: number, rarity: CoreRarity): number {
  validateStars(stars, rarity);
  return 1 + 0.25 * (stars - 1);
}

function validateStars(stars: number, rarity: CoreRarity): void {
  const maximum = ARMOR_MAX_STARS[rarity];
  if (!Number.isInteger(stars) || stars < 1 || stars > maximum) {
    throw new Error(`Quantidade de estrelas inválida para raridade ${rarity}: use um inteiro entre 1 e ${maximum}.`);
  }
}

function validateRoll(roll: number): void {
  if (!Number.isFinite(roll) || roll < 0.5 || roll > 1.0) {
    throw new Error(`Roll inválido: esperado um número entre 0.5 e 1.0; recebido ${roll}.`);
  }
}

export type ArmorAttributeValueInput = {
  type: ArmorType;
  piece: ArmorPiece;
  attribute: ArmorAttribute;
  rarity: CoreRarity;
  stars: number;
  roll: number;
};

export function armorAttributeValue({
  type,
  piece,
  attribute,
  rarity,
  stars,
  roll,
}: ArmorAttributeValueInput): number {
  validateStars(stars, rarity);
  validateRoll(roll);

  if (!ARMOR_PIECE_ATTRIBUTES[type][piece].includes(attribute)) {
    throw new Error(`Atributo "${attribute}" não permitido para peça "${piece}" do tipo "${type}".`);
  }

  const base = ARMOR_BASE_VALUES[type][piece][attribute];
  if (base === undefined) {
    throw new Error(`Valor-base não definido para "${attribute}" em "${type}/${piece}".`);
  }

  return base * ARMOR_RARITY_FRACTION[rarity] * (1 + 0.25 * (stars - 1)) * roll;
}

export type ArmorLining = 'algodao' | 'linho' | 'couro_refinado';
export type LiningAttribute = 'vida' | 'mobilidade' | 'xp_partida';

export const LINING_BASE_VALUES: Record<ArmorLining, { attribute: LiningAttribute; value: number }> = {
  algodao: { attribute: 'vida', value: 6 },
  linho: { attribute: 'mobilidade', value: 2 },
  // Couro refinado aumenta somente o XP obtido dentro da partida.
  couro_refinado: { attribute: 'xp_partida', value: 0.015 },
};

export type LiningValueInput = {
  lining: ArmorLining;
  rarity: CoreRarity;
  stars: number;
  roll: number;
};

export function liningValue({ lining, rarity, stars, roll }: LiningValueInput): number {
  validateStars(stars, rarity);
  validateRoll(roll);
  return LINING_BASE_VALUES[lining].value
    * ARMOR_RARITY_FRACTION[rarity]
    * (1 + 0.25 * (stars - 1))
    * roll;
}

export const ARMOR_RECIPES: Record<ArmorType, Record<ArmorPiece, { base: number; lining: number }>> = {
  couro: {
    capacete: { base: 10, lining: 5 },
    peitoral: { base: 10, lining: 5 },
    calca: { base: 10, lining: 5 },
    bota: { base: 10, lining: 5 },
    luva: { base: 10, lining: 5 },
  },
  bronze: {
    capacete: { base: 12, lining: 6 },
    peitoral: { base: 15, lining: 8 },
    calca: { base: 15, lining: 8 },
    bota: { base: 12, lining: 6 },
    luva: { base: 12, lining: 5 },
  },
};

export const ARMOR_CLASS_USAGE: Record<ClassId, Record<ArmorAttribute, number>> = {
  guerreiro: { vida: 1.2, armadura: 1.3, mobilidade: 0.7, esquiva: 0.8 },
  mago: { vida: 0.9, armadura: 0.8, mobilidade: 1.0, esquiva: 1.0 },
  druida: { vida: 1.0, armadura: 0.9, mobilidade: 1.0, esquiva: 1.0 },
  arqueiro: { vida: 0.8, armadura: 0.7, mobilidade: 1.3, esquiva: 1.2 },
};

export function applyClassUsage(classId: ClassId, attribute: ArmorAttribute, value: number): number {
  return value * ARMOR_CLASS_USAGE[classId][attribute];
}
