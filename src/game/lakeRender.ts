import type { Lake } from './lake';

/** Desenha o lago como chão, antes das entidades ordenadas por profundidade. */
export function drawLake(ctx: CanvasRenderingContext2D, lake: Lake, elapsed: number,
  viewLeft: number, viewTop: number, viewWidth: number, viewHeight: number): void {
  if (lake.rx <= 0 || lake.ry <= 0) return;
  const margin = 24;
  if (lake.x + lake.rx + margin < viewLeft || lake.x - lake.rx - margin > viewLeft + viewWidth
    || lake.y + lake.ry + margin < viewTop || lake.y - lake.ry - margin > viewTop + viewHeight) return;

  ctx.save();

  // A margem tem três faixas: areia clara, areia úmida e a entrada da água.
  ctx.beginPath();
  ctx.ellipse(lake.x, lake.y, lake.rx + 20, lake.ry + 20, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#c6b58a';
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(lake.x, lake.y, lake.rx + 10, lake.ry + 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#918365';
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(lake.x, lake.y, lake.rx, lake.ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#477f88';
  ctx.fill();

  // A água fica mais clara na borda rasa e escurece gradualmente no fundo.
  ctx.save();
  ctx.clip();
  const depth = ctx.createRadialGradient(
    lake.x, lake.y, Math.min(lake.rx, lake.ry) * 0.04,
    lake.x, lake.y, Math.max(lake.rx, lake.ry) * 1.02,
  );
  depth.addColorStop(0, '#173f52');
  depth.addColorStop(0.38, '#245b70');
  depth.addColorStop(0.72, '#34798b');
  depth.addColorStop(1, '#659da0');
  ctx.fillStyle = depth;
  ctx.fillRect(lake.x - lake.rx, lake.y - lake.ry, lake.rx * 2, lake.ry * 2);

  // Três pulsos concêntricos: nascem pequenos e fortes, crescem e desaparecem.
  const cycleSeconds = 18;
  for (let i = 0; i < 3; i++) {
    const progress = (elapsed / cycleSeconds + i / 3) % 1;
    const fade = Math.pow(1 - progress, 1.35);
    const radiusX = lake.rx * (0.055 + progress * 0.43);
    const radiusY = lake.ry * (0.055 + progress * 0.43);

    ctx.beginPath();
    ctx.ellipse(lake.x, lake.y, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(222, 247, 234, ${0.48 * fade})`;
    ctx.lineWidth = 2.4 - progress * 0.8;
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
}
