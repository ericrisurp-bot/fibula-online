import WorldBackdrop from './WorldBackdrop';

export default function WorldBackdropPreview() {
  return (
    <main
      style={{
        position: 'relative', isolation: 'isolate', minHeight: '100dvh',
        overflow: 'hidden', background: '#222322', color: '#f0f0f0',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <WorldBackdrop />
      <header
        style={{
          position: 'absolute', zIndex: 1, top: 'max(18px, env(safe-area-inset-top))',
          left: 16, right: 16, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 12,
        }}
      >
        <div
          style={{
            padding: '10px 14px', borderRadius: 12,
            border: '1px solid rgba(230, 230, 230, .24)',
            background: 'rgba(34, 35, 34, .82)', backdropFilter: 'blur(8px)',
            fontSize: 12, fontWeight: 800, letterSpacing: '.08em',
          }}
        >
          PRÉVIA DO CENÁRIO
        </div>
        <a
          href="/"
          style={{
            padding: '10px 14px', borderRadius: 12, color: '#f0f0f0',
            border: '1px solid rgba(230, 230, 230, .24)',
            background: 'rgba(34, 35, 34, .82)', backdropFilter: 'blur(8px)',
            fontSize: 12, fontWeight: 700, textDecoration: 'none',
          }}
        >
          Voltar ao jogo
        </a>
      </header>
      <p
        style={{
          position: 'absolute', zIndex: 1, left: 16, right: 16,
          bottom: 'max(18px, env(safe-area-inset-bottom))',
          margin: 0, padding: '12px 14px', borderRadius: 12,
          border: '1px solid rgba(230, 230, 230, .2)',
          background: 'rgba(34, 35, 34, .78)', backdropFilter: 'blur(8px)',
          color: '#d0d2d0', fontSize: 12, lineHeight: 1.5, textAlign: 'center',
        }}
      >
        Elementos originais do Fíbula: grama, árvores e pedras. O cenário alterna entre dia e noite.
      </p>
    </main>
  );
}
