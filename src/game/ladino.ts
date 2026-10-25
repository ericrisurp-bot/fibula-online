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

function eye(c: CanvasRenderingContext2D, p: Palette, cx: number, cy: number, rot: number, size = 1): void {
  c.save();
  c.globalAlpha = 0.35;
  poly(c, eyePoints(cx, cy, 6.5 * size * 1.5, 4.8 * size * 1.5, rot), p.glowEdge, p.glowEdge, 0.8);
  c.restore();
  poly(c, eyePoints(cx, cy, 6.5 * size, 4.8 * size, rot), p.glow, p.glow, 0.8);
}

export type LadinoDirection = 'front' | 'back' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right';
export type LadinoPose = { walking: boolean; phase: number; breath: number; carry: boolean; direction: LadinoDirection };

export function drawLadino(ctx: CanvasRenderingContext2D, classId: ClassId, r: number, pose: LadinoPose): void {
  const { walking, phase, breath, carry, direction } = pose;
  const isBack = direction === 'back' || direction === 'up-left' || direction === 'up-right';
  // Diagonais para cima usam a vista traseira em três quartos; não empilham a silhueta lateral.
  const isSide = direction === 'left' || direction === 'right' || direction === 'down-left' || direction === 'down-right';
  // Preserva mais volume corporal na vista lateral sem alargar as demais direções.
  const sideScale = 1;
  const k = carry ? 0.65 : 1;
  const sL = Math.sin(phase);
  const sR = Math.sin(phase + Math.PI);
  // Passada alternada: desloca cada perna para a frente e levanta pouco o pé.
  const strideL = walking ? sL * 4.5 * k : 0;
  const strideR = walking ? sR * 4.5 * k : 0;
  const liftL = walking ? Math.max(0, sL) * 4.5 * k : 0;
  const liftR = walking ? Math.max(0, sR) * 4.5 * k : 0;
  const bob = walking ? -Math.abs(Math.sin(phase)) * 2.4 * (carry ? 1.4 : 1) : -breath * 0.9;
  const sway = walking ? Math.sin(phase) * 2.2 : breath * 0.5;
  const leftArmAngle = walking ? (carry ? -0.30 : -sL * 0.22) : breath * 0.02;
  const rightArmAngle = walking ? (carry ? 0.30 : -sR * 0.22) : -breath * 0.02;
  const leftHandShift = walking ? (carry ? -3 : -sL * 5) : breath * 0.7;
  const rightHandShift = walking ? (carry ? -3 : -sR * 5) : breath * 0.7;

  ctx.save();
  const scale = 4.5 * r / 135; // Ladino 1,5x maior; preserva a proporção interna.
  ctx.translate(-50 * scale, r * 0.9 - 133 * scale);
  ctx.scale(scale * sideScale, scale);
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

  // Pernas e botas: passada alternada com deslocamento horizontal e elevação discreta.
  poly(ctx, [[35+strideL,82+bob],[48+strideL,82+bob],[47+strideL,108-liftL],[36+strideL,108-liftL]], DARK2);
  poly(ctx, [[52+strideR,82+bob],[65+strideR,82+bob],[64+strideR,108-liftR],[53+strideR,108-liftR]], DARK2);
  for (const [x, lift, stride] of [[41, liftL, strideL], [58, liftR, strideR]] as const) {
    poly(ctx, [[x-7+stride,106-lift],[x+7+stride,106-lift],[x+8+stride,127-lift],[x+11+stride,133-lift],[x-10+stride,133-lift],[x-8+stride,127-lift]], '#2a2420');
    poly(ctx, [[x-7+stride,106-lift],[x+7+stride,106-lift],[x+7+stride,114-lift],[x-7+stride,114-lift]], LEATH);
  }

  // Tronco, túnica, faixa, bolsa, ombros e cachecol respiram em torno do centro do corpo.
  ctx.save();
  ctx.translate(0, bob);
  if (!walking) {
    ctx.translate(50, 70);
    ctx.scale(1, 1 + breath * 0.012);
    ctx.translate(-50, -70);
  }
  // Volume do tronco: ombros em primeiro plano e faces de luz/sombra no peitoral.
  poly(ctx, [[30,48],[70,48],[67,84],[33,84]], '#171820');
  poly(ctx, [[31,49],[42,46],[50,53],[48,68],[37,72],[31,62]], '#41414c');
  poly(ctx, [[70,49],[58,46],[50,53],[52,68],[63,72],[69,62]], '#252630');
  poly(ctx, [[38,50],[62,50],[60,70],[40,70]], '#e9e9ee');
  poly(ctx, [[38,51],[47,53],[47,69],[40,70]], '#ffffff');
  poly(ctx, [[53,53],[62,51],[60,70],[53,72]], '#b9bbc6');
  poly(ctx, [[41,70],[59,70],[64,108],[50,118],[36,108]], '#f1f1f5');
  poly(ctx, [[41,72],[48,74],[47,112],[39,108]], '#ffffff');
  poly(ctx, [[53,73],[59,71],[64,108],[50,118],[50,78]], '#c1c3ce');
  poly(ctx, [[46,75],[54,75],[56,105],[50,111],[44,105]], '#e0e1e8', '', 0);
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
  // Ombreiras facetadas dão largura e separam o braço do peitoral.
  poly(ctx, [[22,42],[39,39],[50,45],[44,56],[28,60],[16,56]], P.light);
  poly(ctx, [[22,43],[30,44],[28,56],[16,56]], '#b7bac7');
  poly(ctx, [[50,45],[61,39],[78,42],[84,56],[72,60],[56,56]], P.main);
  poly(ctx, [[61,41],[78,43],[84,56],[72,57],[64,51]], P.light);
  poly(ctx, [[28,58],[44,54],[50,52],[56,54],[72,58],[68,64],[50,59],[32,64]], '#20212a');
  line(ctx, [[16,56],[28,60],[50,52],[72,60],[84,56]], P.trim, 2);
  poly(ctx, [[34,42],[66,42],[62,56],[50,60],[38,56]], '#2b2b33');
  ctx.restore();

  // A vista define a roupa visível, não apenas a abertura do rosto.
  if (isBack) {
    // Capa traseira contínua: oculta túnica, faixa e bolsa frontais.
    cape([[27,44],[73,44],[80,60],[76,94],[72,116],[61,130],[50,119],[39,130],[28,116],[24,94],[20,60]], P.dark);
    cape([[31,48],[50,51],[50,117],[39,125],[30,113],[28,88]], '#d7d8e0');
    cape([[50,51],[69,48],[72,88],[70,113],[61,125],[50,117]], '#bfc2cd');
    line(ctx, [[31,49],[28,88],[30,113],[39,125]], P.trim, 2.2);
    line(ctx, [[69,49],[72,88],[70,113],[61,125]], P.trim, 2.2);
    line(ctx, [[50,52],[50,117]], '#f0f0f4', 1.5);
    poly(ctx, [[44,45],[56,45],[59,52],[50,58],[41,52]], P.trim, OUT, 1);
  } else if (isSide) {
    // Perfil mais estreito: base contínua e apenas as faces laterais da túnica.
    poly(ctx, [[42,40],[58,40],[70,50],[66,68],[60,78],[63,105],[58,127],[42,127],[37,105],[40,78],[34,68],[30,50]], P.dark, OUT, 1.2);
    poly(ctx, [[44,43],[50,44],[48,75],[45,105],[47,124],[42,125],[37,103],[40,77],[35,67],[33,52]], '#d5d6df', OUT, 1.0);
    poly(ctx, [[50,44],[56,43],[67,52],[63,67],[58,77],[60,103],[55,124],[48,124],[51,105],[52,75]], '#bfc2cd', OUT, 1.0);

    line(ctx, [[44,44],[40,77],[42,103],[44,125]], P.trim, 1.8);
    line(ctx, [[56,44],[67,52],[63,67],[58,77],[60,103],[55,124]], P.trim, 1.8);
    poly(ctx, [[42,80],[58,80],[58,86],[42,86]], LEATH2);
    poly(ctx, [[48,80],[52,80],[52,86],[48,86]], GOLD, OUT, 1);

    // Uma única mão externa; o espelhamento global posiciona-a no lado correto.
    poly(ctx, [[56,55],[63,58],[64,77],[59,87],[53,83]], DARK);
    poly(ctx, [[55,80],[61,81],[60,90],[54,89]], DARK2);
  }

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
  // Faces frontais do capuz não são desenhadas no perfil para evitar sobreposição.
  if (!isSide) {
    poly(ctx, [[50,2],[60,16],[50,29],[40,16]], '#f2f2f6', '', 0);
    poly(ctx, [[50,2],[40,16],[26,20],[18,44],[32,32]], P.light, '', 0);
    poly(ctx, [[60,16],[74,20],[82,44],[68,32]], '#3a3a46', '', 0);
    poly(ctx, [[50,0],[60,16],[40,16]], P.light);
  }
  if (isBack) {
    // Vista traseira do mesmo capuz: preserva a silhueta e os acabamentos, sem mostrar o rosto.
    poly(ctx, [[40,16],[60,16],[68,32],[60,52],[50,56],[40,52],[32,32]], P.dark);
    poly(ctx, [[43,20],[57,20],[62,34],[56,48],[50,51],[44,48],[38,34]], P.main, P.trim, 1.5);
    line(ctx, [[50,21],[50,48]], P.light, 1.6);
  } else if (isSide) {
    // Perfil do capuz: contorno escuro e rosto estreito, sem desenhar olhos.
    poly(ctx, [[44,14],[58,14],[66,29],[63,42],[58,51],[50,55],[42,51],[37,39],[38,27]], P.dark, OUT, 1.2);
    poly(ctx, [[45,18],[56,18],[62,30],[58,43],[52,49],[46,46],[41,34]], SKIN, '', 0);
    line(ctx, [[44,16],[38,30],[44,50]], P.trim, 2.2);
    line(ctx, [[58,16],[66,30],[60,50]], P.trim, 2.2);
    line(ctx, [[44,16],[58,16]], P.trim, 2.2);
    // Os dois olhos ficam menores e próximos no perfil.
    eye(ctx, P, 46, 33, -0.15, 0.42);
    eye(ctx, P, 53, 33, -0.15, 0.42);
  } else {
    poly(ctx, [[40,16],[60,16],[68,32],[60,52],[50,56],[40,52],[32,32]], SKIN);
    line(ctx, [[40,16],[32,32],[40,52]], P.trim, 2.4);
    line(ctx, [[60,16],[68,32],[60,52]], P.trim, 2.4);
    line(ctx, [[40,16],[60,16]], P.trim, 2.4);
    // Olhos frontais reduzidos a 80% do tamanho original.
    eye(ctx, P, 42, 36, -0.25, 0.6);
    eye(ctx, P, 58, 36, 0.25, 0.6);
  }
  poly(ctx, [[46,10],[54,10],[56,18],[44,18]], null, P.trim, 1.4);
  ctx.restore();
  ctx.restore();
}
