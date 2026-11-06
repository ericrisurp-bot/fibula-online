export type CoreRarity = 'normal' | 'common' | 'uncommon' | 'rare' | 'legendary';
export type CoreCategory = 'weapon' | 'armor' | 'accessory';
export type CoreAttributeKey =
  | 'forca'
  | 'velocidadeAtaque'
  | 'inteligencia'
  | 'destreza'
  | 'vida'
  | 'armadura'
  | 'resistenciaMagica'
  | 'velocidadeMovimento'
  | 'esquiva';

export type CoreAttribute = {
  key: CoreAttributeKey;
  /** Valor final em fração: referência da raridade × potência individual. */
  value: number;
};

export type Core = {
  id: string;
  category: CoreCategory;
  rarity: CoreRarity;
  surp: boolean;
  attributes: CoreAttribute[];
};

export type CoreDrop = {
  id: number;
  x: number;
  y: number;
  age: number;
  core: Core;
};

export const CORE_DROP_CHANCE = 0.12;

export const CORE_RARITY_CHANCES: ReadonlyArray<{ rarity: CoreRarity; chance: number }> = [
  { rarity: 'normal', chance: 50 },
  { rarity: 'common', chance: 25 },
  { rarity: 'uncommon', chance: 15 },
  { rarity: 'rare', chance: 8 },
  { rarity: 'legendary', chance: 2 },
];

export const CORE_RARITY_REFERENCE: Record<CoreRarity, number> = {
  normal: 0.2,
  common: 0.4,
  uncommon: 0.6,
  rare: 0.8,
  legendary: 1,
};

const WEAPON_ATTRIBUTES: CoreAttributeKey[] = [
  'forca', 'velocidadeAtaque', 'inteligencia', 'destreza',
];
const ARMOR_ATTRIBUTES: CoreAttributeKey[] = [
  'vida', 'armadura', 'resistenciaMagica', 'velocidadeMovimento', 'esquiva',
];
const ACCESSORY_ATTRIBUTES: CoreAttributeKey[] = [
  ...WEAPON_ATTRIBUTES, ...ARMOR_ATTRIBUTES,
];

export function createCore(random: () => number, id: string): Core {
  const categoryRoll = random();
  const category: CoreCategory = categoryRoll < 1 / 3
    ? 'weapon'
    : categoryRoll < 2 / 3 ? 'armor' : 'accessory';

  const rarityRoll = random() * 100;
  let cumulativeChance = 0;
  const rarity = CORE_RARITY_CHANCES.find(entry => {
    cumulativeChance += entry.chance;
    return rarityRoll < cumulativeChance;
  })?.rarity ?? 'normal';

  const surp = random() < 0.5;
  const attributeCount = random() < 0.98 ? 2 : 4;
  const pool = [...(category === 'weapon'
    ? WEAPON_ATTRIBUTES
    : category === 'armor' ? ARMOR_ATTRIBUTES : ACCESSORY_ATTRIBUTES)];
  const attributes: CoreAttribute[] = [];

  while (attributes.length < attributeCount && pool.length > 0) {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    const [key] = pool.splice(index, 1);
    const potency = surp ? 1 : 0.5 + random() * 0.5;
    attributes.push({
      key,
      value: CORE_RARITY_REFERENCE[rarity] * potency,
    });
  }

  return { id, category, rarity, surp, attributes };
}

/** Codifica todos os dados no itemId para manter a identidade individual no inventário e no Baú. */
export function coreToItemId(core: Core): string {
  return `core:${core.rarity}:${encodeURIComponent(JSON.stringify(core))}`;
}

export function coreFromItemId(itemId: string): Core | null {
  if (!itemId.startsWith('core:')) return null;
  const encoded = itemId.split(':').slice(2).join(':');
  if (!encoded) return null;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(encoded));
    if (!value || typeof value !== 'object') return null;
    const core = value as Partial<Core>;
    if (typeof core.id !== 'string'
      || !['weapon', 'armor', 'accessory'].includes(core.category ?? '')
      || !CORE_RARITY_CHANCES.some(entry => entry.rarity === core.rarity)
      || typeof core.surp !== 'boolean'
      || !Array.isArray(core.attributes)
      || core.attributes.length === 0
      || !core.attributes.every(attribute =>
        attribute && typeof attribute.key === 'string'
        && [...WEAPON_ATTRIBUTES, ...ARMOR_ATTRIBUTES].includes(attribute.key as CoreAttributeKey)
        && Number.isFinite(attribute.value) && attribute.value > 0,
      )) return null;
    return core as Core;
  } catch {
    return null;
  }
}

export function coreRarityLabel(rarity: CoreRarity): string {
  return ({
    normal: 'Normal',
    common: 'Comum',
    uncommon: 'Incomum',
    rare: 'Raro',
    legendary: 'Lendário',
  })[rarity];
}
