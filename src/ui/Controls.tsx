import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { CLASSES, type ClassId, type WeaponId } from '../game/config';
import { drawWeapon } from '../game/weapons';

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
  inventoryPanelOpen: boolean;
  audioVolume: number;
  onAudioVolumeChange: (volume: number) => void;
  interfaceScale: 100 | 130 | 160;
  onInterfaceScaleChange: (scale: 100 | 130 | 160) => void;
  landscapeMode: boolean;
  onToggleLandscape: () => void;
};

const STICK_RADIUS = 42;

const CLASS_WEAPONS: Record<ClassId, WeaponId> = {
  guerreiro: 'espada',
  mago: 'cajado',
  arqueiro: 'arco',
  druida: 'bastao',
};

function ClassWeaponIcon({ classId }: { classId: ClassId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const weapon = CLASS_WEAPONS[classId];

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(3, 32);
    ctx.scale(0.75, 0.75);
    drawWeapon(ctx, weapon, 10);
    ctx.restore();
  }, [weapon]);

  return <canvas ref={canvasRef} width={64} height={64} className="mobile-class-weapon-icon" aria-hidden="true" />;
}

function LowPolyBackpackIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <polygon points="11,5 13,2 19,2 21,5 24,7 26,12 25,27 22,30 10,30 7,27 6,12 8,7" fill="#a92f3c" stroke="#571e27" strokeWidth="1.4" strokeLinejoin="round" />
    <polygon points="11,5 16,4 16,29 10,29 7,26 8,8" fill="#e04a52" />
    <polygon points="16,4 21,5 24,8 25,26 22,29 16,29" fill="#8e2432" />
    <polygon points="11,6 13,3 19,3 21,6 20,10 12,10" fill="#f18b78" stroke="#70202b" strokeWidth="1" strokeLinejoin="round" />
    <polygon points="10,12 22,12 23,22 9,22" fill="#bd3441" stroke="#70202b" strokeWidth="1" strokeLinejoin="round" />
    <polygon points="10,12 16,12 16,22 9,22" fill="#ed5a5b" />
    <polygon points="16,12 22,12 23,22 16,22" fill="#9d2635" />
    <polygon points="13,15 19,15 20,19 12,19" fill="#f2bd8b" stroke="#70202b" strokeWidth="1" strokeLinejoin="round" />
    <polygon points="8,9 10,10 10,25 8,24" fill="#f28b79" />
    <polygon points="22,10 24,9 24,24 22,25" fill="#6e1e2b" />
  </svg>;
}

export default function Controls({ onInventoryToggle, onCartToggle, cartActionVisible, cartCarried, storeToCartVisible, storeToCartDisabled, onStoreToCart, storeToHouseVisible, storeToHouseDisabled, onStoreToHouse, buildHouseVisible, buildRefineryVisible, buildTecelariaVisible, buildCartVisible, onBuildHouse, onBuildRefinery, onBuildTecelaria, onBuildCart, flagWheelOpen, onLongPress, onFlagTap, onWheelMove, onWheelEnd, onMovementStart, onMove, onRange, onZoom, onClass, classId, showRange, weaponLabel, inventoryPanelOpen, audioVolume, onAudioVolumeChange, interfaceScale, onInterfaceScaleChange, landscapeMode, onToggleLandscape }: Props) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<{ id: number; originX: number; originY: number; clientX: number; clientY: number } | null>(null);
  const classSwipePointer = useRef<{ id: number; startX: number; startY: number; changed: boolean } | null>(null);
  const longPressRef = useRef<{ id: number; clientX: number; clientY: number; timer: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { if (flagWheelOpen || inventoryPanelOpen) setMenuOpen(false); }, [flagWheelOpen, inventoryPanelOpen]);
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

  const onSecondaryPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const movement = activePointer.current;
    if (!movement || movement.id === e.pointerId || classSwipePointer.current || menuOpen || flagWheelOpen) return;
    classSwipePointer.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, changed: false };
  };

  const onSecondaryPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const swipe = classSwipePointer.current;
    if (!swipe || swipe.id !== e.pointerId || swipe.changed) return;
    const dx = e.clientX - swipe.startX;
    const dy = e.clientY - swipe.startY;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    const currentIndex = classOrder.indexOf(classId);
    const nextIndex = (currentIndex + (dx < 0 ? -1 : 1) + classOrder.length) % classOrder.length;
    swipe.changed = true;
    onClass(classOrder[nextIndex]);
  };

  const onSecondaryPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (classSwipePointer.current?.id === e.pointerId) classSwipePointer.current = null;
  };

  return <div className="mobile-controls" ref={controlsRef} aria-label="Controles de celular"
    onPointerDown={onSecondaryPointerDown}
    onPointerMove={onSecondaryPointerMove}
    onPointerUp={onSecondaryPointerEnd}
    onPointerCancel={onSecondaryPointerEnd}>
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
      <div className="menu-section-label">ÁUDIO</div>
      <div className="menu-audio-volume">
        <label htmlFor="game-master-volume">Volume geral <strong>{Math.round(audioVolume * 100)}%</strong></label>
        <input id="game-master-volume" type="range" min="0" max="1" step="0.01" value={audioVolume} onChange={event => onAudioVolumeChange(Number(event.currentTarget.value))} aria-label="Volume geral do jogo" />
        <div className="menu-audio-volume-labels"><span>Silencioso</span><span>Máximo</span></div>
      </div>
      <div className="menu-section-label">VISUALIZAÇÃO</div>
      <div className="menu-action-list">
        <button type="button" className={showRange ? 'selected' : ''} aria-pressed={showRange} onClick={onRange}><span>◉ Alcance</span><b>{showRange ? 'ATIVO' : 'OFF'}</b></button>
        <div className="menu-zoom-row"><span>Zoom do jogo</span><div><button type="button" aria-label="Diminuir zoom do jogo" onClick={() => onZoom(-0.15)}>−</button><button type="button" aria-label="Aumentar zoom do jogo" onClick={() => onZoom(0.15)}>+</button></div></div>
        <button type="button" className={landscapeMode ? 'selected' : ''} aria-pressed={landscapeMode} onClick={onToggleLandscape}><span>Jogar com celular deitado</span><b>{landscapeMode ? 'ATIVO' : 'TENTAR'}</b></button>
        <div className="menu-interface-scale" role="group" aria-label="Escala da interface">
          <span>Escala da interface</span>
          <div className="menu-interface-scale-options">
            {([100, 130, 160] as const).map(scale => <button key={scale} type="button" className={interfaceScale === scale ? 'selected' : ''} aria-pressed={interfaceScale === scale} onClick={() => onInterfaceScaleChange(scale)}>{scale}%</button>)}
          </div>
        </div>
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
      <button type="button" className="mobile-quick-class" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onClass(nextClass); }} aria-label={`Trocar classe para ${CLASSES[nextClass].label}`} title={`Próxima classe: ${CLASSES[nextClass].label}`}><ClassWeaponIcon classId={nextClass} /></button>
      <button type="button" className="mobile-quick-bag" onClick={() => { setMenuOpen(false); onInventoryToggle(); }} aria-label="Abrir mochila, casa e carrinho" title="Mochila e casa"><LowPolyBackpackIcon /><small>Mochila</small></button>
    </div>
  </div>;
}
