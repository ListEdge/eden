/**
 * Eden — Supabase browser client.
 *
 * Uses the public anon key and respects Row Level Security. Safe for client
 * components. Created lazily so the bundle/build does not require configuration.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowserConfig } from '@/lib/config/env';
import type { Database } from '@/lib/supabase/types';

let browserClient: SupabaseClient<Database> | null = null;

/** Get (or lazily create) the browser Supabase client. */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;
  const { url, anonKey } = getSupabaseBrowserConfig();
  browserClient = createBrowserClient<Database>(url, anonKey);
  return browserClient;
}
