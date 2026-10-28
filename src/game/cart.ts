import { CONFIG } from './config';

/**
 * Carrinho low-poly. Origem = centro do carrinho (cart.x, cart.y), chão em y = +20.
 * Sentido horizontal: vista lateral (alça aponta para o lado em que o carrinho se move,
 * isto é, na direção do jogador que o puxa). Sentido vertical: vista de cima em 3/4.
 * Rodas só giram quando o carrinho está sendo puxado (moving).
 */
export type CartDrawState = {
  x: number; y: number; angle: number;
  repairWood: number; repaired: boolean; carried: boolean;
  inventory?: ReadonlyArray<{ quantity: number }>;
};

type Pt = readonly [number, number];

/** Fator de escala de todo o desenho (arte autorada em px a 1,0). */
export const CART_SCALE = 1.05;

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
  const f = Math.min(1, c.repairWood / CONFIG.cart.repairCost);
  const planksOn = c.repaired ? 4 : Math.floor(f * 4 + 0.001);
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

  if (c.repaired || planksOn > 0) {
    // armação visível (quadros) sempre
    // tábuas da parede próxima, de cima para baixo
    const tones = [W.d5, W.d4, W.d5, W.d3];
    for (let i = 0; i < 4; i++) {
      if (!c.repaired && (3 - i) >= planksOn) continue;
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
  if (c.repaired || planksOn >= 2) {
    for (const bx of [-12, 12]) poly(ctx, [[bx, -30], [bx + 4, -30], [bx + 4, -5], [bx, -5]], W.d2, W.line, 0.8);
  }
  if (c.repaired) {
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
  if (c.repaired && l > 0) {
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
  const f = Math.min(1, c.repairWood / CONFIG.cart.repairCost);
  const planksOn = c.repaired ? 4 : Math.floor(f * 4 + 0.001);
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
    const phase = ((rot * 2.2) % 7 + 7) % 7;
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
    const on = c.repaired || (rows - 1 - i) < planksOn + 1;
    if (!on) continue;
    const l0 = -30 + (y0 + 26) * (2 / 44), l1 = -30 + (y1 + 26) * (2 / 44);
    poly(ctx, [[l0 + 2, y0 + 0.5], [-l0 - 2, y0 + 0.5], [-l1 - 2, y1 - 0.5], [l1 + 2, y1 - 0.5]], i % 2 ? W.d2 : W.d1, W.d0, 0.8);
  }
  // paredes laterais (espessura vista de cima)
  for (const sx of [-1, 1]) {
    poly(ctx, [[sx * 30, -26], [sx * 24.5, -24], [sx * 23.5, 17], [sx * 28, 18]], c.repaired ? W.d3 : W.d2, W.line, 0.9);
    poly(ctx, [[sx * 30, -26], [sx * 27.5, -25], [sx * 26.5, 17.5], [sx * 28, 18]], c.repaired ? W.d5 : W.d3, null);
  }

  // carga
  const l = loadFraction(c);
  if (c.repaired && l > 0) {
    const s = 0.4 + 0.6 * l;
    poly(ctx, [[-20 * s, 8], [-16 * s, -8 * s - 6], [0, -14 * s - 8], [16 * s, -8 * s - 6], [20 * s, 8]], W.d3, W.line, 0.9);
    poly(ctx, [[-16 * s, -8 * s - 6], [0, -14 * s - 8], [0, 8], [-20 * s, 8]], W.d4, W.line, 0.8);
    poly(ctx, [[0, -14 * s - 8], [16 * s, -8 * s - 6], [20 * s, 8], [0, 8]], W.d2, W.line, 0.8);
  }

  // parede próxima (face frontal) e borda
  poly(ctx, [[-30, 18], [30, 18], [27, 31], [-27, 31]], c.repaired ? W.d4 : W.d2, W.line, 1);
  if (c.repaired) {
    poly(ctx, [[-30, 18], [30, 18], [29, 21], [-29, 21]], W.d6, null);
    poly(ctx, [[-29, 24.5], [29, 24.5], [28.4, 27], [-28.4, 27]], W.m1, W.line, 0.7);
    for (const rx of [-22, -8, 8, 22]) rivet(ctx, rx, 25.8, 1);
    ctx.strokeStyle = 'rgba(40,22,10,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-10, 19); ctx.lineTo(-10, 31); ctx.moveTo(10, 19); ctx.lineTo(10, 31); ctx.stroke();
  } else if (planksOn < 4) {
    ctx.fillStyle = W.d0; ctx.fillRect(-14, 18, 28, 13);                         // rombo (falta tábua)
  }
  // cantoneiras de ferro
  if (c.repaired) for (const sx of [-1, 1]) poly(ctx, [[sx * 30, -27], [sx * 24, -26], [sx * 24, -21], [sx * 30, -22]], W.m1, W.line, 0.7);

  if (!movingUp) handle();
}

export function drawCart(ctx: CanvasRenderingContext2D, cart: CartDrawState, nearby: boolean, time: number, moving: boolean) {
  const { x, y, angle, repairWood, repaired, carried } = cart;
  const vertical = Math.abs(Math.cos(angle)) < 0.15;
  const movingUp = Math.sin(angle) < 0;
  const movingLeft = Math.cos(angle) < 0;
  const rot = moving ? time * 8 : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.save();
  ctx.scale(CART_SCALE, CART_SCALE);

  // sombra
  ctx.fillStyle = 'rgba(10,16,12,.20)';
  ctx.beginPath(); ctx.ellipse(1, 21, vertical ? 38 : 50, vertical ? 22 : 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(8,12,9,.26)';
  ctx.beginPath(); ctx.ellipse(1, 21, vertical ? 30 : 40, vertical ? 17 : 8, 0, 0, Math.PI * 2); ctx.fill();

  if (nearby) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    ctx.beginPath(); ctx.ellipse(0, 4, 62 + pulse * 4, 38 + pulse * 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(210,180,125,${0.07 + pulse * 0.06})`; ctx.fill();
    ctx.strokeStyle = `rgba(230,200,150,${0.3 + pulse * 0.35})`; ctx.lineWidth = 1.5; ctx.stroke();
  }

  if (vertical) drawTop(ctx, cart, movingUp, rot);
  else { ctx.save(); ctx.scale(movingLeft ? -1 : 1, 1); drawSide(ctx, cart, rot); ctx.restore(); }

  ctx.restore();

  if (!repaired) {
    const bw = 80, by = vertical ? -92 : -70;
    ctx.fillStyle = 'rgba(18,25,22,.9)'; ctx.fillRect(-bw / 2, by, bw, 7);
    ctx.fillStyle = '#d7b17b'; ctx.fillRect(-bw / 2, by, bw * (repairWood / CONFIG.cart.repairCost), 7);
    ctx.strokeStyle = 'rgba(235,245,238,.7)'; ctx.lineWidth = 1; ctx.strokeRect(-bw / 2, by, bw, 7);
  }
  if (carried) {
    ctx.strokeStyle = 'rgba(235,235,235,.65)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(0, -3, 70, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}
