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
  const step = Math.max(12, b * 0.18);
  const circles: LakeCircle[] = [];
  for (let t = -a + step; t <= a - step; t += step) {
    const radial = b * Math.sqrt(Math.max(0, 1 - (t / a) ** 2));
    const radius = Math.min(radial, a - Math.abs(t)) * 0.95;
    if (radius < 10) continue;
    circles.push({ x: lake.x + (horizontal ? t : 0), y: lake.y + (horizontal ? 0 : t), radius });
  }
  return circles;
}

export function lakeSteeringCircles(lake: Lake): LakeCircle[] {
  const horizontal = lake.rx >= lake.ry;
  const a = Math.max(lake.rx, lake.ry), b = Math.min(lake.rx, lake.ry);
  const radius = b * 1.12;
  return [-0.72, 0, 0.72].map(fraction => ({
    x: lake.x + (horizontal ? a * fraction : 0),
    y: lake.y + (horizontal ? 0 : a * fraction),
    radius,
  }));
}
