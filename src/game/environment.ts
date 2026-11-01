export type EnvironmentSize = 'small' | 'medium' | 'large';

export const createGrassTile = () => {
  const tile = document.createElement('canvas');
  tile.width = 256;
  tile.height = 256;
  const ctx = tile.getContext('2d');
  if (!ctx) return tile;
  let seed = 173;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  ctx.fillStyle = '#557a43';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 46; i++) {
    const x = random() * 256, y = random() * 256;
    const radius = 8 + random() * 25;
    ctx.fillStyle = ['rgba(105,139,69,0.24)', 'rgba(38,91,48,0.18)', 'rgba(133,145,76,0.12)'][Math.floor(random() * 3)];
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * (0.45 + random() * 0.6), random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 420; i++) {
    const x = random() * 256, y = random() * 256;
    ctx.strokeStyle = random() > 0.5 ? 'rgba(158,180,104,0.32)' : 'rgba(31,75,39,0.28)';
    ctx.lineWidth = 0.7 + random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * 4, y - 1 - random() * 4);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const x = random() * 256, y = random() * 256;
    ctx.fillStyle = 'rgba(105,78,48,0.18)';
    ctx.beginPath();
    ctx.ellipse(x, y, 3 + random() * 7, 2 + random() * 4, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return tile;
};

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
  y: number,
  radius: number,
  rarity?: import('./config').ResourceRarity,
) {
  if (!rarity) return;
  const styles = {
    common: { color: '#49d879', fill: 'rgba(73,216,121,0.16)', edge: 'rgba(73,216,121,0.48)', blur: 14 },
    uncommon: { color: '#579fff', fill: 'rgba(87,159,255,0.12)', edge: 'rgba(87,159,255,0.4)', blur: 11 },
    rare: { color: '#b477f0', fill: 'rgba(180,119,240,0.22)', edge: 'rgba(180,119,240,0.62)', blur: 20 },
    legendary: { color: '#ff9b43', fill: 'rgba(255,155,67,0.32)', edge: 'rgba(255,155,67,0.82)', blur: 30 },
  } as const;
  const style = styles[rarity];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(x, y - radius * 0.12, radius * 0.08, x, y - radius * 0.12, radius);
  glow.addColorStop(0, style.fill);
  glow.addColorStop(0.58, style.fill);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(x, y - radius * 0.12, radius * 0.82, radius * 1.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = style.color;
  ctx.shadowBlur = style.blur;
  ctx.strokeStyle = style.edge;
  ctx.lineWidth = rarity === 'legendary' ? 2.2 : 1.4;
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.42, radius * 0.78, radius * 0.24, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
