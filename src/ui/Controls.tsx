import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { CLASSES, type ClassId } from '../game/config';

type Props = {
  onInventoryToggle: () => void;
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

export default function Controls({ onInventoryToggle, flagWheelOpen, onLongPress, onFlagTap, onWheelMove, onWheelEnd, onMovementStart, onMove, onRange, onZoom, onClass, classId, showRange, weaponLabel }: Props) {
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
        {(Object.keys(CLASSES) as ClassId[]).map((id, index) => <button key={id} type="button" className={classId === id ? 'selected' : ''} aria-pressed={classId === id} title={CLASSES[id].description} onClick={() => { onClass(id); setMenuOpen(false); }}>{index + 1} · {CLASSES[id].label}</button>)}
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
      <button type="button" className="mobile-quick-class" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onClass(nextClass); }} aria-label={`Trocar classe para ${CLASSES[nextClass].label}`} title={`Próxima classe: ${CLASSES[nextClass].label}`}><span aria-hidden="true">↻</span><small>{CLASSES[classId].label}</small></button>
      <button type="button" className="mobile-quick-bag" onClick={() => { setMenuOpen(false); onInventoryToggle(); }} aria-label="Abrir mochila, casa e carrinho" title="Mochila e casa"><span aria-hidden="true">🎒</span></button>
    </div>
  </div>;
}
