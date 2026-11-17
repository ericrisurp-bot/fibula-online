import { CORE_RARITY_REFERENCE } from './cores';
import type { CoreAttributeKey, CoreRarity } from './cores';

export type AccessoryType = 'colar' | 'pulseira' | 'cinto';
export type AccessoryLining = 'linho' | 'couro_refinado';
export type AccessoryMetal = 'bronze' | 'ferro';

/** Chaves canônicas do núcleo; velocidadeMovimento corresponde a mobilidade. */
export type AccessoryAttribute = Exclude<CoreAttributeKey, 'velocidadeAtaque' | 'resistenciaMagica'>;

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

/** Mantém a mesma escala de raridade usada na geração dos núcleos. */
export const ACCESSORY_RARITY_FRACTION: Readonly<Record<CoreRarity, number>> = CORE_RARITY_REFERENCE;

/** O limite é definido pelo metal, não pela raridade. Ferro é uma expansão futura. */
export const ACCESSORY_MAX_STARS_BY_METAL: Readonly<Record<AccessoryMetal, number>> = {
  bronze: 2,
  ferro: 4,
};

export const ACCESSORY_RECIPE = {
  base: 3,
  lining: 8,
} as const;

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
 * Calcula o bônus fixo do núcleo.
 * O limite de 4★ cobre o metal ferro futuro; a fabricação deve validar o teto
 * específico consultando ACCESSORY_MAX_STARS_BY_METAL para o metal escolhido.
 */
export function accessoryAttributeValue({
  attribute,
  rarity,
  stars,
  roll,
}: {
  attribute: AccessoryAttribute;
  rarity: CoreRarity;
  stars: number;
  roll: number;
}): number {
  if (!ACCESSORY_CORE_ATTRIBUTES.includes(attribute)) {
    throw new Error(`Atributo de acessório inválido: ${String(attribute)}.`);
  }
  if (!Object.prototype.hasOwnProperty.call(ACCESSORY_RARITY_FRACTION, rarity)) {
    throw new Error(`Raridade de acessório inválida: ${String(rarity)}.`);
  }
  const maximumStars = Math.max(...Object.values(ACCESSORY_MAX_STARS_BY_METAL));
  if (!Number.isInteger(stars) || stars < 1 || stars > maximumStars) {
    throw new Error(`Estrelas inválidas para acessório: use um inteiro entre 1 e ${maximumStars}.`);
  }
  if (!Number.isFinite(roll) || roll < 0.5 || roll > 1) {
    throw new Error(`Roll inválido para acessório: esperado um número entre 0.5 e 1.0; recebido ${roll}.`);
  }

  return ACCESSORY_ATTRIBUTE_REFERENCE[attribute]
    * ACCESSORY_RARITY_FRACTION[rarity]
    * (1 + 0.25 * (stars - 1))
    * roll;
}

/** Receita fixa em todas as raridades; o material de alça não altera atributos. */
export function accessoryMaterialItemIds(
  rarity: CoreRarity,
  lining: AccessoryLining,
): AccessoryMaterialIds {
  if (!ACCESSORY_LININGS.includes(lining)) {
    throw new Error(`Material de alça inválido para acessório: ${String(lining)}.`);
  }

  const liningMaterial: Record<AccessoryLining, string> = {
    linho: 'linen',
    couro_refinado: 'refined_leather',
  };

  return {
    base: { itemId: materialItemId('bronze', rarity), quantity: ACCESSORY_RECIPE.base },
    lining: {
      itemId: materialItemId(liningMaterial[lining], rarity),
      quantity: ACCESSORY_RECIPE.lining,
    },
  };
}
