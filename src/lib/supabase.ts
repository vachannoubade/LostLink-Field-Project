import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Read environment variables (trimmed and normalized to prevent trailing slash/rest/v1 issues)
const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseUrl = rawUrl ? rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '') : undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

// Support standard JWT-based anon key or newer Supabase publishable key format.
// Both are public keys designed for client-side use with Row Level Security (RLS).
// Note: Never use or expose the Supabase service-role key in frontend client code.
const supabasePublicKey = supabaseAnonKey || supabasePublishableKey;

export interface SupabaseConfigStatus {
  isConfigured: boolean;
  hasUrl: boolean;
  hasKey: boolean;
  keyType: 'anon' | 'publishable' | null;
  missing: string[];
}

/**
 * Diagnostic configuration status check.
 * Allows components and services to inspect setup state safely without logging sensitive keys.
 */
export const getSupabaseConfigStatus = (): SupabaseConfigStatus => {
  const missing: string[] = [];
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!supabasePublicKey) missing.push('VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY');

  return {
    isConfigured: Boolean(supabaseUrl && supabasePublicKey),
    hasUrl: Boolean(supabaseUrl),
    hasKey: Boolean(supabasePublicKey),
    keyType: supabaseAnonKey ? 'anon' : supabasePublishableKey ? 'publishable' : null,
    missing
  };
};

/**
 * Boolean flag indicating whether both URL and public key are present.
 */
export const isSupabaseConfigured: boolean = Boolean(supabaseUrl && supabasePublicKey);

/**
 * Singleton Supabase client.
 * If credentials are not configured, this remains null so that the module can be imported
 * safely without crashing during startup or production builds.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublicKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

/**
 * Helper to retrieve the Supabase client instance.
 * Throws a descriptive error only if called when Supabase is not configured,
 * preventing silent failures while safeguarding module import time.
 */
export const getSupabase = (): SupabaseClient => {
  if (!supabase) {
    const status = getSupabaseConfigStatus();
    throw new Error(
      `Supabase is not configured. Missing required environment variables: ${status.missing.join(', ')}. ` +
      'Please check your .env.local file or refer to .env.example.'
    );
  }
  return supabase;
};
