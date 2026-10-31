export type ToolId = 'machadinho' | 'picareta' | 'foice';
type Pt = readonly [number, number];

function P(ctx: CanvasRenderingContext2D, r: number, pts: readonly Pt[], fill: string, stroke = '#2a2320', lw = 1.1) {
  ctx.beginPath(); ctx.moveTo(pts[0][0]*r, pts[0][1]*r);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0]*r, pts[i][1]*r);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
}
const W1='#9b6a3f', W2='#74492a', W3='#b98a58', L1='#5a3a24', L2='#7c5232';
const S1='#e6eef0', S2='#a9b9c0', S3='#6d808a', S4='#43535c', SO='#27323a';
function handle(ctx: CanvasRenderingContext2D, r: number, len: number, wrapFrom: number, wrapTo: number) {
  P(ctx, r, [[0,-0.12],[len,-0.10],[len,0.10],[0,0.12]], W2);
  P(ctx, r, [[0,-0.12],[len,-0.10],[len,-0.01],[0,-0.01]], W3, '');
  P(ctx, r, [[0,-0.01],[len,-0.01],[len,0.10],[0,0.12]], W1, '');
  for (const [a, b] of [[0.5, 0.9], [0.85, 1.3], [1.2, 1.6]] as const) { if (b < len) P(ctx, r, [[a,-0.05],[b,-0.045],[b,-0.025],[a,-0.03]], W2, ''); }
  P(ctx, r, [[-0.1,-0.15],[0.06,-0.17],[0.06,0.17],[-0.1,0.15],[-0.16,0]], '#7d8c94', SO);
  const n = 4, w = (wrapTo - wrapFrom) / n;
  for (let i = 0; i < n; i++) P(ctx, r, [[wrapFrom + i*w, -0.15],[wrapFrom + (i+0.8)*w, -0.15],[wrapFrom + (i+0.8)*w, 0.15],[wrapFrom + i*w, 0.15]], i % 2 ? L2 : L1, '#2a1a10', 0.8);
}
function drawAxe(ctx: CanvasRenderingContext2D, r: number) {
  handle(ctx, r, 2.15, 0.15, 0.85);
  P(ctx, r, [[1.62,-0.20],[2.02,-0.22],[2.04,0.22],[1.60,0.22]], S3, SO);
  P(ctx, r, [[1.62,-0.20],[2.02,-0.22],[2.02,-0.08],[1.62,-0.08]], S2, '');
  P(ctx, r, [[1.68,-0.20],[2.00,-0.22],[2.00,-0.08],[1.67,-0.08]], S4, SO);
  P(ctx, r, [[1.68,-0.20],[2.00,-0.22],[2.01,-0.29],[1.67,-0.28]], S3, '');
  P(ctx, r, [[1.60,0.20],[2.04,0.22],[2.40,0.60],[2.58,1.02],[2.30,1.14],[1.70,1.14],[1.24,1.02],[1.34,0.62]], S3, SO, 1.2);
  P(ctx, r, [[1.60,0.20],[2.04,0.22],[2.40,0.60],[2.00,0.56],[1.66,0.58],[1.34,0.62]], S2, '');
  P(ctx, r, [[1.34,0.62],[1.66,0.58],[2.00,0.56],[2.40,0.60],[2.58,1.02],[2.30,1.14],[1.70,1.14],[1.24,1.02]], S3, '');
  P(ctx, r, [[1.24,1.02],[1.70,1.14],[2.30,1.14],[2.58,1.02],[2.55,0.92],[2.28,1.03],[1.72,1.03],[1.28,0.92]], S1, '');
  P(ctx, r, [[1.34,0.62],[1.66,0.58],[1.72,1.00],[1.28,0.92]], S4, '');
  P(ctx, r, [[1.50,-0.16],[1.60,-0.18],[1.60,0.18],[1.50,0.16]], '#c9a45a', '#4a3a1c', 0.9);
  P(ctx, r, [[1.78,-0.03],[1.86,-0.03],[1.86,0.05],[1.78,0.05]], S1, SO, 0.6);
}
function drawPick(ctx: CanvasRenderingContext2D, r: number) {
  handle(ctx, r, 2.30, 0.15, 0.85);
  const N = 7; const top: Pt[] = [], bot: Pt[] = [];
  for (let i = 0; i <= N; i++) { const y = -1.25 + 2.5*i/N, th = 0.20*(1 - Math.abs(y)/1.25) + 0.03; const cx = 2.20 - 0.38*Math.pow(y/1.25, 2); top.push([cx + th, y]); bot.push([cx - th, y]); }
  const outline: Pt[] = [...top, ...bot.slice().reverse()];
  P(ctx, r, outline, S3, SO, 1.2);
  P(ctx, r, [...top, ...top.slice().reverse().map((p): Pt => [p[0] - 0.12 * (1 - Math.abs(p[1]) / 1.25) - 0.03, p[1]])], S2, '');
  P(ctx, r, [[top[N-1][0], top[N-1][1]],[top[N][0]-0.01, top[N][1]],[bot[0][0]-0.0, 1.25],[2.02, 1.0]], S1, '');
  P(ctx, r, [[1.78,-1.28],[1.96,-1.30],[2.04,-1.06],[1.86,-1.04]], S1, SO, 0.9);
  P(ctx, r, [[2.00,-0.26],[2.40,-0.26],[2.42,0.26],[2.00,0.26]], S4, SO);
  P(ctx, r, [[2.00,-0.26],[2.40,-0.26],[2.41,-0.08],[2.00,-0.08]], S3, '');
  P(ctx, r, [[2.08,-0.12],[2.16,-0.12],[2.16,-0.04],[2.08,-0.04]], S1, SO, 0.5);
  P(ctx, r, [[2.08,0.08],[2.16,0.08],[2.16,0.16],[2.08,0.16]], S1, SO, 0.5);
  P(ctx, r, [[1.88,-0.16],[1.98,-0.18],[1.98,0.18],[1.88,0.16]], '#c9a45a', '#4a3a1c', 0.9);
}
function drawSickle(ctx: CanvasRenderingContext2D, r: number) {
  handle(ctx, r, 1.30, 0.10, 0.90);
  P(ctx, r, [[1.18,-0.17],[1.32,-0.19],[1.32,0.19],[1.18,0.17]], '#c9a45a', '#4a3a1c', 0.9);
  const R = 0.66, cx = 1.30, cy = R, N = 12; const outer: Pt[] = [], inner: Pt[] = [], mid: Pt[] = [];
  const a0 = -Math.PI/2, a1 = Math.PI * 0.42;
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = a0 + (a1 - a0) * t, wdt = 0.30 * (1 - Math.pow(t, 1.5)) + 0.02;
    outer.push([cx + R*Math.cos(a), cy + R*Math.sin(a)]);
    inner.push([cx + (R - wdt)*Math.cos(a), cy + (R - wdt)*Math.sin(a)]);
    mid.push([cx + (R - wdt*0.5)*Math.cos(a), cy + (R - wdt*0.5)*Math.sin(a)]);
  }
  P(ctx, r, [...outer, ...inner.slice().reverse()], S3, SO, 1.2);
  P(ctx, r, [...outer, ...mid.slice().reverse()], S4, '');
  P(ctx, r, [...mid, ...inner.slice().reverse()], S2, '');
  P(ctx, r, [...inner, ...inner.slice().reverse().map((_p, i, arr) => { const k = arr.length - 1 - i; const t = k / N, a = a0 + (a1 - a0) * t, wdt = 0.30 * (1 - Math.pow(t, 1.5)) + 0.02; return [cx + (R - wdt - 0.04)*Math.cos(a), cy + (R - wdt - 0.04)*Math.sin(a)] as Pt; })], S1, '');
  P(ctx, r, [[1.26,-0.07],[1.34,-0.07],[1.34,0.10],[1.26,0.10]], S3, SO, 0.8);
}

const DRAW: Record<ToolId, (ctx: CanvasRenderingContext2D, r: number) => void> = { machadinho: drawAxe, picareta: drawPick, foice: drawSickle };

/** Arte: origem na ponta do cabo, ferramenta aponta para +x, gume/ponta lidera no lado +y. */
export function drawTool(ctx: CanvasRenderingContext2D, tool: ToolId, r: number): void { DRAW[tool](ctx, r); }

// Animação de relógio: 12h -> alvo. Ponto de impacto local de cada ferramenta (unidades de r).
const IMP: Record<ToolId, Pt> = { machadinho: [1.9, 1.10], picareta: [1.85, 1.25], foice: [1.65, 1.0] };
/** Escala da ferramenta flutuante em relação à arte original. */
export const TOOL_SCALE = 1.0;
const ease = { out: (t: number) => 1 - Math.pow(1 - t, 3), in: (t: number) => t * t * t };
function toolPose(tool: ToolId, r: number, angle: number, reach: number, p: number, minGrip: number) {
  const side = Math.cos(angle) >= 0 ? 1 : -1;
  const start = angle - side * Math.PI / 2;
  let rot = angle, alpha = 1, yOff = 0;
  if (p < 0.18) { const e = ease.out(p / 0.18); alpha = e; yOff = -22 * (1 - e); rot = start - side * 0.30 * (1 - e); }
  else if (p < 0.36) { const s = ease.in((p - 0.18) / 0.18); rot = start + (angle - start) * s; }
  else if (p < 0.46) { rot = angle + side * 0.10 * Math.sin(Math.PI * (p - 0.36) / 0.10); }
  else if (p < 0.82) { rot = angle; }
  else { const t = (p - 0.82) / 0.18; alpha = 1 - t; yOff = -6 * t; }
  // posição do cabo: a cabeça (ponto de impacto) cai em 'reach' quando rot == angle
  const I = IMP[tool], ix = I[0] * r * TOOL_SCALE, iy = I[1] * r * TOOL_SCALE * side, c = Math.cos(angle), sn = Math.sin(angle);
  let gx = reach * c - (ix * c - iy * sn), gy = reach * sn - (ix * sn + iy * c);
  const along = gx * c + gy * sn; if (along < minGrip) { gx += c * (minGrip - along); gy += sn * (minGrip - along); }
  return { side, gx, gy: gy + yOff, rot, alpha };
}
export type FloatingToolOptions = { angle: number; reach: number; timer: number; duration: number; minGrip: number };

/** Chamar com o contexto transladado para o centro do jogador, SEM espelhamento. */
export function drawFloatingTool(ctx: CanvasRenderingContext2D, tool: ToolId, r: number, opts: FloatingToolOptions): void {
  if (opts.timer <= 0) return;
  const p = Math.min(1, Math.max(0, 1 - opts.timer / opts.duration));
  const q = toolPose(tool, r, opts.angle, opts.reach, p, opts.minGrip);
  if (q.alpha <= 0.01) return;
  ctx.save(); ctx.globalAlpha = q.alpha; ctx.translate(q.gx, q.gy); ctx.rotate(q.rot); ctx.scale(TOOL_SCALE, TOOL_SCALE * q.side);
  drawTool(ctx, tool, r); ctx.restore();
}