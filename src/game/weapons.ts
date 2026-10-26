import type { WeaponId } from './config';

type Point = readonly [number, number];

function polygon(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  fill: string,
  stroke = '#25232a',
  lineWidth = 0.8,
) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
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
  // Arco segmentado em facetas, com corda reta e fina.
  const cx = r * 1.18;
  const cy = -r * 0.08;
  const rx = r * 0.37;
  const ry = r * 0.37;
  const outer: Point[] = [
    [cx, cy - ry],
    [cx + rx * 0.58, cy - ry * 0.78],
    [cx + rx, cy - ry * 0.28],
    [cx + rx, cy + ry * 0.28],
    [cx + rx * 0.58, cy + ry * 0.78],
    [cx, cy + ry],
  ];
  const inner: Point[] = [
    [cx + r * 0.07, cy - ry * 0.78],
    [cx + rx * 0.39, cy - ry * 0.62],
    [cx + rx * 0.68, cy - ry * 0.22],
    [cx + rx * 0.68, cy + ry * 0.22],
    [cx + rx * 0.39, cy + ry * 0.62],
    [cx + r * 0.07, cy + ry * 0.78],
  ];
  for (let i = 0; i < outer.length - 1; i++) {
    polygon(ctx, [outer[i], outer[i + 1], inner[i + 1], inner[i]], i < 2 ? '#e7c16a' : '#a97532', '#4d3927', 0.8);
  }
  ctx.strokeStyle = '#e9e2d1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy - ry);
  ctx.lineTo(cx, cy + ry);
  ctx.stroke();
  // Pequeno encaixe junto à empunhadura.
  polygon(ctx, [[r * 0.68, r * 0.13], [r * 0.79, r * 0.03], [r * 0.86, r * 0.12], [r * 0.75, r * 0.22]], '#79502d', '#3d3028', 0.7);
}

function drawDruidStaff(ctx: CanvasRenderingContext2D, r: number) {
  polygon(ctx, [[r * 0.66, r * 0.13], [r * 0.75, r * 0.02], [r * 1.43, -r * 0.42], [r * 1.48, -r * 0.3], [r * 0.82, r * 0.15]], '#68462e', '#332a25');
  polygon(ctx, [[r * 0.75, r * 0.02], [r * 1.43, -r * 0.42], [r * 1.39, -r * 0.32], [r * 0.82, r * 0.15]], '#a87545', '');
  polygon(ctx, [[r * 0.91, -r * 0.04], [r * 1.02, -r * 0.16], [r * 1.08, -r * 0.07], [r * 1.0, r * 0.02]], '#493222', '');
  polygon(ctx, [[r * 1.08, -r * 0.18], [r * 1.18, -r * 0.38], [r * 1.3, -r * 0.35], [r * 1.22, -r * 0.21]], '#315d36', '#24452c', 0.7);
  polygon(ctx, [[r * 1.18, -r * 0.38], [r * 1.3, -r * 0.35], [r * 1.22, -r * 0.21]], '#7bc66a', '');
  polygon(ctx, [[r * 1.17, -r * 0.13], [r * 1.27, -r * 0.27], [r * 1.4, -r * 0.23], [r * 1.31, -r * 0.09]], '#397b3c', '#24452c', 0.7);
  polygon(ctx, [[r * 1.27, -r * 0.27], [r * 1.4, -r * 0.23], [r * 1.31, -r * 0.09]], '#a0e27b', '');
  polygon(ctx, [[r * 1.29, -r * 0.43], [r * 1.41, -r * 0.53], [r * 1.54, -r * 0.43], [r * 1.52, -r * 0.29], [r * 1.4, -r * 0.24], [r * 1.3, -r * 0.31]], '#398b4b', '#21482c', 0.8);
  polygon(ctx, [[r * 1.29, -r * 0.43], [r * 1.41, -r * 0.53], [r * 1.43, -r * 0.38], [r * 1.3, -r * 0.31]], '#8fdf79', '');
  polygon(ctx, [[r * 1.43, -r * 0.38], [r * 1.41, -r * 0.53], [r * 1.54, -r * 0.43], [r * 1.52, -r * 0.29]], '#286d3b', '');
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
