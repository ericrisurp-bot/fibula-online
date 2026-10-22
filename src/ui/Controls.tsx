import type { PointerEvent } from 'react';
import type { WeaponId } from '../game/config';

type Props = { onMove: (x: number, y: number) => void; onCamera: () => void; onWeapon: (id: WeaponId) => void; weapon: WeaponId; };
export default function Controls({ onMove, onCamera, onWeapon, weapon }: Props) {
  const stop = () => onMove(0, 0);
  const direction = (x: number, y: number) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); onMove(x, y); },
    onPointerUp: stop, onPointerCancel: stop, onLostPointerCapture: stop,
  });
  return <div className="mobile-controls">
    <div className="dpad" aria-label="Controles de movimento">
      <button className="pad up" aria-label="Mover para cima" {...direction(0, -1)}>▲</button>
      <button className="pad left" aria-label="Mover para esquerda" {...direction(-1, 0)}>◀</button>
      <button className="pad right" aria-label="Mover para direita" {...direction(1, 0)}>▶</button>
      <button className="pad down" aria-label="Mover para baixo" {...direction(0, 1)}>▼</button>
    </div>
    <div className="mobile-actions">
      <button onClick={onCamera}>Câmera</button>
      <button className={weapon === 'espada' ? 'selected' : ''} onClick={() => onWeapon('espada')}>1 Espada</button>
      <button className={weapon === 'cajado' ? 'selected' : ''} onClick={() => onWeapon('cajado')}>2 Cajado</button>
      <button className={weapon === 'arco' ? 'selected' : ''} onClick={() => onWeapon('arco')}>3 Arco</button>
    </div>
  </div>;
}