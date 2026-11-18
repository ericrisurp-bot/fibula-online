export type EnvironmentSize = 'small' | 'medium' | 'large';

const GRASS_TILE_SIZE = 512;
const GRASS_BASE = '#557a43';

function seededRandom(initialSeed: number) {
  let seed = (initialSeed >>> 0) || 1;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function createGrassVariant(seed: number) {
  const tile = document.createElement('canvas');
  tile.width = GRASS_TILE_SIZE;
  tile.height = GRASS_TILE_SIZE;
  const ctx = tile.getContext('2d');
  if (!ctx) return tile;
  const random = seededRandom(seed);
  ctx.fillStyle = GRASS_BASE;
  ctx.fillRect(0, 0, GRASS_TILE_SIZE, GRASS_TILE_SIZE);

  // Manchas discretas e irregulares dão variação sem criar faixas ou blocos.
  for (let i = 0; i < 34; i++) {
    const x = random() * GRASS_TILE_SIZE;
    const y = random() * GRASS_TILE_SIZE;
    const radius = 12 + random() * 34;
    ctx.fillStyle = [
      'rgba(119,151,76,0.12)',
      'rgba(37,78,42,0.13)',
      'rgba(151,151,82,0.08)',
    ][Math.floor(random() * 3)];
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * (0.38 + random() * 0.7), random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fios maiores, curvos e em três tons para continuarem legíveis em escala real.
  const grassTones = ['rgba(166,190,111,0.48)', 'rgba(116,151,77,0.58)', 'rgba(40,91,47,0.52)'];
  for (let i = 0; i < 620; i++) {
    const x = random() * GRASS_TILE_SIZE;
    const y = random() * GRASS_TILE_SIZE;
    const height = 3 + random() * 6;
    const lean = (random() - 0.5) * 8;
    ctx.strokeStyle = grassTones[Math.floor(random() * grassTones.length)];
    ctx.lineWidth = 0.9 + random() * 1.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.45, y - height * 0.65, x + lean, y - height);
    ctx.stroke();
  }

  for (let i = 0; i < 48; i++) {
    const x = random() * GRASS_TILE_SIZE;
    const y = random() * GRASS_TILE_SIZE;
    const height = 5 + random() * 5;
    ctx.strokeStyle = random() > 0.5 ? 'rgba(171,194,113,0.58)' : 'rgba(42,91,46,0.62)';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - 5, y - height * 0.6, x - 3, y - height);
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 4, y - height * 0.65, x + 5, y - height * 0.9);
    ctx.stroke();
  }

  for (let i = 0; i < 9; i++) {
    const x = random() * GRASS_TILE_SIZE;
    const y = random() * GRASS_TILE_SIZE;
    ctx.fillStyle = 'rgba(105,78,48,0.13)';
    ctx.beginPath();
    ctx.ellipse(x, y, 2 + random() * 5, 1.5 + random() * 3, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return tile;
}

/** Mosaico 2x2 de quatro variantes independentes, cada uma com 512 px. */
export const createGrassTile = () => {
  const mosaic = document.createElement('canvas');
  mosaic.width = GRASS_TILE_SIZE * 2;
  mosaic.height = GRASS_TILE_SIZE * 2;
  const ctx = mosaic.getContext('2d');
  if (!ctx) return mosaic;
  ctx.fillStyle = GRASS_BASE;
  ctx.fillRect(0, 0, mosaic.width, mosaic.height);
  try {
    const variants = [173, 947, 2719, 7919].map(createGrassVariant);
    variants.forEach((variant, index) => {
      const x = (index % 2) * GRASS_TILE_SIZE;
      const y = Math.floor(index / 2) * GRASS_TILE_SIZE;
      ctx.drawImage(variant, x, y);
    });
  } catch {
    ctx.fillStyle = GRASS_BASE;
    ctx.fillRect(0, 0, mosaic.width, mosaic.height);
  }
  return mosaic;
};

/** Variação estática do chão; chamada uma única vez ao preparar o terrainCanvas. */
export function drawGrassTerrainDetails(
  ctx: CanvasRenderingContext2D,
  worldSize: number,
  lake?: { x: number; y: number; rx: number; ry: number },
) {
  const random = seededRandom(0x61f1ba);
  const center = worldSize / 2;
  const safeRadius = Math.max(210, worldSize * 0.055);
  const isNearSpawn = (x: number, y: number) => Math.hypot(x - center, y - center) < safeRadius;
  const isNearLake = (x: number, y: number) => {
    if (!lake || lake.rx <= 0 || lake.ry <= 0) return false;
    const nx = (x - lake.x) / (lake.rx + 90);
    const ny = (y - lake.y) / (lake.ry + 90);
    return nx * nx + ny * ny < 1;
  };

  // Grandes manchas com contorno orgânico e transparência baixa.
  const patchColors = [
    'rgba(91,111,57,0.10)',
    'rgba(42,76,43,0.09)',
    'rgba(119,143,67,0.08)',
  ];
  for (let i = 0; i < 105; i++) {
    const x = random() * worldSize;
    const y = random() * worldSize;
    if (isNearSpawn(x, y)) continue;
    const radius = 100 + random() * 200;
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = patchColors[Math.floor(random() * patchColors.length)];
    ctx.beginPath();
    const points = 11;
    for (let p = 0; p < points; p++) {
      const angle = (p / points) * Math.PI * 2;
      const wobble = radius * (0.72 + random() * 0.42);
      const px = x + Math.cos(angle) * wobble;
      const py = y + Math.sin(angle) * wobble * (0.65 + random() * 0.45);
      if (p === 0) ctx.moveTo(px, py);
      else ctx.quadraticCurveTo(
        x + Math.cos(angle - Math.PI / points) * radius,
        y + Math.sin(angle - Math.PI / points) * radius,
        px, py,
      );
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Faixa úmida junto à muralha, sem interferir no traço/colisão da própria muralha.
  const edgeWidth = 105;
  const edgeGradient = ctx.createLinearGradient(0, 0, edgeWidth, 0);
  edgeGradient.addColorStop(0, 'rgba(35,65,39,0.20)');
  edgeGradient.addColorStop(1, 'rgba(35,65,39,0)');
  ctx.fillStyle = edgeGradient;
  ctx.fillRect(0, 0, edgeWidth, worldSize);
  const rightGradient = ctx.createLinearGradient(worldSize, 0, worldSize - edgeWidth, 0);
  rightGradient.addColorStop(0, 'rgba(35,65,39,0.20)');
  rightGradient.addColorStop(1, 'rgba(35,65,39,0)');
  ctx.fillStyle = rightGradient;
  ctx.fillRect(worldSize - edgeWidth, 0, edgeWidth, worldSize);
  const topGradient = ctx.createLinearGradient(0, 0, 0, edgeWidth);
  topGradient.addColorStop(0, 'rgba(35,65,39,0.20)');
  topGradient.addColorStop(1, 'rgba(35,65,39,0)');
  ctx.fillStyle = topGradient;
  ctx.fillRect(0, 0, worldSize, edgeWidth);
  const bottomGradient = ctx.createLinearGradient(0, worldSize, 0, worldSize - edgeWidth);
  bottomGradient.addColorStop(0, 'rgba(35,65,39,0.20)');
  bottomGradient.addColorStop(1, 'rgba(35,65,39,0)');
  ctx.fillStyle = bottomGradient;
  ctx.fillRect(0, worldSize - edgeWidth, worldSize, edgeWidth);

  if (lake && lake.rx > 0 && lake.ry > 0) {
    const shore = ctx.createRadialGradient(lake.x, lake.y, Math.min(lake.rx, lake.ry) * 0.82, lake.x, lake.y, Math.max(lake.rx, lake.ry) + 115);
    shore.addColorStop(0, 'rgba(40,74,43,0)');
    shore.addColorStop(0.72, 'rgba(40,74,43,0.11)');
    shore.addColorStop(1, 'rgba(40,74,43,0)');
    ctx.fillStyle = shore;
    ctx.beginPath();
    ctx.ellipse(lake.x, lake.y, lake.rx + 115, lake.ry + 115, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pequenos detalhes orgânicos, espaçados e fora do ponto inicial do jogador.
  for (let i = 0; i < 460; i++) {
    const x = random() * worldSize;
    const y = random() * worldSize;
    if (isNearSpawn(x, y) || isNearLake(x, y)) continue;
    const kind = random();
    if (kind < 0.48) {
      ctx.strokeStyle = random() > 0.5 ? 'rgba(174,195,111,0.62)' : 'rgba(46,91,48,0.58)';
      ctx.lineWidth = 1.3 + random() * 0.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + (random() - 0.5) * 8, y - 5, x + (random() - 0.5) * 10, y - 8 - random() * 4);
      ctx.stroke();
    } else if (kind < 0.59) {
      ctx.fillStyle = random() > 0.5 ? '#e9e4c9' : '#d9bd58';
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      ctx.arc(x, y, 1.1 + random() * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (kind < 0.78) {
      ctx.fillStyle = 'rgba(129,103,66,0.48)';
      ctx.beginPath();
      ctx.ellipse(x, y, 2 + random() * 2.5, 1 + random() * 1.5, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(157,164,143,0.52)';
      ctx.beginPath();
      ctx.ellipse(x, y, 1.5 + random() * 2, 1 + random(), random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, size: EnvironmentSize) {
          const scale = size === 'small' ? 1.75 : size === 'medium' ? 2.45 : 3.25;
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  const polygon = (points: Array<[number, number]>, fill: string, stroke?: string) => {
    ctx.beginPath();
    points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.1; ctx.stroke(); }
  };
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(0, 29, 19, 8, 0, 0, Math.PI * 2); ctx.fill();

  // Tronco facetado, raízes e galhos visíveis sob a copa.
  polygon([[-5, 0], [-3, 3], [-4, 25], [-8, 29], [-3, 28], [0, 30], [3, 28], [8, 29], [4, 24], [4, 1], [0, -2]], '#805333', '#593820');
  polygon([[-3, 4], [-1, 2], [-1, 26], [-4, 27]], '#b98451');
  polygon([[1, 7], [3, 5], [3, 24], [1, 26]], '#694329');
  polygon([[-3, 11], [-9, 5], [-11, 0], [-8, 7], [-2, 14]], '#805333', '#593820');
  polygon([[3, 12], [8, 6], [10, 1], [9, 8], [2, 16]], '#805333', '#593820');

  // Silhueta irregular e facetas de sombra/luz para o visual low-poly.
  polygon([[-20, 1], [-18, -8], [-12, -12], [-13, -20], [-6, -25], [0, size === 'large' ? -39 : -34], [7, -26], [15, -24], [14, -16], [20, -10], [18, 0], [10, 7], [0, 10], [-12, 7]], '#214d34', '#173d2a');
  polygon([[-18, -7], [-12, -12], [-13, -20], [-6, -25], [0, -34], [2, -19], [-5, -10], [-7, 2], [-15, 2]], '#397b4c');
  polygon([[0, -34], [7, -26], [15, -24], [14, -16], [20, -10], [18, 0], [8, 4], [3, -7], [7, -17]], '#2d6942');
  polygon([[-18, -7], [-12, -12], [-6, -8], [-10, -1], [-15, 2]], '#4a8a51');
  polygon([[-13, -20], [-6, -25], [0, -34], [-1, -21], [-7, -14]], '#60965a');
  polygon([[-7, -14], [-1, -21], [5, -17], [3, -8], [-5, -5]], '#4c8750');
  polygon([[2, -19], [7, -26], [15, -24], [9, -16]], '#43804a');
  polygon([[9, -16], [14, -16], [20, -10], [12, -7], [5, -10]], '#285b3b');
  polygon([[-15, 2], [-7, 2], [-2, 8], [-12, 7], [-18, 1]], '#285b3b');
  polygon([[3, -7], [8, 4], [0, 10], [-2, 1]], '#245537');
  ctx.restore();
}

export function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, size: EnvironmentSize) {
          const scale = size === 'small' ? 1.22 : size === 'medium' ? 1.5 : 1.85;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(2, 10 * scale, 19 * scale, 8 * scale, 0, 0, Math.PI * 2); ctx.fill();

  const facet = (points: Array<[number, number]>, fill: string) => {
    ctx.beginPath();
    points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x * scale, y * scale) : ctx.lineTo(x * scale, y * scale));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  };

  // Contorno irregular e planos pequenos, distribuídos pela forma da rocha.
  ctx.beginPath();
  ctx.moveTo(-18 * scale, 2 * scale);
  ctx.lineTo(-16 * scale, -6 * scale);
  ctx.lineTo(-11 * scale, -12 * scale);
  ctx.lineTo(-5 * scale, -18 * scale);
  ctx.lineTo(2 * scale, -16 * scale);
  ctx.lineTo(7 * scale, -18 * scale);
  ctx.lineTo(14 * scale, -11 * scale);
  ctx.lineTo(19 * scale, -4 * scale);
  ctx.lineTo(16 * scale, 4 * scale);
  ctx.lineTo(13 * scale, 9 * scale);
  ctx.lineTo(5 * scale, 12 * scale);
  ctx.lineTo(-4 * scale, 11 * scale);
  ctx.lineTo(-12 * scale, 9 * scale);
  ctx.closePath();
  ctx.fillStyle = '#788188'; ctx.fill();
  ctx.strokeStyle = '#454d53'; ctx.lineWidth = 1.5; ctx.stroke();

  // Facetas quebradas e assimétricas: evitam uma faixa clara atravessando o centro.
  facet([[-18, 2], [-16, -6], [-11, -12], [-8, -4], [-10, 3], [-12, 9]], '#929ba1');
  facet([[-16, -6], [-11, -12], [-5, -18], [-2, -9], [-8, -4]], '#aab2b7');
  facet([[-5, -18], [2, -16], [5, -10], [-2, -9]], '#c0c6ca');
  facet([[2, -16], [7, -18], [14, -11], [8, -7], [5, -10]], '#aeb7bd');
  facet([[14, -11], [19, -4], [12, -1], [8, -7]], '#89939a');
  facet([[-8, -4], [-2, -9], [5, -10], [2, -2], [-4, 3]], '#9ca6ac');
  facet([[5, -10], [8, -7], [12, -1], [5, 3], [2, -2]], '#737e85');
  facet([[-10, 3], [-8, -4], [-4, 3], [-5, 8], [-12, 9]], '#7e898f');
  facet([[-4, 3], [2, -2], [5, 3], [1, 8], [-5, 8]], '#a2abb0');
  facet([[5, 3], [12, -1], [16, 4], [13, 9], [5, 12], [1, 8]], '#68737a');
  facet([[-12, 9], [-5, 8], [1, 8], [5, 12], [-4, 11]], '#657078');
  facet([[12, -1], [19, -4], [16, 4]], '#59646b');

  // Microfissuras assimétricas, integradas às facetas (sem formar um rosto).
  ctx.strokeStyle = 'rgba(48,56,61,0.58)'; ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(-13 * scale, -7 * scale); ctx.lineTo(-11 * scale, -5 * scale); ctx.lineTo(-12 * scale, -3 * scale);
  ctx.moveTo(10 * scale, 4 * scale); ctx.lineTo(8 * scale, 6 * scale);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(230,235,238,0.34)'; ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(-10 * scale, -10 * scale); ctx.lineTo(-6 * scale, -15 * scale);
  ctx.moveTo(3 * scale, -14 * scale); ctx.lineTo(5 * scale, -15 * scale);
  ctx.stroke();
  ctx.restore();
}

 
export function drawResourceRarityAura(
  ctx: CanvasRenderingContext2D,
  x: number,
  footY: number,
  radius: number,
  rarity?: import('./config').ResourceRarity,
) {
  if (!rarity) return;
  const styles = {
    common: { color: '#36d66f', opacity: 0.25, blur: 15 },
    uncommon: { color: '#348cff', opacity: 0.28, blur: 17 },
    rare: { color: '#a34be8', opacity: 0.36, blur: 23 },
    legendary: { color: '#ff8a24', opacity: 0.48, blur: 30 },
  } as const;
  const style = styles[rarity];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.shadowColor = style.color;
  ctx.shadowBlur = style.blur;
  const glow = ctx.createRadialGradient(x, footY, 0, x, footY, radius);
  glow.addColorStop(0, `rgba(${rarity === 'common' ? '54,214,111' : rarity === 'uncommon' ? '52,140,255' : rarity === 'rare' ? '163,75,232' : '255,138,36'},${style.opacity})`);
  glow.addColorStop(0.42, `rgba(${rarity === 'common' ? '54,214,111' : rarity === 'uncommon' ? '52,140,255' : rarity === 'rare' ? '163,75,232' : '255,138,36'},${style.opacity * 0.48})`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(x, footY, radius * 1.2, radius * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
