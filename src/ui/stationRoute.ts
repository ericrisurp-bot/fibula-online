export type StationRouteId = 'bigorna' | 'fogao' | 'costura' | 'joalheria';
export type ReservedPageId = 'arsenal' | 'bau' | 'amigos' | 'classes' | 'status' | 'ranking' | 'jogador';
export type StaticPageId = 'lobby' | StationRouteId | ReservedPageId;
export type GameRoute =
  | { page: StaticPageId }
  | { page: 'jogador'; playerId: string };

export const PAGE_PATH_BY_ID: Record<StaticPageId, string> = {
  lobby: '/',
  bigorna: '/bigorna',
  fogao: '/fogao',
  costura: '/alfaiataria',
  joalheria: '/joalheria',
  arsenal: '/arsenal',
  bau: '/bau',
  amigos: '/amigos',
  classes: '/classes',
  status: '/status',
  ranking: '/ranking',
  jogador: '/jogador/:id',
};

const PAGE_ID_BY_PATH = new Map(
  Object.entries(PAGE_PATH_BY_ID).map(([id, path]) => [path, id as StaticPageId]),
);

export function readGameRoute(pathname = typeof window === 'undefined' ? '/' : window.location.pathname): GameRoute | null {
  const page = PAGE_ID_BY_PATH.get(pathname);
  if (page) return { page };
  const playerPrefix = PAGE_PATH_BY_ID.jogador.slice(0, -':id'.length);
  if (!pathname.startsWith(playerPrefix)) return null;
  const playerSegment = pathname.slice(playerPrefix.length).replace(/\/$/, '');
  if (!playerSegment || playerSegment.includes('/')) return null;
  try {
    return { page: 'jogador', playerId: decodeURIComponent(playerSegment) };
  } catch {
    return null;
  }
}

export function isKnownGamePath(pathname: string): boolean {
  return readGameRoute(pathname) !== null;
}

export function isStationRoute(route: GameRoute | null): route is { page: StationRouteId } {
  return route !== null && route.page !== 'lobby' && route.page !== 'arsenal' &&
    route.page !== 'bau' && route.page !== 'amigos' && route.page !== 'classes' &&
    route.page !== 'status' && route.page !== 'ranking' && route.page !== 'jogador';
}

export function readStationRoute(pathname?: string): StationRouteId | null {
  const route = readGameRoute(pathname);
  return isStationRoute(route) ? route.page : null;
}

export function navigateToStation(id: StationRouteId): void {
  if (typeof window === 'undefined') return;
  window.history.pushState({ page: id }, '', PAGE_PATH_BY_ID[id]);
}

export function navigateToLobby(): void {
  if (typeof window === 'undefined') return;
  window.history.replaceState({ page: 'lobby' }, '', PAGE_PATH_BY_ID.lobby);
}
