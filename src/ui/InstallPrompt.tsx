import { useEffect, useState } from 'react';
import WorldBackdrop from './WorldBackdrop';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [ios, setIos] = useState(false);
  const [safari, setSafari] = useState(true);

  useEffect(() => {
    const isInstalledApp = () =>
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (isInstalledApp()) return;

    const userAgent = window.navigator.userAgent;
    const isIosDevice = /iPad|iPhone|iPod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafariBrowser = /Safari/.test(userAgent) &&
      !/(CriOS|FxiOS|EdgiOS|OPiOS)/.test(userAgent);

    setIos(isIosDevice);
    setSafari(isSafariBrowser);
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
      setShowHelp((current) => !current);
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setVisible(false);
    setInstallEvent(null);
  };

  if (!visible) return null;

  const helpSteps = ios
    ? [
        ...(!safari ? ['Abra esta página no Safari. No iPhone, a opção de adicionar à tela inicial fica disponível pelo Safari.'] : []),
        'No Safari, toque no botão Compartilhar (ícone de um quadrado com uma seta para cima).',
        'Role as opções e escolha “Adicionar à Tela de Início”.',
        'Se aparecer a opção “Abrir como App da Web”, deixe-a ativada e toque em “Adicionar”.',
      ]
    : [
        'No Chrome, toque no menu de três pontos (⋮), no canto superior.',
        'Escolha “Instalar app”. Se essa opção não aparecer, escolha “Adicionar à tela inicial”.',
        'Confirme em “Instalar” ou “Adicionar”.',
      ];

  return (
    <aside
      className="install-prompt"
      role="dialog"
      aria-label="Instalar Fíbula Online"
      style={{
        position: 'fixed', zIndex: 10000, top: 'max(12px, env(safe-area-inset-top))',
        left: '50%', transform: 'translateX(-50%)', width: 'min(440px, calc(100vw - 24px))',
        padding: '16px', borderRadius: '14px', border: '1px solid rgba(230, 230, 230, .28)',
        background: 'rgba(34, 35, 34, .84)', color: '#f0f0f0',
        overflow: 'hidden', backdropFilter: 'blur(5px)',
        boxShadow: '0 12px 40px #0009', fontFamily: 'inherit',
      }}
    >
      <WorldBackdrop opacity={0.5} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <button
          type="button"
          aria-label="Fechar aviso"
          onClick={() => setVisible(false)}
          style={{ position: 'absolute', right: 10, top: 8, border: 0, background: 'transparent', color: '#b4b7b4', fontSize: 22, cursor: 'pointer' }}
        >×</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: 22 }}>
          <img src="/icons/icon.png" alt="" width="48" height="48" style={{ borderRadius: 10, objectFit: 'cover' }} />
          <div>
            <strong style={{ display: 'block', fontSize: 16 }}>
              {ios ? 'Instale no iPhone ou iPad' : 'Instale o Fíbula Online'}
            </strong>
            <span style={{ display: 'block', marginTop: 3, color: '#b4b7b4', fontSize: 12, lineHeight: 1.4 }}>
              Tenha o jogo na tela inicial e abra em uma janela própria, como um aplicativo.
            </span>
          </div>
        </div>
        {showHelp && (
          <ol
            aria-live="polite"
            style={{ margin: '12px 0 0', paddingLeft: 22, color: '#d0d2d0', fontSize: 12, lineHeight: 1.6 }}
          >
            {helpSteps.map((step) => <li key={step} style={{ paddingLeft: 3, marginBottom: 5 }}>{step}</li>)}
          </ol>
        )}
        <button
          type="button"
          onClick={() => void install()}
          style={{
            width: '100%', marginTop: 14, padding: '11px 14px', border: 0, borderRadius: 8,
            background: '#d0d2d0', color: '#222322', fontWeight: 900, letterSpacing: '.06em',
            cursor: 'pointer',
          }}
        >
          {showHelp ? 'FECHAR INSTRUÇÕES' : ios || !installEvent ? 'COMO INSTALAR' : 'INSTALAR JOGO'}
        </button>
      </div>
    </aside>
  );
}
