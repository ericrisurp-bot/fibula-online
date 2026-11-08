export type StationRouteId = 'bigorna' | 'fogao' | 'costura' | 'joalheria';

const STATION_PATH_BY_ID: Record<StationRouteId, string> = {
  bigorna: '/bigorna',
  fogao: '/fogao',
  costura: '/alfaiataria',
  joalheria: '/joalheria',
};

const STATION_ID_BY_PATH = Object.fromEntries(
  Object.entries(STATION_PATH_BY_ID).map(([id, path]) => [path, id]),
) as Record<string, StationRouteId>;

export function readStationRoute(pathname = typeof window === 'undefined' ? '/' : window.location.pathname): StationRouteId | null {
  return STATION_ID_BY_PATH[pathname] ?? null;
}

export function isKnownStationPath(pathname: string): boolean {
  return pathname === '/' || readStationRoute(pathname) !== null;
}

export function navigateToStation(id: StationRouteId): void {
  if (typeof window === 'undefined') return;
  window.history.pushState({ station: id }, '', STATION_PATH_BY_ID[id]);
}

export function navigateToLobby(): void {
  if (typeof window === 'undefined') return;
  window.history.pushState({}, '', '/');
}
