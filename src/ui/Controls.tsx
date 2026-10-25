import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { CLASSES, type ClassId } from '../game/config';

type Props = {
  onInventoryToggle: () => void;
  onCartToggle: () => void;
  cartActionVisible: boolean;
  cartCarried: boolean;
  storeToCartVisible: boolean;
  storeToCartDisabled: boolean;
  onStoreToCart: () => void;
  storeToHouseVisible: boolean;
  storeToHouseDisabled: boolean;
  onStoreToHouse: () => void;
  buildHouseVisible: boolean;
  buildRefineryVisible: boolean;
  buildTecelariaVisible: boolean;
  buildCartVisible: boolean;
  onBuildHouse: () => void;
  onBuildRefinery: () => void;
  onBuildTecelaria: () => void;
  onBuildCart: () => void;
  flagWheelOpen: boolean;
  onLongPress: (clientX: number, clientY: number, pointerId: number) => void;
  onFlagTap: (clientX: number, clientY: number) => boolean;
  onWheelMove: (clientX: number, clientY: number, pointerId: number) => void;
  onWheelEnd: (clientX: number, clientY: number, pointerId: number) => void;
  onMovementStart: () => void;
  onMove: (x: number, y: number) => void;
  onRange: () => void;
  onZoom: (delta: number) => void;
  onClass: (id: ClassId) => void;
  classId: ClassId;
  showRange: boolean;
  weaponLabel: string;
};

const STICK_RADIUS = 42;

function ClassWeaponIcon({ classId }: { classId: ClassId }) {
  if (classId === 'guerreiro') return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <polygon points="16,2 21,17 16,21 11,17" fill="#d9e2e8" stroke="#6e7b83" strokeWidth="1.2" strokeLinejoin="round" />
    <polygon points="16,2 16,21 11,17" fill="#f7fafb" />
    <polygon points="8,17 24,17 22,21 10,21" fill="#b98a48" stroke="#65472a" strokeWidth="1" strokeLinejoin="round" />
    <polygon points="14,21 18,21 19,28 13,28" fill="#775039" stroke="#422d20" strokeWidth="1" strokeLinejoin="round" />
    <polygon points="13,28 19,28 20,30 12,30" fill="#d4b47b" stroke="#65472a" strokeWidth="1" />
  </svg>;
  if (classId === 'mago') return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <polygon points="22,5 25,2 29,6 26,10" fill="#c8b4ff" stroke="#6c55a8" strokeWidth="1.2" />
    <polygon points="22,8 25,11 12,29 9,27" fill="#8b72c8" stroke="#57417f" strokeWidth="1.2" strokeLinejoin="round" />
    <polygon points="22,8 25,11 18,20 15,17" fill="#b6a0f1" />
    <polygon points="18,3 22,2 25,5 24,9 20,10 17,7" fill="#a98aff" stroke="#6245a0" strokeWidth="1.2" strokeLinejoin="round" />
    <polygon points="19,4 22,4 23,6 21,8 19,6" fill="#eadfff" />
  </svg>;
  if (classId === 'arqueiro') return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path d="M8 3 Q27 16 8 29" fill="none" stroke="#8a5b35" strokeWidth="4" strokeLinecap="round" />
    <path d="M8 3 Q27 16 8 29" fill="none" stroke="#d3a36d" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M8 3 L8 29" fill="none" stroke="#e7e1cf" strokeWidth="1.2" />
    <polygon points="7,15 18,12 18,14 25,16 18,18 18,20" fill="#d9e2e8" stroke="#6e7b83" strokeWidth="1" strokeLinejoin="round" />
    <polygon points="5,15 9,15 9,18 5,18" fill="#8a5b35" />
  </svg>;
  return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <polygon points="13,12 17,14 10,30 6,28" fill="#397b49" stroke="#245634" strokeWidth="1.2" strokeLinejoin="round" />
    <polygon points="13,12 17,14 13,22 10,20" fill="#72b96a" />
    <polygon points="15,2 20,5 21,10 17,13 12,11 10,7" fill="#73d66c" stroke="#2c793e" strokeWidth="1.2" strokeLinejoin="round" />
    <polygon points="15,2 17,7 12,11 10,7" fill="#b4f18d" />
    <polygon points="17,5 20,5 21,10 17,13 15,9" fill="#3ca853" />
  </svg>;
}

function LowPolyBackpackIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <polygon points="11,5 13,2 19,2 21,5 24,7 26,12 25,27 22,30 10,30 7,27 6,12 8,7" fill="#9b7047" stroke="#493522" strokeWidth="1.3" strokeLinejoin="round" />
    <polygon points="11,5 16,4 16,29 10,29 7,26 8,8" fill="#bd915e" />
    <polygon points="16,4 21,5 24,8 25,26 22,29 16,29" fill="#805738" />
    <polygon points="11,6 13,3 19,3 21,6 20,10 12,10" fill="#d2b07a" stroke="#60452b" strokeWidth="1" strokeLinejoin="round" />
    <polygon points="10,12 22,12 23,22 9,22" fill="#a77a4d" stroke="#60452b" strokeWidth="1" strokeLinejoin="round" />
    <polygon points="10,12 16,12 16,22 9,22" fill="#c2935b" />
    <polygon points="16,12 22,12 23,22 16,22" fill="#8d623e" />
    <polygon points="13,15 19,15 20,19 12,19" fill="#d8b778" stroke="#60452b" strokeWidth="1" strokeLinejoin="round" />
    <polygon points="8,9 10,10 10,25 8,24" fill="#e0c18b" />
    <polygon points="22,10 24,9 24,24 22,25" fill="#68472f" />
  </svg>;
}

export default function Controls({ onInventoryToggle, onCartToggle, cartActionVisible, cartCarried, storeToCartVisible, storeToCartDisabled, onStoreToCart, storeToHouseVisible, storeToHouseDisabled, onStoreToHouse, buildHouseVisible, buildRefineryVisible, buildTecelariaVisible, buildCartVisible, onBuildHouse, onBuildRefinery, onBuildTecelaria, onBuildCart, flagWheelOpen, onLongPress, onFlagTap, onWheelMove, onWheelEnd, onMovementStart, onMove, onRange, onZoom, onClass, classId, showRange, weaponLabel }: Props) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<{ id: number; originX: number; originY: number; clientX: number; clientY: number } | null>(null);
  const longPressRef = useRef<{ id: number; clientX: number; clientY: number; timer: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { if (flagWheelOpen) setMenuOpen(false); }, [flagWheelOpen]);
  const [stick, setStick] = useState({ x: 0, y: 0, dx: 0, dy: 0, active: false });
  const classOrder = Object.keys(CLASSES) as ClassId[];
  const nextClass = classOrder[(classOrder.indexOf(classId) + 1) % classOrder.length];

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current) return;
    e.preventDefault();
    onMovementStart();
    if (onFlagTap(e.clientX, e.clientY)) return;
    const rect = controlsRef.current?.getBoundingClientRect();
    if (!rect) return;
    activePointer.current = { id: e.pointerId, originX: e.clientX - rect.left, originY: e.clientY - rect.top, clientX: e.clientX, clientY: e.clientY };
    longPressRef.current = { id: e.pointerId, clientX: e.clientX, clientY: e.clientY, timer: window.setTimeout(() => {
      const pending = longPressRef.current;
      if (!pending || pending.id !== e.pointerId || activePointer.current?.id !== e.pointerId) return;
      activePointer.current = null;
      longPressRef.current = null;
      onMove(0, 0);
      setStick(current => ({ ...current, dx: 0, dy: 0, active: false }));
      onLongPress(pending.clientX, pending.clientY, pending.id);
    }, 400) };
    e.currentTarget.setPointerCapture(e.pointerId);
    setStick({ x: e.clientX - rect.left, y: e.clientY - rect.top, dx: 0, dy: 0, active: true });
    onMove(0, 0);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (flagWheelOpen) { onWheelMove(e.clientX, e.clientY, e.pointerId); return; }
    const active = activePointer.current;
    if (!active || active.id !== e.pointerId) return;
    e.preventDefault();
    const pending = longPressRef.current;
    if (pending?.id === e.pointerId && Math.hypot(e.clientX - pending.clientX, e.clientY - pending.clientY) > 10) {
      window.clearTimeout(pending.timer);
      longPressRef.current = null;
    }
    const dx = e.clientX - (active.originX + (controlsRef.current?.getBoundingClientRect().left ?? 0));
    const dy = e.clientY - (active.originY + (controlsRef.current?.getBoundingClientRect().top ?? 0));
    const distance = Math.hypot(dx, dy) || 1;
    const scale = Math.min(distance, STICK_RADIUS) / distance;
    const knobX = dx * scale;
    const knobY = dy * scale;
    setStick(current => ({ ...current, dx: knobX, dy: knobY, active: true }));
    onMove(Math.max(-1, Math.min(1, dx / STICK_RADIUS)), Math.max(-1, Math.min(1, dy / STICK_RADIUS)));
  };

  const resetStick = (e: PointerEvent<HTMLDivElement>) => {
    if (flagWheelOpen) { onWheelEnd(e.clientX, e.clientY, e.pointerId); return; }
    if (activePointer.current?.id !== e.pointerId) return;
    const pending = longPressRef.current;
    if (pending?.id === e.pointerId) { window.clearTimeout(pending.timer); longPressRef.current = null; }
    activePointer.current = null;
    onMove(0, 0);
    setStick(current => ({ ...current, dx: 0, dy: 0, active: false }));
  };

  return <div className="mobile-controls" ref={controlsRef} aria-label="Controles de celular">
    <button className="mobile-menu-trigger" type="button" aria-label="Abrir menu de controles" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>
      <span>{menuOpen ? '×' : '☰'}</span>
    </button>
    {menuOpen && <div
      className="mobile-menu-backdrop"
      aria-hidden="true"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); setMenuOpen(false); }}
    />}
    {menuOpen && <div className="mobile-menu-panel" role="dialog" aria-label="Menu de jogo">
      <div className="mobile-menu-heading"><span>MENU</span><button type="button" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}>×</button></div>
<div className="menu-section-label">CLASSES</div>
      <div className="menu-class-grid">
        {(Object.keys(CLASSES) as ClassId[]).map((id, index) => <button key={id} type="button" className={classId === id ? 'selected' : ''} aria-pressed={classId === id} title={CLASSES[id].description} onClick={() => { onClass(id); setMenuOpen(false); }}><span className="menu-class-icon"><ClassWeaponIcon classId={id} /></span><span className="menu-class-label">{index + 1} · {CLASSES[id].label}</span></button>)}
      </div>
      <div className="menu-section-label">VISUALIZAÇÃO</div>
      <div className="menu-action-list">
        <button type="button" className={showRange ? 'selected' : ''} aria-pressed={showRange} onClick={onRange}><span>◉ Alcance</span><b>{showRange ? 'ATIVO' : 'OFF'}</b></button>
        <div className="menu-zoom-row"><span>Zoom</span><div><button type="button" aria-label="Diminuir zoom" onClick={() => onZoom(-0.15)}>−</button><button type="button" aria-label="Aumentar zoom" onClick={() => onZoom(0.15)}>+</button></div></div>
      </div>
      <div className="menu-weapon"><span>ARMA ATUAL</span><strong>{weaponLabel}</strong></div>
    </div>}
    <div className="joystick-touch-area"
      aria-label="Toque na parte inferior para movimentar"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={resetStick}
      onPointerCancel={resetStick}
      onLostPointerCapture={resetStick}
    />
    <div className={stick.active ? 'joystick-float is-active' : 'joystick-float'} aria-hidden="true" style={{ left: stick.x, top: stick.y }}>
      <span className="joystick-cross horizontal" />
      <span className="joystick-cross vertical" />
      <span className="joystick-knob" style={{ transform: `translate(${stick.dx}px, ${stick.dy}px)` }} />
      <span className="joystick-label">MOVER</span>
    </div>
    <div className="mobile-quick-buttons" aria-label="Atalhos rápidos">
      {cartActionVisible && <button type="button" className="mobile-quick-cart" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onCartToggle(); }} aria-label={cartCarried ? 'Largar carrinho' : 'Pegar carrinho'} title={cartCarried ? 'Largar carrinho' : 'Pegar carrinho'}><span aria-hidden="true">🛒</span><small>{cartCarried ? 'Largar' : 'Pegar'}</small></button>}
      {storeToCartVisible && <button type="button" className="mobile-quick-action" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onStoreToCart(); }} disabled={storeToCartDisabled} title="Guardar tudo no carrinho"><span aria-hidden="true">📥</span><small>Guardar</small></button>}
      {storeToHouseVisible && <button type="button" className="mobile-quick-action" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onStoreToHouse(); }} disabled={storeToHouseDisabled} title="Guardar tudo na casa"><span aria-hidden="true">🏠</span><small>Guardar</small></button>}
      {buildHouseVisible && <button type="button" className="mobile-quick-action" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onBuildHouse(); }} title="Construir casa"><span aria-hidden="true">🔨</span><small>Construir</small></button>}
      {buildRefineryVisible && <button type="button" className="mobile-quick-action" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onBuildRefinery(); }} title="Construir refinaria"><span aria-hidden="true">⚒️</span><small>Construir</small></button>}
      {buildTecelariaVisible && <button type="button" className="mobile-quick-action" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onBuildTecelaria(); }} title="Construir tecelaria"><span aria-hidden="true">🧵</span><small>Tecer</small></button>}
      {buildCartVisible && <button type="button" className="mobile-quick-action" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onBuildCart(); }} title="Reparar carrinho"><span aria-hidden="true">🪵</span><small>Construir</small></button>}
      <button type="button" className="mobile-quick-class" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onClass(nextClass); }} aria-label={`Trocar classe para ${CLASSES[nextClass].label}`} title={`Próxima classe: ${CLASSES[nextClass].label}`}><ClassWeaponIcon classId={nextClass} /><small>{CLASSES[nextClass].label}</small></button>
      <button type="button" className="mobile-quick-bag" onClick={() => { setMenuOpen(false); onInventoryToggle(); }} aria-label="Abrir mochila, casa e carrinho" title="Mochila e casa"><LowPolyBackpackIcon /><small>Mochila</small></button>
    </div>
  </div>;
}
