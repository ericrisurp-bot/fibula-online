export type SideNavId = 'classes' | 'status' | 'arsenal' | 'amigos' | 'bau';

type SideNavProps = {
  current: SideNavId;
  onLobby: () => void;
  onOpenPage: (id: SideNavId) => void;
};

const SIDE_NAV_ITEMS: { id: SideNavId; label: string }[] = [
  { id: 'classes', label: 'Classes' },
  { id: 'status', label: 'Status' },
  { id: 'arsenal', label: 'Arsenal' },
  { id: 'amigos', label: 'Amigos' },
  { id: 'bau', label: 'Baú' },
];

export default function SideNav({ current, onLobby, onOpenPage }: SideNavProps) {
  return <nav className="side-nav" aria-label="Navegação das páginas">
    {SIDE_NAV_ITEMS.map(({ id, label }) => {
      const isActive = id === current;
      return <button
        key={id}
        type="button"
        className={`side-nav-button${isActive ? ' is-active' : ' is-inactive'}`}
        aria-label={`Abrir página ${label}`}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => { if (!isActive) onOpenPage(id); }}
      >{label}</button>;
    })}
    <button type="button" className="side-nav-button side-nav-lobby" aria-label="Voltar ao Lobby" onClick={onLobby}>Lobby</button>
  </nav>;
}
