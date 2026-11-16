import {
  ARMOR_MAX_STARS,
  ARMOR_PIECE_ATTRIBUTES,
  ARMOR_RECIPES,
  armorStarMultiplier,
  type ArmorAttribute,
  type ArmorLining,
  type ArmorPiece,
  type ArmorType,
} from './armor';
import type { CoreRarity } from './cores';
import { weaponMaterialItemId } from './weapons';

export type CraftedArmor = {
  id: string;
  piece: ArmorPiece;
  type: ArmorType;
  rarity: CoreRarity;
  stars: number;
  surp: boolean;
  attributes: Array<{ key: ArmorAttribute; value: number }>;
  lining: ArmorLining;
  liningValue: number;
  createdAt: string;
};

type ArmorClient = unknown;
type ArmorInventory = Array<{ itemId: string; quantity: number }>;
type ArmorCraftResult = { armor: CraftedArmor; inventory: ArmorInventory };

const ARMOR_PIECES: readonly ArmorPiece[] = ['capacete', 'peitoral', 'calca', 'bota', 'luva'];
const ARMOR_TYPES: readonly ArmorType[] = ['couro', 'bronze'];
const ARMOR_LININGS: readonly ArmorLining[] = ['algodao', 'linho', 'couro_refinado'];
const ARMOR_RARITIES: readonly CoreRarity[] = ['normal', 'common', 'uncommon', 'rare', 'legendary'];

function invalidArmorResponse(detail: string): Error {
  return new Error('O servidor retornou dados inválidos para a fabricação de armadura: ' + detail);
}

function readArmorObject(value: unknown, detail: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidArmorResponse(detail);
  }
  return value as Record<string, unknown>;
}

function readArmorAttributes(
  value: unknown,
  piece: ArmorPiece,
  type: ArmorType,
): CraftedArmor['attributes'] {
  const allowed = ARMOR_PIECE_ATTRIBUTES[type][piece];
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw invalidArmorResponse('os atributos devem conter de 1 a 3 entradas.');
  }

  const seen = new Set<ArmorAttribute>();
  const attributes = value.map(attribute => {
    const row = readArmorObject(attribute, 'um atributo não é um objeto válido.');
    if (typeof row.key !== 'string'
      || !allowed.includes(row.key as ArmorAttribute)
      || seen.has(row.key as ArmorAttribute)
      || typeof row.value !== 'number'
      || !Number.isFinite(row.value)
      || row.value <= 0) {
      throw invalidArmorResponse('há um atributo não permitido ou com valor inválido para a peça e o tipo.');
    }
    seen.add(row.key as ArmorAttribute);
    return { key: row.key as ArmorAttribute, value: row.value };
  });
  return attributes;
}

function readCraftedArmor(value: unknown): CraftedArmor {
  const row = readArmorObject(value, 'a armadura está ausente ou não é um objeto.');
  if (typeof row.id !== 'string' || row.id.length === 0
    || !ARMOR_PIECES.includes(row.piece as ArmorPiece)
    || !ARMOR_TYPES.includes(row.type as ArmorType)
    || !ARMOR_RARITIES.includes(row.rarity as CoreRarity)
    || !Number.isSafeInteger(row.stars)
    || (row.stars as number) < 1
    || (row.stars as number) > ARMOR_MAX_STARS[row.rarity as CoreRarity]
    || typeof row.surp !== 'boolean'
    || !ARMOR_LININGS.includes(row.lining as ArmorLining)
    || typeof row.liningValue !== 'number'
    || !Number.isFinite(row.liningValue)
    || row.liningValue <= 0
    || typeof row.createdAt !== 'string'
    || !Number.isFinite(Date.parse(row.createdAt))) {
    throw invalidArmorResponse('os campos da armadura estão ausentes ou inválidos.');
  }

  return {
    id: row.id,
    piece: row.piece as ArmorPiece,
    type: row.type as ArmorType,
    rarity: row.rarity as CoreRarity,
    stars: row.stars as number,
    surp: row.surp,
    attributes: readArmorAttributes(row.attributes, row.piece as ArmorPiece, row.type as ArmorType),
    lining: row.lining as ArmorLining,
    liningValue: row.liningValue,
    createdAt: row.createdAt,
  };
}

function readStoredArmor(value: unknown): CraftedArmor {
  const row = readArmorObject(value, 'a linha da tabela contém dados inválidos.');
  return readCraftedArmor({
    id: row.id,
    piece: row.piece,
    type: row.type,
    rarity: row.rarity,
    stars: row.stars,
    surp: row.surp,
    attributes: row.attributes,
    lining: row.lining,
    liningValue: row.lining_value,
    createdAt: row.created_at,
  });
}

function readArmorInventory(value: unknown): ArmorInventory {
  if (!Array.isArray(value) || !value.every(stack => {
    if (!stack || typeof stack !== 'object' || Array.isArray(stack)) return false;
    const row = stack as Record<string, unknown>;
    return typeof row.itemId === 'string' && row.itemId.length > 0
      && Number.isSafeInteger(row.quantity) && (row.quantity as number) > 0;
  })) {
    throw invalidArmorResponse('o inventário devolvido está ausente ou inválido.');
  }
  return value as ArmorInventory;
}

export function armorMaterialItemIds(
  type: ArmorType,
  piece: ArmorPiece,
  lining: ArmorLining,
  rarity: CoreRarity,
): {
  base: { itemId: string; quantity: number };
  lining: { itemId: string; quantity: number };
} {
  const recipe = ARMOR_RECIPES[type][piece];
  const baseMaterial = type === 'couro' ? 'wolf_hide' : 'bronze';
  const liningMaterial: Record<ArmorLining, string> = {
    algodao: 'cotton',
    linho: 'linen',
    couro_refinado: 'refined_leather',
  };
  return {
    base: { itemId: weaponMaterialItemId(baseMaterial, rarity), quantity: recipe.base },
    lining: { itemId: weaponMaterialItemId(liningMaterial[lining], rarity), quantity: recipe.lining },
  };
}

export function armorEffectiveValue(armor: CraftedArmor, attribute: ArmorAttribute): number {
  const value = armor.attributes.find(entry => entry.key === attribute)?.value ?? 0;
  return value * armorStarMultiplier(armor.stars, armor.rarity);
}

export function armorLiningEffectiveValue(armor: CraftedArmor): number {
  return armor.liningValue * armorStarMultiplier(armor.stars, armor.rarity);
}

export async function craftArmor(
  client: ArmorClient,
  piece: ArmorPiece,
  type: ArmorType,
  lining: ArmorLining,
  coreItemId: string,
): Promise<ArmorCraftResult> {
  const rpcClient = client as {
    rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  };
  const { data, error } = await rpcClient.rpc('fibula_craft_armor', {
    p_piece: piece,
    p_type: type,
    p_lining: lining,
    p_core_item_id: coreItemId,
  });
  if (error) throw new Error(error.message || 'O servidor recusou a fabricação da armadura.');
  const payload = readArmorObject(data, 'a resposta não é um objeto.');
  return {
    armor: readStoredArmor(payload.armor),
    inventory: readArmorInventory(payload.inventory),
  };
}

export async function listMyArmors(client: ArmorClient): Promise<CraftedArmor[]> {
  const queryClient = client as {
    from: (table: string) => {
      select: (columns: string) => {
        order: (column: string, options: { ascending: boolean }) => {
          limit: (count: number) => PromiseLike<{
            data: unknown;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };
  const { data, error } = await queryClient.from('fibula_armors')
    .select('id,piece,type,rarity,stars,surp,attributes,lining,lining_value,created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message || 'Não foi possível carregar as armaduras fabricadas.');
  if (!Array.isArray(data)) throw invalidArmorResponse('a lista de armaduras está ausente ou inválida.');
  return data.map(readStoredArmor);
}

export async function deleteArmor(client: ArmorClient, armorId: string): Promise<boolean> {
  const rpcClient = client as {
    rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  };
  const { data, error } = await rpcClient.rpc('fibula_delete_armor', { p_armor_id: armorId });
  if (error) throw new Error(error.message || 'Não foi possível excluir a armadura.');
  if (typeof data !== 'boolean') throw invalidArmorResponse('a resposta da exclusão não é um booleano.');
  return data;
}
