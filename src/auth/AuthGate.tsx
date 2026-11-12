import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  clearArenaSession,
  completeArenaLogin,
  getArenaOAuthDiagnostic,
  getValidArenaSession,
  isArenaOAuthConfigured,
  resetArenaOAuthDiagnostic,
  startArenaLogin,
  type ArenaOAuthCallbackSource,
  type ArenaOAuthDiagnostic,
  type ArenaOAuthSession,
} from './arenaOAuth';
import { fibulaSupabase, isFibulaSupabaseConfigured } from './supabase';
import WorldBackdrop from '../ui/WorldBackdrop';

type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'error' | 'configuration';

type ArenaAuthContextValue = {
  session: ArenaOAuthSession;
  signOut: () => void;
};

const ArenaAuthContext = createContext<ArenaAuthContextValue | null>(null);

function createFallbackDiagnostic(
  source: ArenaOAuthCallbackSource,
  stage: string,
  reason: string,
): ArenaOAuthDiagnostic {
  return {
    source,
    protocol: null,
    hostname: null,
    pathname: null,
    recognizedNativeCallback: false,
    codePresent: false,
    statePresent: false,
    expectedStatePresent: false,
    verifierPresent: false,
    stage,
    reason,
  };
}

const diagnosticStageLabels: Record<string, string> = {
  callback_parse: 'Leitura do endereço',
  callback_received: 'Recebimento do retorno',
  callback_validation: 'Validação do retorno',
  callback_relay: 'Redirecionamento do retorno',
  authorization_response: 'Resposta de autorização',
  token_exchange: 'Troca do código',
  user_info: 'Consulta do perfil',
  session_validation: 'Validação da sessão',
  complete: 'Login',
  login_start: 'Início do login',
  session_check: 'Verificação da sessão',
};

const diagnosticReasonLabels: Record<string, string> = {
  callback_received: 'Retorno recebido',
  invalid_url: 'Formato de endereço inválido',
  unrecognized_callback: 'Endereço não reconhecido como callback nativo',
  checking_parameters: 'Conferindo parâmetros e armazenamento',
  forwarded_to_native: 'Retorno encaminhado ao aplicativo',
  forwarded_to_web: 'Retorno encaminhado ao endereço permitido',
  access_denied: 'A autorização foi recusada',
  provider_authorization_error: 'A Arena retornou um erro de autorização',
  missing_code: 'Código ausente',
  missing_state: 'State ausente',
  missing_expected_state: 'State esperado ausente no armazenamento',
  state_mismatch: 'State recebido não corresponde ao esperado',
  missing_verifier: 'Verifier ausente no armazenamento',
  in_progress: 'Etapa em andamento',
  request_failed: 'Solicitação falhou',
  invalid_token_response: 'Resposta de autenticação inválida',
  success: 'Concluído',
  authorization_request_failed: 'Não foi possível iniciar a autorização',
  session_validation_failed: 'Não foi possível validar a sessão',
  storage_unavailable: 'Não foi possível ler o armazenamento local',
};

function logNativeCallbackTarget(source: 'appUrlOpen' | 'launchUrl', value: string): void {
  try {
    const target = new URL(value);
    console.info('[Arena OAuth] Destino do link recebido no Android.', {
      source,
      protocol: target.protocol,
      hostname: target.hostname,
      pathname: target.pathname,
      recognized: target.protocol === 'fibula:'
        && target.hostname === 'auth'
        && target.pathname === '/callback',
    });
  } catch {
    console.warn('[Arena OAuth] O Android entregou um link com formato inválido.', { source });
  }
}

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
  const [diagnostic, setDiagnostic] = useState<ArenaOAuthDiagnostic | null>(null);
  const nativeCallbackReceived = useRef(false);
  const nativeCallbackSucceeded = useRef(false);
  const nativeCallbackTask = useRef<Promise<ArenaOAuthSession | null> | null>(null);

  useEffect(() => {
    let active = true;
    let removeNativeListener: (() => void) | null = null;

    if (!configured) {
      setStatus('configuration');
      return () => { active = false; };
    }

    const applyNativeCallback = (
      source: Exclude<ArenaOAuthCallbackSource, 'web'>,
      url: string,
    ): Promise<ArenaOAuthSession | null> => {
      nativeCallbackReceived.current = true;
      logNativeCallbackTarget(source, url);
      if (nativeCallbackSucceeded.current) return Promise.resolve(null);
      if (nativeCallbackTask.current) return nativeCallbackTask.current;

      const task = (async () => {
        try {
          const callbackSession = await completeArenaLogin(url, source);
          if (!active) return callbackSession;
          setDiagnostic(getArenaOAuthDiagnostic());
          if (!callbackSession) {
            setMessage('O retorno recebido não pôde ser validado. Consulte o diagnóstico abaixo e tente novamente.');
            setStatus('error');
            return null;
          }
          nativeCallbackSucceeded.current = true;
          setSession(callbackSession);
          setMessage('');
          setStatus('signed-in');
          return callbackSession;
        } catch {
          if (!active) return null;
          setDiagnostic(getArenaOAuthDiagnostic()
            ?? createFallbackDiagnostic(source, 'callback_validation', 'session_validation_failed'));
          setMessage('Não foi possível concluir o login. Consulte o diagnóstico abaixo.');
          setStatus('error');
          return null;
        }
      })();
      nativeCallbackTask.current = task;
      void task.then(() => {
        if (nativeCallbackTask.current === task) nativeCallbackTask.current = null;
      }, () => {
        if (nativeCallbackTask.current === task) nativeCallbackTask.current = null;
      });
      return task;
    };

    if (Capacitor.isNativePlatform()) {
      void App.addListener('appUrlOpen', ({ url }) => {
        void applyNativeCallback('appUrlOpen', url);
      }).then(listener => {
        if (active) {
          removeNativeListener = () => { void listener.remove(); };
        } else {
          void listener.remove();
        }
      });
    }

    const initialize = async () => {
      try {
        let launchSession: ArenaOAuthSession | null = null;
        if (Capacitor.isNativePlatform()) {
          const launch = await App.getLaunchUrl();
          if (launch?.url) {
            launchSession = await applyNativeCallback('launchUrl', launch.url);
            if (!launchSession) return;
          }
        }
        if (nativeCallbackReceived.current) return;

        const callbackSession = await completeArenaLogin();
        const currentSession = callbackSession ?? await getValidArenaSession();
        if (!active || nativeCallbackReceived.current) return;
        if (currentSession) {
          setSession(currentSession);
          setStatus('signed-in');
        } else {
          setStatus('signed-out');
        }
      } catch {
        if (!active || nativeCallbackReceived.current) return;
        setDiagnostic(getArenaOAuthDiagnostic()
          ?? createFallbackDiagnostic('web', 'session_check', 'session_validation_failed'));
        setMessage('Não foi possível validar sua sessão. Consulte o diagnóstico abaixo.');
        setStatus('error');
      }
    };

    void initialize();
    return () => {
      active = false;
      removeNativeListener?.();
    };
  }, [configured]);

  const handleLogin = useCallback(async () => {
    setMessage('');
    setDiagnostic(null);
    nativeCallbackReceived.current = false;
    nativeCallbackSucceeded.current = false;
    resetArenaOAuthDiagnostic();
    try {
      await startArenaLogin();
    } catch {
      setDiagnostic(createFallbackDiagnostic('web', 'login_start', 'authorization_request_failed'));
      setMessage('Não foi possível iniciar o login.');
      setStatus('error');
    }
  }, []);

  const signOut = useCallback(() => {
    clearArenaSession();
    setSession(null);
    setMessage('');
    setDiagnostic(null);
    nativeCallbackReceived.current = false;
    nativeCallbackSucceeded.current = false;
    resetArenaOAuthDiagnostic();
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
        position: 'relative', isolation: 'isolate', overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 0%, #2e2f2e 0%, #171817 68%)',
        color: '#f0f0f0', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <WorldBackdrop />
      <section
        aria-labelledby="arena-auth-title"
        style={{
          width: 'min(100%, 420px)', padding: '30px 26px', borderRadius: 16,
          position: 'relative', zIndex: 1,
          border: '1px solid rgba(230, 230, 230, .24)', background: 'rgba(34, 35, 34, .88)',
          backdropFilter: 'blur(8px)',
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
            margin: '0 0 16px', padding: 11, borderRadius: 8, background: '#2e2f2e',
            border: '1px solid rgba(190, 190, 190, .32)', color: '#f0f0f0', fontSize: 13, lineHeight: 1.5,
          }}>
            {message}
          </p>
        )}

        {status === 'error' && diagnostic && (
          <div role="status" aria-label="Diagnóstico do login OAuth" style={{
            margin: '0 0 16px', padding: 12, borderRadius: 8, background: '#202120',
            border: '1px solid rgba(190, 190, 190, .24)', color: '#d0d2d0',
            fontSize: 11, lineHeight: 1.65, textAlign: 'left', maxHeight: 190, overflowY: 'auto',
          }}>
            <strong style={{ display: 'block', marginBottom: 5, color: '#f0f0f0' }}>Diagnóstico do login</strong>
            <div>Origem: {diagnostic.source}</div>
            <div>Protocolo: {diagnostic.protocol ?? 'indisponível'}</div>
            <div>Host: {diagnostic.hostname ?? 'indisponível'}</div>
            <div>Caminho: {diagnostic.pathname ?? 'indisponível'}</div>
            <div>Callback nativo reconhecido: {diagnostic.recognizedNativeCallback ? 'sim' : 'não'}</div>
            <div>Código presente: {diagnostic.codePresent ? 'sim' : 'não'}</div>
            <div>State presente: {diagnostic.statePresent ? 'sim' : 'não'}</div>
            <div>State esperado armazenado: {diagnostic.expectedStatePresent ? 'sim' : 'não'}</div>
            <div>Verifier armazenado: {diagnostic.verifierPresent ? 'sim' : 'não'}</div>
            <div>Etapa: {diagnosticStageLabels[diagnostic.stage] ?? 'Outra etapa'}</div>
            <div>Motivo: {diagnosticReasonLabels[diagnostic.reason] ?? 'Falha não classificada'}</div>
          </div>
        )}

        {isConfiguration ? (
          <div style={{
            padding: 12, borderRadius: 8, background: '#2e2f2e', color: '#d0d2d0',
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
              background: isLoading ? '#4a4b4a' : '#d0d2d0', color: '#222322',
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
