import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  clearArenaSession,
  completeArenaLogin,
  getValidArenaSession,
  isArenaOAuthConfigured,
  startArenaLogin,
  type ArenaOAuthSession,
} from './arenaOAuth';
import { fibulaSupabase, isFibulaSupabaseConfigured } from './supabase';

type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'error' | 'configuration';

type ArenaAuthContextValue = {
  session: ArenaOAuthSession;
  signOut: () => void;
};

const ArenaAuthContext = createContext<ArenaAuthContextValue | null>(null);

export function useArenaAuth(): ArenaAuthContextValue {
  const context = useContext(ArenaAuthContext);
  if (!context) throw new Error('useArenaAuth precisa ser usado dentro de AuthGate.');
  return context;
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const configured = isArenaOAuthConfigured() && isFibulaSupabaseConfigured && fibulaSupabase !== null;
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<ArenaOAuthSession | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    if (!configured) {
      setStatus('configuration');
      return () => { active = false; };
    }

    const initialize = async () => {
      try {
        const callbackSession = await completeArenaLogin();
        const currentSession = callbackSession ?? await getValidArenaSession();
        if (!active) return;
        if (currentSession) {
          setSession(currentSession);
          setStatus('signed-in');
        } else {
          setStatus('signed-out');
        }
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : 'Não foi possível validar sua sessão.');
        setStatus('error');
      }
    };

    void initialize();
    return () => { active = false; };
  }, [configured]);

  const handleLogin = useCallback(async () => {
    setMessage('');
    try {
      await startArenaLogin();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível iniciar o login.');
      setStatus('error');
    }
  }, []);

  const signOut = useCallback(() => {
    clearArenaSession();
    setSession(null);
    setMessage('');
    setStatus('signed-out');
  }, []);

  const contextValue = useMemo(() => (
    session ? { session, signOut } : null
  ), [session, signOut]);

  if (status === 'signed-in' && session && contextValue) {
    return <ArenaAuthContext.Provider value={contextValue}>{children}</ArenaAuthContext.Provider>;
  }

  const isLoading = status === 'loading';
  const isConfiguration = status === 'configuration';
  const title = isLoading
    ? 'Conectando à Arena'
    : isConfiguration
      ? 'Configuração pendente'
      : 'Entre com sua conta Arena';

  return (
    <main
      style={{
        minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20,
        background: 'radial-gradient(ellipse at 50% 0%, #303130 0%, #171817 68%)',
        color: '#f0f0f0', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <section
        aria-labelledby="arena-auth-title"
        style={{
          width: 'min(100%, 420px)', padding: '30px 26px', borderRadius: 16,
          border: '1px solid rgba(230, 230, 230, .24)', background: 'rgba(34, 35, 34, .96)',
          boxShadow: '0 20px 60px #0008', textAlign: 'center',
        }}
      >
        <div style={{ color: '#d0d2d0', fontSize: 12, fontWeight: 900, letterSpacing: '.2em' }}>
          FÍBULA ONLINE
        </div>
        <h1 id="arena-auth-title" style={{ margin: '14px 0 8px', fontSize: 25, lineHeight: 1.2 }}>
          {title}
        </h1>
        <p style={{ margin: '0 0 22px', color: '#b4b7b4', fontSize: 14, lineHeight: 1.6 }}>
          {isLoading
            ? 'Estamos verificando sua sessão com segurança.'
            : isConfiguration
              ? 'O login único ainda precisa das variáveis públicas do OAuth da Arena e do projeto Supabase do Fíbula no Cloudflare Pages.'
              : 'Use a mesma conta que você já utiliza no Arena iEricris. Não é necessário criar outra senha.'}
        </p>

        {message && (
          <p role="alert" style={{
            margin: '0 0 16px', padding: 11, borderRadius: 8, background: '#3b2525',
            border: '1px solid #865050', color: '#ffd1ca', fontSize: 13, lineHeight: 1.5,
          }}>
            {message}
          </p>
        )}

        {isConfiguration ? (
          <div style={{
            padding: 12, borderRadius: 8, background: '#292a29', color: '#d0d2d0',
            fontSize: 12, lineHeight: 1.7, textAlign: 'left',
          }}>
            <div>• VITE_ARENA_OAUTH_CLIENT_ID</div>
            <div>• VITE_FIBULA_SUPABASE_URL</div>
            <div>• VITE_FIBULA_SUPABASE_PUBLISHABLE_KEY</div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void handleLogin()}
            disabled={isLoading}
            style={{
              width: '100%', minHeight: 48, border: 0, borderRadius: 10,
              background: isLoading ? '#666966' : '#d0d2d0', color: '#222322',
              fontWeight: 900, fontSize: 14, letterSpacing: '.04em',
              cursor: isLoading ? 'wait' : 'pointer',
            }}
          >
            {isLoading ? 'AGUARDE...' : 'ENTRAR COM ARENA'}
          </button>
        )}

        <p style={{ margin: '18px 0 0', color: '#9a9d9a', fontSize: 11, lineHeight: 1.5 }}>
          Sua identidade continua protegida pela autenticação da Arena iEricris.
        </p>
      </section>
    </main>
  );
}
