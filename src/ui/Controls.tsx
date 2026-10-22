import { useRef, type PointerEvent } from 'react';
import { CLASSES, type ClassId, type WeaponId } from '../game/config';

type Props = {
  onMove: (x: number, y: number) => void;
  onCamera: () => void;
  onWeapon: (id: WeaponId) => void;
  onClass: (id: ClassId) => void;
  weapon: WeaponId;
  classId: ClassId;
};

const STICK_RADIUS = 42;

export default function Controls({ onMove, onCamera, onWeapon, onClass, weapon, classId }: Props) {
  const stickRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);

  const moveStick = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy) || 1;
    const scale = Math.min(distance, STICK_RADIUS) / distance;
    onMove(Math.max(-1, Math.min(1, dx / STICK_RADIUS)), Math.max(-1, Math.min(1, dy / STICK_RADIUS)));
    const knob = stickRef.current?.querySelector<HTMLElement>('.joystick-knob');
    if (knob) knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    activePointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveStick(e);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== e.pointerId) return;
    e.preventDefault();
    moveStick(e);
  };
  const resetStick = (e: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    onMove(0, 0);
    const knob = stickRef.current?.querySelector<HTMLElement>('.joystick-knob');
    if (knob) knob.style.transform = 'translate(0, 0)';
  };

  return <div className="mobile-controls" aria-label="Controles de celular">
    <div
      className="joystick"
      ref={stickRef}
      role="application"
      aria-label="Joystick de movimentação"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={resetStick}
      onPointerCancel={resetStick}
      onLostPointerCapture={resetStick}
    >
      <span className="joystick-cross horizontal" />
      <span className="joystick-cross vertical" />
      <span className="joystick-knob" />
      <span className="joystick-label">MOVER</span>
    </div>
    <div className="mobile-actions">
      <button onClick={onCamera}>Câmera</button>
      <button className={weapon === 'espada' ? 'selected' : ''} onClick={() => onWeapon('espada')}>5 Espada</button>
      <button className={weapon === 'cajado' ? 'selected' : ''} onClick={() => onWeapon('cajado')}>6 Cajado</button>
      <button className={weapon === 'arco' ? 'selected' : ''} onClick={() => onWeapon('arco')}>7 Arco</button>
      {(Object.keys(CLASSES) as ClassId[]).map((id, index) => <button key={id} className={classId === id ? 'selected class-button' : 'class-button'} onClick={() => onClass(id)}>{index + 1} {CLASSES[id].label}</button>)}
    </div>
  </div>;
}
