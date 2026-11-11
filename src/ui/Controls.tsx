import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { CLASSES, type ClassId } from '../game/config';

type Props = {
  onInventoryToggle: () => void;
  onCartToggle: () => void;
  cartActionVisible: boolean;
  cartFollowing: boolean;
  storeToCartVisible: boolean;
  storeToCartDisabled: boolean;
  onStoreToCart: () => void;
  storeToHouseVisible: boolean;
  storeToHouseDisabled: boolean;
  onStoreToHouse: () => void;
  buildRefineryVisible: boolean;
  buildTecelariaVisible: boolean;
  buildCartVisible: boolean;
  onBuildRefinery: () => void;
  onBuildTecelaria: () => void;
  onBuildCart: () => void;
  campMenuVisible: boolean;
  onOpenCampMenu: () => void;
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
  interfaceScale: 70 | 100;
  onInterfaceScaleChange: (scale: 100 | 130 | 160) => void;
  landscapeMode: boolean;
  onToggleLandscape: () => void;
};

const STICK_RADIUS = 42;

export default function Controls({ onInventoryToggle, onCartToggle, cartActionVisible, cartFollowing, storeToCartVisible, storeToCartDisabled, onStoreToCart, storeToHouseVisible, storeToHouseDisabled, onStoreToHouse, buildRefineryVisible, buildTecelariaVisible, buildCartVisible, onBuildRefinery, onBuildTecelaria, onBuildCart, campMenuVisible, onOpenCampMenu, flagWheelOpen, onLongPress, onFlagTap, onWheelMove, onWheelEnd, onMovementStart, onMove, onRange, onZoom, onClass, classId, showRange, weaponLabel, inventoryPanelOpen, audioVolume, onAudioVolumeChange, interfaceScale, onInterfaceScaleChange, landscapeMode, onToggleLandscape }: Props) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<{ id: number; originX: number; originY: number; clientX: number; clientY: number } | null>(null);
  const classSwipePointer = useRef<{ id: number; startX: number; startY: number; changed: boolean } | null>(null);
  const longPressRef = useRef<{ id: number; clientX: number; clientY: number; timer: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastTouchActionAt = useRef(0);
  const runTouchAction = (event: PointerEvent<HTMLElement>, action: () => void) => {
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    lastTouchActionAt.current = Date.now();
    action();
  };
  const runClickAction = (event: MouseEvent<HTMLElement>, action: () => void) => {
    if (event.detail !== 0 && Date.now() - lastTouchActionAt.current < 800) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    action();
  };
  useEffect(() => { if (flagWheelOpen || inventoryPanelOpen) setMenuOpen(false); }, [flagWheelOpen, inventoryPanelOpen]);
  const [stick, setStick] = useState({ x: 0, y: 0, dx: 0, dy: 0, active: false });
  const classOrder = Object.keys(CLASSES) as ClassId[];
  const nextClass = classOrder[(classOrder.indexOf(classId) + 1) % classOrder.length];
  const actionBVisible = buildCartVisible || buildRefineryVisible || buildTecelariaVisible || storeToHouseVisible || storeToCartVisible || campMenuVisible;
  const actionBDisabled = buildCartVisible || buildRefineryVisible || buildTecelariaVisible
    ? false
    : storeToHouseVisible ? storeToHouseDisabled
    : storeToCartVisible ? storeToCartDisabled
    : campMenuVisible ? false : true;
  const actionBLabel = buildCartVisible ? 'Construir burrinho e carroça'
    : buildRefineryVisible ? 'Construir refinaria'
    : buildTecelariaVisible ? 'Construir tecelaria'
    : storeToHouseVisible ? 'Guardar tudo no baú'
    : storeToCartVisible ? 'Guardar tudo no carrinho'
    : campMenuVisible ? 'Abrir menu do acampamento'
    : 'Ação B indisponível';
  const runActionB = () => {
    if (buildCartVisible) onBuildCart();
    else if (buildRefineryVisible) onBuildRefinery();
    else if (buildTecelariaVisible) onBuildTecelaria();
    else if (storeToHouseVisible) onStoreToHouse();
    else if (storeToCartVisible) onStoreToCart();
    else if (campMenuVisible) onOpenCampMenu();
  };

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
    // Um segundo toque em um controle deve executar o botão, nunca virar gesto de troca de classe.
    if (e.target instanceof Element && e.target.closest('button, input, select, textarea, a, [role="button"], .mobile-menu-panel')) return;
    e.preventDefault();
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
      
    </div>
    <button className="mobile-menu-trigger" type="button" aria-label="Abrir menu de controles" aria-expanded={menuOpen} onPointerDown={event => runTouchAction(event, () => setMenuOpen(value => !value))} onClick={event => runClickAction(event, () => setMenuOpen(value => !value))}>
      <span>{menuOpen ? '×' : '☰'}</span>
    </button>
    <div className="mobile-quick-buttons" aria-label="Controles de ação">
      <div className="mobile-action-diamond" aria-label="Ações Y, X, B e A">
        <button type="button" className={cartActionVisible ? 'game-action-button action-y is-active' : 'game-action-button action-y'} disabled={!cartActionVisible} aria-disabled={!cartActionVisible} aria-label={cartFollowing ? 'Parar burrinho' : 'Chamar burrinho'} title={cartFollowing ? 'Parar burrinho' : 'Chamar burrinho'} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); if (cartActionVisible) onCartToggle(); }}>
          Y<span className={cartFollowing ? 'game-action-status is-following' : 'game-action-status is-stopped'} aria-hidden="true" />
        </button>
        <button type="button" className="game-action-button action-x is-active" aria-label="X: abrir mochila, baú e carrinho" title="X: abrir mochila, baú e carrinho" onPointerDown={event => runTouchAction(event, () => { setMenuOpen(false); onInventoryToggle(); })} onClick={event => runClickAction(event, () => { setMenuOpen(false); onInventoryToggle(); })}>X</button>
        <button type="button" className={actionBVisible && !actionBDisabled ? 'game-action-button action-b is-active' : 'game-action-button action-b'} disabled={!actionBVisible || actionBDisabled} aria-disabled={!actionBVisible || actionBDisabled} aria-label={actionBLabel} title={actionBLabel} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); if (actionBVisible && !actionBDisabled) runActionB(); }}>
          B
        </button>
        <button type="button" className="game-action-button action-a is-active" aria-label={`A: trocar classe para ${CLASSES[nextClass].label}`} title={`A: trocar classe para ${CLASSES[nextClass].label}`} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onClass(nextClass); }}>A</button>
      </div>
    </div>
    {menuOpen && <div
      className="mobile-menu-backdrop"
      aria-hidden="true"
      onPointerDown={event => { if (event.pointerType !== 'mouse') { event.preventDefault(); event.stopPropagation(); lastTouchActionAt.current = Date.now(); setMenuOpen(false); } else event.stopPropagation(); }}
      onClick={event => { event.stopPropagation(); if (event.detail !== 0 && Date.now() - lastTouchActionAt.current < 800) return; setMenuOpen(false); }}
    />}
    {menuOpen && <div className="mobile-menu-panel" role="dialog" aria-label="Menu de jogo">
      <div className="mobile-menu-heading"><span>MENU</span><button type="button" aria-label="Fechar menu" onPointerDown={event => runTouchAction(event, () => setMenuOpen(false))} onClick={event => runClickAction(event, () => setMenuOpen(false))}>×</button></div>
      <div className="menu-section-label">ÁUDIO</div>
      <div className="menu-audio-volume">
        <label htmlFor="game-master-volume">Volume geral <strong>{Math.round(audioVolume * 100)}%</strong></label>
        <input id="game-master-volume" type="range" min="0" max="1" step="0.01" value={audioVolume} onChange={event => onAudioVolumeChange(Number(event.currentTarget.value))} aria-label="Volume geral do jogo" />
        <div className="menu-audio-volume-labels"><span>Silencioso</span><span>Máximo</span></div>
      </div>
      <div className="menu-section-label">VISUALIZAÇÃO</div>
      <div className="menu-action-list">
        <button type="button" className={showRange ? 'selected' : ''} aria-pressed={showRange} onPointerDown={event => runTouchAction(event, onRange)} onClick={event => runClickAction(event, onRange)}><span>◉ Alcance</span><b>{showRange ? 'ATIVO' : 'OFF'}</b></button>
        <div className="menu-zoom-row"><span>Zoom do jogo</span><div><button type="button" aria-label="Diminuir zoom do jogo" onPointerDown={event => runTouchAction(event, () => onZoom(-0.15))} onClick={event => runClickAction(event, () => onZoom(-0.15))}>−</button><button type="button" aria-label="Aumentar zoom do jogo" onPointerDown={event => runTouchAction(event, () => onZoom(0.15))} onClick={event => runClickAction(event, () => onZoom(0.15))}>+</button></div></div>
        <button type="button" className={landscapeMode ? 'selected' : ''} aria-pressed={landscapeMode} onPointerDown={event => runTouchAction(event, onToggleLandscape)} onClick={event => runClickAction(event, onToggleLandscape)}><span>Jogar com celular deitado</span><b>{landscapeMode ? 'ATIVO' : 'TENTAR'}</b></button>
        <div className="menu-interface-scale" role="group" aria-label="Escala dos controles">
          <span>Escala dos controles</span>
          <div className="menu-interface-scale-options">
            {([70, 100] as const).map(scale => <button key={scale} type="button" className={interfaceScale === scale ? 'selected' : ''} aria-pressed={interfaceScale === scale} onPointerDown={event => runTouchAction(event, () => onInterfaceScaleChange(scale))} onClick={event => runClickAction(event, () => onInterfaceScaleChange(scale))}>{scale}%</button>)}
          </div>
        </div>
      </div>
      <div className="menu-weapon"><span>ARMA ATUAL</span><strong>{weaponLabel}</strong></div>
    </div>}
  </div>;
}
