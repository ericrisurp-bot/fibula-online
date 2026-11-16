import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { ClassId } from '../game/config';
import type { ArmorAttribute, ArmorPiece } from '../game/armor';
import {
  armorEffectiveValue,
  armorLiningEffectiveValue,
  type CraftedArmor,
} from '../game/armorCrafting';
import {
  armorReductionFromPoints,
  armorTotalDodge,
  type ArmorBonuses,
} from '../game/armorEquipment';

const PIECE_LABELS: Record<ArmorPiece, string> = {
  capacete: 'Capacete',
  peitoral: 'Peitoral',
  calca: 'Calça',
  bota: 'Bota',
  luva: 'Luva',
};
const PIECE_SPRITES: Record<ArmorPiece, string> = {
  capacete: 'helmet',
  peitoral: 'chest',
  calca: 'leggs',
  bota: 'boots',
  luva: 'gloves',
};
const RARITY_LABELS: Record<CraftedArmor['rarity'], string> = {
  normal: 'Normal',
  common: 'Comum',
  uncommon: 'Incomum',
  rare: 'Rara',
  legendary: 'Lendária',
};
const ATTRIBUTE_LABELS: Record<ArmorAttribute, string> = {
  armadura: 'Armadura',
  vida: 'Vida',
  mobilidade: 'Mobilidade',
  esquiva: 'Esquiva',
};
const LINING_LABELS: Record<CraftedArmor['lining'], string> = {
  algodao: 'Algodão',
  linho: 'Linho',
  couro_refinado: 'Couro refinado',
};
const rarityColor = (rarity: CraftedArmor['rarity']) => ({
  common: '#36d66f',
  uncommon: '#348cff',
  rare: '#a34be8',
  legendary: '#ff8a24',
}[rarity] ?? null);
const numberLabel = (value: number, maximumFractionDigits = 2) =>
  value.toLocaleString('pt-BR', { maximumFractionDigits });

export function ArmorPieceIcon({ armor, className = '' }: {
  armor: CraftedArmor;
  className?: string;
}) {
  const color = rarityColor(armor.rarity);
  const glow: CSSProperties = color ? { filter: `drop-shadow(0 0 5px ${color})` } : {};
  return <span className={`arsenal-armor-art ${className}`} style={glow}>
    <img
      src={`/assets/armors/${armor.type === 'couro' ? 'zeryn' : 'vark'}-${PIECE_SPRITES[armor.piece]}.png`}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  </span>;
}

export function ArmorInventoryCard({ armor, selected, onClick }: {
  armor: CraftedArmor;
  selected: boolean;
  onClick: () => void;
}) {
  return <button
    type="button"
    className={`arsenal-inventory-slot filled arsenal-armor-inventory-item${selected ? ' selected' : ''}`}
    onClick={onClick}
    aria-label={`${PIECE_LABELS[armor.piece]}, ${RARITY_LABELS[armor.rarity]}, ${armor.stars} estrelas. Abrir ações.`}
  >
    <ArmorPieceIcon armor={armor} />
    <small>{PIECE_LABELS[armor.piece]}</small>
    <span className="arsenal-armor-stars" aria-label={`${armor.stars} estrelas`}>{'★'.repeat(armor.stars)}</span>
  </button>;
}

export function ArmorBonusSummary({ classId, bonuses, equippedCount }: {
  classId: ClassId | null;
  bonuses: ArmorBonuses | null;
  equippedCount: number;
}) {
  if (!classId || !bonuses) return null;
  if (equippedCount === 0) return <section className="arsenal-armor-bonus-summary">
    <strong>BÔNUS DA ARMADURA · {({ guerreiro: 'Guerreiro', mago: 'Mago', arqueiro: 'Arqueiro', druida: 'Druida' } as const)[classId]}</strong>
    <p>Nenhuma armadura equipada.</p>
    {!CONFIG_RULES_V2_ENABLED && <small>Estes bônus passam a valer no jogo quando as Regras v2 forem ativadas.</small>}
  </section>;
  const reduction = armorReductionFromPoints(bonuses.armadura);
  const totalDodge = armorTotalDodge(CONFIG_CLASS_DODGE[classId], bonuses.esquiva);
  return <section className="arsenal-armor-bonus-summary">
    <strong>BÔNUS DA ARMADURA · {({ guerreiro: 'Guerreiro', mago: 'Mago', arqueiro: 'Arqueiro', druida: 'Druida' } as const)[classId]}</strong>
    <div><span>Vida</span><b>+{numberLabel(bonuses.vida)}</b></div>
    <div><span>Armadura</span><b>{numberLabel(reduction * 100)}% de redução{reduction >= 0.6 ? ' · teto 60%' : ''}</b></div>
    <div><span>Mobilidade</span><b>+{numberLabel(bonuses.mobilidade)}</b></div>
    <div><span>Esquiva</span><b>+{numberLabel(bonuses.esquiva * 100)}% da armadura · total {numberLabel(totalDodge * 100)}%{totalDodge >= 0.35 ? ' · teto 35%' : ''}</b></div>
    {bonuses.xpPartida > 0 && <div><span>XP da partida</span><b>+{numberLabel(bonuses.xpPartida * 100)}%</b></div>}
    {!CONFIG_RULES_V2_ENABLED && <small>Estes bônus passam a valer no jogo quando as Regras v2 forem ativadas.</small>}
  </section>;
}

// Os valores são passados pelo App para manter o componente apenas de apresentação.
let CONFIG_RULES_V2_ENABLED = false;
let CONFIG_CLASS_DODGE: Record<ClassId, number> = {
  guerreiro: 0.032, mago: 0.04, arqueiro: 0.048, druida: 0.04,
};
export function configureArmorBonusPresentation(rulesV2Enabled: boolean, classDodge: Record<ClassId, number>) {
  CONFIG_RULES_V2_ENABLED = rulesV2Enabled;
  CONFIG_CLASS_DODGE = classDodge;
}

export function ArmorActionDialogs({ armor, equipped, deleteConfirmation, busy, onClose, onEquip, onUnequip, onRequestDelete, onCancelDelete, onConfirmDelete }: {
  armor: CraftedArmor | null;
  equipped: boolean;
  deleteConfirmation: boolean;
  busy: boolean;
  onClose: () => void;
  onEquip: () => void;
  onUnequip: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (!armor) return null;
  const pieceLabel = PIECE_LABELS[armor.piece];
  const attributeValue = (attribute: ArmorAttribute, value: number) => {
    if (attribute === 'esquiva') return `+${numberLabel(value * 100)}%`;
    if (attribute === 'armadura') return `+${numberLabel(value)} pontos`;
    return `+${numberLabel(value)}`;
  };
  return <>
    {!detailsOpen && !deleteConfirmation && <div className="arsenal-action-backdrop" role="presentation" onClick={onClose}>
      <section className="arsenal-action-dialog" role="dialog" aria-modal="true" aria-label={pieceLabel} onClick={event => event.stopPropagation()}>
        <header><strong>{pieceLabel}</strong><button type="button" aria-label="Fechar" onClick={onClose}>×</button></header>
        {equipped
          ? <button type="button" className="arsenal-action-button" autoFocus onClick={onUnequip}>Desequipar</button>
          : <button type="button" className="arsenal-action-button" autoFocus onClick={onEquip}>Equipar</button>}
        <button type="button" className="arsenal-action-button" onClick={() => setDetailsOpen(true)}>Detalhes</button>
        <button type="button" className="arsenal-action-button danger" onClick={onRequestDelete}>Excluir</button>
      </section>
    </div>}
    {detailsOpen && <div className="arsenal-weapon-info-backdrop" role="presentation" onClick={() => setDetailsOpen(false)}>
      <section className="arsenal-weapon-info-card arsenal-armor-details" role="dialog" aria-modal="true" aria-label={pieceLabel} onClick={event => event.stopPropagation()}>
        <header><strong>{pieceLabel}</strong><button type="button" onClick={() => setDetailsOpen(false)}>Fechar</button></header>
        <div className="arsenal-item-info-details">
          <div><span>Tipo</span><b>{armor.type === 'couro' ? 'Couro' : 'Bronze'}</b></div>
          <div><span>Raridade</span><b>{RARITY_LABELS[armor.rarity]}</b></div>
          <div><span>Estrelas</span><b>{'★'.repeat(armor.stars)}</b></div>
          <div><span>SURP</span><b>{armor.surp ? 'Sim' : 'Não'}</b></div>
        </div>
        <h3>Atributos efetivos</h3>
        <ul>{armor.attributes.map(attribute => <li key={attribute.key}><span>{ATTRIBUTE_LABELS[attribute.key]}</span><b>{attributeValue(attribute.key, armorEffectiveValue(armor, attribute.key))}</b></li>)}</ul>
        <h3>Forro</h3>
        <div className="arsenal-item-info-details"><div><span>{LINING_LABELS[armor.lining]}</span><b>{armor.lining === 'couro_refinado' ? `+${numberLabel(armorLiningEffectiveValue(armor) * 100)}% XP` : armor.lining === 'algodao' ? `+${numberLabel(armorLiningEffectiveValue(armor))} vida` : `+${numberLabel(armorLiningEffectiveValue(armor))} mobilidade`}</b></div></div>
      </section>
    </div>}
    {deleteConfirmation && <div className="arsenal-action-backdrop arsenal-confirm-backdrop" role="presentation" onClick={() => { if (!busy) onCancelDelete(); }}>
      <section className="arsenal-action-dialog arsenal-confirm-dialog" role="dialog" aria-modal="true" aria-label="Confirmar exclusão" onClick={event => event.stopPropagation()}>
        <header><strong>Excluir {pieceLabel}?</strong></header>
        <p>Esta ação não pode ser desfeita.</p>
        <div className="arsenal-confirm-actions">
          <button type="button" className="arsenal-action-button" autoFocus disabled={busy} onClick={onCancelDelete}>Cancelar</button>
          <button type="button" className="arsenal-action-button danger" disabled={busy} onClick={onConfirmDelete}>{busy ? 'Excluindo…' : 'Excluir'}</button>
        </div>
      </section>
    </div>}
  </>;
}
