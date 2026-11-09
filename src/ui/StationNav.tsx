import type { StationRouteId } from './stationRoute';

type StationNavProps = {
  current: StationRouteId;
  onLobby: () => void;
  onOpenStation: (id: StationRouteId) => void;
};

const STATIONS: { id: StationRouteId; label: string }[] = [
  { id: 'bigorna', label: 'Bigorna' },
  { id: 'fogao', label: 'Cozinha' },
  { id: 'costura', label: 'Alfaiataria' },
  { id: 'joalheria', label: 'Joalheria' },
];

export default function StationNav({ current, onLobby, onOpenStation }: StationNavProps) {
  return <nav className="station-nav" aria-label="Navegação entre estações">
    <button type="button" className="station-nav-button station-nav-lobby" aria-label="Voltar ao Lobby" onClick={onLobby}>Lobby</button>
    {STATIONS.filter(station => station.id !== current).map(station =>
      <button
        key={station.id}
        type="button"
        className={`station-nav-button station-nav-${station.id}`}
        aria-label={`Abrir estação ${station.label}`}
        onClick={() => onOpenStation(station.id)}
      >{station.label}</button>,
    )}
  </nav>;
}
