import { useEffect, useRef, useState } from 'react';
import {
  ARMOR_ATTRIBUTE_TO_CORE_ATTRIBUTE,
  ARMOR_CORE_EQUIPMENT_TO_PIECE,
  ARMOR_PIECE_ATTRIBUTES,
  ARMOR_RARITY_FRACTION,
  armorAttributeValue,
  type ArmorPiece,
  type ArmorType,
} from '../game/armor';
import { coreFromItemId, coreRarityLabel, parseCoreItemId, type Core, type CoreAttributeKey } from '../game/cores';
import { WEAPON_ACTIVE_ATTRIBUTES, WEAPON_CORE_POINTS_PER_VALUE, type WeaponModel } from '../game/weapons';

type CoreDetailProps = {
  itemId: string;
  mode: 'trigger' | 'inline';
  armorTypes?: ArmorType[];
};

const ATTRIBUTE_LABELS: Record<CoreAttributeKey, string> = {
  forca: 'Força',
  velocidadeAtaque: 'Velocidade de ataque',
  inteligencia: 'Inteligência',
  destreza: 'Destreza',
  vida: 'Vida',
  armadura: 'Armadura',
  resistenciaMagica: 'Resistência mágica',
  velocidadeMovimento: 'Velocidade de movimento',
  esquiva: 'Esquiva',
};

const PIECE_LABELS: Record<ArmorPiece, string> = {
  capacete: 'Capacete',
  peitoral: 'Peitoral',
  calca: 'Calça',
  bota: 'Bota',
  luva: 'Luva',
};

const WEAPON_LABELS: Record<WeaponModel, string> = {
  espada: 'Espada',
  arco: 'Arco',
  cajado: 'Cajado',
  bastao: 'Bastão da Natureza',
};

const formatValue = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const formatWeaponPoints = (value: number) => '+' + (value * WEAPON_CORE_POINTS_PER_VALUE).toFixed(1).replace('.', ',');

function weaponModel(core: Core): WeaponModel {
  if (core.weaponModel === 'arco') return 'arco';
  if (core.weaponModel === 'cajado') return core.affinity === 'natureza' ? 'bastao' : 'cajado';
  return 'espada';
}

function armorPiece(core: Core): ArmorPiece | null {
  if (!core.equipmentType || !Object.prototype.hasOwnProperty.call(ARMOR_CORE_EQUIPMENT_TO_PIECE, core.equipmentType)) return null;
  return ARMOR_CORE_EQUIPMENT_TO_PIECE[core.equipmentType as keyof typeof ARMOR_CORE_EQUIPMENT_TO_PIECE];
}

function armorRows(core: Core, type: ArmorType) {
  const piece = armorPiece(core);
  if (!piece) return [];
  return ARMOR_PIECE_ATTRIBUTES[type][piece].map(attribute => {
    const coreKey = ARMOR_ATTRIBUTE_TO_CORE_ATTRIBUTE[attribute];
    const coreAttribute = core.attributes.find(entry => entry.key === coreKey);
    const rarityFraction = ARMOR_RARITY_FRACTION[core.rarity];
    const roll = core.surp || !coreAttribute
      ? 1
      : Math.max(0.5, Math.min(1, coreAttribute.value / rarityFraction));
    const value = armorAttributeValue({
      type,
      piece,
      attribute,
      rarity: core.rarity,
      stars: 1,
      roll,
    });
    const display = attribute === 'armadura'
      ? `${formatValue(value)}% de redução`
      : attribute === 'esquiva'
        ? `${formatValue(value * 100)}% esquiva`
        : `+${formatValue(value)} ${attribute === 'vida' ? 'vida' : 'mobilidade'}`;
    return { key: attribute, label: ({ armadura: 'Armadura', vida: 'Vida', mobilidade: 'Mobilidade', esquiva: 'Esquiva' } as const)[attribute], display };
  });
}

function CoreDetailContent({ core, armorTypes }: { core: Core; armorTypes: ArmorType[] }) {
  if (core.category === 'weapon') {
    const model = weaponModel(core);
    const compatible = WEAPON_ACTIVE_ATTRIBUTES[model] as readonly string[];
    return <>
      <div className="core-detail-meta"><span>{WEAPON_LABELS[model]}</span><span>{coreRarityLabel(core.rarity)}</span>{core.surp && <strong>SURP</strong>}</div>
      <ul className="core-detail-attributes">
        {core.attributes.map(attribute => {
          const active = compatible.includes(attribute.key);
          return <li key={attribute.key} className={!active ? 'is-inactive' : ''}>
            <span>{ATTRIBUTE_LABELS[attribute.key]}</span>
            <b>{formatWeaponPoints(attribute.value)}</b>
            {!active && <small>não conta nesta arma</small>}
          </li>;
        })}
      </ul>
      <p className="core-detail-note">Dano e efeito da arma são sorteados na fabricação</p>
    </>;
  }

  if (core.category === 'armor') {
    const piece = armorPiece(core);
    if (!piece) return <p className="core-detail-note">Não foi possível identificar a peça deste núcleo.</p>;
    return <>
      <div className="core-detail-meta"><span>{PIECE_LABELS[piece]}</span><span>{coreRarityLabel(core.rarity)}</span>{core.surp && <strong>SURP</strong>}</div>
      <div className={armorTypes.length > 1 ? 'core-detail-armor-columns' : 'core-detail-armor-columns is-single'}>
        {armorTypes.map(type => <section className="core-detail-armor-column" key={type}>
          <strong>{type === 'couro' ? 'Couro · 1★' : 'Bronze · 1★'}</strong>
          <ul className="core-detail-attributes">
            {armorRows(core, type).map(attribute => <li key={attribute.key}><span>{attribute.label}</span><b>{attribute.display}</b></li>)}
          </ul>
        </section>)}
      </div>
    </>;
  }

  return <>
    <div className="core-detail-meta"><span>Acessório</span><span>{coreRarityLabel(core.rarity)}</span>{core.surp && <strong>SURP</strong>}</div>
    <ul className="core-detail-attributes">
      {core.attributes.map(attribute => <li key={attribute.key}>
        <span>{ATTRIBUTE_LABELS[attribute.key]}</span>
        <b>{formatWeaponPoints(attribute.value)}</b>
      </li>)}
    </ul>
    <p className="core-detail-note">Valores exibidos no mesmo formato atual da Joalheria</p>
  </>;
}

export default function CoreDetail({ itemId, mode, armorTypes = ['couro', 'bronze'] }: CoreDetailProps) {
  const parsed = parseCoreItemId(itemId);
  if (parsed?.kind !== 'revealed') return null;
  const core = coreFromItemId(itemId);
  if (!core) return null;

  if (mode === 'inline') {
    return <section className="core-detail-card" aria-label="Detalhes do núcleo selecionado">
      <strong className="core-detail-heading">DETALHES DO NÚCLEO</strong>
      <CoreDetailContent core={core} armorTypes={armorTypes}/>
    </section>;
  }

  return <CoreDetailTrigger itemId={itemId} core={core} armorTypes={armorTypes}/>;
}

function CoreDetailTrigger({ itemId, core, armorTypes }: { itemId: string; core: Core; armorTypes: ArmorType[] }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return <div className="core-detail-trigger-wrap" data-core-detail-id={itemId}>
    <button
      ref={triggerRef}
      type="button"
      className="core-detail-trigger"
      aria-label={`Ver atributos de ${core.category === 'weapon' ? WEAPON_LABELS[weaponModel(core)] : core.category === 'armor' ? 'armadura' : 'acessório'}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen(true); }}
    >ⓘ</button>
    {open && <div className="core-detail-backdrop" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>
      <div
        ref={dialogRef}
        className="core-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes do núcleo revelado"
        tabIndex={-1}
        onClick={event => event.stopPropagation()}
      >
        <header><strong>DETALHES DO NÚCLEO</strong><button type="button" aria-label="Fechar detalhes" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>×</button></header>
        <CoreDetailContent core={core} armorTypes={armorTypes}/>
      </div>
    </div>}
  </div>;
}
