import type { WeaponId } from './config';

type Point = readonly [number, number];



function facet(ctx: CanvasRenderingContext2D, r: number, points: readonly Point[], fill: string, stroke = '#25232a', lineWidth = 1.1) {
  ctx.beginPath();
  ctx.moveTo(points[0][0] * r, points[0][1] * r);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0] * r, points[i][1] * r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function drawSword(ctx: CanvasRenderingContext2D, r: number) {
  // Empunhadura curta com faixas de couro, pomo facetado e guarda em cruz.
  facet(ctx, r, [[0.62,0.12],[0.82,0.02],[0.91,0.11],[0.72,0.23]], '#35272a', '#201d23');
  facet(ctx, r, [[0.65,0.12],[0.77,0.06],[0.81,0.1],[0.69,0.17]], '#b17a50', '');
  facet(ctx, r, [[0.69,0.16],[0.82,0.1],[0.85,0.14],[0.73,0.21]], '#714631', '');
  facet(ctx, r, [[0.73,0.2],[0.85,0.14],[0.88,0.18],[0.77,0.24]], '#c08b5b', '');
  facet(ctx, r, [[0.82,0.02],[0.91,-0.04],[1.02,0.02],[1.03,0.12],[0.93,0.18],[0.85,0.11]], '#7e8990', '#263039');
  facet(ctx, r, [[0.82,0.02],[0.91,-0.04],[0.95,0.05],[0.88,0.1]], '#d5e0e3', '');
  facet(ctx, r, [[0.95,0.05],[1.02,0.02],[1.03,0.12],[0.93,0.18]], '#4b5963', '');
  // Guarda larga, com extremidades ligeiramente recurvadas.
  facet(ctx, r, [[0.94,-0.16],[1.05,-0.12],[1.12,-0.02],[1.08,0.04],[1.01,-0.03],[0.92,0.16],[0.85,0.12],[0.96,-0.07]], '#b48a4b', '#4b3828');
  facet(ctx, r, [[0.94,-0.16],[1.05,-0.12],[1.02,-0.04],[0.96,-0.07]], '#f0d58b', '');
  facet(ctx, r, [[1.08,0.04],[1.01,-0.03],[0.96,0.08],[0.92,0.16]], '#77512f', '');
  // Lâmina comprida, larga na base, chanfrada na ponta e com fuller central.
  facet(ctx, r, [[1.02,-0.08],[1.13,-0.13],[3.55,-0.035],[3.7,0.0],[3.55,0.045],[1.13,0.13],[1.02,0.06]], '#71838d', '#26333b', 1.2);
  facet(ctx, r, [[1.04,-0.075],[1.13,-0.13],[3.7,0.0],[1.2,-0.015]], '#e4eef0', '');
  facet(ctx, r, [[1.2,-0.015],[3.7,0.0],[3.55,0.045],[1.13,0.13]], '#52636e', '');
  facet(ctx, r, [[1.2,-0.015],[3.52,0.0],[1.3,0.025],[1.12,0.02]], '#93a6ae', '');
  facet(ctx, r, [[1.12,0.02],[3.52,0.0],[3.55,0.045],[1.13,0.13]], '#3e515b', '');
  facet(ctx, r, [[1.17,0.045],[3.48,0.012],[3.43,0.023],[1.17,0.065]], '#b93643', '');
  facet(ctx, r, [[1.1,-0.075],[1.18,-0.095],[3.48,-0.018],[3.53,-0.005],[1.2,-0.035]], '#f2f7f6', '');
  facet(ctx, r, [[1.12,-0.025],[2.7,-0.018],[2.86,-0.004],[1.16,0.012]], '#c1d1d5', '');
}
function drawMageStaff(ctx: CanvasRenderingContext2D, r: number) {
  // Halo facetado translúcido, sem filtros nem sombras caras.
  ctx.save(); ctx.globalAlpha = 0.16;
  facet(ctx, r, [[2.63,-0.48],[2.82,-0.83],[3.18,-0.94],[3.48,-0.68],[3.53,-0.32],[3.29,-0.06],[2.91,-0.12]], '#a96cff', '');
  ctx.restore();
  // Haste comprida de madeira roxa com três faces.
  facet(ctx,r,[[0.63,0.13],[0.72,0.02],[3.02,-0.72],[3.09,-0.59],[0.81,0.17]],'#281e35','#1d1924');
  facet(ctx,r,[[0.72,0.02],[3.02,-0.72],[3.06,-0.63],[0.81,0.17]],'#65447f','');
  facet(ctx,r,[[0.81,0.17],[3.06,-0.63],[3.09,-0.59]],'#3d2a52','');
  // Empunhadura e anéis metálicos.
  facet(ctx,r,[[0.64,0.12],[0.76,0.04],[0.88,0.10],[0.76,0.19]],'#8c6a4c','#30252b');
  facet(ctx,r,[[0.9,-0.045],[1.0,-0.075],[1.04,0.015],[0.94,0.045]],'#b5b8c5','#46404e');
  facet(ctx,r,[[1.58,-0.24],[1.68,-0.28],[1.72,-0.19],[1.62,-0.15]],'#b5b8c5','#46404e');
  facet(ctx,r,[[2.25,-0.45],[2.35,-0.49],[2.39,-0.40],[2.29,-0.36]],'#d9d5e4','#46404e');
  // Garras do engaste.
  facet(ctx,r,[[2.76,-0.57],[2.88,-0.76],[3.04,-0.73],[3.08,-0.58],[2.97,-0.48]],'#70508c','#34243f');
  facet(ctx,r,[[3.23,-0.57],[3.37,-0.75],[3.49,-0.67],[3.47,-0.49],[3.34,-0.43]],'#4b315f','#34243f');
  facet(ctx,r,[[2.78,-0.34],[2.91,-0.18],[3.05,-0.23],[3.08,-0.39],[2.96,-0.48]],'#8b63a7','#34243f');
  // Cristal roxo facetado em nove faces.
  facet(ctx,r,[[2.82,-0.59],[2.91,-0.82],[3.13,-0.98],[3.36,-0.88],[3.49,-0.66],[3.42,-0.42],[3.22,-0.29],[3.01,-0.35],[2.86,-0.47]],'#6436a0','#2c1c42',1.2);
  facet(ctx,r,[[2.91,-0.82],[3.13,-0.98],[3.16,-0.72],[3.02,-0.61]],'#e0c4ff','');
  facet(ctx,r,[[3.13,-0.98],[3.36,-0.88],[3.16,-0.72]],'#b98cf0','');
  facet(ctx,r,[[3.36,-0.88],[3.49,-0.66],[3.29,-0.62],[3.16,-0.72]],'#8a57d0','');
  facet(ctx,r,[[3.49,-0.66],[3.42,-0.42],[3.24,-0.51],[3.29,-0.62]],'#542a8e','');
  facet(ctx,r,[[3.42,-0.42],[3.22,-0.29],[3.12,-0.52],[3.24,-0.51]],'#7544b5','');
  facet(ctx,r,[[3.22,-0.29],[3.01,-0.35],[3.02,-0.61],[3.12,-0.52]],'#a978df','');
  facet(ctx,r,[[3.01,-0.35],[2.86,-0.47],[2.82,-0.59],[3.02,-0.61]],'#4b287d','');
  facet(ctx,r,[[3.02,-0.61],[3.16,-0.72],[3.29,-0.62],[3.24,-0.51],[3.12,-0.52]],'#cda7f7','');
  // Pequenos fragmentos orbitais, também facetados.
  facet(ctx,r,[[2.61,-0.78],[2.68,-0.91],[2.78,-0.85],[2.75,-0.73]],'#c9a0ff','#55327b',0.9);
  facet(ctx,r,[[3.53,-0.39],[3.62,-0.49],[3.7,-0.38],[3.62,-0.28]],'#a978ed','#55327b',0.9);
  facet(ctx,r,[[3.24,-1.06],[3.31,-1.16],[3.39,-1.07],[3.34,-0.98]],'#e1c7ff','#55327b',0.9);
}
function drawBow(ctx: CanvasRenderingContext2D, r: number) {
  // Uma única curva contínua, convexa para +x, da ponta superior à inferior.
  const halfHeight = 1.7;
  const baseX = 0.62;
  const bulge = 0.56;
  const segments = 20; // dez segmentos em cada braço
  const centerAt = (y: number) => baseX + bulge * (1 - (y / halfHeight) ** 2);
  const widthAt = (y: number) => 0.045 + 0.105 * (1 - Math.abs(y) / halfHeight);

  // Cada trecho forma duas facetas contíguas; a faixa afina progressivamente nas pontas.
  for (let i = 0; i < segments; i++) {
    const y0 = -halfHeight + (2 * halfHeight * i) / segments;
    const y1 = -halfHeight + (2 * halfHeight * (i + 1)) / segments;
    const x0 = centerAt(y0);
    const x1 = centerAt(y1);
    const w0 = widthAt(y0);
    const w1 = widthAt(y1);
    const left0 = x0 - w0 / 2;
    const right0 = x0 + w0 / 2;
    const left1 = x1 - w1 / 2;
    const right1 = x1 + w1 / 2;
    const tones = i < segments / 2
      ? ['#e4c36b', '#b9823b', '#76502e']
      : ['#f0d47c', '#c08a42', '#80542f'];
    facet(ctx, r, [[left0,y0],[x0,y0],[x1,y1],[left1,y1]], tones[0], '#624522', 0.8);
    facet(ctx, r, [[x0,y0],[right0,y0],[right1,y1],[x1,y1]], tones[1], '#624522', 0.8);
  }

  // Nocks dourados nas duas pontas, sem interromper a curva principal.
  facet(ctx, r, [[centerAt(-halfHeight)-0.04,-halfHeight-0.015],[centerAt(-halfHeight)+0.045,-halfHeight+0.035],[centerAt(-halfHeight)+0.01,-halfHeight+0.12],[centerAt(-halfHeight)-0.035,-halfHeight+0.045]], '#f0d47d', '#624522', 0.9);
  facet(ctx, r, [[centerAt(halfHeight)-0.035,halfHeight-0.045],[centerAt(halfHeight)+0.01,halfHeight-0.12],[centerAt(halfHeight)+0.045,halfHeight-0.035],[centerAt(halfHeight)-0.04,halfHeight+0.015]], '#b98339', '#624522', 0.9);

  // Empunhadura de couro centralizada perto de (r*1.18, -r*0.08), com três voltas.
  facet(ctx, r, [[1.105,-0.27],[1.255,-0.27],[1.255,0.11],[1.105,0.11]], '#79502f', '#4b3024', 1);
  facet(ctx, r, [[1.115,-0.24],[1.19,-0.24],[1.19,0.08],[1.115,0.08]], '#c08a4a', '');
  facet(ctx, r, [[1.105,-0.19],[1.255,-0.16],[1.255,-0.10],[1.105,-0.13]], '#e7d5a0', '#5d432a', 0.7);
  facet(ctx, r, [[1.105,-0.075],[1.255,-0.045],[1.255,0.015],[1.105,-0.015]], '#b98248', '#5d432a', 0.7);
  facet(ctx, r, [[1.105,0.04],[1.255,0.07],[1.255,0.13],[1.105,0.10]], '#e7d5a0', '#5d432a', 0.7);

  // Corda reta e fina entre as pontas.
  ctx.beginPath();
  ctx.moveTo(centerAt(-halfHeight) * r, -halfHeight * r);
  ctx.lineTo(centerAt(halfHeight) * r, halfHeight * r);
  ctx.strokeStyle = '#f2eadb';
  ctx.lineWidth = Math.max(0.7, r * 0.018);
  ctx.stroke();

  // Flecha decorativa encaixada na corda; não participa da mecânica de projéteis.
  facet(ctx, r, [[1.19,-0.055],[2.27,-0.055],[2.27,-0.015],[1.19,-0.015]], '#5b4b3c', '');
  facet(ctx, r, [[2.27,-0.095],[2.5,-0.035],[2.27,0.025]], '#d4dbe0', '#58636a', 0.8);
  facet(ctx, r, [[1.32,-0.035],[1.51,-0.15],[1.48,-0.035]], '#d6e1e4', '#4b5960', 0.8);
  facet(ctx, r, [[1.32,-0.015],[1.51,0.10],[1.48,-0.015]], '#9caeb5', '#4b5960', 0.8);
}
function drawDruidStaff(ctx: CanvasRenderingContext2D, r: number) {
  // Haste torcida: segmentos deslocados e nós de madeira facetados.
  facet(ctx,r,[[0.62,0.13],[0.7,0.01],[1.1,-0.12],[1.16,-0.02],[0.78,0.18]],'#65422d','#30251f',1.1);
  facet(ctx,r,[[0.7,0.01],[1.1,-0.12],[1.15,-0.25],[1.23,-0.16],[1.16,-0.02]],'#a87345','');
  facet(ctx,r,[[0.78,0.18],[1.16,-0.02],[1.23,-0.16],[1.3,-0.06],[1.22,0.04],[0.84,0.25]],'#754a2d','#30251f',1.1);
  facet(ctx,r,[[1.22,0.04],[1.3,-0.06],[1.73,-0.32],[1.79,-0.21],[1.32,0.08]],'#5b3927','#30251f',1.1);
  facet(ctx,r,[[1.3,-0.06],[1.73,-0.32],[1.78,-0.45],[1.88,-0.37],[1.79,-0.21]],'#a87345','');
  facet(ctx,r,[[1.32,0.08],[1.79,-0.21],[1.88,-0.37],[1.96,-0.27],[1.86,-0.14],[1.38,0.18]],'#70452b','#30251f',1.1);
  facet(ctx,r,[[1.86,-0.14],[1.96,-0.27],[2.33,-0.52],[2.41,-0.41],[1.94,-0.04]],'#5a3928','#30251f',1.1);
  facet(ctx,r,[[1.96,-0.27],[2.33,-0.52],[2.4,-0.65],[2.49,-0.57],[2.41,-0.41]],'#b17c49','');
  facet(ctx,r,[[1.94,-0.04],[2.41,-0.41],[2.49,-0.57],[2.57,-0.46],[2.46,-0.32],[2.0,0.08]],'#754a2d','#30251f',1.1);
  facet(ctx,r,[[0.91,0.09],[1.02,-0.02],[1.12,0.02],[1.02,0.14]],'#3d2a20','');
  facet(ctx,r,[[1.72,-0.25],[1.81,-0.36],[1.92,-0.3],[1.83,-0.18]],'#39271f','');
  facet(ctx,r,[[2.35,-0.43],[2.45,-0.54],[2.55,-0.48],[2.45,-0.35]],'#3d2a20','');
  // Videira fina que cruza a haste e pequenas folhas.
  facet(ctx,r,[[0.79,0.17],[0.84,0.14],[1.05,-0.02],[1.28,-0.04],[1.49,-0.18],[1.7,-0.23],[1.92,-0.38],[2.14,-0.39],[2.38,-0.55],[2.42,-0.51],[2.17,-0.34],[1.95,-0.33],[1.73,-0.18],[1.51,-0.13],[1.3,0.01],[1.07,0.02],[0.82,0.21]],'#3f7137','#29452a',0.9);
  facet(ctx,r,[[1.03,0.02],[0.96,-0.18],[1.12,-0.16],[1.17,-0.04]],'#34733a','#24472a',0.9);
  facet(ctx,r,[[1.0,-0.12],[0.96,-0.18],[1.12,-0.16]],'#9bd36d','');
  facet(ctx,r,[[1.42,-0.08],[1.45,-0.29],[1.61,-0.26],[1.55,-0.12]],'#2f6937','#24472a',0.9);
  facet(ctx,r,[[1.45,-0.29],[1.61,-0.26],[1.55,-0.12]],'#9bd36d','');
  facet(ctx,r,[[1.88,-0.3],[1.93,-0.49],[2.08,-0.44],[2.01,-0.31]],'#34733a','#24472a',0.9);
  facet(ctx,r,[[1.93,-0.49],[2.08,-0.44],[2.01,-0.31]],'#9bd36d','');
  facet(ctx,r,[[2.18,-0.37],[2.29,-0.53],[2.41,-0.47],[2.34,-0.34]],'#2f6937','#24472a',0.9);
  facet(ctx,r,[[2.29,-0.53],[2.41,-0.47],[2.34,-0.34]],'#9bd36d','');
  // Galhos e raízes abraçam a gema verde.
  facet(ctx,r,[[2.45,-0.43],[2.58,-0.68],[2.75,-0.78],[2.81,-0.69],[2.69,-0.57],[2.65,-0.39]],'#68432b','#30251f',1.1);
  facet(ctx,r,[[2.45,-0.39],[2.55,-0.17],[2.72,-0.1],[2.78,-0.2],[2.65,-0.28],[2.62,-0.45]],'#825331','#30251f',1.1);
  facet(ctx,r,[[2.53,-0.5],[2.66,-0.72],[2.83,-0.77],[2.97,-0.64],[3.0,-0.43],[2.88,-0.27],[2.68,-0.3],[2.56,-0.4]],'#287b43','#1f4b2e',1.2);
  // Gema grande facetada: faces claras, médias e escuras.
  facet(ctx,r,[[2.66,-0.52],[2.73,-0.69],[2.87,-0.73],[2.97,-0.61],[2.94,-0.43],[2.82,-0.34],[2.69,-0.4]],'#2f9b55','#17472b',1.1);
  facet(ctx,r,[[2.73,-0.69],[2.87,-0.73],[2.86,-0.56],[2.77,-0.52]],'#b7f28c','');
  facet(ctx,r,[[2.87,-0.73],[2.97,-0.61],[2.86,-0.56]],'#70d975','');
  facet(ctx,r,[[2.97,-0.61],[2.94,-0.43],[2.83,-0.47],[2.86,-0.56]],'#328f4c','');
  facet(ctx,r,[[2.94,-0.43],[2.82,-0.34],[2.76,-0.45],[2.83,-0.47]],'#1e683b','');
  facet(ctx,r,[[2.82,-0.34],[2.69,-0.4],[2.66,-0.52],[2.76,-0.45]],'#3baa59','');
  facet(ctx,r,[[2.66,-0.52],[2.73,-0.69],[2.77,-0.52],[2.76,-0.45]],'#84e47a','');
  // Brotos/folhas do topo.
  facet(ctx,r,[[2.65,-0.56],[2.49,-0.72],[2.52,-0.88],[2.69,-0.78]],'#347e3d','#214c2c',0.9);
  facet(ctx,r,[[2.49,-0.72],[2.52,-0.88],[2.69,-0.78]],'#9fe278','');
  facet(ctx,r,[[2.82,-0.7],[2.83,-0.91],[2.98,-0.99],[3.0,-0.82],[2.91,-0.7]],'#2d7d3e','#214c2c',0.9);
  facet(ctx,r,[[2.83,-0.91],[2.98,-0.99],[3.0,-0.82]],'#a6e780','');
  facet(ctx,r,[[2.91,-0.39],[3.08,-0.45],[3.19,-0.34],[3.1,-0.23],[2.96,-0.28]],'#347e3d','#214c2c',0.9);
  facet(ctx,r,[[3.08,-0.45],[3.19,-0.34],[3.1,-0.23]],'#9fe278','');
  facet(ctx,r,[[2.69,-0.35],[2.61,-0.19],[2.69,-0.08],[2.81,-0.2]],'#2d7d3e','#214c2c',0.9);
  facet(ctx,r,[[2.61,-0.19],[2.69,-0.08],[2.81,-0.2]],'#a6e780','');
}

type FloatingWeaponOptions = {
  time: number;
  facingX: number;
  moving: boolean;
  hasEnemies: boolean;
  hasTarget: boolean;
  aimAngle: number;
  carried: boolean;
  swingTimer: number;
  swingAngle: number;
};

const hover = {
  side: 1,
  sideT: 1,
  combatT: 0,
  presence: 0,
  angle: -Math.PI / 2,
  moveT: 0,
  lastTime: 0,
  lastEnemyTime: -999,
};

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function isFloatingWeaponVisible(): boolean {
  return hover.presence >= 0.02;
}

export function drawFloatingWeapon(
  ctx: CanvasRenderingContext2D,
  weapon: WeaponId,
  r: number,
  opts: FloatingWeaponOptions,
): void {
  if (opts.time < hover.lastTime) {
    hover.side = 1;
    hover.sideT = 1;
    hover.combatT = 0;
    hover.presence = 0;
    hover.angle = -Math.PI / 2;
    hover.moveT = 0;
    hover.lastEnemyTime = -999;
  }
  const dt = Math.min(0.05, Math.max(0, opts.time - hover.lastTime));
  hover.lastTime = opts.time;

  if (opts.hasEnemies && !opts.carried) hover.lastEnemyTime = opts.time;
  const presenceTarget = opts.time - hover.lastEnemyTime < 0.8 ? 1 : 0;
  const presenceAlpha = 1 - Math.exp(-dt / 0.12);
  hover.presence += (presenceTarget - hover.presence) * presenceAlpha;
  if (hover.presence < 0.02) return;

  if (opts.facingX < -0.35) hover.side = 1;
  else if (opts.facingX > 0.35) hover.side = -1;

  const sideAlpha = 1 - Math.exp(-dt / 0.15);
  hover.sideT += (hover.side - hover.sideT) * sideAlpha;
  const movingTarget = opts.moving ? 1 : 0;
  hover.moveT += (movingTarget - hover.moveT) * sideAlpha;

  const combatTarget = opts.hasTarget ? 1 : 0;
  const combatAlpha = 1 - Math.exp(-dt / 0.12);
  hover.combatT += (combatTarget - hover.combatT) * combatAlpha;
  if (opts.swingTimer > 0) hover.combatT = 1;

  const bob = Math.sin(opts.time * 2.2) * 1.6;
  const restX = hover.sideT * r * 1.9;
  const restY = -r * 1.3 + bob;
  const restLean = Math.sin(opts.time * 1.7) * 0.04
    - hover.sideT * 0.10 * hover.moveT;
  const restAngle = (weapon === 'arco' ? 0 : -Math.PI / 2) + restLean;

  const swingProgress = opts.swingTimer > 0 ? 1 - opts.swingTimer / 0.24 : 0;
  const combatAngle = weapon === 'espada' && opts.swingTimer > 0
    ? opts.swingAngle + (swingProgress - 0.5) * 1.55
    : opts.aimAngle;
  const combatX = r * 0.68 * Math.cos(opts.aimAngle);
  const combatY = r * 0.68 * Math.sin(opts.aimAngle) + r * 0.1;
  const x = restX + (combatX - restX) * hover.combatT;
  const y = restY + (combatY - restY) * hover.combatT;
  const desiredAngle = restAngle + angleDelta(restAngle, combatAngle) * hover.combatT;
  const angleAlpha = 1 - Math.exp(-dt / 0.12);
  hover.angle += angleDelta(hover.angle, desiredAngle) * angleAlpha;
  if (hover.combatT === 1 && opts.swingTimer > 0) hover.angle = combatAngle;

  ctx.save();
  ctx.globalAlpha = hover.presence;
  ctx.translate(x, y);
  const entryScale = 0.85 + 0.15 * hover.presence;
  ctx.scale(entryScale, entryScale);
  ctx.rotate(hover.angle);
  drawWeapon(ctx, weapon, r);
  ctx.restore();
}

export function drawWeapon(ctx: CanvasRenderingContext2D, weapon: WeaponId, r: number): void {
  switch (weapon) {
    case 'espada':
      drawSword(ctx, r);
      break;
    case 'cajado':
      drawMageStaff(ctx, r);
      break;
    case 'arco':
      drawBow(ctx, r);
      break;
    case 'bastao':
      drawDruidStaff(ctx, r);
      break;
  }
}
