export type CoreRarity = 'normal' | 'common' | 'uncommon' | 'rare' | 'legendary';
export type CoreCategory = 'weapon' | 'armor' | 'accessory';
export type CoreWeaponModel = 'espada' | 'arco' | 'cajado';
export type CoreEquipmentType = 'capacete' | 'peitoral' | 'leggings' | 'bota' | 'luva' | 'colar' | 'pulseira' | 'cinto';
export type CoreAttributeKey = 'forca' | 'velocidadeAtaque' | 'inteligencia' | 'destreza' | 'vida' | 'armadura' | 'resistenciaMagica' | 'velocidadeMovimento' | 'esquiva';
export type CoreAttribute = { key: CoreAttributeKey; value: number };
export type ClosedCore = { category: CoreCategory; rarity: CoreRarity; weaponModel?: CoreWeaponModel; equipmentType?: CoreEquipmentType };
export type Core = { id: string; category: CoreCategory; rarity: CoreRarity; surp: boolean; attributes: CoreAttribute[]; weaponModel?: CoreWeaponModel; affinity?: 'dano' | 'natureza'; equipmentType?: CoreEquipmentType };
export type CoreDrop = { id: number; x: number; y: number; age: number; core: ClosedCore };
export const CORE_DROP_CHANCE = 0.02;
export const CORE_SURP_CHANCE = 0.02;
export const CORE_CATEGORY_CHANCES: ReadonlyArray<{ category: CoreCategory; chance: number }> = [
  { category: 'weapon', chance: 1 / 3 }, { category: 'armor', chance: 1 / 3 }, { category: 'accessory', chance: 1 / 3 },
];
export const CORE_RARITY_CHANCES: ReadonlyArray<{ rarity: CoreRarity; chance: number }> = [
  { rarity: 'normal', chance: 50 }, { rarity: 'common', chance: 25 }, { rarity: 'uncommon', chance: 15 }, { rarity: 'rare', chance: 8 }, { rarity: 'legendary', chance: 2 },
];
export const CORE_RARITY_REFERENCE: Record<CoreRarity, number> = { normal: 0.2, common: 0.4, uncommon: 0.6, rare: 0.8, legendary: 1 };
const WEAPON_ATTRIBUTES: CoreAttributeKey[] = ['forca', 'inteligencia', 'destreza', 'velocidadeAtaque'];
const ARMOR_ATTRIBUTES: CoreAttributeKey[] = ['vida', 'armadura', 'velocidadeMovimento', 'esquiva'];
const ACCESSORY_ATTRIBUTES: CoreAttributeKey[] = [...WEAPON_ATTRIBUTES, ...ARMOR_ATTRIBUTES];
const WEAPON_MODEL_ATTRIBUTES: Record<CoreWeaponModel, readonly CoreAttributeKey[]> = {
  espada: ['forca', 'velocidadeAtaque'],
  arco: ['forca', 'destreza', 'velocidadeAtaque'],
  cajado: ['inteligencia', 'velocidadeAtaque'],
};
const isCategory = (v: unknown): v is CoreCategory => v === 'weapon' || v === 'armor' || v === 'accessory';
const isRarity = (v: unknown): v is CoreRarity => CORE_RARITY_CHANCES.some(entry => entry.rarity === v);
const isWeaponModel = (v: unknown): v is CoreWeaponModel => v === 'espada' || v === 'arco' || v === 'cajado';
const ARMOR_EQUIPMENT_TYPES = ['capacete', 'peitoral', 'leggings', 'bota', 'luva'] as const;
const ACCESSORY_EQUIPMENT_TYPES = ['colar', 'pulseira', 'cinto'] as const;
const isEquipmentType = (v: unknown, category: CoreCategory): v is CoreEquipmentType =>
  category === 'armor' ? ARMOR_EQUIPMENT_TYPES.includes(v as typeof ARMOR_EQUIPMENT_TYPES[number])
    : category === 'accessory' ? ACCESSORY_EQUIPMENT_TYPES.includes(v as typeof ACCESSORY_EQUIPMENT_TYPES[number]) : false;
const randomEquipmentType = (random: () => number, category: Exclude<CoreCategory, 'weapon'>): CoreEquipmentType => {
  const types = category === 'armor' ? ARMOR_EQUIPMENT_TYPES : ACCESSORY_EQUIPMENT_TYPES;
  return types[Math.min(types.length - 1, Math.floor(random() * types.length))];
};
const poolFor = (category: CoreCategory) => category === 'weapon' ? WEAPON_ATTRIBUTES : category === 'armor' ? ARMOR_ATTRIBUTES : ACCESSORY_ATTRIBUTES;
export function createClosedCore(random: () => number): ClosedCore {
  const categoryRoll = random(); let categoryTotal = 0;
  const category = CORE_CATEGORY_CHANCES.find(entry => { categoryTotal += entry.chance; return categoryRoll < categoryTotal; })?.category ?? 'accessory';
  const weaponModel = category === 'weapon'
    ? (['espada', 'arco', 'cajado'] as const)[Math.min(2, Math.floor(random() * 3))]
    : undefined;
  const equipmentType = category === 'weapon' ? undefined : randomEquipmentType(random, category);
  const rarityRoll = random() * 100; let rarityTotal = 0;
  const rarity = CORE_RARITY_CHANCES.find(entry => { rarityTotal += entry.chance; return rarityRoll < rarityTotal; })?.rarity ?? 'normal';
  return { category, rarity, ...(weaponModel ? { weaponModel } : {}), ...(equipmentType ? { equipmentType } : {}) };
}
export function closedCoreItemId(core: ClosedCore): string {
  if (core.category === 'weapon') return `core:${core.rarity}:weapon:${core.weaponModel ?? 'espada'}`;
  return `core:${core.rarity}:${core.category}:${core.equipmentType ?? randomEquipmentType(() => 0, core.category)}`;
}
export function revealCore(random: () => number, category: CoreCategory, rarity: CoreRarity, id: string, weaponModel?: CoreWeaponModel, equipmentType?: CoreEquipmentType): Core {
  const surp = random() < CORE_SURP_CHANCE;
  const ref = CORE_RARITY_REFERENCE[rarity];
  if (category === 'weapon') {
    const model = weaponModel ?? 'espada';
    const attributes = WEAPON_MODEL_ATTRIBUTES[model].map(key => ({
      key,
      value: ref * (surp ? 1 : 0.5 + random() * 0.5),
    }));
    const affinity = model === 'cajado' ? (random() < 0.5 ? 'dano' : 'natureza') : undefined;
    return { id, category, rarity, surp, attributes, weaponModel: model, ...(affinity ? { affinity } : {}) };
  }
  const count = surp ? 4 : 2, pool = [...poolFor(category)];
  const attributes: CoreAttribute[] = [];
  while (attributes.length < count && pool.length) {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length)), [key] = pool.splice(index, 1);
    const potency = surp ? 1 : 0.5 + random() * 0.5;
    attributes.push({ key, value: ref * potency });
  }
  return { id, category, rarity, surp, attributes, equipmentType: equipmentType && isEquipmentType(equipmentType, category) ? equipmentType : randomEquipmentType(random, category) };
}
export function coreAttributeTier(value: number, rarity: CoreRarity): 'ruim' | 'medio' | 'bom' | 'maximo' {
  const potency = value / CORE_RARITY_REFERENCE[rarity];
  if (potency >= 1) return 'maximo';
  if (potency >= 0.834) return 'bom';
  if (potency >= 0.667) return 'medio';
  return 'ruim';
}
export function coreToItemId(core: Core): string { return `rcore:${core.rarity}:${encodeURIComponent(JSON.stringify(core))}`; }
function parseOldCore(encoded: string): Core | null {
  try {
    const value: unknown = JSON.parse(decodeURIComponent(encoded)); if (!value || typeof value !== 'object') return null;
    const core = value as Partial<Core>;
    if (typeof core.id !== 'string' || !isCategory(core.category) || core.category === 'weapon' || !isRarity(core.rarity) || typeof core.surp !== 'boolean'
      || !Array.isArray(core.attributes) || core.attributes.length === 0) return null;
    const pool = poolFor(core.category), seen = new Set<CoreAttributeKey>(), ref = CORE_RARITY_REFERENCE[core.rarity];
    for (const a of core.attributes) {
      if (!a || typeof a.key !== 'string' || !pool.includes(a.key as CoreAttributeKey) || seen.has(a.key as CoreAttributeKey)
        || !Number.isFinite(a.value) || a.value < ref * 0.5 - 0.005 || a.value > ref + 0.005) return null;
      seen.add(a.key as CoreAttributeKey);
    }
    return core as Core;
  } catch { return null; }
}
function parseNewCore(encoded: string, rarityPart: string): Core | null {
  try {
    const value: unknown = JSON.parse(decodeURIComponent(encoded)); if (!value || typeof value !== 'object') return null;
    const core = value as Partial<Core>;
    if (typeof core.id !== 'string' || !isCategory(core.category) || !isRarity(core.rarity) || core.rarity !== rarityPart
      || typeof core.surp !== 'boolean' || !Array.isArray(core.attributes)) return null;
    const ref = CORE_RARITY_REFERENCE[core.rarity];
    if (core.category === 'weapon') {
      if (!isWeaponModel(core.weaponModel) || (core.affinity !== undefined && (core.weaponModel !== 'cajado' || (core.affinity !== 'dano' && core.affinity !== 'natureza')))) return null;
      const expected = WEAPON_MODEL_ATTRIBUTES[core.weaponModel];
      if (core.attributes.length !== expected.length || core.attributes.some(a => !a || !expected.includes(a.key as CoreAttributeKey))
        || new Set(core.attributes.map(a => a?.key)).size !== expected.length) return null;
      let allMaximum = true;
      for (const a of core.attributes) {
        if (!a || typeof a.key !== 'string' || !expected.includes(a.key as CoreAttributeKey)
          || !Number.isFinite(a.value) || a.value < ref * 0.5 - 0.005 || a.value > ref + 0.005) return null;
        if (a.value < ref - 0.000001) allMaximum = false;
      }
      if (core.surp !== allMaximum) return null;
    } else {
      if (core.weaponModel !== undefined || core.affinity !== undefined || ![2, 4].includes(core.attributes.length)
        || (core.equipmentType !== undefined && !isEquipmentType(core.equipmentType, core.category))
        || core.surp !== (core.attributes.length === 4)) return null;
      const pool = poolFor(core.category), seen = new Set<CoreAttributeKey>();
      for (const a of core.attributes) {
        if (!a || typeof a.key !== 'string' || !pool.includes(a.key as CoreAttributeKey) || seen.has(a.key as CoreAttributeKey)
          || !Number.isFinite(a.value) || a.value < ref * 0.5 - 0.005 || a.value > ref + 0.005) return null;
        seen.add(a.key as CoreAttributeKey);
      }
    }
    return core as Core;
  } catch { return null; }
}
export type ParsedCoreItemId =
  | { kind: 'closed'; category: CoreCategory; rarity: CoreRarity; weaponModel?: CoreWeaponModel; equipmentType?: CoreEquipmentType }
  | { kind: 'revealed'; core: Core };
export function parseCoreItemId(itemId: string): ParsedCoreItemId | null {
  const parts = itemId.split(':');
  if (parts[0] === 'core' && isRarity(parts[1])) {
    if (parts.length === 4 && parts[2] === 'weapon' && isWeaponModel(parts[3])) {
      return { kind: 'closed', category: 'weapon', rarity: parts[1], weaponModel: parts[3] };
    }
    if (parts.length === 4 && (parts[2] === 'armor' || parts[2] === 'accessory') && isEquipmentType(parts[3], parts[2])) {
      return { kind: 'closed', category: parts[2], rarity: parts[1], equipmentType: parts[3] };
    }
    if (parts.length === 3 && (parts[2] === 'armor' || parts[2] === 'accessory')) {
      return { kind: 'closed', category: parts[2], rarity: parts[1] };
    }
    const legacy = parseOldCore(parts.slice(2).join(':')); return legacy ? { kind: 'revealed', core: legacy } : null;
  }
  if (parts[0] === 'rcore' && isRarity(parts[1])) {
    const core = parseNewCore(parts.slice(2).join(':'), parts[1]); return core ? { kind: 'revealed', core } : null;
  }
  return null;
}
export function coreFromItemId(itemId: string): Core | null {
  const parsed = parseCoreItemId(itemId); return parsed?.kind === 'revealed' ? parsed.core : null;
}
export function coreRarityLabel(rarity: CoreRarity): string {
  return ({ normal: 'Normal', common: 'Comum', uncommon: 'Incomum', rare: 'Raro', legendary: 'Lendário' })[rarity];
}
