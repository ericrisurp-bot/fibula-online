import { CONFIG } from './config';

export type LakeSize = 'small' | 'medium' | 'large';
export type Lake = { x: number; y: number; rx: number; ry: number; size: LakeSize };
export type LakeCircle = { x: number; y: number; radius: number };

export function isInsideLake(lake: Lake, x: number, y: number, margin = 0): boolean {
  const rx = lake.rx + margin, ry = lake.ry + margin;
  if (rx <= 0 || ry <= 0) return false;
  const dx = (x - lake.x) / rx, dy = (y - lake.y) / ry;
  return dx * dx + dy * dy <= 1;
}

/** Distância euclidiana assinada até a borda; valores negativos indicam o interior. */
export function distanceToLakeEdge(lake: Lake, x: number, y: number): number {
  const dx = Math.abs(x - lake.x), dy = Math.abs(y - lake.y);
  const rx = lake.rx, ry = lake.ry;
  if (rx <= 0 || ry <= 0) return Infinity;
  const squaredDistance = (angle: number) => (rx * Math.cos(angle) - dx) ** 2 + (ry * Math.sin(angle) - dy) ** 2;
  const segments = 48, step = Math.PI * 2 / segments;
  let best = 0, bestValue = Infinity;
  for (let i = 0; i < segments; i++) {
    const value = squaredDistance(i * step);
    if (value < bestValue) { best = i; bestValue = value; }
  }
  const ratio = (Math.sqrt(5) - 1) / 2;
  let low = best * step - step, high = best * step + step;
  let left = high - ratio * (high - low), right = low + ratio * (high - low);
  let leftValue = squaredDistance(left), rightValue = squaredDistance(right);
  for (let i = 0; i < 36; i++) {
    if (leftValue <= rightValue) {
      high = right; right = left; rightValue = leftValue;
      left = high - ratio * (high - low); leftValue = squaredDistance(left);
    } else {
      low = left; left = right; leftValue = rightValue;
      right = low + ratio * (high - low); rightValue = squaredDistance(right);
    }
  }
  const distance = Math.sqrt(Math.min(leftValue, rightValue));
  return isInsideLake(lake, x, y) ? -distance : distance;
}

export function lakeColliderCircles(lake: Lake): LakeCircle[] {
  const horizontal = lake.rx >= lake.ry;
  const a = Math.max(lake.rx, lake.ry), b = Math.min(lake.rx, lake.ry);
  const step = Math.max(CONFIG.lake.colliderStepMinimum, b * CONFIG.lake.colliderStepMinorAxisFactor);
  const circles: LakeCircle[] = [];
  for (let t = -a + step; t <= a - step; t += step) {
    const radial = b * Math.sqrt(Math.max(0, 1 - (t / a) ** 2));
    const radius = Math.min(radial, a - Math.abs(t)) * CONFIG.lake.colliderRadiusInset;
    if (radius < CONFIG.lake.colliderMinimumRadius) continue;
    circles.push({ x: lake.x + (horizontal ? t : 0), y: lake.y + (horizontal ? 0 : t), radius });
  }
  return circles;
}

export function lakeSteeringCircles(lake: Lake): LakeCircle[] {
  const horizontal = lake.rx >= lake.ry;
  const a = Math.max(lake.rx, lake.ry), b = Math.min(lake.rx, lake.ry);
  const radius = b * CONFIG.lake.steeringCircleRadiusFactor;
  return [-0.72, 0, 0.72].map(fraction => ({
    x: lake.x + (horizontal ? a * fraction : 0),
    y: lake.y + (horizontal ? 0 : a * fraction),
    radius,
  }));
}
/** Normal externa unitária da elipse no ponto (gradiente) e raio normalizado q (q<1 dentro). */
function lakeNormal(lake: Lake, x: number, y: number) {
  const qx = (x - lake.x) / lake.rx, qy = (y - lake.y) / lake.ry;
  const q = Math.hypot(qx, qy) || 1e-6;
  let nx = qx / lake.rx, ny = qy / lake.ry;
  const length = Math.hypot(nx, ny) || 1;
  nx /= length; ny /= length;
  return { nx, ny, q };
}

/** Ajusta a direção desejada para deslizar ao longo da margem: remove o componente que aponta para a água e, com o alvo de frente, empurra pela tangente (lado estável por `side`). Retorna null quando o lago não interfere. */
export function lakeSlideDirection(lake: Lake, x: number, y: number, dirX: number, dirY: number, side: 1 | -1, range: number): { x: number; y: number } | null {
  const { nx, ny, q } = lakeNormal(lake, x, y);
  const edge = (q - 1) * Math.min(lake.rx, lake.ry);
  if (edge > range) return null;
  const into = dirX * nx + dirY * ny;
  if (into >= 0) return null;
  const tx = -ny, ty = nx;
  const along = dirX * tx + dirY * ty;
  const sign = Math.abs(along) > 0.08 ? Math.sign(along) : side;
  const head = -into;
  let ox = dirX - into * nx + tx * sign * head;
  let oy = dirY - into * ny + ty * sign * head;
  const length = Math.hypot(ox, oy) || 1;
  ox /= length; oy /= length;
  return { x: ox, y: oy };
}

/** Empurra a entidade (centro + raio) para fora da elipse exata, sem frestas entre círculos. */
export function pushOutOfLake(lake: Lake, entity: { x: number; y: number }, radius: number): void {
  const rxE = lake.rx + radius, ryE = lake.ry + radius;
  for (let pass = 0; pass < 3; pass++) {
    const qx = (entity.x - lake.x) / rxE, qy = (entity.y - lake.y) / ryE;
    const q = Math.hypot(qx, qy);
    if (q >= 1) return;
    if (q < 1e-6) { entity.x += rxE; return; }
    let nx = qx / rxE, ny = qy / ryE;
    const length = Math.hypot(nx, ny) || 1;
    nx /= length; ny /= length;
    const push = (1 - q) * Math.min(rxE, ryE) + 0.25;
    entity.x += nx * push; entity.y += ny * push;
  }
}

