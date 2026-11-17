import type { CSSProperties, ReactNode } from 'react';

type TailorCraftSlotsProps = {
  coreItemId: string | null;
  hideItemId: string | null;
  hideQuantity: number;
  hideRequired: number;
  liningItemId: string | null;
  liningQuantity: number;
  liningRequired: number;
  busy: boolean;
  disabled: boolean;
  feedback: string;
  renderIcon: (itemId: string) => ReactNode;
  glowStyle: (itemId: string) => CSSProperties;
  label: (itemId: string) => string;
  onClearCore: () => void;
  onClearHide: () => void;
  onClearLining: () => void;
  onCraft: () => void;
};

export default function TailorCraftSlots({
  coreItemId, hideItemId, hideQuantity, hideRequired, liningItemId, liningQuantity,
  liningRequired, busy, disabled, feedback, renderIcon, glowStyle, label,
  onClearCore, onClearHide, onClearLining, onCraft,
}: TailorCraftSlotsProps) {
  return <section className="forge-zone forge-selection-zone tailor-selection-zone" aria-label="Materiais selecionados para fabricação">
    <div className="forge-panel-heading">
      <strong>MATERIAIS SELECIONADOS</strong>
      <span>Núcleo e componentes da receita</span>
    </div>
    <div className="forge-recipe-slots" aria-label="Slots da receita">
      <button type="button" className={coreItemId ? 'forge-recipe-slot forge-core-recipe-slot filled' : 'forge-recipe-slot forge-core-recipe-slot'}
        style={{ order: 0 }} onClick={onClearCore} disabled={busy}
        aria-label={coreItemId ? 'Devolver núcleo ao Baú' : 'Slot vazio do núcleo'}>
        <span style={coreItemId ? glowStyle(coreItemId) : undefined}>{coreItemId ? renderIcon(coreItemId) : '＋'}</span>
        <strong>{coreItemId ? label(coreItemId) : 'Núcleo'}</strong>
        <small>{coreItemId ? '1/1' : '0/1'}</small>
      </button>
      {coreItemId && <>
        <button type="button" className={hideItemId ? 'forge-recipe-slot forge-material-recipe-slot filled' : 'forge-recipe-slot forge-material-recipe-slot'}
          style={{ order: 1 }} onClick={onClearHide} disabled={busy}
          aria-label={hideItemId ? 'Devolver couro de lobo ao Baú' : 'Slot de couro de lobo'}>
          <span style={hideItemId ? glowStyle(hideItemId) : undefined}>{hideItemId ? renderIcon(hideItemId) : '＋'}</span>
          <strong>Couro de lobo ×{hideRequired}</strong>
          <small>{hideQuantity}/{hideRequired}</small>
        </button>
        <button type="button" className={liningItemId ? 'forge-recipe-slot forge-material-recipe-slot filled' : 'forge-recipe-slot forge-material-recipe-slot'}
          style={{ order: 2 }} onClick={onClearLining} disabled={busy}
          aria-label={liningItemId ? 'Devolver forro ao Baú' : 'Slot de forro'}>
          <span style={liningItemId ? glowStyle(liningItemId) : undefined}>{liningItemId ? renderIcon(liningItemId) : '＋'}</span>
          <strong>{liningItemId ? label(liningItemId) : 'Forro'} ×{liningRequired}</strong>
          <small>{liningQuantity}/{liningRequired}</small>
        </button>
      </>}
    </div>
    <div className="forge-action-area forge-selection-action">
      <button type="button" className="forge-craft-button" onClick={onCraft} disabled={disabled || busy}>
        {busy ? 'Fabricando…' : 'Fabricar'}
      </button>
      {feedback && <p className="forge-feedback" role="alert">{feedback}</p>}
    </div>
  </section>;
}
