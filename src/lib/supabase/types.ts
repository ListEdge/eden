/**
 * Eden — Supabase database types (placeholder).
 *
 * Milestone 1 ships the foundation migration only (see supabase/migrations).
 * Once tables exist, regenerate strong types and replace this file:
 *
 *   npx supabase gen types typescript --project-id <your-project-id> \
 *     > src/lib/supabase/types.ts
 *
 * Until then this permissive placeholder keeps the clients generically typed
 * without pretending to know a schema that hasn't been fully built yet.
 */

export interface Database {
  public: {
    Tables: Record<
      string,
      {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      }
    >;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
