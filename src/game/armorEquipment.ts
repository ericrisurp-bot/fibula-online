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

export type EquippedArmorSelections = Partial<Record<ArmorPiece, string>>;

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

const equippedArmorStorageKey = (userId: string) => \`fibula:equipped-armors:\${userId}\`;

export function readEquippedArmorSelections(userId: string): EquippedArmorSelections {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(equippedArmorStorageKey(userId)) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const selections: EquippedArmorSelections = {};
    for (const piece of ARMOR_PIECE_ORDER) {
      const id = (parsed as Record<string, unknown>)[piece];
      if (typeof id === 'string' && id.length > 0) selections[piece] = id;
    }
    return selections;
  } catch {
    return {};
  }
}

export function writeEquippedArmorSelections(
  userId: string,
  selections: EquippedArmorSelections,
): void {
  try {
    const safeSelections: EquippedArmorSelections = {};
    for (const piece of ARMOR_PIECE_ORDER) {
      const id = selections[piece];
      if (typeof id === 'string' && id.length > 0) safeSelections[piece] = id;
    }
    window.localStorage.setItem(equippedArmorStorageKey(userId), JSON.stringify(safeSelections));
  } catch {
    // Armazenamento local indisponível.
  }
}

export function resolveEquippedArmors(
  armors: CraftedArmor[],
  selections: EquippedArmorSelections,
): Partial<Record<ArmorPiece, CraftedArmor>> {
  const equipped: Partial<Record<ArmorPiece, CraftedArmor>> = {};
  for (const piece of ARMOR_PIECE_ORDER) {
    const id = selections[piece];
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
