import type { Lake } from './lake';

type ShorePoint = { x: number; y: number };

function shorePath(ctx: CanvasRenderingContext2D, points: ShorePoint[], scale = 1): void {
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = point.x * scale, y = point.y * scale;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function createShoreline(): ShorePoint[] {
  const points: ShorePoint[] = [];
  const count = 72;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const variation = 1
      + Math.sin(angle * 3 + 0.45) * 0.025
      + Math.sin(angle * 5 - 1.1) * 0.018
      + Math.sin(angle * 9 + 0.8) * 0.009;
    points.push({ x: Math.cos(angle) * variation, y: Math.sin(angle) * variation });
  }
  return points;
}

/** Desenha o lago como uma depressão orgânica integrada à textura do terreno. */
export function drawLake(ctx: CanvasRenderingContext2D, lake: Lake, elapsed: number,
  viewLeft: number, viewTop: number, viewWidth: number, viewHeight: number): void {
  if (lake.rx <= 0 || lake.ry <= 0) return;
  const shore = 34;
  if (lake.x + lake.rx + shore < viewLeft || lake.x - lake.rx - shore > viewLeft + viewWidth
    || lake.y + lake.ry + shore < viewTop || lake.y - lake.ry - shore > viewTop + viewHeight) return;

  const shoreline = createShoreline();
  ctx.save();
  ctx.translate(lake.x, lake.y);
  ctx.scale(lake.rx, lake.ry);

  // A borda externa escurece a grama aos poucos, como solo encharcado.
  shorePath(ctx, shoreline, 1.24);
  ctx.fillStyle = 'rgba(53, 66, 43, 0.25)';
  ctx.fill();

  // Areia irregular, sem uma linha geométrica perfeita separando o mapa do lago.
  shorePath(ctx, shoreline, 1.15);
  ctx.fillStyle = '#9a8a68';
  ctx.fill();

  // Faixa úmida entre a areia seca e a água.
  shorePath(ctx, shoreline, 1.075);
  ctx.fillStyle = '#756f55';
  ctx.fill();

  // Pequenas manchas de areia e terra ficam presas à margem e não se movem com o tempo.
  ctx.save();
  shorePath(ctx, shoreline, 1.15);
  ctx.clip();
  ctx.globalAlpha = 0.32;
  let seed = 9137;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 110; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 1.025 + random() * 0.115;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const rotation = random() * Math.PI;
    ctx.fillStyle = random() > 0.5 ? '#c0ad80' : '#4d5942';
    ctx.beginPath();
    ctx.ellipse(x, y, 0.009 + random() * 0.009, 0.007 + random() * 0.006, rotation, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // A água tem uma borda rasa e irregular; o centro é mais profundo e escuro.
  shorePath(ctx, shoreline, 1);
  ctx.save();
  ctx.clip();
  const depth = ctx.createRadialGradient(0, 0, 0.08, 0, 0, 1.12);
  depth.addColorStop(0, '#244a55');
  depth.addColorStop(0.48, '#326777');
  depth.addColorStop(0.82, '#568b8b');
  depth.addColorStop(1, '#789b8a');
  ctx.fillStyle = depth;
  ctx.fillRect(-1.25, -1.25, 2.5, 2.5);

  // Textura discreta de água: manchas suaves e reflexos quebrados, sem anéis concêntricos.
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 24; i++) {
    const angle = i * 2.399963;
    const radius = 0.18 + ((i * 37) % 67) / 100;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    ctx.fillStyle = i % 2 === 0 ? '#b6d0b5' : '#173e4b';
    ctx.beginPath();
    ctx.ellipse(x, y, 0.022 + (i % 3) * 0.008, 0.014 + (i % 2) * 0.004,
      ((i * 17) % 13) * Math.PI / 13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Um único ponto pulsa por vez. Os três pontos ficam separados ao longo do eixo maior.
  const pulseDuration = 6;
  const pulseIndex = Math.floor(elapsed / pulseDuration) % 3;
  const pulseProgress = (elapsed % pulseDuration) / pulseDuration;
  const pulseAxis = lake.rx >= lake.ry;
  const pulseOffset = [-0.34, 0, 0.34][pulseIndex];
  const pulseX = pulseAxis ? pulseOffset : 0;
  const pulseY = pulseAxis ? 0 : pulseOffset;
  const pulseRadius = 0.035 + pulseProgress * 0.19;
  const pulseAlpha = Math.pow(1 - pulseProgress, 1.25) * 0.5;

  ctx.beginPath();
  ctx.ellipse(pulseX, pulseY, pulseRadius, pulseRadius * 0.62, 0, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(211, 232, 211, ${pulseAlpha})`;
  ctx.lineWidth = 0.008;
  ctx.stroke();

  // Reflexo amplo e muito sutil, para dar leitura de superfície sem aparência de plástico.
  const sheen = ctx.createLinearGradient(-0.7, -0.55, 0.65, 0.5);
  sheen.addColorStop(0, 'rgba(202, 220, 190, 0.08)');
  sheen.addColorStop(0.45, 'rgba(202, 220, 190, 0)');
  sheen.addColorStop(1, 'rgba(17, 47, 55, 0.12)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-1, -1, 2, 2);

  ctx.restore();
  ctx.restore();
}
