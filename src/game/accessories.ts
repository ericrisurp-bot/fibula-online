import { CORE_RARITY_REFERENCE } from './cores';
import type { CoreAttributeKey, CoreEquipmentType, CoreRarity } from './cores';

export type AccessoryType = Extract<CoreEquipmentType, 'colar' | 'pulseira' | 'cinto'>;
export type AccessoryLining = 'linho' | 'couro_refinado';
export type AccessoryMetal = 'bronze' | 'ferro';

/** Chaves válidas recebidas do núcleo. */
export type AccessoryAttribute = Exclude<CoreAttributeKey, 'velocidadeAtaque' | 'resistenciaMagica'>;

/** Chaves finais persistidas pelo servidor; mobilidade substitui velocidadeMovimento. */
export type AccessoryStoredAttributeKey =
  | 'forca'
  | 'inteligencia'
  | 'destreza'
  | 'vida'
  | 'armadura'
  | 'mobilidade'
  | 'esquiva';

export type AccessoryStoredAttributes = Partial<Record<AccessoryStoredAttributeKey, number>>;

/** Conversão da chave original do núcleo para a chave estável armazenada. */
export const ACCESSORY_CORE_ATTRIBUTE_TO_STORED: Readonly<Record<AccessoryAttribute, AccessoryStoredAttributeKey>> = {
  forca: 'forca',
  inteligencia: 'inteligencia',
  destreza: 'destreza',
  vida: 'vida',
  armadura: 'armadura',
  velocidadeMovimento: 'mobilidade',
  esquiva: 'esquiva',
};

export function accessoryStoredAttributeKey(attribute: AccessoryAttribute): AccessoryStoredAttributeKey {
  return ACCESSORY_CORE_ATTRIBUTE_TO_STORED[attribute];
}

/** Pool permitido para núcleos de acessório: dois atributos comuns ou quatro em SURP. */
export const ACCESSORY_CORE_ATTRIBUTES: readonly AccessoryAttribute[] = [
  'forca',
  'inteligencia',
  'destreza',
  'vida',
  'armadura',
  'velocidadeMovimento',
  'esquiva',
];

/** Referências fixas em unidades finais: HP, pontos de armadura, fração de esquiva e pontos brutos. */
export const ACCESSORY_ATTRIBUTE_REFERENCE: Readonly<Record<AccessoryAttribute, number>> = {
  forca: 10,
  inteligencia: 10,
  destreza: 10,
  vida: 12,
  armadura: 0.8,
  velocidadeMovimento: 2,
  esquiva: 0.008,
};

/** Mesma escala de raridade usada na geração dos núcleos. */
export const ACCESSORY_RARITY_FRACTION: Readonly<Record<CoreRarity, number>> = CORE_RARITY_REFERENCE;

/** O limite é definido pelo metal, não pela raridade. Ferro permanece preparado para o futuro. */
export const ACCESSORY_MAX_STARS_BY_METAL: Readonly<Record<AccessoryMetal, number>> = {
  bronze: 2,
  ferro: 4,
};

/** Receita progressiva: uma barra e uma unidade de alça adicionais por degrau de raridade. */
export const ACCESSORY_RECIPE: Readonly<Record<CoreRarity, { base: number; lining: number }>> = {
  normal: { base: 3, lining: 8 },
  common: { base: 4, lining: 9 },
  uncommon: { base: 5, lining: 10 },
  rare: { base: 6, lining: 11 },
  legendary: { base: 7, lining: 12 },
};

export const ACCESSORY_LININGS: readonly AccessoryLining[] = ['linho', 'couro_refinado'];

export type AccessoryMaterialIds = {
  base: { itemId: string; quantity: number };
  lining: { itemId: string; quantity: number };
};

// Mesmo padrão de armorMaterialItemIds: Normal sem sufixo; demais raridades com :raridade.
// Mantido local para não importar armorCrafting.ts, que também contém chamadas de rede.
function materialItemId(base: string, rarity: CoreRarity): string {
  return rarity === 'normal' ? base : `${base}:${rarity}`;
}

/**
 * Calcula e retorna o valor de 1★ a ser armazenado: referência × fração da raridade × roll.
 * Estrelas não entram no valor persistido; são aplicadas somente na leitura.
 */
export function accessoryAttributeValue({
  attribute,
  rarity,
  roll,
}: {
  attribute: AccessoryAttribute;
  rarity: CoreRarity;
  roll: number;
}): number {
  if (!ACCESSORY_CORE_ATTRIBUTES.includes(attribute)) {
    throw new Error(`Atributo de acessório inválido: ${String(attribute)}.`);
  }
  if (!Object.prototype.hasOwnProperty.call(ACCESSORY_RARITY_FRACTION, rarity)) {
    throw new Error(`Raridade de acessório inválida: ${String(rarity)}.`);
  }
  if (!Number.isFinite(roll) || roll < 0.5 || roll > 1) {
    throw new Error(`Roll inválido para acessório: esperado um número entre 0.5 e 1.0; recebido ${roll}.`);
  }

  return ACCESSORY_ATTRIBUTE_REFERENCE[attribute]
    * ACCESSORY_RARITY_FRACTION[rarity]
    * roll;
}

/** Aplica na leitura +25% por estrela acima da primeira, respeitando o teto do metal. */
export function accessoryEffectiveValue(valueAtOneStar: number, stars: number, metal: AccessoryMetal): number {
  if (!Number.isFinite(valueAtOneStar) || valueAtOneStar < 0) {
    throw new Error(`Valor armazenado inválido para acessório: ${valueAtOneStar}.`);
  }
  if (!Object.prototype.hasOwnProperty.call(ACCESSORY_MAX_STARS_BY_METAL, metal)) {
    throw new Error(`Metal inválido para acessório: ${String(metal)}.`);
  }
  const maximumStars = ACCESSORY_MAX_STARS_BY_METAL[metal];
  if (!Number.isInteger(stars) || stars < 1 || stars > maximumStars) {
    throw new Error(`Estrelas inválidas para acessório de ${metal}: use um inteiro entre 1 e ${maximumStars}.`);
  }
  return valueAtOneStar * (1 + 0.25 * (stars - 1));
}

/** Tipo final do acessório é fornecido por core.equipmentType; não há escolha na receita. */
export function accessoryTypeFromCore(equipmentType: CoreEquipmentType | undefined): AccessoryType | null {
  return equipmentType === 'colar' || equipmentType === 'pulseira' || equipmentType === 'cinto'
    ? equipmentType
    : null;
}

/** Resolve os materiais e quantidades conforme a raridade do núcleo. */
export function accessoryMaterialItemIds(
  rarity: CoreRarity,
  lining: AccessoryLining,
): AccessoryMaterialIds {
  if (!Object.prototype.hasOwnProperty.call(ACCESSORY_RECIPE, rarity)) {
    throw new Error(`Raridade inválida para receita de acessório: ${String(rarity)}.`);
  }
  if (!ACCESSORY_LININGS.includes(lining)) {
    throw new Error(`Material de alça inválido para acessório: ${String(lining)}.`);
  }

  const liningMaterial: Record<AccessoryLining, string> = {
    linho: 'linen',
    couro_refinado: 'refined_leather',
  };
  const recipe = ACCESSORY_RECIPE[rarity];

  return {
    base: { itemId: materialItemId('bronze', rarity), quantity: recipe.base },
    lining: {
      itemId: materialItemId(liningMaterial[lining], rarity),
      quantity: recipe.lining,
    },
  };
}
