export type InventoryStack = {
  itemId: string;
  quantity: number;
};

export type InventoryLimits = {
  maxSlots: number;
  maxPerSlot: number;
};

export type AddItemResult = {
  inventory: InventoryStack[];
  added: number;
};

/**
 * Fills partial stacks of the same item first, then creates new slots.
 * Any amount that does not fit remains in the world as a drop.
 */
export function addToInventory(
  inventory: InventoryStack[],
  itemId: string,
  requested: number,
  limits: InventoryLimits,
): AddItemResult {
  const amount = Math.max(0, Math.floor(requested));
  const next = inventory.map(stack => ({ ...stack }));
  if (!itemId || amount === 0) return { inventory: next, added: 0 };

  let remaining = amount;
  for (const stack of next) {
    if (stack.itemId !== itemId || remaining <= 0) continue;
    const room = Math.max(0, limits.maxPerSlot - stack.quantity);
    const added = Math.min(room, remaining);
    stack.quantity += added;
    remaining -= added;
  }

  while (remaining > 0 && next.length < limits.maxSlots) {
    const added = Math.min(limits.maxPerSlot, remaining);
    next.push({ itemId, quantity: added });
    remaining -= added;
  }

  return { inventory: next, added: amount - remaining };
}

export function getItemQuantity(inventory: InventoryStack[], itemId: string): number {
  return inventory.reduce((total, stack) => stack.itemId === itemId ? total + stack.quantity : total, 0);
}
