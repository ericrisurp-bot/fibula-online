import type { ClassId } from './config';

type Palette = {
  main: string;
  light: string;
  dark: string;
  trim: string;
  glow: string;
  glowEdge: string;
};

const PALETTES: Record<ClassId, Palette> = {
  guerreiro: { main: '#b8463f', light: '#d9645c', dark: '#7a2a2a', trim: '#e0b85c', glow: '#ffc2a8', glowEdge: '#ff7a5c' },
  mago: { main: '#6e4bb0', light: '#8d69d3', dark: '#432e79', trim: '#cdb8ff', glow: '#e4ccff', glowEdge: '#a97bff' },
  arqueiro: { main: '#cfa24a', light: '#e8c36d', dark: '#8c6824', trim: '#fff1c4', glow: '#fff3b8', glowEdge: '#ffd25c' },
  druida: { main: '#4f9a52', light: '#74bd76', dark: '#2c6333', trim: '#dfeaa5', glow: '#c8ffc0', glowEdge: '#7dff8a' },
};

const OUT = '#15151c';
const SKIN = '#0a0c12';
const DARK = '#23232b';
const DARK2 = '#32323d';
const LEATH = '#6b4a2f';
const LEATH2 = '#8a6340';
const GOLD = '#d9b45a';

type Point = [number, number];

function poly(c: CanvasRenderingContext2D, pts: Point[], fill: string | null, stroke = OUT, lw = 1.6): void {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.lineJoin = 'round';
    c.stroke();
  }
}

function line(c: CanvasRenderingContext2D, pts: Point[], color: string, lw: number): void {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke();
}

function eyePoints(cx: number, cy: number, w: number, h: number, rot: number): Point[] {
  const base: Point[] = [[-w, 0], [-w * 0.2, -h], [w * 0.9, -h * 0.35], [w, h * 0.25], [-w * 0.1, h]];
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return base.map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos]);
}

function eye(c: CanvasRenderingContext2D, p: Palette, cx: number, cy: number, rot: number): void {
  c.save();
  c.globalAlpha = 0.35;
  poly(c, eyePoints(cx, cy, 6.5 * 1.5, 4.8 * 1.5, rot), p.glowEdge, p.glowEdge, 0.8);
  c.restore();
  poly(c, eyePoints(cx, cy, 6.5, 4.8, rot), p.glow, p.glow, 0.8);
}

export type LadinoPose = { walking: boolean; phase: number; breath: number; carry: boolean };

export function drawLadino(ctx: CanvasRenderingContext2D, classId: ClassId, r: number, pose: LadinoPose): void {
  const { walking, phase, breath, carry } = pose;
  const k = carry ? 0.65 : 1;
  const sL = Math.sin(phase);
  const sR = Math.sin(phase + Math.PI);
  const liftL = walking ? Math.max(0, sL) * 7 * k : 0;
  const liftR = walking ? Math.max(0, sR) * 7 * k : 0;
  const bob = walking ? -Math.abs(Math.sin(phase)) * 2.4 * (carry ? 1.4 : 1) : -breath * 0.9;
  const sway = walking ? Math.sin(phase) * 2.2 : breath * 0.5;
  const leftArmAngle = walking ? (carry ? -0.30 : -sL * 0.22) : breath * 0.02;
  const rightArmAngle = walking ? (carry ? 0.30 : -sR * 0.22) : -breath * 0.02;
  const leftHandShift = walking ? (carry ? -3 : -sL * 5) : breath * 0.7;
  const rightHandShift = walking ? (carry ? -3 : -sR * 5) : breath * 0.7;

  ctx.save();
  const scale = 3.0 * r / 135;
  ctx.translate(-50 * scale, r * 0.9 - 133 * scale);
  ctx.scale(scale, scale);
  const P = PALETTES[classId];

  // Sombra mantida fixa no drawPlayer; a capa tem atraso próprio em relação ao corpo.
  const cape = (points: Point[], fill: string) => poly(ctx, points.map(([x, y]) => {
    if (y < 90) return [x, y] as Point;
    const distance = Math.max(0, Math.min(1, (y - 46) / 82));
    const factor = 1 + distance * 0.4;
    return [x + sway * factor, y + bob * 0.6] as Point;
  }), fill);
  cape([[27,46],[73,46],[84,96],[78,122],[66,112],[58,128],[50,114],[42,128],[34,112],[22,122],[16,96]], P.dark);
  cape([[27,46],[50,46],[50,114],[42,128],[34,112],[22,122],[16,96]], P.main);

  // Pernas e botas: a fase deriva da distância real percorrida pelo jogador.
  poly(ctx, [[35,82+bob],[48,82+bob],[47,108-liftL],[36,108-liftL]], DARK2);
  poly(ctx, [[52,82+bob],[65,82+bob],[64,108-liftR],[53,108-liftR]], DARK2);
  for (const [x, lift] of [[41, liftL], [58, liftR]] as const) {
    poly(ctx, [[x-7,106-lift],[x+7,106-lift],[x+8,127-lift],[x+11,133-lift],[x-10,133-lift],[x-8,127-lift]], '#2a2420');
    poly(ctx, [[x-7,106-lift],[x+7,106-lift],[x+7,114-lift],[x-7,114-lift]], LEATH);
  }

  // Tronco, túnica, faixa, bolsa, ombros e cachecol respiram em torno do centro do corpo.
  ctx.save();
  ctx.translate(0, bob);
  if (!walking) {
    ctx.translate(50, 70);
    ctx.scale(1, 1 + breath * 0.012);
    ctx.translate(-50, -70);
  }
  poly(ctx, [[32,48],[68,48],[66,84],[34,84]], DARK);
  poly(ctx, [[38,50],[62,50],[60,70],[40,70]], '#e9e9ee');
  poly(ctx, [[41,70],[59,70],[61,112],[50,118],[39,112]], '#f1f1f5');
  poly(ctx, [[50,70],[59,70],[61,112],[50,118]], '#cfcfd8');
  poly(ctx, [[47,76],[53,76],[53,106],[47,106]], P.main, '', 0);
  line(ctx, [[50,78],[50,104]], P.trim, 2.2);

  // Braços articulados a partir dos ombros; o deslocamento da mão afeta 40% do braço.
  ctx.save();
  ctx.translate(29, 50 + leftHandShift * 0.4);
  ctx.rotate(leftArmAngle);
  poly(ctx, [[-5,-8],[5,-10],[5,22],[-3,27],[-8,14]], DARK);
  poly(ctx, [[-8,20],[2,22],[1,32],[-7,32]], DARK2);
  ctx.restore();
  ctx.save();
  ctx.translate(71, 50 + rightHandShift * 0.4);
  ctx.rotate(rightArmAngle);
  poly(ctx, [[-5,-10],[5,-8],[8,14],[3,27],[-5,22]], DARK);
  poly(ctx, [[-2,22],[8,20],[7,32],[-1,32]], DARK2);
  ctx.restore();

  poly(ctx, [[30,56],[40,50],[70,76],[62,82]], LEATH);
  poly(ctx, [[33,82],[67,82],[67,89],[33,89]], LEATH2);
  poly(ctx, [[48,81],[53,81],[53,90],[48,90]], GOLD, OUT, 1);
  poly(ctx, [[27,86],[39,86],[39,99],[27,99]], LEATH);
  poly(ctx, [[27,86],[39,86],[39,91],[27,91]], LEATH2);
  poly(ctx, [[22,42],[50,38],[50,52],[28,60],[16,56]], P.light);
  poly(ctx, [[50,38],[78,42],[84,56],[72,60],[50,52]], P.main);
  line(ctx, [[16,56],[28,60],[50,52],[72,60],[84,56]], P.trim, 2);
  poly(ctx, [[34,42],[66,42],[62,56],[50,60],[38,56]], '#2b2b33');
  ctx.restore();

  // Capuz com atraso e inclinação próprios, sem rodar o personagem inteiro.
  const hoodTilt = walking ? Math.sin(phase + 0.9) * 0.035 : breath * 0.008;
  const hoodShift = walking ? Math.sin(phase * 2 + 0.6) * 0.9 : -breath * 0.7;
  ctx.save();
  ctx.translate(0, bob + hoodShift);
  ctx.translate(50, 54);
  ctx.rotate(hoodTilt);
  ctx.translate(-50, -54);
  poly(ctx, [[50,0],[26,16],[18,44],[28,58],[40,52],[32,32],[40,16]], P.main);
  poly(ctx, [[50,0],[74,16],[82,44],[72,58],[60,52],[68,32],[60,16]], P.dark);
  poly(ctx, [[50,0],[60,16],[40,16]], P.light);
  poly(ctx, [[40,16],[60,16],[68,32],[60,52],[50,56],[40,52],[32,32]], SKIN);
  line(ctx, [[40,16],[32,32],[40,52]], P.trim, 2.4);
  line(ctx, [[60,16],[68,32],[60,52]], P.trim, 2.4);
  line(ctx, [[40,16],[60,16]], P.trim, 2.4);
  // Halo e núcleo dos olhos continuam poligonais, sem shadowBlur.
  eye(ctx, P, 42, 36, -0.25);
  eye(ctx, P, 58, 36, 0.25);
  poly(ctx, [[46,10],[54,10],[56,18],[44,18]], null, P.trim, 1.4);
  ctx.restore();
  ctx.restore();
}
