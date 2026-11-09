import type { StationRouteId } from './stationRoute';

type StationNavProps = {
  current: StationRouteId;
  onLobby: () => void;
  onOpenStation: (id: StationRouteId) => void;
};

const STATION_LABELS: Record<StationRouteId, string> = {
  bigorna: 'Bigorna',
  costura: 'Alfaiataria',
  joalheria: 'Joalheria',
  fogao: 'Cozinha',
};

const STATION_NAV_ORDER: StationRouteId[] = ['bigorna', 'costura', 'joalheria', 'fogao'];

export default function StationNav({ current, onLobby, onOpenStation }: StationNavProps) {
  return <nav className="station-nav" aria-label="Navegação entre estações">
    {STATION_NAV_ORDER.filter(id => id !== current).map(id =>
      <button
        key={id}
        type="button"
        className={`station-nav-button station-nav-${id}`}
        aria-label={`Abrir estação ${STATION_LABELS[id]}`}
        onClick={() => onOpenStation(id)}
      >{STATION_LABELS[id]}</button>,
    )}
    <button type="button" className="station-nav-button station-nav-lobby" aria-label="Voltar ao Lobby" onClick={onLobby}>Lobby</button>
  </nav>;
}
