import { CONFIG, type WeaponId } from './config';

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
  // Todas as peças ficam alinhadas ao eixo +x; a geometria é simétrica em y.
  // Pomo facetado dourado, de x=0.56 a 0.74.
  facet(ctx, r, [[0.56,0],[0.59,-0.10],[0.66,-0.14],[0.72,-0.09],[0.74,0],[0.72,0.09],[0.66,0.14],[0.59,0.10]], '#9b7135', '#29252a', 1.2);
  facet(ctx, r, [[0.59,-0.10],[0.66,-0.14],[0.68,0],[0.59,0]], '#f3d887', '');
  facet(ctx, r, [[0.68,0],[0.72,-0.09],[0.74,0],[0.72,0.09],[0.68,0]], '#75502d', '');
  facet(ctx, r, [[0.59,0],[0.68,0],[0.66,0.14],[0.59,0.10]], '#c69a4c', '');

  // Empunhadura reta de couro, com quatro faixas alternadas e costura clara.
  facet(ctx, r, [[0.74,-0.10],[1.06,-0.10],[1.06,0.10],[0.74,0.10]], '#4b3025', '#292329', 1.2);
  facet(ctx, r, [[0.75,-0.085],[0.82,-0.085],[0.82,0.085],[0.75,0.085]], '#b77b45', '');
  facet(ctx, r, [[0.82,-0.085],[0.89,-0.085],[0.89,0.085],[0.82,0.085]], '#65402d', '');
  facet(ctx, r, [[0.89,-0.085],[0.96,-0.085],[0.96,0.085],[0.89,0.085]], '#c18b52', '');
  facet(ctx, r, [[0.96,-0.085],[1.03,-0.085],[1.03,0.085],[0.96,0.085]], '#70452d', '');
  ctx.save();
  ctx.strokeStyle = '#e8c995';
  ctx.lineWidth = 0.8;
  for (const x of [0.80, 0.87, 0.94, 1.01]) {
    ctx.beginPath();
    ctx.moveTo(x * r, -0.062 * r);
    ctx.lineTo(x * r, -0.035 * r);
    ctx.moveTo(x * r, 0.035 * r);
    ctx.lineTo(x * r, 0.062 * r);
    ctx.stroke();
  }
  ctx.restore();

  // Pequena faixa de pano vermelho logo abaixo da guarda.
  facet(ctx, r, [[1.00,-0.105],[1.06,-0.105],[1.06,0.105],[1.00,0.105]], '#8e2535', '#33232a', 1.0);
  facet(ctx, r, [[1.00,-0.105],[1.025,-0.105],[1.025,0.105],[1.00,0.105]], '#e34a50', '');

  // Guarda em cruz: pontas recurvadas para a frente, dentro de x=1.06..1.22.
  facet(ctx, r, [[1.06,-0.09],[1.075,-0.29],[1.13,-0.47],[1.19,-0.52],[1.22,-0.47],[1.19,-0.34],[1.15,-0.14],[1.15,0.14],[1.19,0.34],[1.22,0.47],[1.19,0.52],[1.13,0.47],[1.075,0.29],[1.06,0.09]], '#9b7138', '#30272a', 1.2);
  facet(ctx, r, [[1.075,-0.29],[1.13,-0.47],[1.16,-0.36],[1.12,-0.13],[1.12,0.13],[1.16,0.36],[1.13,0.47],[1.075,0.29],[1.10,0]], '#f0d184', '');
  facet(ctx, r, [[1.16,-0.36],[1.22,-0.47],[1.19,-0.34],[1.15,-0.14],[1.15,0.14],[1.19,0.34],[1.22,0.47],[1.16,0.36],[1.12,0]], '#68462e', '');
  facet(ctx, r, [[1.06,-0.09],[1.15,-0.14],[1.15,0.14],[1.06,0.09]], '#c49a50', '');

  // Gema vermelha central em três facetas.
  facet(ctx, r, [[1.105,-0.075],[1.145,-0.09],[1.18,-0.035],[1.18,0.035],[1.145,0.09],[1.105,0.075],[1.09,0]], '#a62436', '#3b2529', 1.0);
  facet(ctx, r, [[1.105,-0.075],[1.145,-0.09],[1.145,0],[1.09,0]], '#ff7772', '');
  facet(ctx, r, [[1.145,-0.09],[1.18,-0.035],[1.18,0.035],[1.145,0]], '#c92d42', '');
  facet(ctx, r, [[1.09,0],[1.145,0],[1.105,0.075],[1.09,0]], '#6f1e32', '');

  // Ricasso curto entre a guarda e a lâmina.
  facet(ctx, r, [[1.22,-0.24],[1.39,-0.23],[1.39,0.23],[1.22,0.24]], '#64727a', '#283139', 1.2);
  facet(ctx, r, [[1.23,-0.22],[1.31,-0.21],[1.31,0.21],[1.23,0.22]], '#d5e1e3', '');
  facet(ctx, r, [[1.31,-0.21],[1.39,-0.23],[1.39,0.23],[1.31,0.21]], '#45535d', '');

  // Lâmina: meia largura 0.24 na base, 0.13 em x=3.2 e ponta exata em x=3.70.
  facet(ctx, r, [[1.22,-0.24],[3.20,-0.13],[3.70,0],[3.20,0.13],[1.22,0.24]], '#72838b', '#263139', 1.2);
  // Plano superior claro e plano inferior escuro, ao longo da lâmina.
  facet(ctx, r, [[1.24,-0.225],[3.20,-0.13],[3.70,0],[2.98,0],[1.30,-0.035]], '#e7f0ef', '');
  facet(ctx, r, [[1.30,-0.035],[2.98,0],[3.70,0],[3.20,0.13],[1.24,0.225]], '#465761', '');
  // Facetas adicionais do bisel, sem quebrar a simetria.
  facet(ctx, r, [[1.28,-0.16],[3.20,-0.105],[3.20,-0.035],[1.34,-0.075]], '#b9cbd0', '');
  facet(ctx, r, [[1.28,0.16],[3.20,0.105],[3.20,0.035],[1.34,0.075]], '#354750', '');
  // Canaleta central de x=1.5 a 3.2, com fio vermelho fino.
  facet(ctx, r, [[1.50,-0.025],[3.20,-0.012],[3.20,0.012],[1.50,0.025]], '#33444d', '');
  facet(ctx, r, [[1.55,-0.006],[3.12,-0.004],[3.12,0.004],[1.55,0.006]], '#d13a45', '');
  // Filete de brilho no gume superior.
  facet(ctx, r, [[1.27,-0.205],[3.18,-0.122],[3.48,-0.058],[3.20,-0.112],[1.30,-0.19]], '#fbffff', '');
  // Ponta chanfrada em duas facetas; vértice em x=3.70*r.
  facet(ctx, r, [[3.20,-0.13],[3.70,0],[3.20,0]], '#f5fbf9', '');
  facet(ctx, r, [[3.20,0],[3.70,0],[3.20,0.13]], '#394a54', '');
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
  // Aumenta o arco inteiro em 40%, mantendo o centro visual no mesmo lugar.
  ctx.save();
  ctx.translate(1.4 * r, 0);
  ctx.scale(1.4, 1.4);
  ctx.translate(-1.4 * r, 0);
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

  // Corda puxada para trás: dois segmentos finos formam um V simétrico.
  const nockPointX = 0.15;
  ctx.beginPath();
  ctx.moveTo(centerAt(-halfHeight) * r, -halfHeight * r);
  ctx.lineTo(nockPointX * r, 0);
  ctx.lineTo(centerAt(halfHeight) * r, halfHeight * r);
  ctx.strokeStyle = '#f2eadb';
  ctx.lineWidth = Math.max(0.7, r * 0.018);
  ctx.stroke();

  // Flecha decorativa encaixada na corda; não participa da mecânica de projéteis.
  // Desloca a flecha inteira para que o nock coincida com o vértice do V.
  const nockX = centerAt(0);
  ctx.save();
  // Inverte a flecha horizontalmente: ponta e penas trocam de extremidade.
  // Mantém o conjunto dentro da mesma área visual antes da redução para 50%.
  ctx.translate((2 * nockPointX + 0.5 * (4.38 - nockX)) * r, 0);
  ctx.scale(-1, 1);
  // Reduz a flecha para 50%, mantendo o conjunto alinhado à corda.
  ctx.translate(nockPointX * r, 0);
  ctx.scale(0.5, 0.5);
  ctx.translate(-nockX * r, 0);
  // Haste de madeira clara, comprimento total aproximado de 3.2*r até a ponta antes da escala.
  facet(ctx, r, [[nockX,-0.035],[3.94,-0.035],[3.94,0.035],[nockX,0.035]], '#b98a50', '#4c3a2b', 0.8);
  facet(ctx, r, [[nockX,-0.027],[3.91,-0.027],[3.91,-0.006],[nockX,-0.006]], '#f0d5a0', '');
  facet(ctx, r, [[1.24,0.006],[3.94,0.006],[3.94,0.035],[1.24,0.035]], '#8c623c', '');
  // Nock traseiro com entalhe voltado para a corda.
  facet(ctx, r, [[nockX,-0.055],[nockX+0.075,-0.035],[nockX+0.075,0.035],[nockX,0.055],[nockX+0.025,0],[nockX,0]], '#e7e5dc', '#50535a', 0.8);

  // Três vanes traseiros; os dois principais são facetas espelhadas vermelho e creme.
  facet(ctx, r, [[1.23,-0.028],[1.34,-0.095],[1.58,-0.17],[1.78,-0.16],[1.66,-0.09],[1.48,-0.035]], '#c93442', '#522b31', 0.8);
  facet(ctx, r, [[1.23,0.028],[1.34,0.095],[1.58,0.17],[1.78,0.16],[1.66,0.09],[1.48,0.035]], '#f2e5c9', '#66584a', 0.8);
  facet(ctx, r, [[1.22,-0.012],[1.35,0],[1.65,0.012],[1.77,0]], '#8c2939', '');
  // Quatro barbas diagonais finas em cada vane.
  ctx.save();
  ctx.lineWidth = 0.65;
  ctx.strokeStyle = '#f08a8c';
  for (const [x, y] of [[1.37,-0.06],[1.44,-0.08],[1.51,-0.105],[1.58,-0.125]]) {
    ctx.beginPath(); ctx.moveTo(x*r, y*r); ctx.lineTo((x+0.055)*r, (y-0.045)*r); ctx.stroke();
  }
  ctx.strokeStyle = '#b3a28b';
  for (const [x, y] of [[1.37,0.06],[1.44,0.08],[1.51,0.105],[1.58,0.125]]) {
    ctx.beginPath(); ctx.moveTo(x*r, y*r); ctx.lineTo((x+0.055)*r, (y+0.045)*r); ctx.stroke();
  }
  // Terceiro vane estreito visível junto ao eixo.
  ctx.strokeStyle = '#dfcba8';
  ctx.beginPath(); ctx.moveTo(1.28*r, 0); ctx.lineTo(1.63*r, 0); ctx.stroke();
  ctx.restore();

  // Três marcas curtas de veio na haste.
  ctx.save();
  ctx.strokeStyle = '#6f4c32';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(2.02*r, -0.018*r); ctx.lineTo(2.11*r, -0.006*r);
  ctx.moveTo(2.72*r, 0.012*r); ctx.lineTo(2.82*r, 0.002*r);
  ctx.moveTo(3.35*r, -0.016*r); ctx.lineTo(3.44*r, -0.004*r);
  ctx.stroke();
  ctx.restore();

  // Amarração colorida na junção dos vanes com a haste.
  facet(ctx, r, [[1.19,-0.045],[1.23,-0.045],[1.23,0.045],[1.19,0.045]], '#b52c3c', '#5c2830', 0.7);
  facet(ctx, r, [[1.195,-0.04],[1.215,-0.04],[1.215,0.04],[1.195,0.04]], '#f1c76a', '');

  // Soquete metálico curto, amarração e ponta de aço em forma de folha.
  facet(ctx, r, [[3.82,-0.045],[3.96,-0.045],[3.96,0.045],[3.82,0.045]], '#7c8990', '#414950', 0.8);
  facet(ctx, r, [[3.83,-0.028],[3.95,-0.028],[3.95,-0.008],[3.83,-0.008]], '#dfe8e8', '');
  facet(ctx, r, [[3.78,-0.048],[3.81,-0.048],[3.81,0.048],[3.78,0.048]], '#c13a46', '#4b2b31', 0.7);
  facet(ctx, r, [[3.93,-0.04],[4.12,-0.11],[4.27,-0.065],[4.38,0],[4.27,0.065],[4.12,0.11],[3.93,0.04]], '#9ba8ad', '#3e4b53', 1.0);
  // Três facetas da ponta: clara, média e escura.
  facet(ctx, r, [[3.94,-0.035],[4.12,-0.11],[4.38,0],[4.13,-0.012]], '#edf4f1', '');
  facet(ctx, r, [[4.13,-0.012],[4.38,0],[4.27,0.065],[4.12,0.11]], '#687780', '');
  facet(ctx, r, [[3.94,0.035],[4.13,-0.012],[4.27,0.065],[4.12,0.11]], '#b7c3c7', '');
  ctx.restore();
  ctx.restore();
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

  // Enquanto houver alvo, mantém a arma no lado em que já está; só reposiciona após perdê-lo.
  if (!opts.hasTarget) {
    if (opts.facingX < -0.35) hover.side = 1;
    else if (opts.facingX > 0.35) hover.side = -1;
  }

  const sideAlpha = 1 - Math.exp(-dt / 0.15);
  hover.sideT += (hover.side - hover.sideT) * sideAlpha;
  const movingTarget = opts.moving ? 1 : 0;
  hover.moveT += (movingTarget - hover.moveT) * sideAlpha;

  const combatTarget = opts.hasTarget ? 1 : 0;
  const combatAlpha = 1 - Math.exp(-dt / 0.12);
  hover.combatT += (combatTarget - hover.combatT) * combatAlpha;
  if (opts.swingTimer > 0) hover.combatT = 1;

  const bob = Math.sin(opts.time * 2.2) * 1.6;
  const restX = hover.sideT * CONFIG.player.auraRadius;
  const restY = (weapon === 'arco' ? -r * 0.1 : r * 0.35) + bob;
  const restLean = Math.sin(opts.time * 1.7) * 0.04
    - hover.sideT * 0.10 * hover.moveT;
  // Sem alvo, o arco aponta contra o movimento horizontal: esquerda -> direita, direita -> esquerda.
  const bowRestAngle = hover.side < 0 ? Math.PI : 0;
  const restAngle = (weapon === 'arco' ? bowRestAngle : -Math.PI / 2) + restLean;

  const swingProgress = opts.swingTimer > 0 ? 1 - opts.swingTimer / 0.24 : 0;
  const combatAngle = opts.swingTimer > 0
    ? opts.swingAngle + (swingProgress - 0.5) * 1.55
    : opts.aimAngle;
  const combatDirection = opts.swingTimer > 0
    ? opts.swingAngle
    : opts.aimAngle;
  const combatDistance = weapon === 'espada'
    ? Math.max(0, CONFIG.weapons.espada.range - SWORD_TIP_LENGTH)
    : CONFIG.player.auraRadius - r * 0.68;
  const combatX = combatDistance * Math.cos(combatDirection);
  const combatY = combatDistance * Math.sin(combatDirection);
  const x = weapon === 'espada' ? restX + (combatX - restX) * hover.combatT : restX;
  const y = weapon === 'espada' ? restY + (combatY - restY) * hover.combatT : restY;
  // Armas à distância acompanham a velocidade de ataque: com alvo, a pose é exatamente a da mira
  // (sem suavização), igual à usada pelo motor para a saída do projétil.
  const desiredAngle = weapon === 'espada'
    ? restAngle + angleDelta(restAngle, combatAngle) * hover.combatT
    : weapon === 'arco' && opts.hasTarget
      ? opts.aimAngle
      : restAngle;
  const angleAlpha = 1 - Math.exp(-dt / 0.12);
  // O arco acompanha a mira sem atraso, para a flecha sair no mesmo eixo visual.
  if (weapon === 'arco' && opts.hasTarget) hover.angle = desiredAngle;
  else hover.angle += angleDelta(hover.angle, desiredAngle) * angleAlpha;
  if (weapon === 'espada' && hover.combatT === 1 && opts.swingTimer > 0) hover.angle = combatAngle;

  ctx.save();
  ctx.globalAlpha = hover.presence;
  ctx.translate(x, y);
  const entryScale = 0.85 + 0.15 * hover.presence;
  ctx.scale(entryScale, entryScale);
  ctx.rotate(hover.angle);
  drawWeapon(ctx, weapon, r);
  ctx.restore();
}

/** Espada mais larga e longa que a arte base, para ler melhor em jogo. */
const SWORD_SCALE_X = 1.25;
const SWORD_SCALE_Y = 1.7;
/** Distância da empunhadura à ponta da lâmina, em px (a razão r cancela na normalização visual). */
const SWORD_TIP_LENGTH = (3.7 * 50 / 3.14) * SWORD_SCALE_X;

const WEAPON_VISUAL_LENGTH: Record<WeaponId, number> = {
  espada: 3.14,
  cajado: 3.07,
  arco: 3.4,
  bastao: 2.57,
};

export function drawWeapon(ctx: CanvasRenderingContext2D, weapon: WeaponId, r: number): void {
  // Normaliza o maior eixo visual de cada arma para cerca de 50 unidades.
  const visualScale = 50 / (WEAPON_VISUAL_LENGTH[weapon] * r);
  ctx.save();
  ctx.scale(visualScale, visualScale);
  if (weapon === 'espada') ctx.scale(SWORD_SCALE_X, SWORD_SCALE_Y);
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
  ctx.restore();
}
