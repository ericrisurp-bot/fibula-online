import type { ReactNode } from 'react';

type PageFrameProps = {
  eyebrow: string;
  title: string;
  onBack: () => void;
  children: ReactNode;
};

export default function PageFrame({ eyebrow, title, onBack, children }: PageFrameProps) {
  return <main className="station-page" aria-labelledby="station-page-title">
    <header className="station-page-header">
      <button type="button" className="station-page-back" onClick={onBack}>← Lobby</button>
      <div><span>{eyebrow}</span><h1 id="station-page-title">{title}</h1></div>
    </header>
    {children}
  </main>;
}
