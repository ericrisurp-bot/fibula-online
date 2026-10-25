import type { ClassId } from './config';

type Palette = {
  main: string;
  light: string;
  dark: string;
  trim: string;
  glow: string;
  glowEdge: string;
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

export function drawLadino(ctx: CanvasRenderingContext2D, _classId: ClassId, r: number): void {
  ctx.save();
  const s = 3.0 * r / 135;
  ctx.translate(-50 * s, r * 0.9 - 133 * s);
  ctx.scale(s, s);
  const P: Palette = { main: '#e2e3e9', light: '#f5f5f8', dark: '#b8bbc5', trim: '#d9b45a', glow: '#8ffaff', glowEdge: '#00cfff' };

  // Capa traseira
  poly(ctx, [[27,46],[73,46],[84,96],[78,122],[66,112],[58,128],[50,114],[42,128],[34,112],[22,122],[16,96]], P.dark);
  poly(ctx, [[27,46],[50,46],[50,114],[42,128],[34,112],[22,122],[16,96]], P.main);

  // Pernas e botas
  poly(ctx, [[35,82],[48,82],[47,108],[36,108]], DARK2);
  poly(ctx, [[52,82],[65,82],[64,108],[53,108]], DARK2);
  for (const x of [41, 58]) {
    poly(ctx, [[x-7,106],[x+7,106],[x+8,127],[x+11,133],[x-10,133],[x-8,127]], '#2a2420');
    poly(ctx, [[x-7,106],[x+7,106],[x+7,114],[x-7,114]], LEATH);
  }

  // Tronco e túnica
  poly(ctx, [[32,48],[68,48],[66,84],[34,84]], DARK);
  poly(ctx, [[38,50],[62,50],[60,70],[40,70]], '#e9e9ee');
  poly(ctx, [[41,70],[59,70],[61,112],[50,118],[39,112]], '#f1f1f5');
  poly(ctx, [[50,70],[59,70],[61,112],[50,118]], '#cfcfd8');
  poly(ctx, [[47,76],[53,76],[53,106],[47,106]], P.main, '', 0);
  line(ctx, [[50,78],[50,104]], P.trim, 2.2);

  // Braços e luvas
  poly(ctx, [[24,50],[34,48],[34,80],[26,84],[21,72]], DARK);
  poly(ctx, [[66,48],[76,50],[79,72],[74,84],[66,80]], DARK);
  poly(ctx, [[21,78],[31,80],[30,90],[22,90]], DARK2);
  poly(ctx, [[69,80],[79,78],[78,90],[70,90]], DARK2);

  // Faixa, cinto e bolsa
  poly(ctx, [[30,56],[40,50],[70,76],[62,82]], LEATH);
  poly(ctx, [[33,82],[67,82],[67,89],[33,89]], LEATH2);
  poly(ctx, [[48,81],[53,81],[53,90],[48,90]], GOLD, OUT, 1);
  poly(ctx, [[27,86],[39,86],[39,99],[27,99]], LEATH);
  poly(ctx, [[27,86],[39,86],[39,91],[27,91]], LEATH2);

  // Ombros e cachecol
  poly(ctx, [[22,42],[50,38],[50,52],[28,60],[16,56]], P.light);
  poly(ctx, [[50,38],[78,42],[84,56],[72,60],[50,52]], P.main);
  line(ctx, [[16,56],[28,60],[50,52],[72,60],[84,56]], P.trim, 2);
  poly(ctx, [[34,42],[66,42],[62,56],[50,60],[38,56]], '#2b2b33');

  // Capuz e rosto
  poly(ctx, [[50,0],[26,16],[18,44],[28,58],[40,52],[32,32],[40,16]], P.main);
  poly(ctx, [[50,0],[74,16],[82,44],[72,58],[60,52],[68,32],[60,16]], P.dark);
  poly(ctx, [[50,0],[60,16],[40,16]], P.light);
  poly(ctx, [[40,16],[60,16],[68,32],[60,52],[50,56],[40,52],[32,32]], SKIN);
  line(ctx, [[40,16],[32,32],[40,52]], P.trim, 2.4);
  line(ctx, [[60,16],[68,32],[60,52]], P.trim, 2.4);
  line(ctx, [[40,16],[60,16]], P.trim, 2.4);

  // Olhos brilhantes sem shadowBlur
  eye(ctx, P, 42, 36, -0.25);
  eye(ctx, P, 58, 36, 0.25);
  poly(ctx, [[46,10],[54,10],[56,18],[44,18]], null, P.trim, 1.4);
  ctx.restore();
}
