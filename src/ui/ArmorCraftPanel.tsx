import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ARMOR_ATTRIBUTE_TO_CORE_ATTRIBUTE,
  ARMOR_CORE_EQUIPMENT_TO_PIECE,
  ARMOR_PIECE_ATTRIBUTES,
  ARMOR_RARITY_FRACTION,
  armorAttributeValue,
  liningValue,
  type ArmorLining,
  type ArmorPiece,
  type ArmorType,
} from '../game/armor';
import { armorCoreRoll, parseCoreItemId, type Core, type CoreRarity } from '../game/cores';
import { armorMaterialItemIds, craftArmor, type CraftedArmor } from '../game/armorCrafting';

type ChestStack = { itemId: string; quantity: number };

type ArmorCraftPanelProps = {
  type: ArmorType;
  chestItems: ChestStack[];
  chestReady: boolean;
  online: boolean;
  client: Parameters<typeof craftArmor>[0];
  applyInventory: (stacks: ChestStack[]) => void;
  refreshChest: () => Promise<boolean>;
  onCrafted: (armor: CraftedArmor) => void;
  renderIcon: (itemId: string) => ReactNode;
  glowStyle: (itemId: string) => CSSProperties;
  label: (itemId: string) => string;
  selectedCoreId?: string | null;
  onClearCore?: () => void;
  onBusyChange?: (busy: boolean) => void;
};

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

const RARITY_LABELS: Record<CoreRarity, string> = {
  normal: 'Normal',
  common: 'Comum',
  uncommon: 'Incomum',
  rare: 'Rara',
  legendary: 'Lendária',
};

const LININGS: Array<{ id: ArmorLining; label: string; effect: string }> = [
  { id: 'algodao', label: 'Algodão', effect: '+vida' },
  { id: 'linho', label: 'Linho', effect: '+mobilidade' },
  { id: 'couro_refinado', label: 'Couro refinado', effect: '+XP da partida' },
];

function formatValue(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function corePiece(core: Core): ArmorPiece | null {
  if (!core.equipmentType || !(core.equipmentType in ARMOR_CORE_EQUIPMENT_TO_PIECE)) return null;
  return ARMOR_CORE_EQUIPMENT_TO_PIECE[core.equipmentType as keyof typeof ARMOR_CORE_EQUIPMENT_TO_PIECE];
}

export default function ArmorCraftPanel({
  type,
  chestItems,
  chestReady,
  online,
  client,
  applyInventory,
  refreshChest,
  onCrafted,
  renderIcon,
  glowStyle,
  label,
  selectedCoreId: controlledCoreId,
  onClearCore,
  onBusyChange,
}: ArmorCraftPanelProps) {
  const [internalCoreId, setInternalCoreId] = useState<string | null>(null);
  const isControlled = controlledCoreId !== undefined;
  const selectedCoreId = isControlled ? controlledCoreId : internalCoreId;
  const [selectedLining, setSelectedLining] = useState<ArmorLining | null>(null);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const craftLockRef = useRef(false);

  const armorCores = useMemo(() => {
    const merged = new Map<string, { itemId: string; quantity: number; core: Core; piece: ArmorPiece }>();
    for (const stack of chestItems) {
      if (stack.quantity <= 0) continue;
      const parsed = parseCoreItemId(stack.itemId);
      if (parsed?.kind !== 'revealed' || armorCoreRoll(parsed.core) === null) continue;
      const piece = corePiece(parsed.core);
      if (!piece) continue;
      const current = merged.get(stack.itemId);
      if (current) current.quantity += stack.quantity;
      else merged.set(stack.itemId, { itemId: stack.itemId, quantity: stack.quantity, core: parsed.core, piece });
    }
    return Array.from(merged.values());
  }, [chestItems]);

  const selectedCore = armorCores.find(entry => entry.itemId === selectedCoreId) ?? null;
  const selectedPiece = selectedCore?.piece ?? null;
  const selectedLiningInfo = LININGS.find(entry => entry.id === selectedLining) ?? null;
  const materials = selectedCore && selectedPiece && selectedLining
    ? armorMaterialItemIds(type, selectedPiece, selectedLining, selectedCore.core.rarity)
    : null;
  const materialRows = materials ? [
    { ...materials.base },
    { ...materials.lining },
  ] : [];
  const materialStatus = materialRows.map(material => ({
    ...material,
    available: chestItems.reduce((total, stack) => stack.itemId === material.itemId ? total + stack.quantity : total, 0),
  }));
  const hasMaterials = materialStatus.length === 2
    && materialStatus.every(material => material.available >= material.quantity);

  const preview = selectedCore && selectedPiece && selectedLining
    ? ARMOR_PIECE_ATTRIBUTES[type][selectedPiece].map(attribute => {
      const coreKey = ARMOR_ATTRIBUTE_TO_CORE_ATTRIBUTE[attribute];
      const coreAttribute = selectedCore.core.attributes.find(entry => entry.key === coreKey);
      const rarityFraction = ARMOR_RARITY_FRACTION[selectedCore.core.rarity];
      const roll = selectedCore.core.surp || !coreAttribute
        ? 1
        : Math.max(0.5, Math.min(1, coreAttribute.value / rarityFraction));
      const value = armorAttributeValue({
        type,
        piece: selectedPiece,
        attribute,
        rarity: selectedCore.core.rarity,
        stars: 1,
        roll,
      });
      const display = attribute === 'armadura'
        ? `${formatValue(value)}% de redução`
        : attribute === 'esquiva'
          ? `${formatValue(value * 100)}% esquiva`
          : `+${formatValue(value)} ${attribute === 'vida' ? 'vida' : 'mobilidade'}`;
      return {
        key: attribute,
        label: ({ armadura: 'Armadura', vida: 'Vida', mobilidade: 'Mobilidade', esquiva: 'Esquiva' } as const)[attribute],
        display,
      };
    })
    : [];
  const liningPreview = selectedCore && selectedLining
    ? liningValue({
      lining: selectedLining,
      rarity: selectedCore.core.rarity,
      stars: 1,
      roll: armorCoreRoll(selectedCore.core) ?? 1,
    })
    : null;
  const liningDisplay = liningPreview === null || !selectedLining ? ''
    : selectedLining === 'algodao' ? `+${formatValue(liningPreview)} vida`
      : selectedLining === 'linho' ? `+${formatValue(liningPreview)} mobilidade`
        : `+${formatValue(liningPreview * 100)}% XP da partida`;

  const canCraft = Boolean(
    selectedCore && selectedPiece && selectedLining && hasMaterials
      && Boolean(client) && online && chestReady && !busy,
  );

  const handleCraft = async () => {
    if (craftLockRef.current) return;
    if (!online) {
      setFeedback('Sem conexão: fabricar exige internet.');
      return;
    }
    if (!selectedCore || !selectedPiece || !selectedLining || !hasMaterials || !chestReady) return;
    craftLockRef.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setFeedback('');
    try {
      const result = await craftArmor(client, selectedPiece, type, selectedLining, selectedCore.itemId);
      applyInventory(result.inventory);
      if (isControlled) onClearCore?.();
      else setInternalCoreId(null);
      setSelectedLining(null);
      onCrafted(result.armor);
      setFeedback(`Peça fabricada! ${result.armor.stars} ${result.armor.stars === 1 ? 'estrela' : 'estrelas'}.`);
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Não foi possível fabricar a armadura.');
      await refreshChest();
    } finally {
      craftLockRef.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  return <section className="armor-craft-panel" aria-label={type === 'couro' ? 'Fabricação de armadura de couro' : 'Fabricação de armadura de bronze'}>
    <div className="armor-craft-scroll">
      {isControlled ? <section className="armor-craft-section" aria-label="Núcleo selecionado">
        <header className="armor-craft-heading"><strong>NÚCLEO</strong><span>{selectedCore && selectedPiece ? PIECE_LABELS[selectedPiece] + ' · ' + RARITY_LABELS[selectedCore.core.rarity] : 'Selecione no Baú'}</span></header>
        <div className="armor-craft-selected-core">
          {selectedCore && selectedPiece ? <>
            <img className="armor-craft-piece-image" src={`/assets/armors/${type === 'couro' ? 'zeryn' : 'vark'}-${PIECE_SPRITES[selectedPiece]}.png`} alt="" aria-hidden="true" draggable={false}/>
            <strong>{PIECE_LABELS[selectedPiece]}</strong>
            <small>{RARITY_LABELS[selectedCore.core.rarity]}{selectedCore.core.surp ? ' · SURP' : ''}</small>
            <button type="button" disabled={busy} onClick={() => { onClearCore?.(); setFeedback(''); setSelectedLining(null); }}>Trocar núcleo</button>
          </> : <p className="armor-craft-empty">Selecione um núcleo de armadura no Baú da Bigorna.</p>}
        </div>
      </section> : <section className="armor-craft-section" aria-label="Núcleos revelados">
        <header className="armor-craft-heading"><strong>NÚCLEO</strong><span>Escolha uma peça revelada no Baú</span></header>
        <div className="armor-craft-core-grid">
          {armorCores.map(entry => <button type="button" key={entry.itemId}
            className={`armor-craft-core-card${selectedCoreId === entry.itemId ? ' armor-craft-is-selected' : ''}`}
            onClick={() => { setInternalCoreId(entry.itemId); setFeedback(''); }} aria-pressed={selectedCoreId === entry.itemId}>
            <img className="armor-craft-piece-image" src={`/assets/armors/${type === 'couro' ? 'zeryn' : 'vark'}-${PIECE_SPRITES[entry.piece]}.png`} alt="" aria-hidden="true" draggable={false}/>
            <strong>{PIECE_LABELS[entry.piece]}</strong>
            <small>{RARITY_LABELS[entry.core.rarity]}{entry.core.surp ? ' · SURP' : ''}</small>
            {entry.quantity > 1 && <em>×{entry.quantity}</em>}
          </button>)}
          {armorCores.length === 0 && <p className="armor-craft-empty">Nenhum núcleo revelado de armadura no Baú.</p>}
        </div>
      </section>}

      <section className="armor-craft-section" aria-label="Escolha do forro">
        <header className="armor-craft-heading"><strong>FORRO</strong><span>Escolha obrigatória</span></header>
        <div className="armor-craft-linings">
          {LININGS.map(item => <button
            key={item.id}
            type="button"
            className={`armor-craft-lining-button${selectedLining === item.id ? ' armor-craft-is-selected' : ''}`}
            aria-pressed={selectedLining === item.id}
            onClick={() => { setSelectedLining(item.id); setFeedback(''); }}
          >
            <strong>{item.label}</strong><small>{item.effect}</small>
          </button>)}
        </div>
      </section>

      {selectedCore && selectedPiece && selectedLining && materials && <>
        <section className="armor-craft-section" aria-label="Materiais necessários">
          <header className="armor-craft-heading"><strong>MATERIAIS</strong><span>Mesma raridade do núcleo · {RARITY_LABELS[selectedCore.core.rarity]}</span></header>
          <div className="armor-craft-materials">
            {materialStatus.map(material => <div className="armor-craft-material-row" key={material.itemId}>
              <span className="armor-craft-material-icon" style={glowStyle(material.itemId)}>{renderIcon(material.itemId)}</span>
              <strong>{label(material.itemId)}</strong>
              <small>Tem {material.available} / precisa {material.quantity}</small>
              <span className={material.available >= material.quantity ? 'armor-craft-ok' : 'armor-craft-missing'} aria-label={material.available >= material.quantity ? 'Material suficiente' : 'Material insuficiente'}>{material.available >= material.quantity ? '✓' : '!'}</span>
            </div>)}
          </div>
        </section>

        <section className="armor-craft-section armor-craft-preview" aria-label="Prévia da armadura">
          <header className="armor-craft-heading"><strong>PRÉVIA</strong><span>Valores informativos · 1★</span></header>
          <div className="armor-craft-preview-grid">
            {preview.map(item => <div className="armor-craft-preview-row" key={item.key}><span>{item.label}</span><strong>{item.display}</strong></div>)}
            <div className="armor-craft-preview-row"><span>{selectedLiningInfo?.label}</span><strong>{liningDisplay}</strong></div>
          </div>
        </section>
      </>}
    </div>
    <footer className="armor-craft-footer">
      {feedback && <p role="status" className="armor-craft-feedback">{feedback}</p>}
      {!online && <p role="status" className="armor-craft-hint">Sem conexão: fabricar exige internet.</p>}
      <button type="button" className="armor-craft-submit" disabled={!canCraft} onClick={() => { void handleCraft(); }}>
        {busy ? 'Fabricando…' : 'Fabricar'}
      </button>
    </footer>
  </section>;
}
