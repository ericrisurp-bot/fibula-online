/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ARENA_OAUTH_CLIENT_ID: string;
  readonly VITE_FIBULA_SUPABASE_URL: string;
  readonly VITE_FIBULA_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
