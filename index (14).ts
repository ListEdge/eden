/**
 * Eden — Supabase server clients (server-only).
 *
 * Two distinct clients with different authority:
 *
 *  • Request client (anon key + cookies): user-scoped, RLS-enforced. Use in
 *    Server Components and Route Handlers acting on behalf of a signed-in user.
 *
 *  • Admin client (service-role key): system-scoped, BYPASSES RLS. Reserved for
 *    trusted system writes — in the architecture, the Memory Plane is the only
 *    writer of state, and tenant isolation is enforced by RLS in production
 *    (Build Spec §3.1, R11). Treat the service role as a secret: never import
 *    this into client code, never log the key.
 */

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowserConfig, getSupabaseServerConfig } from '@/lib/config/env';
import type { Database } from '@/lib/supabase/types';

/** User-scoped server client. RLS applies. `cookies()` is async in the App Router. */
export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const { url, anonKey } = getSupabaseBrowserConfig();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component where cookies are read-only — safe to ignore.
        }
      },
    },
  });
}

let adminClient: SupabaseClient<Database> | null = null;

/** System-scoped admin client (service role). Bypasses RLS — use with care. */
export function getSupabaseAdminClient(): SupabaseClient<Database> {
  if (adminClient) return adminClient;
  const { url, serviceRoleKey } = getSupabaseServerConfig();
  adminClient = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
