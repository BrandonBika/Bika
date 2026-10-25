import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm';
import runtimeConfig from '../../runtime-config.js';

if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseAnonKey) {
  throw new Error('Supabase is not configured. Check the public runtime configuration.');
}

export const supabase = createClient(
  runtimeConfig.supabaseUrl,
  runtimeConfig.supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      persistSession: true
    }
  }
);
