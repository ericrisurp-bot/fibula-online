import { useEffect, useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const isStandalone = () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (isStandalone()) return;

    const userAgent = window.navigator.userAgent;
    const isIosDevice = /iPad|iPhone|iPod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIos(isIosDevice);
    setVisible(true);

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setVisible(false);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!installEvent) {
      setShowHelp(true);
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setVisible(false);
    setInstallEvent(null);
  };

  if (!visible) return null;

  return (
    <aside
      role="dialog"
      aria-label="Instalar Fíbula Online"
      style={{
        position: 'fixed', zIndex: 10000, top: 'max(12px, env(safe-area-inset-top))',
        left: '50%', transform: 'translateX(-50%)', width: 'min(440px, calc(100vw - 24px))',
        padding: '16px', borderRadius: '14px', border: '1px solid #668776',
        background: 'linear-gradient(145deg, #1b2b24, #101916)', color: '#e8f0ec',
        boxShadow: '0 12px 40px #0009', fontFamily: 'inherit',
      }}
    >
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => setVisible(false)}
        style={{ position: 'absolute', right: 10, top: 8, border: 0, background: 'transparent', color: '#a9bdb2', fontSize: 22, cursor: 'pointer' }}
      >×</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: 22 }}>
        <img src="/icons/icon.png" alt="" width="48" height="48" style={{ borderRadius: 10, objectFit: 'cover' }} />
        <div>
          <strong style={{ display: 'block', fontSize: 16 }}>Instale o Fíbula Online</strong>
          <span style={{ display: 'block', marginTop: 3, color: '#a9bdb2', fontSize: 12, lineHeight: 1.4 }}>
            Tenha o jogo na tela inicial e abra como um aplicativo.
          </span>
        </div>
      </div>
      {showHelp && (
        <p style={{ margin: '12px 0 0', color: '#c5d5cc', fontSize: 12, lineHeight: 1.5 }}>
          {ios
            ? 'Toque em Compartilhar e depois em “Adicionar à Tela de Início”.'
            : 'Abra o menu do navegador (⋮) e escolha “Instalar app” ou “Adicionar à tela inicial”.'}
        </p>
      )}
      <button
        type="button"
        onClick={() => void install()}
        style={{
          width: '100%', marginTop: 14, padding: '11px 14px', border: 0, borderRadius: 8,
          background: '#92e0bf', color: '#12231b', fontWeight: 900, letterSpacing: '.06em',
          cursor: 'pointer',
        }}
      >{showHelp || ios ? 'COMO INSTALAR' : 'INSTALAR JOGO'}</button>
    </aside>
  );
}
