export const ARSENAL_CAPACITY = 30;

export const EQUIPMENT_SLOTS = [
  'capacete',
  'armadura',
  'calca',
  'bota',
  'luva',
  'arma1',
  'arma2',
  'colar',
  'pulseira',
] as const;

export type EquipmentSlotId = typeof EQUIPMENT_SLOTS[number];

export type ArsenalEquipment = {
  id: string;
  name: string;
  slot: EquipmentSlotId;
  icon: string;
  rarity?: string;
};

export type EquipmentLoadout = Partial<Record<EquipmentSlotId, string>>;

/**
 * Central entry point for equipment obtained from drops or crafting.
 * Equipment is stored one item per slot; materials remain in the normal inventory.
 */
export function addEquipmentToArsenal(
  arsenal: ArsenalEquipment[],
  equipment: ArsenalEquipment,
): ArsenalEquipment[] {
  if (!equipment.id || arsenal.some(item => item.id === equipment.id)) return arsenal;
  if (arsenal.length >= ARSENAL_CAPACITY) return arsenal;
  return [...arsenal, equipment];
}

export function equipArsenalItem(
  loadout: EquipmentLoadout,
  equipment: ArsenalEquipment,
): EquipmentLoadout {
  return { ...loadout, [equipment.slot]: equipment.id };
}

export function unequipArsenalSlot(
  loadout: EquipmentLoadout,
  slot: EquipmentSlotId,
): EquipmentLoadout {
  const next = { ...loadout };
  delete next[slot];
  return next;
}
