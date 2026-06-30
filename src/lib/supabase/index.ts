/**
 * Eden — Supabase access layer.
 *
 * Thin client factories only. Domain reads/writes belong to the Memory Plane
 * (`core/memory`), which is the single, governed path to state. Other planes
 * never touch the database directly.
 */
export { getSupabaseBrowserClient } from '@/lib/supabase/client';
export { createSupabaseServerClient, getSupabaseAdminClient } from '@/lib/supabase/server';
export type { Database } from '@/lib/supabase/types';
