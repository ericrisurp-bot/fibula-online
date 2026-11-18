import type { AccessoryAttributeKey, CraftedAccessory } from '../game/accessoryCrafting';
import { accessoryEffectiveValue } from '../game/accessoryCrafting';
const TYPE_LABELS: Record<CraftedAccessory['type'], string> = { colar: 'Colar', pulseira: 'Pulseira', cinto: 'Cinto' };
const TYPE_ICONS: Record<CraftedAccessory['type'], string> = { colar: '📿', pulseira: '💠', cinto: '🪢' };
const RARITY_LABELS: Record<CraftedAccessory['rarity'], string> = { normal: 'Normal', common: 'Comum', uncommon: 'Incomum', rare: 'Rara', legendary: 'Lendária' };
const RARITY_COLORS: Partial<Record<CraftedAccessory['rarity'], string>> = { common: '#36d66f', uncommon: '#348cff', rare: '#a34be8', legendary: '#ff8a24' };
const ATTRIBUTE_LABELS: Record<AccessoryAttributeKey, string> = { forca: 'Força', inteligencia: 'Inteligência', destreza: 'Destreza', vida: 'Vida', armadura: 'Armadura', mobilidade: 'Mobilidade', esquiva: 'Esquiva' };
const LINING_LABELS: Record<CraftedAccessory['lining'], string> = { linho: 'Linho', couro_refinado: 'Couro refinado' };
const numberLabel = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
export function AccessoryInventoryCard({ accessory, selected, onClick }: { accessory: CraftedAccessory; selected: boolean; onClick: () => void }) {
  const color = RARITY_COLORS[accessory.rarity];
  return <button type="button" className={`arsenal-inventory-slot filled arsenal-accessory-inventory-item${selected ? ' selected' : ''}`} onClick={onClick}
    aria-label={`${TYPE_LABELS[accessory.type]}, ${RARITY_LABELS[accessory.rarity]}, ${accessory.stars} estrelas. Abrir ações.`}>
    <span className="arsenal-accessory-art" style={color ? { filter: `drop-shadow(0 0 5px ${color})` } : undefined}>{TYPE_ICONS[accessory.type]}</span>
    <small>{TYPE_LABELS[accessory.type]}</small><span className="arsenal-armor-stars">{'★'.repeat(accessory.stars)}</span>
  </button>;
}
export function AccessoryDetailsDialog({ accessory, onClose }: { accessory: CraftedAccessory | null; onClose: () => void }) {
  if (!accessory) return null;
  const color = RARITY_COLORS[accessory.rarity];
  const valueLabel = (key: AccessoryAttributeKey, value: number) => {
    const effective = accessoryEffectiveValue(accessory, value);
    if (key === 'esquiva') return `+${numberLabel(effective * 100)}%`;
    if (key === 'armadura') return `+${numberLabel(effective)} pontos`;
    if (key === 'vida') return `+${numberLabel(effective)} HP`;
    if (key === 'mobilidade') return `+${numberLabel(effective)} pontos`;
    return `+${numberLabel(effective)}`;
  };
  return <div className="arsenal-weapon-info-backdrop" role="presentation" onClick={onClose}>
    <section className="arsenal-weapon-info-card arsenal-accessory-details" role="dialog" aria-modal="true" aria-label={TYPE_LABELS[accessory.type]} onClick={event => event.stopPropagation()}>
      <header><strong>{TYPE_LABELS[accessory.type]}</strong><button type="button" onClick={onClose}>Fechar</button></header>
      {accessory.craftedBy && <p className="item-signature-line">{accessory.craftedBy}</p>}
      <div className="arsenal-accessory-details-art" style={color ? { filter: `drop-shadow(0 0 7px ${color})` } : undefined}>{TYPE_ICONS[accessory.type]}</div>
      <div className="arsenal-item-info-details">
        <div><span>Tipo</span><b>{TYPE_LABELS[accessory.type]}</b></div>
        <div><span>Raridade</span><b>{RARITY_LABELS[accessory.rarity]}</b></div>
        <div><span>Metal</span><b>{accessory.metal === 'bronze' ? 'Bronze' : 'Ferro'}</b></div>
        <div><span>Estrelas</span><b>{'★'.repeat(accessory.stars)}</b></div>
        <div><span>SURP</span><b>{accessory.surp ? 'Sim' : 'Não'}</b></div>
        <div><span>Alça</span><b>{LINING_LABELS[accessory.lining]}</b></div>
      </div>
      <h3>Atributos efetivos</h3>
      <ul>{accessory.attributes.map(attribute => <li key={attribute.key}><span>{ATTRIBUTE_LABELS[attribute.key]}</span><b>{valueLabel(attribute.key, attribute.value)}</b></li>)}</ul>
    </section>
  </div>;
}
