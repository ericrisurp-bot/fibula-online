import type { ClassId } from './config';
import type { AttributeBaseBonuses } from './attributes';
import { accessoryEffectiveValue, type AccessoryType, type CraftedAccessory } from './accessoryCrafting';

export type EquippedAccessorySelections = Partial<Record<ClassId, Partial<Record<AccessoryType, string>>>>;
export const ACCESSORY_SLOT_ORDER: readonly AccessoryType[] = ['colar', 'pulseira', 'cinto'];
const CLASS_ORDER: readonly ClassId[] = ['guerreiro', 'mago', 'arqueiro', 'druida'];
const storageKey = (userId: string) => 'fibula:equipped-accessories:' + userId;

function cloneSelections(selections: EquippedAccessorySelections): EquippedAccessorySelections {
  const cloned: EquippedAccessorySelections = {};
  for (const classId of CLASS_ORDER) {
    const classSelections = selections[classId];
    if (classSelections) cloned[classId] = { ...classSelections };
  }
  return cloned;
}

export function readEquippedAccessorySelections(userId: string): EquippedAccessorySelections {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const saved = parsed as Record<string, unknown>;
    const selections: EquippedAccessorySelections = {};
    for (const classId of CLASS_ORDER) {
      const raw = saved[classId];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const slots: Partial<Record<AccessoryType, string>> = {};
      for (const type of ACCESSORY_SLOT_ORDER) {
        const id = (raw as Record<string, unknown>)[type];
        if (typeof id === 'string' && id.length > 0) slots[type] = id;
      }
      if (Object.keys(slots).length) selections[classId] = slots;
    }
    return selections;
  } catch {
    return {};
  }
}

export function writeEquippedAccessorySelections(userId: string, selections: EquippedAccessorySelections): void {
  try {
    const safe: EquippedAccessorySelections = {};
    const usedIds = new Set<string>();
    for (const classId of CLASS_ORDER) {
      const raw = selections[classId];
      if (!raw) continue;
      const slots: Partial<Record<AccessoryType, string>> = {};
      for (const type of ACCESSORY_SLOT_ORDER) {
        const id = raw[type];
        if (typeof id !== 'string' || !id || usedIds.has(id)) continue;
        slots[type] = id;
        usedIds.add(id);
      }
      if (Object.keys(slots).length) safe[classId] = slots;
    }
    window.localStorage.setItem(storageKey(userId), JSON.stringify(safe));
  } catch {
    // Armazenamento local indisponível.
  }
}

export function equipAccessoryForClass(
  selections: EquippedAccessorySelections,
  classId: ClassId,
  accessory: Pick<CraftedAccessory, 'id' | 'type'>,
): EquippedAccessorySelections {
  const next = cloneSelections(selections);
  const equippedElsewhere = CLASS_ORDER.some(owner => owner !== classId
    && Object.values(next[owner] ?? {}).includes(accessory.id));
  if (equippedElsewhere) return next;
  next[classId] = { ...(next[classId] ?? {}), [accessory.type]: accessory.id };
  return next;
}

export function unequipAccessoryForClass(
  selections: EquippedAccessorySelections,
  classId: ClassId,
  accessory: Pick<CraftedAccessory, 'id' | 'type'>,
): EquippedAccessorySelections {
  const next = cloneSelections(selections);
  const slots = next[classId];
  if (slots?.[accessory.type] === accessory.id) delete slots[accessory.type];
  if (slots && !Object.keys(slots).length) delete next[classId];
  return next;
}

export function removeAccessoryFromSelections(
  selections: EquippedAccessorySelections,
  accessoryId: string,
): EquippedAccessorySelections {
  const next = cloneSelections(selections);
  for (const classId of CLASS_ORDER) {
    const slots = next[classId];
    if (!slots) continue;
    for (const type of ACCESSORY_SLOT_ORDER) {
      if (slots[type] === accessoryId) delete slots[type];
    }
    if (!Object.keys(slots).length) delete next[classId];
  }
  return next;
}

export function sanitizeEquippedAccessorySelections(
  accessories: CraftedAccessory[],
  selections: EquippedAccessorySelections,
): EquippedAccessorySelections {
  const safe: EquippedAccessorySelections = {};
  const usedIds = new Set<string>();
  for (const classId of CLASS_ORDER) {
    const raw = selections[classId] ?? {};
    const slots: Partial<Record<AccessoryType, string>> = {};
    for (const type of ACCESSORY_SLOT_ORDER) {
      const id = raw[type];
      const accessory = typeof id === 'string' ? accessories.find(item => item.id === id && item.type === type) : undefined;
      if (!accessory || usedIds.has(accessory.id)) continue;
      slots[type] = accessory.id;
      usedIds.add(accessory.id);
    }
    if (Object.keys(slots).length) safe[classId] = slots;
  }
  return safe;
}

export function resolveEquippedAccessories(
  accessories: CraftedAccessory[],
  selections: EquippedAccessorySelections,
  classId: ClassId,
): Partial<Record<AccessoryType, CraftedAccessory>> {
  const equipped: Partial<Record<AccessoryType, CraftedAccessory>> = {};
  for (const type of ACCESSORY_SLOT_ORDER) {
    const id = selections[classId]?.[type];
    const accessory = typeof id === 'string' ? accessories.find(item => item.id === id && item.type === type) : undefined;
    if (accessory) equipped[type] = accessory;
  }
  return equipped;
}

export function computeAccessoryAttributeBonuses(
  equipped: Partial<Record<AccessoryType, CraftedAccessory>>,
): AttributeBaseBonuses {
  const bonuses: AttributeBaseBonuses = {};
  for (const type of ACCESSORY_SLOT_ORDER) {
    const accessory = equipped[type];
    if (!accessory) continue;
    for (const attribute of accessory.attributes) {
      const key = attribute.key === 'mobilidade' ? 'velocidadeMovimento' : attribute.key;
      bonuses[key] = (bonuses[key] ?? 0) + accessoryEffectiveValue(accessory, attribute.value);
    }
  }
  return bonuses;
}
