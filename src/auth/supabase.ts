import { createClient } from '@supabase/supabase-js';
import { getArenaAccessToken } from './arenaOAuth';

const supabaseUrl = import.meta.env.VITE_FIBULA_SUPABASE_URL?.trim() ?? '';
const publishableKey = import.meta.env.VITE_FIBULA_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

export const isFibulaSupabaseConfigured = Boolean(supabaseUrl && publishableKey);

export const fibulaSupabase = isFibulaSupabaseConfigured
  ? createClient(supabaseUrl, publishableKey, {
      accessToken: getArenaAccessToken,
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  : null;
