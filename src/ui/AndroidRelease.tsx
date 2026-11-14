import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App } from '@capacitor/app';
import { FileTransfer } from '@capacitor/file-transfer';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { DownloadModal } from './DownloadModal';

const RELEASES_URL = 'https://api.github.com/repos/ericrisurp-bot/fibula-online/releases?per_page=10';
const RELEASE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

type ApkInstallerPlugin = {
  checkInstallPermission: () => Promise<{ canInstall: boolean }>;
  openInstallSettings: () => Promise<void>;
  installApk: (options: { filePath: string }) => Promise<void>;
};

const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller');

type AndroidRelease = {
  versionName: string;
  versionCode: number | null;
  apkUrl: string;
  publishedAt: string | null;
};

type AndroidReleaseContextValue = {
  release: AndroidRelease | null;
  previousRelease: AndroidRelease | null;
  currentVersionName: string | null;
  currentVersionCode: number | null;
  isAndroid: boolean;
  updateAvailable: boolean;
  checking: boolean;
  downloading: boolean;
  downloadProgress: number;
  pendingApkPath: string | null;
  isSupported: boolean;
  downloadLatest: () => Promise<void>;
};

const AndroidReleaseContext = createContext<AndroidReleaseContextValue | null>(null);

function parseRelease(value: unknown): AndroidRelease | null {
  if (!value || typeof value !== 'object') return null;
  const release = value as {
    tag_name?: unknown;
    body?: unknown;
    assets?: unknown;
  };
  if (typeof release.tag_name !== 'string') return null;
  const versionMatch = /^android-v(\d+\.\d+\.\d+)$/.exec(release.tag_name);
  if (!versionMatch || !Array.isArray(release.assets)) return null;

  const apk = release.assets.find((asset) =>
    !!asset && typeof asset === 'object'
      && (asset as { name?: unknown }).name === 'app-release.apk'
      && typeof (asset as { browser_download_url?: unknown }).browser_download_url === 'string',
  ) as { browser_download_url: string } | undefined;
  if (!apk) return null;

  const versionCodeMatch = typeof release.body === 'string'
    ? /Código da versão:\s*(\d+)/i.exec(release.body)
    : null;

  return {
    versionName: versionMatch[1],
    versionCode: versionCodeMatch ? Number(versionCodeMatch[1]) : null,
    apkUrl: apk.browser_download_url,
    publishedAt: null,
  };
}

function compareVersionNames(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function AndroidReleaseProvider({ children }: { children: ReactNode }) {
  const platform = Capacitor.getPlatform();
  const isAndroid = platform === 'android';
  const isSupported = isAndroid || platform === 'web';
  const [release, setRelease] = useState<AndroidRelease | null>(null);
  const [previousRelease, setPreviousRelease] = useState<AndroidRelease | null>(null);
  const [currentVersionName, setCurrentVersionName] = useState<string | null>(null);
  const [currentVersionCode, setCurrentVersionCode] = useState<number | null>(null);
  const [checking, setChecking] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [pendingApkPath, setPendingApkPath] = useState<string | null>(null);
  const lastCheckAt = useRef(0);

  const refresh = useCallback(async () => {
    if (Date.now() - lastCheckAt.current < RELEASE_CHECK_INTERVAL_MS) return;
    lastCheckAt.current = Date.now();
    setChecking(true);

    try {
      if (isAndroid) {
        try {
          const info = await App.getInfo();
          setCurrentVersionName(info.version || null);
          const build = Number.parseInt(info.build, 10);
          setCurrentVersionCode(Number.isFinite(build) && build > 0 ? build : null);
        } catch {
          setCurrentVersionName(null);
          setCurrentVersionCode(null);
        }
      }

      const response = await fetch(RELEASES_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-cache',
      });
      if (response.status === 404) {
        setRelease(null);
        setPreviousRelease(null);
        return;
      }
      if (!response.ok) throw new Error('Não foi possível consultar a versão publicada.');
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) throw new Error('A resposta de versões do GitHub é inválida.');
      const validReleases = payload
        .filter((item) => !!item && typeof item === 'object'
          && (item as { draft?: unknown }).draft !== true
          && (item as { prerelease?: unknown }).prerelease !== true)
        .map((item) => {
          const parsed = parseRelease(item);
          if (!parsed) return null;
          const publishedAt = (item as { published_at?: unknown }).published_at;
          return { ...parsed, publishedAt: typeof publishedAt === 'string' ? publishedAt : null };
        })
        .filter((item): item is AndroidRelease => item !== null);
      setRelease(validReleases[0] ?? null);
      setPreviousRelease(validReleases[1] ?? null);
    } catch {
      // Falhas temporárias do GitHub não bloqueiam o acesso ao jogo.
    } finally {
      setChecking(false);
    }
  }, [isAndroid]);

  useEffect(() => {
    void refresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refresh]);

  const updateAvailable = isAndroid && !!release && (
    currentVersionCode !== null && release.versionCode !== null
      ? release.versionCode > currentVersionCode
      : currentVersionName !== null && compareVersionNames(release.versionName, currentVersionName) > 0
  );

  const downloadLatest = useCallback(async () => {
    if (downloading) return;
    if (!release) {
      window.alert(checking
        ? 'O Fíbula ainda está consultando a versão oficial. Aguarde alguns segundos e tente novamente.'
        : 'Não encontramos um APK oficial disponível no momento. Tente novamente mais tarde.');
      return;
    }

    if (isAndroid) {
      setDownloading(true);
      setDownloadProgress(0);
      let progressListener: { remove: () => Promise<void> } | null = null;
      try {
        let apkPath = pendingApkPath;
        if (!apkPath) {
          const fileName = `fibula-online-${release.versionName}.apk`;
          const destination = await Filesystem.getUri({
            directory: Directory.Cache,
            path: fileName,
          });
          progressListener = await FileTransfer.addListener('progress', ({ bytes, contentLength }) => {
            if (contentLength > 0) {
              setDownloadProgress(Math.min(100, Math.round((bytes / contentLength) * 100)));
            }
          });
          await FileTransfer.downloadFile({
            url: release.apkUrl,
            path: destination.uri,
            progress: true,
          });
          const downloadedFile = await Filesystem.stat({
            directory: Directory.Cache,
            path: fileName,
          });
          if (downloadedFile.size <= 0) throw new Error('O arquivo baixado está vazio.');
          setDownloadProgress(100);
          apkPath = destination.uri;
          setPendingApkPath(apkPath);
        }

        const permission = await ApkInstaller.checkInstallPermission();
        if (!permission.canInstall) {
          window.alert(
            'O APK foi baixado. Para instalar, autorize o Fíbula a instalar apps: ative “Permitir desta fonte” na tela que será aberta. Depois volte ao Fíbula e toque em “Concluir instalação”.',
          );
          await ApkInstaller.openInstallSettings();
          return;
        }

        await ApkInstaller.installApk({ filePath: apkPath });
        setPendingApkPath(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        window.alert(
          message
            ? `Não foi possível abrir o instalador do Android: ${message}`
            : 'Não foi possível concluir o download ou abrir o instalador. Tente novamente.',
        );
      } finally {
        if (progressListener) {
          try {
            await progressListener.remove();
          } catch {
            // A falha ao remover o listener não deve deixar o botão preso.
          }
        }
        setDownloading(false);
      }
      return;
    }

    // A URL vem da Release mais recente e redireciona diretamente ao APK.
    // Navegar na aba atual evita abrir a página do repositório em uma nova aba.
    window.location.assign(release.apkUrl);
  }, [checking, downloading, isAndroid, pendingApkPath, release]);

  const value = useMemo(() => ({
    release,
    previousRelease,
    currentVersionName,
    currentVersionCode,
    isAndroid,
    updateAvailable,
    checking,
    downloading,
    downloadProgress,
    pendingApkPath,
    isSupported,
    downloadLatest,
  }), [release, previousRelease, currentVersionName, currentVersionCode, isAndroid, updateAvailable, checking, downloading, downloadProgress, pendingApkPath, isSupported, downloadLatest]);

  return <AndroidReleaseContext.Provider value={value}>{children}</AndroidReleaseContext.Provider>;
}

export function useAndroidRelease(): AndroidReleaseContextValue {
  const context = useContext(AndroidReleaseContext);
  if (!context) throw new Error('useAndroidRelease precisa ser usado dentro de AndroidReleaseProvider.');
  return context;
}

export function AndroidReleaseButton() {
  const { release, updateAvailable, checking, downloading, downloadProgress, pendingApkPath, isSupported } = useAndroidRelease();
  const [modalOpen, setModalOpen] = useState(false);
  const closeModal = useCallback(() => setModalOpen(false), []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (!isSupported) return null;

  const label = downloading
    ? `Baixando APK: ${downloadProgress}%`
    : pendingApkPath
      ? 'Concluir instalação do APK'
    : checking && !release
      ? 'Verificando versões publicadas'
      : updateAvailable
        ? 'Atualização obrigatória disponível. Baixar APK novo.'
        : 'Baixar aplicativo oficial do Fíbula';
  const title = downloading
    ? `Baixando APK: ${downloadProgress}%`
    : pendingApkPath
      ? 'Autorizar ou continuar a instalação do APK baixado'
    : checking && !release
      ? 'Verificando se existe uma versão nova'
      : updateAvailable
        ? `NEW · Atualizar para a versão ${release?.versionName ?? ''}`
        : release
          ? 'Baixar APK oficial'
          : 'Baixar APK oficial do Fíbula';

  return (
    <>
    <button
      ref={triggerRef}
      className={`lobby-release-button${checking && !release ? ' is-checking' : ''}${downloading ? ' is-downloading' : ''}`}
      type="button"
      aria-label={label}
      title={title}
      aria-busy={checking || downloading}
      disabled={downloading}
      onClick={() => setModalOpen(true)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3" />
      </svg>
      {downloading && <span className="lobby-release-progress">{downloadProgress}%</span>}
      {updateAvailable && !downloading && <span className="lobby-release-new">NEW</span>}
    </button>
    {modalOpen && <DownloadModal onClose={closeModal} triggerRef={triggerRef} />}
    </>
  );
}
