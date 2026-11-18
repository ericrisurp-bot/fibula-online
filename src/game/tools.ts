export type ToolId = 'machadinho' | 'picareta' | 'foice' | 'faca';
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

function drawKnife(ctx: CanvasRenderingContext2D, r: number) {
  P(ctx, r, [[0,-0.12],[1.12,-0.10],[1.18,0],[1.12,0.10],[0,0.12],[-0.12,0]], W2);
  P(ctx, r, [[0,-0.105],[1.08,-0.085],[1.12,-0.015],[0,-0.015]], W3, '');
  P(ctx, r, [[0,-0.015],[1.12,-0.015],[1.12,0.09],[0,0.105]], W1, '');
  for (let i=0;i<5;i++) { const x=0.18+i*0.16; P(ctx,r,[[x,-0.12],[x+0.07,-0.12],[x+0.17,0.12],[x+0.10,0.12]],i%2?L2:L1,'#2a1a10',0.7); }
  P(ctx,r,[[-0.08,-0.18],[0.08,-0.18],[0.12,0],[0.08,0.18],[-0.08,0.18],[-0.12,0]],'#c9a45a','#4a3a1c',1);
  P(ctx,r,[[1.10,-0.13],[1.34,-0.16],[1.56,-0.04],[1.88,0.18],[2.12,0.48],[2.18,0.66],[2.00,0.62],[1.76,0.43],[1.50,0.25],[1.28,0.13]],S3,SO,1.1);
  P(ctx,r,[[1.16,-0.10],[1.38,-0.12],[1.60,0.02],[1.88,0.25],[2.12,0.48],[2.18,0.66],[1.92,0.47],[1.64,0.27],[1.40,0.12]],S2,'');
  P(ctx,r,[[1.40,0.12],[1.64,0.27],[1.92,0.47],[2.18,0.66],[2.00,0.62],[1.76,0.43],[1.50,0.25]],S1,'');
  ctx.save(); ctx.strokeStyle='#f7fbfc'; ctx.lineWidth=Math.max(0.65,r*0.035); ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(1.34*r,0.055*r); ctx.quadraticCurveTo(1.78*r,0.25*r,2.10*r,0.62*r); ctx.stroke();
  ctx.strokeStyle='#ffffff'; ctx.globalAlpha=0.72; ctx.lineWidth=Math.max(0.5,r*0.022);
  ctx.beginPath(); ctx.moveTo(1.45*r,-0.045*r); ctx.quadraticCurveTo(1.72*r,0.02*r,1.98*r,0.31*r); ctx.stroke(); ctx.restore();
}

export type FishingRodOptions = {
  startX: number;
  startY: number;
  tipX: number;
  tipY: number;
  hookX: number;
  hookY: number;
  pull: number;
};

/** Vara de bambu com empunhadura, passadores, linha, anzol e boia. */
export function drawFishingRod(ctx: CanvasRenderingContext2D, r: number, opts: FishingRodOptions): void {
  const dx = opts.tipX - opts.startX;
  const dy = opts.tipY - opts.startY;
  const length = Math.max(1, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  const pull = Math.max(0, Math.min(1, opts.pull));
  const detailScale = Math.max(0.75, Math.min(1.25, r / 18));
  const flex = pull * Math.min(4.2, length * 0.075);
  const yAt = (x: number) => flex * (x / length) * (x / length);

  ctx.save();
  ctx.translate(opts.startX, opts.startY);
  ctx.rotate(angle);

  // Cabo revestido em couro e cortiça, com costuras diagonais discretas.
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#49301f'; ctx.lineWidth = 5.2;
  ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(Math.min(14, length * 0.28), 0); ctx.stroke();
  ctx.strokeStyle = '#a8794e'; ctx.lineWidth = 3.8;
  ctx.beginPath(); ctx.moveTo(2, -0.2); ctx.lineTo(Math.min(13, length * 0.26), -0.2); ctx.stroke();
  ctx.strokeStyle = '#d0a477'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(3, -1.5); ctx.lineTo(Math.min(12, length * 0.24), -1.5); ctx.stroke();
  ctx.strokeStyle = '#5a3827'; ctx.lineWidth = 1;
  for (let x = 4; x < Math.min(13, length * 0.25); x += 3) {
    ctx.beginPath(); ctx.moveTo(x, -2); ctx.lineTo(x + 1.5, 2); ctx.stroke();
  }

  // Três seções de bambu afuniladas, com veios claros e junções metálicas.
  const sections = [
    { from: Math.min(13, length * 0.27), to: length * 0.43, width: 3.1, color: '#8b6038', light: '#c99a60' },
    { from: length * 0.43, to: length * 0.73, width: 2.35, color: '#a87945', light: '#dfb77b' },
    { from: length * 0.73, to: Math.max(length * 0.74, length - 3), width: 1.55, color: '#c49a60', light: '#f0d49a' },
  ];
  for (const section of sections) {
    const from = Math.max(0, section.from);
    const to = Math.max(from + 1, section.to);
    const drawCurve = (offset: number) => {
      ctx.beginPath();
      ctx.moveTo(from, yAt(from) + offset);
      ctx.quadraticCurveTo((from + to) * 0.5, yAt((from + to) * 0.5) + offset, to, yAt(to) + offset);
    };
    ctx.strokeStyle = '#543820'; ctx.lineWidth = section.width + 1.1; drawCurve(0); ctx.stroke();
    ctx.strokeStyle = section.color; ctx.lineWidth = section.width; drawCurve(0); ctx.stroke();
    ctx.strokeStyle = section.light; ctx.lineWidth = Math.max(0.55, section.width * 0.23); drawCurve(-section.width * 0.23); ctx.stroke();
  }

  // Anéis de união entre as três partes.
  for (const x of [length * 0.43, length * 0.73]) {
    ctx.fillStyle = '#56616a';
    ctx.fillRect(x - 1.5, yAt(x) - 2.2, 3, 4.4);
    ctx.fillStyle = '#c6d0d2';
    ctx.fillRect(x - 0.7, yAt(x) - 2.1, 0.8, 4.2);
    ctx.strokeStyle = '#35434b'; ctx.lineWidth = 0.65; ctx.strokeRect(x - 1.5, yAt(x) - 2.2, 3, 4.4);
  }

  // Pequeno molinete lateral, preso ao cabo.
  ctx.fillStyle = '#39454b'; ctx.strokeStyle = '#202a30'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(10, 4.2, 4.1, 3.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#aeb9bb'; ctx.beginPath(); ctx.ellipse(10, 4.2, 2.1, 1.45, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d6ddda'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(10, 1.2); ctx.lineTo(13.2, -0.4); ctx.stroke();

  // Três passadores de linha, progressivamente menores em direção à ponta.
  const guides = [
    { x: length * 0.43, size: 2.6 },
    { x: length * 0.68, size: 1.9 },
    { x: length * 0.87, size: 1.25 },
  ];
  for (const guide of guides) {
    const y = yAt(guide.x);
    ctx.strokeStyle = '#46545a'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.ellipse(guide.x, y, guide.size * 0.7, guide.size, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#d5dedc'; ctx.lineWidth = 0.55;
    ctx.beginPath(); ctx.ellipse(guide.x - 0.25, y - 0.25, guide.size * 0.38, guide.size * 0.65, 0, 0, Math.PI * 2); ctx.stroke();
  }

  // Ponteira clara para destacar a extremidade flexível.
  ctx.strokeStyle = '#dce7df'; ctx.lineWidth = 1.25 * detailScale;
  ctx.beginPath(); ctx.moveTo(length - 4, yAt(length - 4)); ctx.lineTo(length, yAt(length)); ctx.stroke();
  ctx.restore();

  // A linha parte da nova ponta ampliada; a boia afunda durante a puxada.
  const rodTipX = opts.tipX;
  const rodTipY = opts.tipY;
  const sink = pull * 5.5;
  const floatX = opts.hookX;
  const floatY = opts.hookY + sink;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(35,43,43,0.52)'; ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.moveTo(rodTipX, rodTipY);
  ctx.quadraticCurveTo((rodTipX + floatX) * 0.5 + 2, (rodTipY + floatY) * 0.5 + 3, floatX, floatY);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(244,240,220,0.9)'; ctx.lineWidth = 0.65;
  ctx.beginPath();
  ctx.moveTo(rodTipX, rodTipY + 0.35);
  ctx.quadraticCurveTo((rodTipX + floatX) * 0.5 + 2, (rodTipY + floatY) * 0.5 + 2, floatX, floatY);
  ctx.stroke();

  const bobberAlpha = Math.max(0, 1 - pull * 1.08);
  if (bobberAlpha > 0.02) {
    ctx.globalAlpha = bobberAlpha;
    ctx.fillStyle = '#eee9d9'; ctx.strokeStyle = '#563a2b'; ctx.lineWidth = 0.85;
    ctx.beginPath(); ctx.ellipse(floatX, floatY, 2.35, 3.5, -0.18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c94b3d';
    ctx.beginPath(); ctx.ellipse(floatX, floatY - 1.55, 2.15, 1.85, -0.18, Math.PI, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff5df'; ctx.lineWidth = 0.65;
    ctx.beginPath(); ctx.moveTo(floatX - 1.1, floatY + 1.5); ctx.lineTo(floatX + 1.1, floatY + 1.5); ctx.stroke();
  }

  // Anzol pequeno logo abaixo da boia.
  ctx.globalAlpha = bobberAlpha;
  ctx.strokeStyle = '#d9e0dc'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(floatX, floatY + 2.5);
  ctx.lineTo(floatX + 0.7, floatY + 5.1);
  ctx.quadraticCurveTo(floatX + 3.4, floatY + 6.2, floatX + 2.6, floatY + 3.9);
  ctx.stroke();
  ctx.restore();
}

const DRAW: Record<ToolId, (ctx: CanvasRenderingContext2D, r: number) => void> = { machadinho: drawAxe, picareta: drawPick, foice: drawSickle, faca: drawKnife };

/** Arte: origem na ponta do cabo, ferramenta aponta para +x, gume/ponta lidera no lado +y. */
export function drawTool(ctx: CanvasRenderingContext2D, tool: ToolId, r: number): void { DRAW[tool](ctx, r); }

// Animação de relógio: 12h -> alvo. Ponto de impacto local de cada ferramenta (unidades de r).
const IMP: Record<ToolId, Pt> = { machadinho: [1.9, 1.10], picareta: [1.85, 1.25], foice: [1.65, 1.0], faca: [2.10, 0.66] };
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