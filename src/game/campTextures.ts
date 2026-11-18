type CampTextureKind = 'wood' | 'stone' | 'linen';

type TextureEntry = { canvas: HTMLCanvasElement };
const textureCache: Partial<Record<CampTextureKind, TextureEntry>> = {};
const patternCache = new WeakMap<CanvasRenderingContext2D, Partial<Record<CampTextureKind, CanvasPattern>>>();

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createTexture(kind: CampTextureKind): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const random = seededRandom(({ wood: 0x51a7, stone: 0x8d8b, linen: 0xe9e2 })[kind]);

  if (kind === 'wood') {
    ctx.fillStyle = '#4b3020';
    ctx.fillRect(0, 0, size, size);
    for (let x = 3; x < size; x += 9) {
      const offset = random() * 4;
      ctx.strokeStyle = random() > 0.5 ? '#a87542' : '#755038';
      ctx.globalAlpha = 0.55 + random() * 0.25;
      ctx.lineWidth = 1 + random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x + offset, 0);
      ctx.bezierCurveTo(x - 2, 18, x + 3, 43, x + offset, size);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const x = 6 + random() * 52;
      const y = 5 + random() * 54;
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = i % 2 ? '#a87542' : '#2f1d14';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(x, y, 2 + random() * 2, 1 + random(), random() * Math.PI, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (kind === 'stone') {
    ctx.fillStyle = '#514f49';
    ctx.fillRect(0, 0, size, size);
    const blocks = [
      [0, 0, 30, 19], [32, 0, 32, 21], [0, 21, 20, 22],
      [22, 23, 42, 19], [0, 45, 35, 19], [37, 44, 27, 20],
    ];
    for (const [x, y, w, h] of blocks) {
      const variation = Math.round(random() * 18 - 9);
      ctx.fillStyle = variation > 0 ? '#a5a39c' : '#8d8b84';
      ctx.globalAlpha = 0.82 + random() * 0.16;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 1);
      ctx.lineTo(x + w - 3, y + random() * 3);
      ctx.lineTo(x + w - 1, y + h - 3);
      ctx.lineTo(x + w * 0.55, y + h - 1);
      ctx.lineTo(x + 1, y + h - 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#514f49';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#e0ded7';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 4);
      ctx.lineTo(x + w * 0.55, y + 3);
      ctx.stroke();
    }
  } else if (kind === 'linen') {
    ctx.fillStyle = '#e9e2cf';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < size; i += 3) {
      ctx.strokeStyle = i % 6 === 0 ? '#fff8e9' : '#c7bda8';
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
      ctx.strokeStyle = i % 6 === 0 ? '#c7bda8' : '#fff8e9';
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  return canvas;
}

// As superfícies são preparadas uma única vez na carga do módulo; falhas deixam o cache vazio.
if (typeof document !== 'undefined') {
  for (const kind of ['wood', 'stone', 'linen'] as const) {
    try {
      const canvas = createTexture(kind);
      if (canvas) textureCache[kind] = { canvas };
    } catch {
      // O chamador usa o preenchimento chapado original como fallback.
    }
  }
}

export function campTexturePattern(ctx: CanvasRenderingContext2D, kind: CampTextureKind): CanvasPattern | null {
  const cached = patternCache.get(ctx)?.[kind];
  if (cached) return cached;
  const canvas = textureCache[kind]?.canvas;
  if (!canvas) return null;
  try {
    const pattern = ctx.createPattern(canvas, 'repeat');
    if (!pattern) return null;
    const contextPatterns = patternCache.get(ctx) ?? {};
    contextPatterns[kind] = pattern;
    patternCache.set(ctx, contextPatterns);
    return pattern;
  } catch {
    return null;
  }
}

export function fillCampTexture(ctx: CanvasRenderingContext2D, kind: CampTextureKind, fallback: string): void {
  ctx.fillStyle = campTexturePattern(ctx, kind) ?? fallback;
  ctx.fill();
}

export function fillCampTexturedRect(
  ctx: CanvasRenderingContext2D,
  kind: CampTextureKind,
  x: number,
  y: number,
  width: number,
  height: number,
  fallback: string,
): void {
  ctx.fillStyle = campTexturePattern(ctx, kind) ?? fallback;
  ctx.fillRect(x, y, width, height);
}
