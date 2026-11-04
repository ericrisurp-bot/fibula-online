import { CONFIG } from './config';

/**
 * Carrinho low-poly. Origem = centro do carrinho (cart.x, cart.y), chão em y = +20.
 * Sentido horizontal: vista lateral (alça aponta para o lado em que o carrinho se move,
 * isto é, na direção do jogador que o puxa). Sentido vertical: vista de cima em 3/4.
 * As rodas usam a fase acumulada do deslocamento real do conjunto.
 */
export type CartDrawState = {
  x: number; y: number; angle: number; wheelPhase?: number;
  stage: 'broken' | 'built'; carried: boolean;
  inventory?: ReadonlyArray<{ quantity: number }>;
};

/** Escala global do carrinho low-poly. */
export const CART_SCALE = 1.05;
let lastWheel: number | null = null;
let moveAmt = 0;

function loadFraction(c: CartDrawState): number {
  if (!c.inventory) return 0;
  const total = c.inventory.reduce((t, s) => t + s.quantity, 0);
  return Math.min(1, total / (CONFIG.cart.capacitySlots * CONFIG.cart.maxPerSlot));
}

type Vec3 = [number, number, number];
interface RigPiece {
  v: Vec3[];
  col: string;
  poly?: boolean;
  spoke?: boolean;
  tire?: boolean;
}
interface BoxOptions {
  sy0?: number; sz0?: number; sy1?: number; sz1?: number;
  bx?: number; tx?: number; by?: number; ty?: number;
}
const RIG_EL = 42 * Math.PI / 180;
const RIG_SE = Math.sin(RIG_EL);
const RIG_CE = Math.cos(RIG_EL);
const RIG_LIGHT = rigNorm([-0.45, -0.35, 0.82]);

function rigNorm(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}
function rigSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function rigCross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function rigDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function rigShade(hex: string, k: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  let r = value >> 16;
  let g = (value >> 8) & 255;
  let b = value & 255;
  const factor = 0.50 + 0.62 * k;
  r = Math.max(0, Math.min(255, r * factor)) | 0;
  g = Math.max(0, Math.min(255, g * factor)) | 0;
  b = Math.max(0, Math.min(255, b * factor)) | 0;
  return `rgb(${r},${g},${b})`;
}

// Coordenadas locais: +x frente (burrinho), +y direita, +z cima.
const RIG_FACES: readonly (readonly number[])[] = [
  [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
  [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
];
function rigBox(
  pieces: RigPiece[],
  x0: number, x1: number, y0: number, y1: number,
  z0: number, z1: number, color: string, options: BoxOptions = {},
): void {
  const sy0 = options.sy0 ?? 1;
  const sz0 = options.sz0 ?? 1;
  const sy1 = options.sy1 ?? 1;
  const sz1 = options.sz1 ?? 1;
  const cy = (y0 + y1) / 2;
  const cz = (z0 + z1) / 2;
  const hy = (y1 - y0) / 2;
  const hz = (z1 - z0) / 2;
  const bx = options.bx ?? 0;
  const tx = options.tx ?? 0;
  const by = options.by ?? 0;
  const ty = options.ty ?? 0;
  const vertices: Vec3[] = [];
  for (const zz of [0, 1]) {
    for (const [xi, yi] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
      const x = (xi ? x1 : x0) + (zz ? tx : bx);
      const sy = xi ? sy1 : sy0;
      const sz = xi ? sz1 : sz0;
      vertices.push([
        x,
        cy + (yi ? 1 : -1) * hy * sy + (zz ? ty : by),
        cz + (zz ? 1 : -1) * hz * sz,
      ]);
    }
  }
  pieces.push({ v: vertices, col: color });
}
function rigCylinder(
  pieces: RigPiece[], cx: number, cy: number, cz: number,
  radius: number, width: number, color: string, phase: number, segments = 8,
): void {
  const ring = (yy: number): Vec3[] => Array.from({ length: segments }, (_, i) => {
    const a = i / segments * Math.PI * 2 + phase;
    return [cx + Math.cos(a) * radius, yy, cz + Math.sin(a) * radius];
  });
  const a = ring(cy - width / 2);
  const b = ring(cy + width / 2);
  pieces.push({ poly: true, v: a.slice().reverse(), col: color });
  pieces.push({ poly: true, v: b, col: color });
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    pieces.push({
      poly: true,
      v: [a[i], a[j], b[j], b[i]],
      col: i % 2 ? '#6b4a28' : '#7a5530',
      tire: true,
    });
  }
}

function buildDonkeyCartRig(
  dist: number, walkPhase: number, wheelPhase: number, time: number, load: number, m: number, broken: boolean,
): RigPiece[] {
  const pieces: RigPiece[] = [];
  const DS = 1.32, DW = 0.82;
  const zf = 12, X0 = -31, X1 = 25, HW = 21;
  rigBox(pieces, X0, X1, -HW, HW, zf, zf + 3, '#9a6b38');
  const wallC = ['#c28d4f', '#d9a766', '#c28d4f', '#d9a766'];
  if (!broken) {
    for (let i = 0; i < 4; i++) {
      const z0 = zf + 3 + i * 6.2, z1 = z0 + 6.2;
      rigBox(pieces, X0, X1, -HW, -HW + 3, z0, z1, wallC[i]);
      rigBox(pieces, X0, X1, HW - 3, HW, z0, z1, wallC[i]);
      rigBox(pieces, X0, X0 + 3, -HW + 3, HW - 3, z0, z1, wallC[(i + 1) % 4]);
      rigBox(pieces, X1 - 3, X1, -HW + 3, HW - 3, z0, z1, wallC[(i + 1) % 4]);
    }
    rigBox(pieces, X0 - 1, X1 + 1, -HW - 1, -HW + 4, zf + 25, zf + 28, '#e8c088');
    rigBox(pieces, X0 - 1, X1 + 1, HW - 4, HW + 1, zf + 25, zf + 28, '#e8c088');
    rigBox(pieces, X0 - 1, X0 + 4, -HW - 1, HW + 1, zf + 25, zf + 28, '#e8c088');
    rigBox(pieces, X1 - 4, X1 + 1, -HW - 1, HW + 1, zf + 25, zf + 28, '#e8c088');
    for (const y of [-HW - 0.2, HW - 3]) {
      rigBox(pieces, X0, X1, y, y + 3.2, zf + 12, zf + 14.5, '#6f7378');
    }
  } else {
    const posts: readonly (readonly [number, number])[] = [
      [X0, -HW], [X0, HW - 3.4], [X1 - 3.4, -HW], [X1 - 3.4, HW - 3.4],
    ];
    for (const [px, py] of posts) {
      rigBox(pieces, px, px + 3.4, py, py + 3.4, zf + 3, zf + 26, '#8e6234');
    }
    rigBox(pieces, X0, X1, -HW, -HW + 3, zf + 3, zf + 9.2, wallC[0]);
    rigBox(pieces, X0, X0 + 3, -HW + 3, HW - 3, zf + 3, zf + 9.2, wallC[1]);
    rigBox(pieces, X0, X1 - 14, HW - 3, HW, zf + 3, zf + 9.2, wallC[2], { sz1: 0.8 });
    rigBox(pieces, X0 - 1, X1 - 12, -HW - 1, -HW + 4, zf + 25, zf + 28, '#e8c088');
    rigBox(pieces, X0 + 8, X0 + 30, HW + 6, HW + 9.6, 0, 2.4, '#c28d4f');
    rigBox(pieces, X0 + 14, X0 + 34, HW + 12, HW + 15.6, 0, 2.4, '#d9a766', { ty: 2 });
  }
  const WY = HW + 6;
  rigBox(pieces, -5, 1, -WY, broken ? WY - 5 : WY, 16, 19, '#4a3320');
  rigCylinder(pieces, -2, -WY, 17, 17, 5, '#8a5c2c', wheelPhase);
  if (!broken) rigCylinder(pieces, -2, WY, 17, 17, 5, '#8a5c2c', wheelPhase);
  for (const sy of (broken ? [-1] : [-1, 1])) {
    const y = sy * WY + sy * 3.2;
    for (let i = 0; i < 6; i++) {
      const angle = wheelPhase + i * Math.PI / 3;
      const cosine = Math.cos(angle), sine = Math.sin(angle), t = 0.9;
      pieces.push({
        v: [
          [-2 - sine * t + cosine, y - 0.6, 17 + cosine * t + sine],
          [-2 + sine * t + cosine, y - 0.6, 17 - cosine * t + sine],
          [-2 + sine * t + cosine * 15, y - 0.6, 17 - cosine * t + sine * 15],
          [-2 - sine * t + cosine * 15, y - 0.6, 17 + cosine * t + sine * 15],
        ],
        poly: true, col: '#c99a5c', spoke: true,
      });
    }
    rigBox(pieces, -4, 0, sy * WY + sy * 2.6 - 1, sy * WY + sy * 2.6 + 1, 15, 19, '#6f7378');
  }
  rigBox(pieces, X0 + 3, X0 + 7, -12, -8, 0, zf, '#5a3d1e');
  rigBox(pieces, X0 + 3, X0 + 7, 8, 12, 0, zf, '#5a3d1e');
  rigBox(pieces, X0 - 27, X0, -HW + 4, -HW + 7, zf + 14, zf + 17, '#b07f45');
  rigBox(pieces, X0 - 27, X0, HW - 7, HW - 4, zf + 14, zf + 17, '#b07f45');
  rigBox(pieces, X0 - 29, X0 - 25, -HW + 4, HW - 4, zf + 13, zf + 18, '#d9a766');
  const hx = dist + 14 * DS;
  if (!broken) {
    rigBox(pieces, -12, hx, -10.5, -8, zf + 20, zf + 23, '#c28d4f');
    rigBox(pieces, -12, hx, 8, 10.5, zf + 20, zf + 23, '#c28d4f');
    rigBox(pieces, 0, 4, -10.5, 10.5, zf + 20, zf + 23, '#a2723d');
  } else {
    rigBox(pieces, -6, dist - 4, -12.5, -10, 0.4, 3, '#c28d4f', { ty: -1.5 });
    rigBox(pieces, -6, dist - 4, 10, 12.5, 0.4, 3, '#c28d4f', { ty: 1.5 });
  }

  // Carga em 3–5 volumes low-poly dentro da caçamba; altura acompanha load.
  if (!broken && load > 0) {
    const count = 3 + Math.min(2, Math.floor(load * 3));
    const loadHeight = 3 + 13 * load;
    const cargo: readonly { x: number; y: number; w: number; d: number; color: string }[] = [
      { x: -25, y: -7, w: 12, d: 8, color: '#9a6b38' },
      { x: -10, y: 5, w: 13, d: 9, color: '#6d7780' },
      { x: 5, y: -6, w: 12, d: 8, color: '#c28d4f' },
      { x: 17, y: 5, w: 9, d: 8, color: '#98a2ab' },
      { x: -1, y: 0, w: 11, d: 8, color: '#ad7a45' },
    ];
    for (let i = 0; i < count; i++) {
      const item = cargo[i];
      const height = loadHeight * (0.72 + (i % 3) * 0.14);
      rigBox(
        pieces, item.x, item.x + item.w, item.y, item.y + item.d,
        zf + 3, zf + 3 + height, item.color,
      );
    }
  }

  // Burrinho articulado: só estas peças recebem animação e guinada.
  const p0 = pieces.length;
  const D = dist, F = '#a98258', FD = '#8a6644', FL = '#d2b48a', DK = '#4d3622', FM = '#b78f62';
  const sp = Math.sin(walkPhase), sp2 = Math.sin(walkPhase * 2);
  const br = Math.sin(time * 1.9), brA = 0.9 * (1 - 0.55 * m) + 0.35 * m;
  const bob = (sp2 * 1.5 * m) + br * 0.25 * (1 - m);
  const sway = sp * 1.1 * m;
  const rumpZ = sp * 0.9 * m, chestZ = -sp * 0.9 * m;
  const legs: readonly (readonly [number, number, number])[] = [
    [12, -5.8, 0], [12, 5.8, Math.PI], [-13, -5.8, Math.PI], [-13, 5.8, 0],
  ];
  for (const [lx, ly, off] of legs) {
    const side = ly < 0, color = side ? FD : F, phase = walkPhase + off;
    const swing = Math.sin(phase), lift = Math.max(0, Math.cos(phase)) * 3.0 * m, k = swing * m;
    rigBox(pieces, D + lx - 3.4, D + lx + 3.4, ly - 3, ly + 3, 15 + lift * 0.5, 26 + bob * 0.4, color,
      { bx: k * 0.9, tx: 0, sy0: 0.78, sz0: 1, sy1: 1, sz1: 1 });
    rigBox(pieces, D + lx - 2.4, D + lx + 2.4, ly - 2.2, ly + 2.2, 5 + lift, 15.4 + lift * 0.5, side ? '#7a5a3a' : '#9a7650',
      { bx: k * 2.2, tx: k * 0.9, sy0: 0.8, sy1: 0.85 });
    rigBox(pieces, D + lx - 3.2, D + lx + 3.2, ly - 2.6, ly + 2.6, 0 + lift, 5.4 + lift, DK,
      { bx: k * 2.7 + lift * 0.4, tx: k * 2.2, sy0: 0.8 });
  }
  rigBox(pieces, D - 23, D - 9, -7.5, 7.5, 22 + bob + rumpZ, 38 + bob + rumpZ, FM,
    { sy0: 0.62, sz0: 0.82, sy1: 1, sz1: 1, by: -sway * 0.6, ty: -sway * 0.6 });
  rigBox(pieces, D - 9, D + 5, -8.6, 8.6, 21 + bob - br * brA * 0.4, 40 + bob + br * brA, F,
    { sy0: 1 + br * 0.03, sy1: 1 + br * 0.03, by: sway * 0.2, ty: sway * 0.2 });
  rigBox(pieces, D + 5, D + 17, -8.2, 8.2, 22 + bob + chestZ, 43 + bob + chestZ + br * brA * 0.5, FM,
    { sy1: 0.8, sz1: 1.0, by: sway * 0.7, ty: sway * 0.7 });
  rigBox(pieces, D - 16, D + 10, -5.5, 5.5, 17.5 + bob - br * brA * 0.55, 22.5 + bob, FL,
    { sy0: 0.8 + br * 0.04, sy1: 0.9 + br * 0.04 });
  rigBox(pieces, D - 21, D + 12, -2.8, 2.8, 38.5 + bob + br * brA, 41.5 + bob + br * brA, DK,
    { sy0: 0.5, sy1: 0.7, sz0: 0.6 });
  const nod = sp2 * 1.7 * m + Math.sin(walkPhase + 0.9) * 0.8 * m - br * 0.35 * (1 - m);
  const headLift = sp * 1.6 * m;
  rigBox(pieces, D + 13, D + 22, -5.2, 5.2, 34 + bob + chestZ, 46 + bob + nod * 0.6, FM,
    { sy1: 0.62, sz1: 0.85, tx: 6 + nod * 0.35, by: sway * 0.7, ty: headLift * 0.5 });
  rigBox(pieces, D + 16, D + 27, -1.4, 1.4, 45 + bob + nod * 0.4, 55 + bob + nod, DK,
    { sy0: 0.9, tx: 4 + nod * 0.35, sy1: 0.4, by: headLift * 0.4, ty: headLift * 0.5 });
  rigBox(pieces, D + 25, D + 37, -4.6, 4.6, 45 + bob + nod, 56 + bob + nod, F,
    { sy0: 1, sy1: 0.62, sz0: 1, sz1: 0.55, tx: 0, by: headLift * 0.6, ty: headLift * 0.7 });
  rigBox(pieces, D + 36, D + 44, -3.1, 3.1, 42 + bob + nod, 50 + bob + nod, FL,
    { sy0: 1, sy1: 0.78, sz0: 1, sz1: 0.7, by: headLift * 0.7, ty: headLift * 0.8 });
  rigBox(pieces, D + 43.2, D + 44.4, -1.1, 1.1, 44.5 + bob + nod, 46.5 + bob + nod, DK,
    { by: headLift * 0.8, ty: headLift * 0.8 });
  const pulse = (x: number) => Math.pow(Math.max(0, Math.sin(x)), 12);
  const earLeft = -2.5 + Math.sin(time * 9) * pulse(time * 0.9 + 1) * 2.4 + sp2 * 1.3 * m;
  const earRight = -2.5 + Math.sin(time * 9 + 1.7) * pulse(time * 0.7 + 2.2) * 2.4 - sp2 * 1.3 * m + Math.sin(walkPhase + 1) * 0.6 * m;
  const earSwayLeft = -pulse(time * 0.9 + 1) * 1.6 - sp * 1.2 * m;
  const earSwayRight = pulse(time * 0.7 + 2.2) * 1.6 + sp * 1.2 * m;
  rigBox(pieces, D + 28, D + 31, -4.2, -1.2, 55 + bob + nod, 67 + bob + nod, FD,
    { sy1: 0.25, sz1: 0.9, tx: earLeft, by: headLift * 0.6, ty: headLift * 0.6 + earSwayLeft });
  rigBox(pieces, D + 28, D + 31, 1.2, 4.2, 55 + bob + nod, 67 + bob + nod, FD,
    { sy1: 0.25, sz1: 0.9, tx: earRight, by: headLift * 0.6, ty: headLift * 0.6 + earSwayRight });
  rigBox(pieces, D + 34.5, D + 36, -5, -4, 51 + bob + nod, 53 + bob + nod, '#1b130c',
    { by: headLift * 0.7, ty: headLift * 0.7 });
  rigBox(pieces, D + 34.5, D + 36, 4, 5, 51 + bob + nod, 53 + bob + nod, '#1b130c',
    { by: headLift * 0.7, ty: headLift * 0.7 });
  const tail = Math.sin(walkPhase + 0.6) * 4.2 * m + Math.sin(time * 1.7) * 1.0 * (1 - m);
  const tailTip = Math.sin(walkPhase - 0.2) * 6.5 * m + Math.sin(time * 1.7 - 0.7) * 1.8 * (1 - m);
  rigBox(pieces, D - 27, D - 22, -1.6, 1.6, 32 + bob + rumpZ, 41 + bob + rumpZ, DK,
    { sy0: 0.7, by: tail * 0.5, ty: -sway * 0.6, bx: -1 });
  rigBox(pieces, D - 28.5, D - 23, -1.4, 1.4, 21, 32 + bob * 0.5, DK,
    { sy0: 0.6, sy1: 0.9, by: tailTip, ty: tail * 0.5, bx: -1.5 - Math.abs(tailTip) * 0.15, tx: -1 });
  if (!broken) {
    rigBox(pieces, D + 14.5, D + 18.5, -9, 9, 27 + bob + chestZ, 40 + bob + chestZ, '#4a3320',
      { sy1: 0.9, by: sway * 0.7, ty: sway * 0.7 });
    rigBox(pieces, D + 14, D + 19.5, -9.6, -8, 32 + bob + chestZ, 37 + bob + chestZ, '#b9bec2',
      { by: sway * 0.7, ty: sway * 0.7 });
    rigBox(pieces, D + 14, D + 19.5, 8, 9.6, 32 + bob + chestZ, 37 + bob + chestZ, '#b9bec2',
      { by: sway * 0.7, ty: sway * 0.7 });
  }

  const yaw = sp * 0.05 * m, cyw = Math.cos(yaw), syw = Math.sin(yaw), pivot = dist - 8;
  for (let i = p0; i < pieces.length; i++) {
    for (const vertex of pieces[i].v) {
      const x = dist + (vertex[0] - dist) * DS;
      const y = vertex[1] * DS * DW;
      const dx = x - pivot;
      vertex[0] = pivot + dx * cyw - y * syw;
      vertex[1] = dx * syw + y * cyw;
      vertex[2] *= DS;
    }
  }
  return pieces;
}

function drawDonkeyCartRig(
  ctx: CanvasRenderingContext2D,
  angle: number,
  dist: number,
  walkPhase: number,
  wheelPhase: number,
  time: number,
  load: number,
  m: number,
  broken: boolean,
): void {
  const pieces = buildDonkeyCartRig(dist, walkPhase, wheelPhase, time, load, m, broken);
  const faces: {
    pts: Vec3[]; normal: Vec3; depth: number; color: string;
    spoke?: boolean; tire?: boolean;
  }[] = [];
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const transform = (point: Vec3): Vec3 => [
    point[0] * cosine - point[1] * sine,
    point[0] * sine + point[1] * cosine,
    point[2],
  ];
  for (const piece of pieces) {
    const vertices = piece.v.map(transform);
    const polygons = piece.poly
      ? [vertices.map((_, index) => index)]
      : RIG_FACES;
    const center = vertices.reduce<Vec3>(
      (sum, point) => [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]],
      [0, 0, 0],
    ).map(value => value / vertices.length) as Vec3;
    for (const indices of polygons) {
      const points = indices.map(index => vertices[index]);
      let normal = rigNorm(rigCross(rigSub(points[1], points[0]), rigSub(points[2], points[0])));
      const faceCenter = points.reduce<Vec3>(
        (sum, point) => [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]],
        [0, 0, 0],
      ).map(value => value / points.length) as Vec3;
      if (!piece.poly && rigDot(normal, rigSub(faceCenter, center)) < 0) {
        normal = normal.map(value => -value) as Vec3;
      }
      if (piece.poly && rigDot(normal, [0, RIG_CE, RIG_SE]) < 0) {
        normal = normal.map(value => -value) as Vec3;
      }
      if (rigDot(normal, [0, RIG_CE, RIG_SE]) <= 0.0001 && !piece.poly) continue;
      faces.push({
        pts: points, normal,
        depth: faceCenter[1] * RIG_CE + faceCenter[2] * RIG_SE,
        color: piece.col, spoke: piece.spoke, tire: piece.tire,
      });
    }
  }
  faces.sort((a, b) => a.depth - b.depth);
  ctx.save();
  ctx.translate(0, 20);
  ctx.fillStyle = 'rgba(8,14,9,.22)';
  ctx.beginPath();
  ctx.ellipse(
    dist * 0.45 * cosine,
    dist * 0.45 * sine * RIG_SE + 2,
    (Math.abs(cosine) * 54 + Math.abs(sine) * 30 + 28) * 0.72,
    (Math.abs(sine) * 26 + Math.abs(cosine) * 14 + 10) * 0.62,
    0, 0, Math.PI * 2,
  );
  ctx.fill();
  for (const face of faces) {
    const brightness = Math.max(0, rigDot(face.normal, RIG_LIGHT));
    ctx.beginPath();
    face.pts.forEach((point, index) => {
      const x = point[0];
      const y = point[1] * RIG_SE - point[2] * RIG_CE;
      if (index) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = rigShade(face.color, brightness);
    ctx.fill();
    ctx.strokeStyle = face.spoke ? 'rgba(30,18,8,.5)' : 'rgba(30,18,10,.78)';
    ctx.lineWidth = face.tire ? 0.9 : 0.85;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

export function drawCart(
  ctx: CanvasRenderingContext2D,
  cart: CartDrawState,
  nearby: boolean,
  time: number,
  moving: boolean,
  wheelPhase?: number,
): void {
  const { x, y, angle, stage, carried } = cart;
  const broken = stage === 'broken';
  const rot = wheelPhase ?? (moving ? time * 8 : 0);
  const rigWheelPhase = broken ? 0 : (cart.wheelPhase ?? rot);
  let donkeyMove = 0;
  if (!broken) {
    const motionPhase = wheelPhase ?? cart.wheelPhase;
    if (motionPhase !== undefined) {
      const delta = lastWheel === null
        ? 0
        : Math.abs(Math.atan2(Math.sin(motionPhase - lastWheel), Math.cos(motionPhase - lastWheel)));
      const target = delta > 1e-4 || moving ? 1 : 0;
      moveAmt += (target - moveAmt) * 0.2;
      lastWheel = motionPhase;
      donkeyMove = moveAmt;
    } else {
      moveAmt = moving ? 1 : 0;
      donkeyMove = moveAmt;
      lastWheel = null;
    }
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.save();
  ctx.scale(CART_SCALE, CART_SCALE);

  if (nearby) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    ctx.beginPath();
    ctx.ellipse(0, 4, 62 + pulse * 4, 38 + pulse * 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(210,180,125,${0.07 + pulse * 0.06})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(230,200,150,${0.3 + pulse * 0.35})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  drawDonkeyCartRig(
    ctx, angle, CONFIG.donkey.cartDistance,
    broken ? 0 : rigWheelPhase * 0.9,
    rigWheelPhase, time, broken ? 0 : loadFraction(cart),
    donkeyMove, broken,
  );

  ctx.restore();

  if (carried) {
    ctx.strokeStyle = 'rgba(235,235,235,.65)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(0, -3, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}
