import type { Lake } from './lake';

/** Desenha o lago como chão, antes das entidades ordenadas por profundidade. */
export function drawLake(ctx: CanvasRenderingContext2D, lake: Lake, elapsed: number,
  viewLeft: number, viewTop: number, viewWidth: number, viewHeight: number): void {
  if (lake.rx <= 0 || lake.ry <= 0) return;
  const margin = 18;
  if (lake.x + lake.rx + margin < viewLeft || lake.x - lake.rx - margin > viewLeft + viewWidth
    || lake.y + lake.ry + margin < viewTop || lake.y - lake.ry - margin > viewTop + viewHeight) return;
  ctx.save();
  ctx.fillStyle = '#c6b58a';
  ctx.beginPath(); ctx.ellipse(lake.x, lake.y, lake.rx + 14, lake.ry + 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(105, 91, 65, 0.48)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(lake.x, lake.y, lake.rx, lake.ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.clip();
  const gradient = ctx.createRadialGradient(lake.x - lake.rx * 0.18, lake.y - lake.ry * 0.2,
    Math.min(lake.rx, lake.ry) * 0.08, lake.x, lake.y, Math.max(lake.rx, lake.ry) * 1.08);
  gradient.addColorStop(0, '#245b70'); gradient.addColorStop(0.58, '#34798b'); gradient.addColorStop(1, '#78b3b4');
  ctx.fillStyle = gradient; ctx.fillRect(lake.x - lake.rx, lake.y - lake.ry, lake.rx * 2, lake.ry * 2);
  const drift = elapsed * 0.12;
  for (let i = 0; i < 4; i++) {
    const phase = drift + i * 1.57;
    ctx.beginPath();
    ctx.ellipse(lake.x + Math.sin(phase) * lake.rx * 0.2,
      lake.y + Math.cos(phase * 0.73) * lake.ry * 0.28,
      lake.rx * (0.28 + i * 0.12), lake.ry * (0.075 + i * 0.012), 0, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.strokeStyle = `rgba(218, 244, 229, ${0.12 + (i % 2) * 0.05})`;
    ctx.lineWidth = 2 + (i % 2); ctx.stroke();
  }
  for (let i = 0; i < 2; i++) {
    const progress = (elapsed / 16 + i * 0.5) % 1;
    const alpha = Math.sin(progress * Math.PI) * 0.22;
    const centerX = lake.x + Math.sin(i * 2.4 + elapsed * 0.035) * lake.rx * 0.22;
    const centerY = lake.y + Math.cos(i * 1.8 + elapsed * 0.03) * lake.ry * 0.2;
    ctx.beginPath(); ctx.ellipse(centerX, centerY, lake.rx * 0.3 * progress, lake.ry * 0.3 * progress, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(222, 247, 234, ${alpha})`; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.restore(); ctx.restore();
}
