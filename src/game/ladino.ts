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
  poly(ctx, [[41,70],[59,70],[65,119],[59,130],[50,133],[41,130],[35,119]], '#f1f1f5');
  poly(ctx, [[41,72],[48,74],[47,125],[41,129],[37,119]], '#ffffff');
  poly(ctx, [[53,73],[59,71],[65,119],[59,130],[50,133],[50,78]], '#c1c3ce');
  poly(ctx, [[46,75],[54,75],[56,122],[50,128],[44,122]], '#e0e1e8', '', 0);
  poly(ctx, [[47,76],[53,76],[53,125],[47,125]], P.main, '', 0);
  line(ctx, [[50,78],[50,125]], P.trim, 2.2);

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
    poly(ctx, [[42,40],[58,40],[70,50],[66,68],[60,78],[63,106],[59,130],[50,132],[41,130],[37,106],[40,78],[34,68],[30,50]], P.dark, OUT, 1.2);
    poly(ctx, [[44,43],[50,44],[48,75],[45,107],[47,128],[42,129],[37,105],[40,77],[35,67],[33,52]], '#f1f1f5', OUT, 1.0);
    poly(ctx, [[50,44],[56,43],[67,52],[63,67],[58,77],[60,105],[55,128],[48,128],[51,107],[52,75]], '#c1c3ce', OUT, 1.0);

    line(ctx, [[44,44],[40,77],[42,105],[44,129]], P.trim, 1.8);
    line(ctx, [[56,44],[67,52],[63,67],[58,77],[60,105],[55,128]], P.trim, 1.8);
    // A faixa central acompanha o caimento da túnica branca também no perfil.
    line(ctx, [[50,79],[51,101],[50,127]], P.trim, 2.2);
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
    // Facetas do capuz mantêm a cor da classe, com luz e sombra próprias.
    poly(ctx, [[50,2],[60,16],[50,29],[40,16]], P.dark, '', 0);
    poly(ctx, [[50,2],[40,16],[26,20],[18,44],[32,32]], P.light, '', 0);
    poly(ctx, [[60,16],[74,20],[82,44],[68,32]], P.dark, '', 0);
    poly(ctx, [[50,0],[60,16],[40,16]], P.light);
  }
  if (isBack) {
    // Vista traseira do mesmo capuz: preserva a silhueta e os acabamentos, sem mostrar o rosto.
    poly(ctx, [[40,16],[60,16],[68,32],[60,52],[50,56],[40,52],[32,32]], P.dark);
    poly(ctx, [[43,20],[57,20],[62,34],[56,48],[50,51],[44,48],[38,34]], P.main, P.trim, 1.5);
    line(ctx, [[50,21],[50,48]], P.light, 1.6);
  } else if (isSide) {
    // Silhueta do rosto em sombra, sem traços nem olhos.
    poly(ctx, [[44,14],[58,14],[66,29],[63,42],[58,51],[50,55],[42,51],[37,39],[38,27]], '#1c1d24', '#111218', 1.2);
    ctx.save();
    ctx.shadowColor = '#090a0f';
    ctx.shadowBlur = 8;
    poly(ctx, [[45,18],[56,18],[62,30],[58,43],[52,49],[46,46],[41,34]], '#292a32', '#41424c', 1.0);
    ctx.restore();
    line(ctx, [[44,16],[38,30],[44,50]], P.trim, 2.2);
    line(ctx, [[58,16],[66,30],[60,50]], P.trim, 2.2);
    line(ctx, [[44,16],[58,16]], P.trim, 2.2);
  } else {
    ctx.save();
    ctx.shadowColor = '#090a0f';
    ctx.shadowBlur = 8;
    poly(ctx, [[40,16],[60,16],[68,32],[60,52],[50,56],[40,52],[32,32]], '#292a32', '#41424c', 1.0);
    ctx.restore();
    line(ctx, [[40,16],[32,32],[40,52]], P.trim, 2.4);
    line(ctx, [[60,16],[68,32],[60,52]], P.trim, 2.4);
    line(ctx, [[40,16],[60,16]], P.trim, 2.4);
  }
  poly(ctx, [[46,10],[54,10],[56,18],[44,18]], null, P.trim, 1.4);
  ctx.restore();
  ctx.restore();
}
