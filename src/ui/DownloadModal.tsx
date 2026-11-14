import { useEffect, type RefObject } from 'react';
import { useAndroidRelease } from './AndroidRelease';

type DownloadModalProps = {
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

const GAME_STORY = [
  'Eu sou streamer e criei o Fíbula Online para vocês, a minha comunidade.',
  'Tudo começou com uma vontade simples: ter um lugar nosso. Um jogo onde cada conversa na live, cada rank disputado e cada amigo que a gente fez pelo caminho tivesse onde morar.',
  'Ele nasceu de jogos que marcaram a minha vida: a sobrevivência do Tibia, a loucura de ondas do Brotato, a liberdade de construir do Minecraft, e o encanto de Magic Campus e Luz da Escuridão. Misturei tudo com muitos slimes, uma fogueira e muito carinho.',
  'O Fíbula é melhor em boa companhia. Chame um amigo, junte materiais, cozinhe, fabrique, suba no rank e volte sempre para casa.',
  'O jogo ainda está crescendo, e foi pensado para crescer junto com vocês. Obrigado por estarem aqui. Baixe, jogue e me conta o que achou.',
] as const;

function formatPublishedDate(value: string | null): string {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Data não informada'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date);
}

export function DownloadModal({ onClose, triggerRef }: DownloadModalProps) {
  const {
    release, previousRelease, currentVersionName, isAndroid, updateAvailable,
    checking, downloading, downloadProgress, pendingApkPath, downloadLatest,
  } = useAndroidRelease();

  useEffect(() => {
    const dialog = document.querySelector<HTMLElement>('.download-modal-dialog');
    dialog?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [onClose, triggerRef]);

  const downloadLabel = downloading
    ? `Baixando… ${downloadProgress}%`
    : pendingApkPath
      ? 'Concluir instalação'
      : checking
        ? 'Verificando versões…'
        : release
          ? `Download da versão ${release.versionName}`
          : 'Nenhuma versão publicada ainda';

  return (
    <div
      className="download-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onTouchEnd={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="download-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-modal-title"
        tabIndex={-1}
      >
        <button className="download-modal-close" type="button" onClick={onClose} aria-label="Fechar janela">×</button>
        <h2 id="download-modal-title">Fíbula Online</h2>
        <div className="download-modal-story">
          {GAME_STORY.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>

        <div className="download-modal-download-area">
          <button
            className="download-modal-download-button"
            type="button"
            disabled={checking || downloading || !release}
            onClick={() => { void downloadLatest(); }}
            aria-busy={checking || downloading}
          >
            <span>{downloadLabel}</span>
            {downloading && (
              <span className="download-modal-progress-track" role="progressbar" aria-label="Progresso do download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={downloadProgress}>
                <span style={{ width: `${downloadProgress}%` }} />
              </span>
            )}
            {updateAvailable && !downloading && <span className="download-modal-new">NOVA</span>}
          </button>
        </div>

        <p className="download-modal-version-info">
          {isAndroid
            ? `Instalada: ${currentVersionName ?? 'não identificada'} · Publicada: ${release?.versionName ?? 'não identificada'}`
            : release
              ? `Publicada: ${formatPublishedDate(release.publishedAt)}`
              : 'Nenhuma versão publicada ainda'}
        </p>

        {previousRelease && (
          <div className="download-modal-previous" aria-disabled="true">
            <span className="download-modal-lock" aria-hidden="true">🔒</span>
            <span>Versão anterior {previousRelease.versionName}</span>
            <time dateTime={previousRelease.publishedAt ?? undefined}>{formatPublishedDate(previousRelease.publishedAt)}</time>
          </div>
        )}
      </section>
    </div>
  );
}
