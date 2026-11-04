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

  // varal distante (mais escuro)
  poly(ctx, [[-30, -12], [50, -8], [50, -5], [-30, -8]], W.d0, W.line, 0.8);

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

  // varal próximo (à frente da roda) e punho
  poly(ctx, [[-32, -9], [51, -4], [51, 0], [-32, -5]], W.d3, W.line, 0.9);
  poly(ctx, [[-32, -9], [51, -4], [51, -3], [-32, -8]], W.d5, null);
  poly(ctx, [[46, -10], [54, -10], [54, 4], [46, 4]], W.m0, W.line, 0.8);           // garra de ferro
  poly(ctx, [[47, -9], [53, -9], [53, 3], [47, 3]], W.d4, W.line, 0.7);              // barra do punho
  poly(ctx, [[47, -9], [53, -9], [53, -7], [47, -7]], W.d6, null);
  rivet(ctx, 50, -4.5, 1);
  ctx.restore();
}

// ---------- vista de cima (alça para cima se movingUp, para baixo caso contrário) ----------
function drawTop(ctx: CanvasRenderingContext2D, c: CartDrawState, movingUp: boolean, rot: number) {
  const built = c.stage === 'built';
  const planksOn = built ? 4 : 0;
  const dir = movingUp ? -1 : 1;                 // lado da alça (onde está o jogador)

  const handle = () => {
    for (const sx of [-1, 1]) {
      poly(ctx, [[sx * 14 - 2.2, dir * 28], [sx * 14 + 2.2, dir * 28], [sx * 13 + 2.2, dir * 50], [sx * 13 - 2.2, dir * 50]], W.d3, W.line, 0.9);
      poly(ctx, [[sx * 14 - 2.2, dir * 28], [sx * 14 - 0.6, dir * 28], [sx * 13 - 0.6, dir * 50], [sx * 13 - 2.2, dir * 50]], W.d5, null);
    }
    poly(ctx, [[-17, dir * 50 - 2.6], [17, dir * 50 - 2.6], [17, dir * 50 + 2.6], [-17, dir * 50 + 2.6]], W.d4, W.line, 0.9);
    poly(ctx, [[-17, dir * 50 - 2.6], [17, dir * 50 - 2.6], [17, dir * 50 - 1], [-17, dir * 50 - 1]], W.d6, null);
    for (const sx of [-1, 1]) poly(ctx, [[sx * 17 - 2, dir * 50 - 3], [sx * 17 + 2, dir * 50 - 3], [sx * 17 + 2, dir * 50 + 3], [sx * 17 - 2, dir * 50 + 3]], W.m1, W.line, 0.7);
  };
  if (movingUp) handle();

  // rodas laterais (lâminas finas com banda de rodagem animada)
  for (const sx of [-1, 1]) {
    const cx = sx * 35;
    poly(ctx, [[cx - 4.5, -10], [cx + 4.5, -10], [cx + 4.5, 20], [cx - 4.5, 20]], W.m0, W.line, 1);
    poly(ctx, [[cx - 3, -9], [cx + 3, -9], [cx + 3, 19], [cx - 3, 19]], W.d1, null);
    ctx.save(); ctx.beginPath(); ctx.rect(cx - 3, -9, 6, 28); ctx.clip();
    const phase = ((rot * 17) % 7 + 7) % 7;
    ctx.strokeStyle = W.d4; ctx.lineWidth = 1.5;
    for (let y = -9 + phase - 7; y < 19; y += 7) { ctx.beginPath(); ctx.moveTo(cx - 3, y); ctx.lineTo(cx + 3, y); ctx.stroke(); }
    ctx.restore();
    poly(ctx, [[cx - 1.2, -11], [cx + 1.2, -11], [cx + 1.2, 21], [cx - 1.2, 21]], W.m1, null);
  }

  // parede distante (lado oposto ao da alça fica atrás; usamos a de cima como "fundo")
  poly(ctx, [[-27, -31], [27, -31], [30, -26], [-30, -26]], W.d3, W.line, 0.9);
  // interior da caixa
  poly(ctx, [[-30, -26], [30, -26], [28, 18], [-28, 18]], W.d0, W.line, 0.9);
  const rows = 5;
  for (let i = 0; i < rows; i++) {
    const y0 = -26 + i * (44 / rows), y1 = y0 + 44 / rows;
    const on = built || (rows - 1 - i) < planksOn + 1;
    if (!on) continue;
    const l0 = -30 + (y0 + 26) * (2 / 44), l1 = -30 + (y1 + 26) * (2 / 44);
    poly(ctx, [[l0 + 2, y0 + 0.5], [-l0 - 2, y0 + 0.5], [-l1 - 2, y1 - 0.5], [l1 + 2, y1 - 0.5]], i % 2 ? W.d2 : W.d1, W.d0, 0.8);
  }
  // paredes laterais (espessura vista de cima)
  for (const sx of [-1, 1]) {
    poly(ctx, [[sx * 30, -26], [sx * 24.5, -24], [sx * 23.5, 17], [sx * 28, 18]], built ? W.d3 : W.d2, W.line, 0.9);
    poly(ctx, [[sx * 30, -26], [sx * 27.5, -25], [sx * 26.5, 17.5], [sx * 28, 18]], built ? W.d5 : W.d3, null);
  }

  // carga
  const l = loadFraction(c);
  if (built && l > 0) {
    const s = 0.4 + 0.6 * l;
    poly(ctx, [[-20 * s, 8], [-16 * s, -8 * s - 6], [0, -14 * s - 8], [16 * s, -8 * s - 6], [20 * s, 8]], W.d3, W.line, 0.9);
    poly(ctx, [[-16 * s, -8 * s - 6], [0, -14 * s - 8], [0, 8], [-20 * s, 8]], W.d4, W.line, 0.8);
    poly(ctx, [[0, -14 * s - 8], [16 * s, -8 * s - 6], [20 * s, 8], [0, 8]], W.d2, W.line, 0.8);
  }

  // parede próxima (face frontal) e borda
  poly(ctx, [[-30, 18], [30, 18], [27, 31], [-27, 31]], built ? W.d4 : W.d2, W.line, 1);
  if (built) {
    poly(ctx, [[-30, 18], [30, 18], [29, 21], [-29, 21]], W.d6, null);
    poly(ctx, [[-29, 24.5], [29, 24.5], [28.4, 27], [-28.4, 27]], W.m1, W.line, 0.7);
    for (const rx of [-22, -8, 8, 22]) rivet(ctx, rx, 25.8, 1);
    ctx.strokeStyle = 'rgba(40,22,10,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-10, 19); ctx.lineTo(-10, 31); ctx.moveTo(10, 19); ctx.lineTo(10, 31); ctx.stroke();
  } else if (planksOn < 4) {
    ctx.fillStyle = W.d0; ctx.fillRect(-14, 18, 28, 13);                         // rombo (falta tábua)
  }
  // cantoneiras de ferro
  if (built) for (const sx of [-1, 1]) poly(ctx, [[sx * 30, -27], [sx * 24, -26], [sx * 24, -21], [sx * 30, -22]], W.m1, W.line, 0.7);

  if (!movingUp) handle();
}

function drawDonkey(
  ctx: CanvasRenderingContext2D,
  time: number,
  angle: number,
  wheelPhase: number,
  moving: boolean,
  broken: boolean,
) {
  const bob = moving && !broken ? Math.sin(wheelPhase * 2) * 1.1 : Math.sin(time * 2.1) * 1.2;
  const gait = moving && !broken ? wheelPhase : 0;
  const horizontal = Math.abs(Math.cos(angle));
  const vertical = Math.abs(Math.sin(angle));
  const side = horizontal > 0.72;
  const diagonal = !side && vertical < 0.94;
  const facingLeft = Math.cos(angle) < 0;
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
    const profileScale = 0.55 + 0.45 * Math.max(0, Math.min(1, (horizontal - 0.72) / 0.28));
    ctx.scale((facingLeft ? -1 : 1) * profileScale, 1);
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
    const depth = diagonal ? 0.82 + 0.18 * Math.max(0, Math.min(1, (vertical - 0.69) / 0.25)) : 1;
    ctx.save(); ctx.scale(diagonal && facingLeft ? -depth : depth, 1);

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
    const depth = diagonal ? 0.82 + 0.18 * Math.max(0, Math.min(1, (vertical - 0.69) / 0.25)) : 1;
    ctx.save(); ctx.scale(diagonal && facingLeft ? -depth : depth, 1);
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
