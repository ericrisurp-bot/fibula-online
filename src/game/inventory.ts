export type InventoryStack = {
  itemId: string;
  quantity: number;
};

export type InventoryLimits = {
  maxTypes: number;
  maxPerType: number;
};

export type AddItemResult = {
  inventory: InventoryStack[];
  added: number;
};

/**
 * Adds as much as possible without exceeding the slot or per-item limits.
 * The caller keeps any remainder in the world as a drop.
 */
export function addToInventory(
  inventory: InventoryStack[],
  itemId: string,
  requested: number,
  limits: InventoryLimits,
): AddItemResult {
  const amount = Math.max(0, Math.floor(requested));
  if (!itemId || amount === 0) return { inventory: inventory.map(stack => ({ ...stack })), added: 0 };

  const next = inventory.map(stack => ({ ...stack }));
  const index = next.findIndex(stack => stack.itemId === itemId);
  if (index < 0 && next.length >= limits.maxTypes) return { inventory: next, added: 0 };

  const current = index < 0 ? 0 : next[index].quantity;
  const added = Math.min(amount, Math.max(0, limits.maxPerType - current));
  if (added === 0) return { inventory: next, added: 0 };

  if (index < 0) next.push({ itemId, quantity: added });
  else next[index].quantity += added;

  return { inventory: next, added };
}

export function getItemQuantity(inventory: InventoryStack[], itemId: string): number {
  return inventory.find(stack => stack.itemId === itemId)?.quantity ?? 0;
}
