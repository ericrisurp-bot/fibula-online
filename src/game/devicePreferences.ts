const GUIDE_ENABLED_KEY = 'fibula-adventurer-guide-enabled';
const GAME_ZOOM_KEY = 'fibula-game-zoom';

const MIN_GAME_ZOOM = 0.8;

function getMaxGameZoom(): number {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 1.75 : 1.45;
}

function getDefaultGameZoom(): number {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 1.55 : 1.3;
}

export function readAdventurerGuideEnabled(): boolean {
  try {
    return window.localStorage.getItem(GUIDE_ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeAdventurerGuideEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(GUIDE_ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // A preferência continua valendo durante a sessão se o armazenamento estiver indisponível.
  }
}

export function readGameZoom(): number {
  const fallback = getDefaultGameZoom();
  try {
    const saved = window.localStorage.getItem(GAME_ZOOM_KEY);
    if (saved === null) return fallback;
    const parsed = Number(saved);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(MIN_GAME_ZOOM, Math.min(getMaxGameZoom(), parsed));
  } catch {
    return fallback;
  }
}

export function writeGameZoom(zoom: number): void {
  if (!Number.isFinite(zoom)) return;
  try {
    const safeZoom = Math.max(MIN_GAME_ZOOM, Math.min(getMaxGameZoom(), zoom));
    window.localStorage.setItem(GAME_ZOOM_KEY, String(safeZoom));
  } catch {
    // O zoom permanece aplicado na partida atual mesmo sem persistência local.
  }
}
