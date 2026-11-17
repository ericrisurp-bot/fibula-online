import type { CoreRarity } from './cores';
export type AccessoryType = 'colar' | 'pulseira' | 'cinto';
export type AccessoryLining = 'linho' | 'couro_refinado';
export type AccessoryAttributeKey = 'forca' | 'inteligencia' | 'destreza' | 'vida' | 'armadura' | 'mobilidade' | 'esquiva';
export type CraftedAccessory = {
  id: string; type: AccessoryType; rarity: CoreRarity; metal: 'bronze' | 'ferro'; stars: number;
  surp: boolean; attributes: Array<{ key: AccessoryAttributeKey; value: number }>;
  lining: AccessoryLining; craftedBy: string | null; createdAt: string;
};
type AccessoryClient = unknown;
type AccessoryInventory = Array<{ itemId: string; quantity: number }>;
type AccessoryCraftResult = { accessory: CraftedAccessory; inventory: AccessoryInventory };
const TYPES: readonly AccessoryType[] = ['colar', 'pulseira', 'cinto'];
const RARITIES: readonly CoreRarity[] = ['normal', 'common', 'uncommon', 'rare', 'legendary'];
const LININGS: readonly AccessoryLining[] = ['linho', 'couro_refinado'];
const ATTRIBUTE_KEYS: readonly AccessoryAttributeKey[] = ['forca','inteligencia','destreza','vida','armadura','mobilidade','esquiva'];
function invalidAccessoryResponse(detail: string): Error { return new Error('O servidor retornou dados inválidos para o acessório: ' + detail); }
function readObject(value: unknown, detail: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidAccessoryResponse(detail);
  return value as Record<string, unknown>;
}
function readAttributes(value: unknown): CraftedAccessory['attributes'] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) throw invalidAccessoryResponse('os atributos devem conter de 2 a 4 entradas.');
  const seen = new Set<AccessoryAttributeKey>();
  return value.map(entry => {
    const row = readObject(entry, 'um atributo não é um objeto válido.');
    if (typeof row.key !== 'string' || !ATTRIBUTE_KEYS.includes(row.key as AccessoryAttributeKey)
      || seen.has(row.key as AccessoryAttributeKey) || typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value <= 0) {
      throw invalidAccessoryResponse('há um atributo repetido, não permitido ou com valor inválido.');
    }
    seen.add(row.key as AccessoryAttributeKey);
    return { key: row.key as AccessoryAttributeKey, value: row.value };
  });
}
function readCraftedAccessory(value: unknown): CraftedAccessory {
  const row = readObject(value, 'a peça está ausente ou não é um objeto.');
  const maxStars = row.metal === 'bronze' ? 2 : row.metal === 'ferro' ? 4 : 0;
  if (typeof row.id !== 'string' || !row.id || !TYPES.includes(row.type as AccessoryType)
    || !RARITIES.includes(row.rarity as CoreRarity) || !maxStars
    || !Number.isSafeInteger(row.stars) || (row.stars as number) < 1 || (row.stars as number) > maxStars
    || typeof row.surp !== 'boolean' || !LININGS.includes(row.lining as AccessoryLining)
    || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))) {
    throw invalidAccessoryResponse('os campos do acessório estão ausentes ou inválidos.');
  }
  return {
    id: row.id, type: row.type as AccessoryType, rarity: row.rarity as CoreRarity,
    metal: row.metal as CraftedAccessory['metal'], stars: row.stars as number, surp: row.surp,
    attributes: readAttributes(row.attributes), lining: row.lining as AccessoryLining,
    craftedBy: typeof row.craftedBy === 'string' ? row.craftedBy.trim().slice(0,60).trim() || null : null,
    createdAt: row.createdAt,
  };
}
function readStoredAccessory(value: unknown): CraftedAccessory {
  const row = readObject(value, 'a linha da tabela contém dados inválidos.');
  return readCraftedAccessory({ id: row.id, type: row.type, rarity: row.rarity, metal: row.metal,
    stars: row.stars, surp: row.surp, attributes: row.attributes, lining: row.lining,
    craftedBy: row.crafted_by, createdAt: row.created_at });
}
function readInventory(value: unknown): AccessoryInventory {
  if (!Array.isArray(value) || !value.every(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const row = entry as Record<string, unknown>;
    return typeof row.itemId === 'string' && !!row.itemId && Number.isSafeInteger(row.quantity) && (row.quantity as number) > 0;
  })) throw invalidAccessoryResponse('o inventário devolvido está ausente ou inválido.');
  return value as AccessoryInventory;
}
export function accessoryEffectiveValue(accessory: CraftedAccessory, value: number): number {
  return value * (1 + 0.25 * (accessory.stars - 1));
}
export async function craftAccessory(client: AccessoryClient, lining: AccessoryLining, coreItemId: string): Promise<AccessoryCraftResult> {
  const rpcClient = client as { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }> };
  const { data, error } = await rpcClient.rpc('fibula_craft_accessory', { p_lining: lining, p_core_item_id: coreItemId });
  if (error) throw new Error(error.message || 'O servidor recusou a fabricação do acessório.');
  const payload = readObject(data, 'a resposta não é um objeto.');
  return { accessory: readStoredAccessory(payload.accessory), inventory: readInventory(payload.inventory) };
}
export async function listMyAccessories(client: AccessoryClient): Promise<CraftedAccessory[]> {
  const queryClient = client as { from: (table: string) => { select: (columns: string) => { order: (column: string, options: { ascending: boolean }) => { limit: (count: number) => PromiseLike<{ data: unknown; error: { message?: string } | null }> } } } };
  const { data, error } = await queryClient.from('fibula_accessories')
    .select('id,type,rarity,metal,stars,surp,attributes,lining,crafted_by,created_at')
    .order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error(error.message || 'Não foi possível carregar os acessórios fabricados.');
  if (!Array.isArray(data)) throw invalidAccessoryResponse('a lista de acessórios está ausente ou inválida.');
  return data.map(readStoredAccessory);
}
