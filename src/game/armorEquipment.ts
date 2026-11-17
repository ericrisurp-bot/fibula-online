import { CONFIG, type ClassId } from './config';
import {
  applyClassUsage,
  type ArmorAttribute,
  type ArmorPiece,
} from './armor';
import {
  armorEffectiveValue,
  armorLiningEffectiveValue,
  type CraftedArmor,
} from './armorCrafting';

export type EquippedArmorSelections = Partial<Record<ClassId, Partial<Record<ArmorPiece, string>>>>;

export type ArmorBonuses = {
  armadura: number;
  vida: number;
  mobilidade: number;
  esquiva: number;
  xpPartida: number;
};

export const ARMOR_PIECE_ORDER: ArmorPiece[] = [
  'capacete',
  'peitoral',
  'calca',
  'bota',
  'luva',
];

const ARMOR_CLASS_ORDER: readonly ClassId[] = ['guerreiro', 'mago', 'arqueiro', 'druida'];
const equippedArmorStorageKey = (userId: string) => 'fibula:equipped-armors:' + userId;

function isClassId(value: string): value is ClassId {
  return ARMOR_CLASS_ORDER.includes(value as ClassId);
}

function cloneSelections(selections: EquippedArmorSelections): EquippedArmorSelections {
  const cloned: EquippedArmorSelections = {};
  for (const classId of ARMOR_CLASS_ORDER) {
    const classSelections = selections[classId];
    if (classSelections) cloned[classId] = { ...classSelections };
  }
  return cloned;
}

/**
 * Lê o formato atual (por classe) e migra o formato antigo compartilhado
 * para a classe principal, sem duplicar a mesma peça na classe secundária.
 */
export function readEquippedArmorSelections(
  userId: string,
  legacyPrimaryClass: ClassId = 'guerreiro',
): EquippedArmorSelections {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(equippedArmorStorageKey(userId)) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const saved = parsed as Record<string, unknown>;
    const hasClassEntries = ARMOR_CLASS_ORDER.some(classId =>
      !!saved[classId] && typeof saved[classId] === 'object' && !Array.isArray(saved[classId]),
    );

    if (hasClassEntries) {
      const selections: EquippedArmorSelections = {};
      for (const classId of ARMOR_CLASS_ORDER) {
        const rawClass = saved[classId];
        if (!rawClass || typeof rawClass !== 'object' || Array.isArray(rawClass)) continue;
        const pieces: Partial<Record<ArmorPiece, string>> = {};
        for (const piece of ARMOR_PIECE_ORDER) {
          const id = (rawClass as Record<string, unknown>)[piece];
          if (typeof id === 'string' && id.length > 0) pieces[piece] = id;
        }
        if (Object.keys(pieces).length) selections[classId] = pieces;
      }
      return selections;
    }

    const legacyPieces: Partial<Record<ArmorPiece, string>> = {};
    for (const piece of ARMOR_PIECE_ORDER) {
      const id = saved[piece];
      if (typeof id === 'string' && id.length > 0) legacyPieces[piece] = id;
    }
    return Object.keys(legacyPieces).length ? { [legacyPrimaryClass]: legacyPieces } : {};
  } catch {
    return {};
  }
}

/** Persiste seleções por classe e remove IDs repetidos entre classes. */
export function writeEquippedArmorSelections(
  userId: string,
  selections: EquippedArmorSelections,
): void {
  try {
    const safeSelections: EquippedArmorSelections = {};
    const usedArmorIds = new Set<string>();
    for (const classId of ARMOR_CLASS_ORDER) {
      const classSelections = selections[classId];
      if (!classSelections) continue;
      const safePieces: Partial<Record<ArmorPiece, string>> = {};
      for (const piece of ARMOR_PIECE_ORDER) {
        const id = classSelections[piece];
        if (typeof id !== 'string' || id.length === 0 || usedArmorIds.has(id)) continue;
        safePieces[piece] = id;
        usedArmorIds.add(id);
      }
      if (Object.keys(safePieces).length) safeSelections[classId] = safePieces;
    }
    window.localStorage.setItem(equippedArmorStorageKey(userId), JSON.stringify(safeSelections));
  } catch {
    // Armazenamento local indisponível.
  }
}

export function equipArmorForClass(
  selections: EquippedArmorSelections,
  classId: ClassId,
  armor: Pick<CraftedArmor, 'id' | 'piece'>,
): EquippedArmorSelections {
  const next = cloneSelections(selections);
  // Um item fabricado só pode ocupar uma classe por vez.
  for (const ownerClass of ARMOR_CLASS_ORDER) {
    const pieces = next[ownerClass];
    if (!pieces) continue;
    for (const piece of ARMOR_PIECE_ORDER) {
      if (pieces[piece] === armor.id) delete pieces[piece];
    }
    if (!Object.keys(pieces).length) delete next[ownerClass];
  }
  next[classId] = { ...(next[classId] ?? {}), [armor.piece]: armor.id };
  return next;
}

export function unequipArmorForClass(
  selections: EquippedArmorSelections,
  classId: ClassId,
  armor: Pick<CraftedArmor, 'id' | 'piece'>,
): EquippedArmorSelections {
  const next = cloneSelections(selections);
  const pieces = next[classId];
  if (pieces?.[armor.piece] === armor.id) delete pieces[armor.piece];
  if (pieces && !Object.keys(pieces).length) delete next[classId];
  return next;
}

export function removeArmorFromSelections(
  selections: EquippedArmorSelections,
  armorId: string,
): EquippedArmorSelections {
  const next = cloneSelections(selections);
  for (const classId of ARMOR_CLASS_ORDER) {
    const pieces = next[classId];
    if (!pieces) continue;
    for (const piece of ARMOR_PIECE_ORDER) {
      if (pieces[piece] === armorId) delete pieces[piece];
    }
    if (!Object.keys(pieces).length) delete next[classId];
  }
  return next;
}

/** Mantém apenas armaduras existentes e garante exclusividade global por ID. */
export function sanitizeEquippedArmorSelections(
  armors: CraftedArmor[],
  selections: EquippedArmorSelections,
): EquippedArmorSelections {
  const safe: EquippedArmorSelections = {};
  const usedArmorIds = new Set<string>();
  for (const classId of ARMOR_CLASS_ORDER) {
    const resolved = resolveEquippedArmors(armors, selections, classId);
    const pieces: Partial<Record<ArmorPiece, string>> = {};
    for (const piece of ARMOR_PIECE_ORDER) {
      const armor = resolved[piece];
      if (!armor || usedArmorIds.has(armor.id)) continue;
      pieces[piece] = armor.id;
      usedArmorIds.add(armor.id);
    }
    if (Object.keys(pieces).length) safe[classId] = pieces;
  }
  return safe;
}

export function resolveEquippedArmors(
  armors: CraftedArmor[],
  selections: EquippedArmorSelections,
  classId: ClassId,
): Partial<Record<ArmorPiece, CraftedArmor>> {
  const equipped: Partial<Record<ArmorPiece, CraftedArmor>> = {};
  const classSelections = selections[classId] ?? {};
  for (const piece of ARMOR_PIECE_ORDER) {
    const id = classSelections[piece];
    if (typeof id !== 'string' || id.length === 0) continue;
    const armor = armors.find(item => item.id === id && item.piece === piece);
    if (armor) equipped[piece] = armor;
  }
  return equipped;
}

export function computeArmorBonuses(
  equipped: Partial<Record<ArmorPiece, CraftedArmor>>,
  classId: ClassId,
): ArmorBonuses {
  const bonuses: ArmorBonuses = {
    armadura: 0,
    vida: 0,
    mobilidade: 0,
    esquiva: 0,
    xpPartida: 0,
  };
  const attributes: readonly ArmorAttribute[] = ['armadura', 'vida', 'mobilidade', 'esquiva'];

  // O aproveitamento por classe é aplicado somente aqui, uma vez. A A5.3 não deve reaplicá-lo.
  for (const piece of ARMOR_PIECE_ORDER) {
    const armor = equipped[piece];
    if (!armor) continue;

    for (const attribute of attributes) {
      bonuses[attribute] += applyClassUsage(
        classId,
        attribute,
        armorEffectiveValue(armor, attribute),
      );
    }

    const liningValue = armorLiningEffectiveValue(armor);
    if (armor.lining === 'algodao') {
      bonuses.vida += applyClassUsage(classId, 'vida', liningValue);
    } else if (armor.lining === 'linho') {
      bonuses.mobilidade += applyClassUsage(classId, 'mobilidade', liningValue);
    } else if (armor.lining === 'couro_refinado') {
      bonuses.xpPartida += liningValue;
    }
  }

  return bonuses;
}

/** Retorna a redução percentual por pontos de armadura, limitada ao teto global de 60%. */
export function armorReductionFromPoints(pontos: number): number {
  return Math.min(
    CONFIG.rulesV2.armorMaxReduction,
    pontos * CONFIG.rulesV2.armorPercentPerPoint / 100,
  );
}

/** Soma a esquiva-base e a esquiva da armadura, limitada ao teto total de 35%. */
export function armorTotalDodge(esquivaBaseClasse: number, esquivaArmadura: number): number {
  return Math.min(0.35, esquivaBaseClasse + esquivaArmadura);
}
