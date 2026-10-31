const ARENA_AUTH_BASE = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1';
const SESSION_KEY = 'fibula-arena-oauth-session';
const STATE_KEY = 'fibula-arena-oauth-state';
const VERIFIER_KEY = 'fibula-arena-oauth-verifier';
const CALLBACK_PATH = '/auth/callback';

export type ArenaUser = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export type ArenaOAuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: ArenaUser;
};

type OAuthTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  error?: unknown;
  error_description?: unknown;
};

const getClientId = () => import.meta.env.VITE_ARENA_OAUTH_CLIENT_ID?.trim() ?? '';

export const isArenaOAuthConfigured = () => getClientId().length > 0;

const getRedirectUri = () => `${window.location.origin}${CALLBACK_PATH}`;

function randomBase64Url(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function clearPendingAuthorization(): void {
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
}

function cleanCallbackUrl(): void {
  window.history.replaceState({}, document.title, '/');
}

function readStoredSession(): ArenaOAuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ArenaOAuthSession>;
    if (
      typeof value.access_token !== 'string' ||
      typeof value.refresh_token !== 'string' ||
      typeof value.expires_at !== 'number' ||
      !value.user ||
      typeof value.user.sub !== 'string'
    ) return null;
    return value as ArenaOAuthSession;
  } catch {
    return null;
  }
}

function saveSession(session: ArenaOAuthSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearArenaSession(): void {
  localStorage.removeItem(SESSION_KEY);
  clearPendingAuthorization();
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as (T & OAuthTokenResponse) | null;
  if (!response.ok) {
    const description = typeof payload?.error_description === 'string'
      ? payload.error_description
      : typeof payload?.error === 'string'
        ? payload.error
        : 'Não foi possível concluir a autenticação com a Arena.';
    throw new Error(description);
  }
  if (!payload) throw new Error('A resposta de autenticação da Arena estava vazia.');
  return payload;
}

async function exchangeAuthorizationCode(code: string, verifier: string): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: getClientId(),
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: verifier,
  });

  const response = await fetch(`${ARENA_AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
    credentials: 'omit',
  });
  return readResponse<OAuthTokenResponse>(response);
}

async function refreshTokens(refreshToken: string): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: getClientId(),
    refresh_token: refreshToken,
  });

  const response = await fetch(`${ARENA_AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
    credentials: 'omit',
  });
  return readResponse<OAuthTokenResponse>(response);
}

async function fetchArenaUser(accessToken: string): Promise<ArenaUser> {
  const response = await fetch(`${ARENA_AUTH_BASE}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    credentials: 'omit',
  });
  const user = await readResponse<ArenaUser>(response);
  if (!user || typeof user.sub !== 'string' || !user.sub) {
    throw new Error('A Arena não retornou um identificador de usuário válido.');
  }
  return user;
}

function buildSession(tokens: OAuthTokenResponse, user: ArenaUser, previousRefreshToken?: string): ArenaOAuthSession {
  if (typeof tokens.access_token !== 'string' || !tokens.access_token) {
    throw new Error('A Arena não retornou um token de acesso válido.');
  }
  const refreshToken = typeof tokens.refresh_token === 'string' && tokens.refresh_token
    ? tokens.refresh_token
    : previousRefreshToken;
  if (!refreshToken) throw new Error('A Arena não retornou um token de renovação válido.');
  const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : Number(tokens.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('A Arena retornou um prazo de sessão inválido.');
  }
  return {
    access_token: tokens.access_token,
    refresh_token: refreshToken,
    expires_at: Date.now() + expiresIn * 1000,
    user,
  };
}

export async function startArenaLogin(): Promise<void> {
  const clientId = getClientId();
  if (!clientId) throw new Error('O cliente OAuth da Arena ainda não foi configurado no ambiente do Fíbula.');

  const verifier = randomBase64Url();
  const state = randomBase64Url();
  const challenge = await createCodeChallenge(verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const authorizationUrl = new URL(`${ARENA_AUTH_BASE}/oauth/authorize`);
  authorizationUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: 'openid email profile',
  }).toString();

  window.location.assign(authorizationUrl.toString());
}

let callbackInFlight: Promise<ArenaOAuthSession | null> | null = null;

export function completeArenaLogin(): Promise<ArenaOAuthSession | null> {
  if (callbackInFlight) return callbackInFlight;
  if (window.location.pathname !== CALLBACK_PATH) return Promise.resolve(null);
  callbackInFlight = completeArenaLoginOnce().finally(() => {
    callbackInFlight = null;
  });
  return callbackInFlight;
}

async function completeArenaLoginOnce(): Promise<ArenaOAuthSession | null> {
  if (window.location.pathname !== CALLBACK_PATH) return null;

  const callback = new URL(window.location.href);
  const code = callback.searchParams.get('code');
  const returnedState = callback.searchParams.get('state');
  const oauthError = callback.searchParams.get('error');
  const errorDescription = callback.searchParams.get('error_description');
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);

  cleanCallbackUrl();

  if (oauthError) {
    clearPendingAuthorization();
    throw new Error(errorDescription || (oauthError === 'access_denied'
      ? 'O acesso ao Fíbula foi recusado na Arena.'
      : 'A Arena não conseguiu autorizar o acesso ao Fíbula.'));
  }
  if (!code || !returnedState || !expectedState || returnedState !== expectedState || !verifier) {
    clearPendingAuthorization();
    throw new Error('A validação de segurança do login falhou. Inicie o acesso novamente.');
  }

  try {
    const tokens = await exchangeAuthorizationCode(code, verifier);
    if (typeof tokens.access_token !== 'string' || !tokens.access_token) {
      throw new Error('A Arena não retornou um token de acesso válido.');
    }
    const user = await fetchArenaUser(tokens.access_token);
    const session = buildSession(tokens, user);
    saveSession(session);
    return session;
  } finally {
    clearPendingAuthorization();
  }
}

let refreshInFlight: Promise<ArenaOAuthSession | null> | null = null;

async function refreshStoredSession(session: ArenaOAuthSession): Promise<ArenaOAuthSession | null> {
  const tokens = await refreshTokens(session.refresh_token);
  const refreshed = buildSession(tokens, session.user, session.refresh_token);
  saveSession(refreshed);
  return refreshed;
}

export async function getValidArenaSession(): Promise<ArenaOAuthSession | null> {
  const session = readStoredSession();
  if (!session) return null;
  if (session.expires_at > Date.now() + 60_000) return session;

  if (!refreshInFlight) {
    refreshInFlight = refreshStoredSession(session)
      .catch((error: unknown) => {
        if (error instanceof Error && /invalid_grant|invalid refresh|refresh token/i.test(error.message)) {
          clearArenaSession();
          return null;
        }
        throw error;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function getArenaAccessToken(): Promise<string | null> {
  const session = await getValidArenaSession();
  return session?.access_token ?? null;
}
