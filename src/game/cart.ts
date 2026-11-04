import { CONFIG } from './config';

/**
 * Carrinho low-poly. Origem = centro do carrinho (cart.x, cart.y), chão em y = +20.
 * O burrinho e a carroça são renderizados como uma única ilustração lateral integrada.
 * As rodas usam a fase acumulada do deslocamento real do conjunto.
 */
export type CartDrawState = {
  x: number; y: number; angle: number; facingLeft?: boolean; facingAngle?: number; wheelPhase?: number;
  stage: 'broken' | 'built'; carried: boolean;
  inventory?: ReadonlyArray<{ quantity: number }>;
};

type Pt = readonly [number, number];

/** Escala da carroça (corpo, rodas e detalhes); o burrinho mantém escala própria. */
export const CART_SCALE = 0.84;

const W = {
  d0: '#3b2416', d1: '#5a3a22', d2: '#7a4f2d', d3: '#94653a', d4: '#ad7a45', d5: '#c8935a', d6: '#e0b077',
  line: '#27170d',
  m0: '#4b535b', m1: '#6d7780', m2: '#98a2ab', m3: '#c5ccd2',
};

function poly(ctx: CanvasRenderingContext2D, pts: readonly Pt[], fill: string, stroke: string | null = W.line, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function rivet(ctx: CanvasRenderingContext2D, x: number, y: number, r = 1.3) {
  ctx.fillStyle = W.m3; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = W.m0; ctx.lineWidth = 0.5; ctx.stroke();
}

function loadFraction(c: CartDrawState): number {
  if (!c.inventory) return 0;
  const total = c.inventory.reduce((t, s) => t + s.quantity, 0);
  return Math.min(1, total / (CONFIG.cart.capacitySlots * CONFIG.cart.maxPerSlot));
}

// ---------- roda low-poly (vista lateral) ----------
function wheel(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, rot: number) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  const N = 12;
  const ring = (r: number) => Array.from({ length: N }, (_, i) => [Math.cos(i / N * Math.PI * 2) * r, Math.sin(i / N * Math.PI * 2) * r] as Pt);
  poly(ctx, ring(R), W.m0, W.line, 1.2);                       // aro de ferro
  poly(ctx, ring(R - 2.6), W.d1, null);                        // base escura
  const outer = ring(R - 2.6), inner = ring(R - 7);
  for (let i = 0; i < N; i++) {                                // gomos de madeira (aro)
    const j = (i + 1) % N;
    poly(ctx, [outer[i], outer[j], inner[j], inner[i]], i % 2 ? W.d3 : W.d4, W.line, 0.6);
  }
  for (let i = 0; i < 8; i++) {                                // raios
    const a = i / 8 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), px = -sa * 1.5, py = ca * 1.5;
    poly(ctx, [[ca * 3 + px, sa * 3 + py], [ca * (R - 7) + px, sa * (R - 7) + py], [ca * (R - 7) - px, sa * (R - 7) - py], [ca * 3 - px, sa * 3 - py]], i % 2 ? W.d5 : W.d4, W.line, 0.5);
  }
  poly(ctx, ring(4.2), W.m1, W.line, 0.8);                      // cubo
  poly(ctx, ring(2), W.m3, null);
  ctx.restore();
}

// ---------- vista lateral (frente = +x; o chamador espelha se o carrinho vai para a esquerda) ----------
function drawSide(ctx: CanvasRenderingContext2D, c: CartDrawState, rot: number) {
  const built = c.stage === 'built';
  const planksOn = built ? 4 : 0;
  const xl = (y: number) => -40 + (y + 30) * (4 / 26);
  const xr = (y: number) => 30 - (y + 30) * (4 / 26);
  ctx.save();
  ctx.translate(0, 3); // assenta a carroceria mais perto do chão

  // pé de apoio traseiro (curto e fino; a carroceria fica assentada mais perto do chão)
  poly(ctx, [[-34.5, -4], [-31.5, -4], [-31.5, 16], [-34.5, 16]], W.d1, W.line, 0.9);
  poly(ctx, [[-37, 14.5], [-29, 14.5], [-29, 17], [-37, 17]], W.d0, W.line, 0.9);

  // caixa: parede distante (interior)
  poly(ctx, [[-37, -39], [28, -39], [31, -35], [-40, -35]], W.d1, W.line, 0.9);
  poly(ctx, [[-36, -35], [29, -35], [30, -30], [-39, -30]], W.d0, null);

  if (built || planksOn > 0) {
    // armação visível (quadros) sempre
    // tábuas da parede próxima, de cima para baixo
    const tones = [W.d5, W.d4, W.d5, W.d3];
    for (let i = 0; i < 4; i++) {
      if (!built && (3 - i) >= planksOn) continue;
      const y0 = -30 + i * 6.5, y1 = y0 + 6.5;
      poly(ctx, [[xl(y0), y0], [xr(y0), y0], [xr(y1), y1], [xl(y1), y1]], tones[i], W.line, 0.9);
      ctx.strokeStyle = 'rgba(255,225,170,.35)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(xl(y0) + 3, y0 + 1.3); ctx.lineTo(xr(y0) - 3, y0 + 1.3); ctx.stroke();
      ctx.strokeStyle = 'rgba(40,22,10,.35)';
      ctx.beginPath(); ctx.moveTo(xl(y0) + 6, y0 + 4.2); ctx.lineTo(xl(y0) + 16, y0 + 4.2); ctx.moveTo(xr(y0) - 18, y0 + 3.4); ctx.lineTo(xr(y0) - 8, y0 + 3.4); ctx.stroke();
    }
  }
  // moldura inferior e montantes (sempre visíveis — é o esqueleto do carrinho)
  poly(ctx, [[-37, -5], [27, -5], [26, -2], [-36, -2]], W.d1, W.line, 0.9);
  for (const px of [-37, 25]) poly(ctx, [[px, -33], [px + 4.2, -33], [px + 3.2, -3], [px - 1, -3]], W.d2, W.line, 0.9);
  if (built || planksOn >= 2) {
    for (const bx of [-12, 12]) poly(ctx, [[bx, -30], [bx + 4, -30], [bx + 4, -5], [bx, -5]], W.d2, W.line, 0.8);
  }
  if (built) {
    // faixa de ferro + rebites
    poly(ctx, [[xl(-19), -19], [xr(-19), -19], [xr(-15.5), -15.5], [xl(-15.5), -15.5]], W.m1, W.line, 0.8);
    poly(ctx, [[xl(-19), -19], [xr(-19), -19], [xr(-18), -18], [xl(-18), -18]], W.m2, null);
    for (const px of [-34, -12, 10, 24]) rivet(ctx, px, -17.2);
    // cantoneiras
    for (const sx of [-1, 1]) {
      const ex = sx < 0 ? xl(-30) : xr(-30);
      poly(ctx, [[ex, -30], [ex + sx * -6, -30], [ex + sx * -6, -24], [ex, -24]], W.m1, W.line, 0.7);
      poly(ctx, [[ex, -7], [ex + sx * -6, -7], [ex + sx * -6, -2], [ex, -2]], W.m1, W.line, 0.7);
      rivet(ctx, ex + sx * -3, -27, 1); rivet(ctx, ex + sx * -3, -4.5, 1);
    }
    // borda superior iluminada
    poly(ctx, [[-41, -35], [32, -35], [30, -30], [-40, -30]], W.d6, W.line, 0.9);
    poly(ctx, [[-41, -35], [32, -35], [31, -33.5], [-41, -33.5]], '#f1cb92', null);
  } else {
    poly(ctx, [[-41, -35], [-16, -35], [-17, -31.5], [-40, -31.5]], W.d5, W.line, 0.8); // pedaço de borda quebrado
  }

  // carga
  const l = loadFraction(c);
  if (built && l > 0) {
    const h = 6 + 16 * l;
    poly(ctx, [[-34, -34], [-28, -34 - h * 0.7], [-16, -34 - h * 0.95], [-2, -34 - h], [12, -34 - h * 0.85], [22, -34 - h * 0.5], [26, -34]], W.d2, W.line, 0.9);
    poly(ctx, [[-28, -34 - h * 0.7], [-16, -34 - h * 0.95], [-14, -34], [-30, -34]], W.d3, W.line, 0.8);
    poly(ctx, [[-16, -34 - h * 0.95], [-2, -34 - h], [0, -34], [-14, -34]], W.d4, W.line, 0.8);
    poly(ctx, [[-2, -34 - h], [12, -34 - h * 0.85], [10, -34], [0, -34]], W.d3, W.line, 0.8);
    poly(ctx, [[12, -34 - h * 0.85], [22, -34 - h * 0.5], [26, -34], [10, -34]], W.d2, W.line, 0.8);
  }

  // roda (frente da parede), sempre visível
  wheel(ctx, -2, 0, 17, rot);

  ctx.restore();
}

function drawDonkey(
  ctx: CanvasRenderingContext2D,
  time: number,
  angle: number,
  wheelPhase: number,
  moving: boolean,
  broken: boolean,
  facingLeftOverride?: boolean,
) {
  const bob = moving && !broken ? Math.sin(wheelPhase * 2) * 1.1 : Math.sin(time * 2.1) * 1.2;
  const gait = moving && !broken ? wheelPhase : 0;
  // Perfil lateral permanente; o conjunto só espelha entre esquerda e direita.
  const side = true;
  const facingLeft = facingLeftOverride ?? Math.cos(angle) < 0;
  const facingDown = Math.sin(angle) > 0;
  const frontView = facingDown;
  const coat = W.d3;
  const coatLight = W.d6;
  const coatMid = W.d4;
  const coatDark = W.d1;
  const outline = W.line;
  const contour = 0.9;

  ctx.save();
  ctx.translate(0, bob);

  // Sombra no chão, sempre independente da orientação do corpo.
  ctx.fillStyle = 'rgba(8,7,5,.24)';
  ctx.beginPath();
  ctx.ellipse(0, 18, side ? 25 : 17, side ? 8 : 24, 0, 0, Math.PI * 2);
  ctx.fill();

  if (side) {
    // Perfil: a arte permanece em pé; esquerda é apenas espelhamento horizontal.
    ctx.save();
    ctx.scale(facingScaleX, 1);
    // Pernas distantes primeiro, mais escuras e ligeiramente recuadas.
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? -12 : 8;
      const swing = moving && !broken ? Math.sin(gait + i * Math.PI) * 4 : 0;
      ctx.strokeStyle = W.d0; ctx.lineWidth = 7.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, 5); ctx.lineTo(x + swing * .55, 17); ctx.stroke();
      ctx.strokeStyle = W.d2; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - 1, 8); ctx.lineTo(x - 1 + swing * .55, 16); ctx.stroke();
    }
    // Pernas próximas, em primeiro plano.
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? -5 : 15;
      const swing = moving && !broken ? Math.sin(gait + Math.PI + i * Math.PI) * 4 : 0;
      ctx.strokeStyle = coatDark; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x + swing, 19); ctx.stroke();
      ctx.strokeStyle = '#b49a75'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x - 1, 8); ctx.lineTo(x - 1 + swing, 17); ctx.stroke();
      poly(ctx, [[x + swing - 2.5, 17], [x + swing + 3, 17], [x + swing + 3.5, 20], [x + swing - 2, 20]], W.d0, outline, .7);
    }

    // Cauda, com pequeno balanço ligado ao passo.
    ctx.strokeStyle = coatDark; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-21, -3); ctx.quadraticCurveTo(-31, 1 + Math.sin(gait) * 1.5, -29, 10); ctx.stroke();
    ctx.strokeStyle = W.d0; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-29, 8); ctx.lineTo(-32, 12); ctx.stroke();

    // Corpo volumétrico em três planos de luz.
    ctx.fillStyle = coatDark; ctx.strokeStyle = outline; ctx.lineWidth = contour;
    ctx.beginPath(); ctx.ellipse(-2, 0, 22, 12, -.08, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = coat; ctx.beginPath(); ctx.ellipse(1, -2, 18, 9.5, -.08, Math.PI * 1.05, Math.PI * 2.02); ctx.fill();
    poly(ctx, [[-13, -6], [-3, -10], [10, -8], [17, -2], [10, 2], [-7, 3]], coatLight, null);
    poly(ctx, [[-17, 2], [-5, 4], [10, 3], [16, 0], [12, 7], [-8, 9]], W.d2, null);

    // Pescoço e cabeça com bochecha/focinho claros.
    const headBob = moving && !broken ? Math.sin(gait * 2) * 1.2 : Math.sin(time * 2.1) * .45;
    ctx.save(); ctx.translate(0, headBob);
    poly(ctx, [[8, -8], [16, -19], [25, -18], [30, -10], [25, -3], [14, 1]], coatDark, outline, contour);
    poly(ctx, [[10, -9], [18, -21], [27, -19], [29, -11], [22, -5], [13, -2]], coatMid, outline, contour);
    poly(ctx, [[18, -17], [24, -21], [29, -16], [26, -10]], coatLight, null);
    ctx.fillStyle = W.d6; ctx.strokeStyle = outline; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.ellipse(30, -12, 7, 4.5, -.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    poly(ctx, [[24, -18], [21, -34], [26, -31], [29, -18]], coatMid, outline, contour);
    poly(ctx, [[29, -17], [32, -31], [36, -26], [34, -15]], coat, outline, contour);
    poly(ctx, [[23, -23], [24, -31], [26, -27]], W.d0, null);
    poly(ctx, [[31, -23], [34, -29], [34, -22]], W.d0, null);
    // Crina curta ao longo da nuca.
    poly(ctx, [[13, -19], [17, -25], [18, -21], [21, -28], [22, -20], [25, -24], [24, -16]], W.d0, outline, .6);
    ctx.fillStyle = '#171512'; ctx.beginPath(); ctx.arc(29, -17, 1.35, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = W.d0; ctx.beginPath(); ctx.arc(35, -12, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Arreio, peitoral e tiras de couro.
    ctx.strokeStyle = W.d0; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(-14, -9); ctx.quadraticCurveTo(-9, 0, -14, 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(11, -11); ctx.quadraticCurveTo(17, -3, 11, 7); ctx.stroke();
    ctx.strokeStyle = W.d5; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-13, -8); ctx.quadraticCurveTo(-8, 0, -13, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12, -10); ctx.quadraticCurveTo(18, -2, 12, 6); ctx.stroke();
    poly(ctx, [[8, -7], [15, -5], [17, 0], [10, 2]], W.d2, outline, .8);
    rivet(ctx, 13, -2, 1);
    ctx.restore();
  } else if (frontView) {
    // Vista frontal e 3/4 descendo: quadril junto à carroça, cabeça voltada para baixo.
    ctx.save();

    // 1) Cauda e quadril ficam no alto, atrás do tronco.
    ctx.strokeStyle = W.d1; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-11, -11); ctx.quadraticCurveTo(-17 + Math.sin(gait) * 2, -18, -18, -23); ctx.stroke();
    ctx.strokeStyle = W.d0; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-18, -21); ctx.lineTo(-21, -25); ctx.stroke();

    // 2) Tronco largo, com luz superior e planos laterais.
    ctx.fillStyle = coatDark; ctx.strokeStyle = outline; ctx.lineWidth = contour;
    ctx.beginPath(); ctx.ellipse(0, -2, 18, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    poly(ctx, [[-16, -9], [-13, -16], [-7, -19], [7, -19], [14, -13], [17, -4], [14, 8], [7, 14], [-8, 14], [-15, 8]], coatMid, null);
    poly(ctx, [[-14, -10], [-10, -17], [-2, -18], [0, 10], [-10, 8]], coatLight, null);
    poly(ctx, [[1, -18], [9, -16], [15, -8], [13, 9], [2, 13]], W.d2, null);

    // 3) Peitoral restrito à junção peito/pescoço; não atravessa a face.
    ctx.strokeStyle = W.d0; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.quadraticCurveTo(0, 7, 11, 0); ctx.stroke();
    ctx.strokeStyle = W.d5; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(0, 6, 10, 0); ctx.stroke();
    rivet(ctx, 0, 4, 1);

    // 4) Pernas traseiras nas laterais do tronco.
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? -12 : 12;
      const swing = moving && !broken ? Math.sin(gait + i * Math.PI) * 3 : 0;
      ctx.strokeStyle = W.d0; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, -1); ctx.lineTo(x + swing * .4, 13); ctx.stroke();
      poly(ctx, [[x + swing - 3.5, 11], [x + swing + 3.5, 11], [x + swing + 4, 15], [x + swing - 3, 15]], W.d0, outline, contour);
    }

    // 5) Pernas dianteiras saem do peito, abertas nas laterais da cabeça.
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? -12 : 12;
      const swing = moving && !broken ? Math.sin(gait + Math.PI + i * Math.PI) * 3.5 : 0;
      ctx.strokeStyle = coatDark; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x + swing, 20); ctx.stroke();
      ctx.strokeStyle = '#b49a75'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(x - 1, 5); ctx.lineTo(x - 1 + swing, 17); ctx.stroke();
      poly(ctx, [[x + swing - 4, 18], [x + swing + 4, 18], [x + swing + 4.5, 22], [x + swing - 3.5, 22]], W.d0, outline, contour);
    }

    // 6) Pescoço e cabeça são desenhados por cima das pernas e do peitoral.
    const headBob = moving && !broken ? Math.sin(gait * 2) * 1.1 : Math.sin(time * 2.1) * .4;
    ctx.save(); ctx.translate(0, 10 + headBob);

    // Pescoço liga o peito à cabeça; fica por cima das pernas e atrás da face.
    poly(ctx, [[-8, -8], [-8, -15], [-4, -19], [4, -19], [8, -15], [8, -8], [7, 5], [5, 11], [-5, 11], [-7, 5]], coatMid, outline, contour);
    poly(ctx, [[-6, -9], [-4, -16], [0, -17], [0, 8], [-5, 7]], coatLight, null);
    poly(ctx, [[1, -17], [5, -15], [7, -7], [5, 8], [1, 9]], W.d2, null);

    // Orelhas pertencem à cabeça: nascem acima da testa e ficam visíveis.
    poly(ctx, [[-8, -7], [-14, -24], [-7, -21], [-2, -8]], coatMid, outline, contour);
    poly(ctx, [[3, -8], [9, -24], [16, -19], [10, -5]], coat, outline, contour);
    poly(ctx, [[-10, -11], [-12, -21], [-8, -18]], W.d0, null);
    poly(ctx, [[9, -12], [13, -20], [13, -14]], W.d0, null);

    // Crina entre as orelhas e descendo pelo pescoço.
    poly(ctx, [[-5, -12], [-2, -18], [1, -13], [4, -20], [7, -12], [9, -5], [5, 1], [1, -4], [-3, 2]], W.d0, outline, contour);

    // Cabeça: testa, olhos e focinho claro na extremidade inferior.
    poly(ctx, [[-11, -10], [-13, -3], [-11, 5], [-7, 10], [0, 12], [7, 10], [11, 5], [13, -3], [10, -10], [5, -14], [-5, -14]], coatMid, outline, 1.4);
    poly(ctx, [[-10, -8], [-6, -13], [0, -13], [0, 8], [-8, 7]], coatLight, null);
    poly(ctx, [[1, -13], [7, -12], [11, -7], [9, 7], [2, 9]], W.d2, null);
    ctx.fillStyle = '#171512';
    ctx.beginPath(); ctx.arc(-6, -3, 1.5, 0, Math.PI * 2); ctx.arc(6, -3, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = W.d6; ctx.strokeStyle = outline; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 7, 9, 5.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = W.d0; ctx.beginPath(); ctx.arc(0, 8, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.restore();
  } else {
    // Vista traseira e 3/4 subindo: bloco original preservado.
    ctx.save();
    // Pernas distantes atrás do corpo.
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? -10 : 10;
      const swing = moving && !broken ? Math.sin(gait + i * Math.PI) * 3.5 : 0;
      ctx.strokeStyle = W.d0; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, 7); ctx.lineTo(x + swing * .4, 19); ctx.stroke();
    }
    // Corpo: dorso e laterais em planos facetados.
    ctx.fillStyle = coatDark; ctx.strokeStyle = outline; ctx.lineWidth = contour;
    ctx.beginPath(); ctx.ellipse(0, 1, 18, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    poly(ctx, [[-16, -7], [-13, -15], [-7, -18], [7, -18], [14, -12], [17, -3], [15, 10], [8, 16], [-8, 16], [-15, 9]], coatMid, null);
    poly(ctx, [[-14, -8], [-10, -15], [-2, -16], [0, 13], [-10, 10]], coatLight, null);
    poly(ctx, [[1, -16], [9, -15], [15, -7], [13, 10], [2, 15]], W.d2, null);
    // Pernas próximas em primeiro plano.
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? -11 : 11;
      const swing = moving && !broken ? Math.sin(gait + Math.PI + i * Math.PI) * 3.5 : 0;
      ctx.strokeStyle = coatDark; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x + swing, 20); ctx.stroke();
      ctx.strokeStyle = '#b49a75'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 1, 10); ctx.lineTo(x - 1 + swing, 18); ctx.stroke();
      poly(ctx, [[x + swing - 4, 18], [x + swing + 4, 18], [x + swing + 4.5, 22], [x + swing - 3.5, 22]], W.d0, W.line, contour);
    }

    // Arreio traseiro recebe os varais; o peitoral aparece na vista frontal.
    ctx.strokeStyle = W.d0; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(-10, frontView ? -8 : 8); ctx.quadraticCurveTo(0, frontView ? -13 : 13, 10, frontView ? -8 : 8); ctx.stroke();
    ctx.strokeStyle = W.d5; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-9, frontView ? -8 : 8); ctx.quadraticCurveTo(0, frontView ? -12 : 12, 9, frontView ? -8 : 8); ctx.stroke();

    // Cauda visível na vista traseira; peito/peitoral na vista frontal.
    // Cauda aparece também de frente, saindo de trás do quadril.
    ctx.strokeStyle = W.d1; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(frontView ? -12 : 0, 12); ctx.quadraticCurveTo((frontView ? -17 : 4) + Math.sin(gait) * 2, 22, frontView ? -18 : 1, 27); ctx.stroke();
    ctx.strokeStyle = W.d0; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(frontView ? -18 : 1, 25); ctx.lineTo(frontView ? -21 : -2, 29); ctx.stroke();
    if (frontView) {
      ctx.strokeStyle = W.d0; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-10, 5); ctx.quadraticCurveTo(0, 12, 10, 5); ctx.stroke();
      ctx.strokeStyle = W.d5; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-9, 5); ctx.quadraticCurveTo(0, 11, 9, 5); ctx.stroke();
      rivet(ctx, 0, 8, 1);
    }

    // Cabeça alinhada ao eixo vertical, com duas orelhas e focinho claro.
    const headY = frontView ? 19 : -19;
    const headTilt = moving && !broken ? Math.sin(gait * 2) * 1.1 : Math.sin(time * 2.1) * .4;
    ctx.save(); ctx.translate(0, headY + headTilt);
    const sign = frontView ? -1 : 1;
    poly(ctx, [[-12, sign * 2], [-14, sign * -6], [-11, sign * -13], [-6, sign * -17], [0, sign * -18], [6, sign * -17], [11, sign * -13], [14, sign * -6], [12, sign * 2]], coatMid, outline, 1.4);
    poly(ctx, [[-11, sign * -5], [-7, sign * -14], [0, sign * -16], [0, sign * 1], [-9, sign * 1]], coatLight, null);
    poly(ctx, [[-8, sign * -12], [-15, sign * -30], [-6, sign * -28], [-1, sign * -13]], coatMid, outline, contour);
    poly(ctx, [[2, sign * -13], [8, sign * -31], [16, sign * -26], [10, sign * -9]], coat, outline, contour);
    poly(ctx, [[-12, sign * -21], [-10, sign * -28], [-6, sign * -25]], W.d0, null);
    poly(ctx, [[9, sign * -21], [13, sign * -27], [14, sign * -22]], W.d0, null);
    if (frontView) {
      ctx.fillStyle = '#171512';
      ctx.beginPath(); ctx.arc(-7, -8, 1.5, 0, Math.PI * 2); ctx.arc(7, -8, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = W.d6; ctx.strokeStyle = outline; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = W.d0; ctx.beginPath(); ctx.arc(0, 1, 1.2, 0, Math.PI * 2); ctx.fill();
    } else {
      poly(ctx, [[-5, sign * -2], [0, sign * 2], [5, sign * -2]], W.d2, outline, .8);
    }
    poly(ctx, [[-7, sign * -13], [-3, sign * -20], [0, sign * -14], [4, sign * -21], [8, sign * -12]], W.d0, null);
    // Crina curta e franja também legíveis na vista frontal e traseira.
    poly(ctx, [[-5, sign * -14], [-2, sign * -18], [1, sign * -14], [4, sign * -19], [7, sign * -12]], W.d1, W.line, contour);
    ctx.restore();
    ctx.restore();
  }
  ctx.restore();
}
export function drawCart(ctx: CanvasRenderingContext2D, cart: CartDrawState, nearby: boolean, time: number, moving: boolean, wheelPhase?: number) {
  const { x, y, angle, stage, carried } = cart;
  // A escala horizontal interpolada faz o perfil virar no próprio eixo sem
  // mover a composição nem desenhar um arco de reposicionamento.
  const facingAngle = cart.facingAngle ?? ((cart.facingLeft ?? Math.cos(angle) < 0) ? Math.PI : 0);
  const facingScaleX = Math.cos(facingAngle);
  const rot = wheelPhase ?? (moving ? time * 8 : 0);
  // Composição visual única: o burrinho fica à frente e encostado à carroça.
  // A pose física continua pertencendo ao conjunto; não há eixo/varal desenhado
  // nem um segundo sprite posicionado por uma distância independente.
  const donkeyX = 30;
  const donkeyY = -5;

  ctx.save();
  ctx.translate(x, y);

  // A sombra acompanha a silhueta lateral fixa do conjunto.
  ctx.save();
  ctx.scale(CART_SCALE, CART_SCALE);
  ctx.fillStyle = 'rgba(10,16,12,.20)';
  ctx.beginPath(); ctx.ellipse(1, 21, 50, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(8,12,9,.26)';
  ctx.beginPath(); ctx.ellipse(1, 21, 40, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Espelha o conjunto inteiro uma única vez: posição e orientação do burrinho
  // e da carroça permanecem coerentes nos dois sentidos.
  ctx.save();
  ctx.scale(facingLeft ? -1 : 1, 1);

  // O burrinho e a carroça compartilham a mesma transformação visual.
  // O perfil base aponta para a direita; o espelhamento externo vira ambos.
  ctx.save(); ctx.translate(donkeyX, donkeyY);
  drawDonkey(ctx, time, angle, rot, moving && stage === 'built', stage === 'broken', false);
  ctx.restore();

  if (nearby) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    ctx.beginPath(); ctx.ellipse(0, 4, 62 + pulse * 4, 38 + pulse * 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(210,180,125,${0.07 + pulse * 0.06})`; ctx.fill();
    ctx.strokeStyle = `rgba(230,200,150,${0.3 + pulse * 0.35})`; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // A carroça fica atrás do burrinho nos dois sentidos, sem eixo ou varais.
  ctx.save();
  ctx.translate(-18, 0);
  ctx.scale(CART_SCALE, CART_SCALE);
  drawSide(ctx, cart, rot);
  ctx.restore();
  ctx.restore();

  if (carried) {
    ctx.strokeStyle = 'rgba(235,235,235,.65)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(0, -3, 70, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}
