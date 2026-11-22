import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App } from '@capacitor/app';
import { FileTransfer } from '@capacitor/file-transfer';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { DownloadModal } from './DownloadModal';

const RELEASES_URL = 'https://api.github.com/repos/ericrisurp-bot/fibula-online/releases?per_page=10';
const RELEASE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const RELEASE_RETRY_INTERVAL_MS = 30 * 1000;
const RELEASE_CACHE_KEY = 'fibula-android-release-cache-v1';

type ApkInstallerPlugin = {
  checkInstallPermission: () => Promise<{ canInstall: boolean }>;
  openInstallSettings: () => Promise<void>;
  installApkSession: (options: { filePath: string }) => Promise<void>;
  installApk: (options: { filePath: string }) => Promise<void>;
  verifyApk: (options: { filePath: string; expectedSize: number; expectedSha256: string }) => Promise<{ valid: boolean; size: number; sha256: string }>;
};

const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller');

type AndroidRelease = {
  versionName: string;
  versionCode: number | null;
  apkUrl: string;
  apkSize: number;
  apkSha256: string;
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
  checkFailed: boolean;
  downloading: boolean;
  downloadProgress: number;
  pendingApkPath: string | null;
  isSupported: boolean;
  downloadLatest: () => Promise<void>;
  retryCheck: () => Promise<void>;
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
  ) as { browser_download_url: string; size?: unknown; digest?: unknown } | undefined;
  if (!apk || typeof apk.size !== 'number' || !Number.isSafeInteger(apk.size) || apk.size <= 0) return null;
  if (typeof apk.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(apk.digest)) return null;

  const versionCodeMatch = typeof release.body === 'string'
    ? /Código da versão:\s*(\d+)/i.exec(release.body)
    : null;

  return {
    versionName: versionMatch[1],
    versionCode: versionCodeMatch ? Number(versionCodeMatch[1]) : null,
    apkUrl: apk.browser_download_url,
    apkSize: apk.size,
    apkSha256: apk.digest.slice('sha256:'.length).toLowerCase(),
    publishedAt: null,
  };
}

function isCachedRelease(value: unknown): value is AndroidRelease {
  if (!value || typeof value !== 'object') return false;
  const cached = value as Partial<AndroidRelease>;
  return typeof cached.versionName === 'string'
    && /^\d+\.\d+\.\d+$/.test(cached.versionName)
    && (cached.versionCode === null || (typeof cached.versionCode === 'number' && Number.isFinite(cached.versionCode)))
    && typeof cached.apkUrl === 'string'
    && typeof cached.apkSize === 'number' && Number.isSafeInteger(cached.apkSize) && cached.apkSize > 0
    && typeof cached.apkSha256 === 'string' && /^[a-f0-9]{64}$/i.test(cached.apkSha256)
    && (cached.publishedAt === null || typeof cached.publishedAt === 'string');
}

type ReleaseCache = {
  release: AndroidRelease;
  previousRelease: AndroidRelease | null;
  savedAt: number;
};

function readReleaseCache(): ReleaseCache | null {
  try {
    const stored = window.localStorage.getItem(RELEASE_CACHE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return null;
    const cache = parsed as Partial<ReleaseCache>;
    if (!isCachedRelease(cache.release)
      || !(cache.previousRelease === null || isCachedRelease(cache.previousRelease))
      || typeof cache.savedAt !== 'number' || !Number.isFinite(cache.savedAt)) return null;
    return {
      release: cache.release,
      previousRelease: cache.previousRelease,
      savedAt: cache.savedAt,
    };
  } catch {
    return null;
  }
}

function writeReleaseCache(release: AndroidRelease, previousRelease: AndroidRelease | null): void {
  try {
    window.localStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify({
      release,
      previousRelease,
      savedAt: Date.now(),
    } satisfies ReleaseCache));
  } catch {
    // O cache é opcional; indisponibilidade do armazenamento não bloqueia a consulta.
  }
}

function clearReleaseCache(): void {
  try {
    window.localStorage.removeItem(RELEASE_CACHE_KEY);
  } catch {
    // A consulta bem-sucedida continua válida mesmo se não for possível limpar o cache.
  }
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
  const [checkFailed, setCheckFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [pendingApkPath, setPendingApkPath] = useState<string | null>(null);
  const lastCheckAt = useRef(0);
  const lastRetryAt = useRef(0);

  const refresh = useCallback(async (ignoreMinimumInterval = false) => {
    const checkStartedAt = Date.now();
    if (!ignoreMinimumInterval && checkStartedAt - lastCheckAt.current < RELEASE_CHECK_INTERVAL_MS) return;
    lastCheckAt.current = checkStartedAt;
    setChecking(true);
    let useCacheOnFailure = false;

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

      let response: Response;
      try {
        response = await fetch(RELEASES_URL, {
          headers: { Accept: 'application/vnd.github+json' },
          cache: 'no-cache',
        });
      } catch (error) {
        useCacheOnFailure = true;
        throw error;
      }
      if (response.status === 404) {
        setRelease(null);
        setPreviousRelease(null);
        setCheckFailed(false);
        clearReleaseCache();
        return;
      }
      if (response.status === 403 || response.status === 429 || response.status >= 500) {
        useCacheOnFailure = true;
      }
      if (!response.ok) throw new Error(`Não foi possível consultar a versão publicada (HTTP ${response.status}).`);
      useCacheOnFailure = true;
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
      const orderedReleases = [...validReleases].sort((left, right) => {
        const versionOrder = compareVersionNames(right.versionName, left.versionName);
        if (versionOrder !== 0) return versionOrder;

        if (left.versionCode !== right.versionCode) {
          if (left.versionCode === null) return 1;
          if (right.versionCode === null) return -1;
          return right.versionCode - left.versionCode;
        }

        if (left.publishedAt === right.publishedAt) return 0;
        if (left.publishedAt === null) return 1;
        if (right.publishedAt === null) return -1;
        return right.publishedAt.localeCompare(left.publishedAt);
      });
      const latestRelease = orderedReleases[0] ?? null;
      const previousLatestRelease = orderedReleases[1] ?? null;
      setRelease(latestRelease);
      setPreviousRelease(previousLatestRelease);
      setCheckFailed(false);
      if (latestRelease) writeReleaseCache(latestRelease, previousLatestRelease);
      else clearReleaseCache();
    } catch {
      if (useCacheOnFailure) {
        const cached = readReleaseCache();
        if (cached) {
          setRelease(cached.release);
          setPreviousRelease(cached.previousRelease);
        }
      }
      setCheckFailed(true);
    } finally {
      setChecking(false);
    }
  }, [isAndroid]);

  const retryCheck = useCallback(async () => {
    const now = Date.now();
    if (now - lastRetryAt.current < RELEASE_RETRY_INTERVAL_MS) return;
    lastRetryAt.current = now;
    await refresh(true);
  }, [refresh]);

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
        const fileName = `fibula-online-${release.versionName}.apk`;
        const destination = await Filesystem.getUri({
          directory: Directory.Cache,
          path: fileName,
        });
        let apkPath = pendingApkPath;
        if (apkPath) {
          let cachedVerification = false;
          try {
            const result = await ApkInstaller.verifyApk({
              filePath: apkPath,
              expectedSize: release.apkSize,
              expectedSha256: release.apkSha256,
            });
            cachedVerification = result.valid;
          } catch {
            // Um arquivo em cache ausente ou ilegível deve ser baixado novamente.
          }
          if (!cachedVerification) {
            setPendingApkPath(null);
            apkPath = null;
          }
        }
        if (!apkPath) {
          try {
            await Filesystem.deleteFile({ directory: Directory.Cache, path: fileName });
          } catch {
            // O arquivo pode ainda não existir no cache.
          }
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
          const verification = await ApkInstaller.verifyApk({
            filePath: destination.uri,
            expectedSize: release.apkSize,
            expectedSha256: release.apkSha256,
          });
          if (!verification.valid) {
            try {
              await Filesystem.deleteFile({ directory: Directory.Cache, path: fileName });
            } catch {
              // A falha de limpeza não deve permitir instalar o arquivo inválido.
            }
            setPendingApkPath(null);
            throw new Error('O APK baixado não corresponde ao arquivo oficial. O download foi descartado; tente novamente.');
          }
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

        let sessionInstallError: unknown = null;
        try {
          await ApkInstaller.installApkSession({ filePath: apkPath });
          setPendingApkPath(null);
        } catch (error) {
          sessionInstallError = error;
          try {
            await ApkInstaller.installApk({ filePath: apkPath });
            setPendingApkPath(null);
          } catch (fallbackError) {
            const describeError = (value: unknown) => value instanceof Error && value.message
              ? value.message
              : typeof value === 'string' && value.trim()
                ? value
                : 'O Android não informou o motivo da falha.';
            const sessionMessage = describeError(sessionInstallError);
            const fallbackMessage = describeError(fallbackError);
            const openDownload = window.confirm(
              `Não foi possível instalar o APK pelos métodos do Android.\\n\\nPackageInstaller (sessão): ${sessionMessage}\\n\\nInstalador tradicional (ACTION_VIEW): ${fallbackMessage}\\n\\nDeseja abrir o download oficial no navegador do Android para tentar instalar manualmente?`,
            );
            if (openDownload) window.location.assign(release.apkUrl);
            return;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        window.alert(
          message
            ? `Não foi possível baixar ou verificar o APK: ${message}`
            : 'Não foi possível concluir o download ou a verificação do APK. Tente novamente.',
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
    checkFailed,
    downloading,
    downloadProgress,
    pendingApkPath,
    isSupported,
    downloadLatest,
    retryCheck,
  }), [release, previousRelease, currentVersionName, currentVersionCode, isAndroid, updateAvailable, checking, checkFailed, downloading, downloadProgress, pendingApkPath, isSupported, downloadLatest, retryCheck]);

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
