import { useRef, useState, type PointerEvent } from 'react';
import type { WeaponId } from '../game/config';

type Props = { onMove: (x: number, y: number) => void; onCamera: () => void; onWeapon: (id: WeaponId) => void; weapon: WeaponId; };
type StickPosition = { x: number; y: number };

const STICK_RADIUS = 38;

export default function Controls({ onMove, onCamera, onWeapon, weapon }: Props) {
  const joystickRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const [stick, setStick] = useState<StickPosition>({ x: 0, y: 0 });

  const updateStick = (e: PointerEvent<HTMLDivElement>) => {
    const element = joystickRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    const scale = distance > STICK_RADIUS ? STICK_RADIUS / distance : 1;
    const x = dx * scale;
    const y = dy * scale;
    setStick({ x, y });
    onMove(x / STICK_RADIUS, y / STICK_RADIUS);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (activePointer.current !== null) return;
    activePointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateStick(e);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== e.pointerId) return;
    e.preventDefault();
    updateStick(e);
  };

  const stop = (e: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    setStick({ x: 0, y: 0 });
    onMove(0, 0);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return <div className="mobile-controls">
    <div
      ref={joystickRef}
      className="joystick"
      role="application"
      aria-label="Joystick de movimento em oito direções"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={(e) => {
        if (activePointer.current === e.pointerId) {
          activePointer.current = null;
          setStick({ x: 0, y: 0 });
          onMove(0, 0);
        }
      }}
    >
      <span className="joystick-ring" />
      <span className="joystick-knob" style={{ transform: `translate(calc(-50% + ${stick.x}px), calc(-50% + ${stick.y}px))` }} />
    </div>
    <div className="mobile-actions">
      <button onClick={onCamera}>Câmera</button>
      <button className={weapon === 'espada' ? 'selected' : ''} onClick={() => onWeapon('espada')}>1 Espada</button>
      <button className={weapon === 'cajado' ? 'selected' : ''} onClick={() => onWeapon('cajado')}>2 Cajado</button>
      <button className={weapon === 'arco' ? 'selected' : ''} onClick={() => onWeapon('arco')}>3 Arco</button>
    </div>
  </div>;
}