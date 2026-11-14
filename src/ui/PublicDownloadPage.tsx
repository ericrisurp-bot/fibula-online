import { useAndroidRelease } from './AndroidRelease';

export default function PublicDownloadPage() {
  const { release, checking, downloading, downloadProgress, downloadLatest } = useAndroidRelease();

  const buttonLabel = downloading
    ? `Baixando APK… ${downloadProgress}%`
    : checking && !release
      ? 'Consultando versão mais recente…'
      : release
        ? `Baixar última versão · ${release.versionName}`
        : 'Download temporariamente indisponível';

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        boxSizing: 'border-box',
        background: 'radial-gradient(ellipse at 50% 0%, #343634 0%, #171817 72%)',
        color: '#f0f0f0',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <section
        aria-labelledby="public-download-title"
        style={{
          width: 'min(100%, 440px)',
          padding: '34px 26px',
          boxSizing: 'border-box',
          borderRadius: 18,
          border: '1px solid rgba(230, 230, 230, .22)',
          background: 'rgba(34, 35, 34, .92)',
          boxShadow: '0 22px 64px #0009',
          textAlign: 'center',
        }}
      >
        <img
          src="/icons/icon.png"
          alt=""
          width={76}
          height={76}
          style={{ borderRadius: 18, objectFit: 'cover', marginBottom: 18 }}
        />
        <p style={{ margin: 0, color: '#bfc2bf', fontSize: 11, fontWeight: 900, letterSpacing: '.2em' }}>
          FÍBULA ONLINE
        </p>
        <h1 id="public-download-title" style={{ margin: '12px 0 10px', fontSize: 27, lineHeight: 1.2 }}>
          Baixe a versão mais recente
        </h1>
        <p style={{ margin: '0 0 26px', color: '#b4b7b4', fontSize: 14, lineHeight: 1.65 }}>
          Instale o aplicativo oficial e entre na sua aventura. O jogo pelo navegador continua disponível pelo acesso normal ao site.
        </p>
        <button
          type="button"
          onClick={() => { void downloadLatest(); }}
          disabled={checking || downloading || !release}
          aria-busy={checking || downloading}
          style={{
            width: '100%',
            minHeight: 54,
            padding: '12px 18px',
            border: 0,
            borderRadius: 11,
            background: checking || downloading || !release ? '#777a77' : '#e2e4e2',
            color: '#222322',
            fontSize: 14,
            fontWeight: 900,
            letterSpacing: '.035em',
            cursor: checking || downloading || !release ? 'wait' : 'pointer',
          }}
        >
          {buttonLabel}
        </button>
        <p aria-live="polite" style={{ minHeight: 18, margin: '16px 0 0', color: '#9a9d9a', fontSize: 12 }}>
          {release ? `Versão oficial publicada: ${release.versionName}` : checking ? 'Verificando a publicação oficial…' : 'Nenhum APK oficial foi encontrado.'}
        </p>
        <a
          href="/"
          style={{ display: 'inline-block', marginTop: 22, color: '#c8cbc8', fontSize: 12, textDecoration: 'underline' }}
        >
          Voltar ao Fíbula Online
        </a>
      </section>
    </main>
  );
}
