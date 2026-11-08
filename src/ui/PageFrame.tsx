import type { ReactNode } from 'react';

type PageFrameProps = {
  eyebrow: string;
  title: string;
  onBack: () => void;
  children: ReactNode;
  hideHeader?: boolean;
  stateClassName?: string;
};

export default function PageFrame({ eyebrow, title, onBack, children, hideHeader = false, stateClassName }: PageFrameProps) {
  return <main className={`${hideHeader ? "station-page station-page-no-header" : "station-page"}${stateClassName ? ` ${stateClassName}` : ""}`} aria-labelledby={hideHeader ? undefined : "station-page-title"}>
    {!hideHeader && <header className="station-page-header">
      <button type="button" className="station-page-back" onClick={onBack}>← Lobby</button>
      <div><span>{eyebrow}</span><h1 id="station-page-title">{title}</h1></div>
    </header>}
    {children}
  </main>;
}
