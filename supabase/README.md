# Eden — Supabase

This folder holds the database schema for Eden as ordered SQL migrations.

```
supabase/
  migrations/
    0001_init.sql    foundation schema (this milestone)
```

You can apply migrations two ways. The **SQL editor** is the simplest and needs
no tooling; the **CLI** is handy once you're managing many migrations.

---

## Option A — Supabase SQL editor (simplest)

1. Open your project at <https://supabase.com> and go to the **SQL Editor**.
2. Click **New query**.
3. Open [`migrations/0001_init.sql`](migrations/0001_init.sql), copy all of it,
   and paste it into the editor.
4. Click **Run**.

Run the migration files in order (lowest number first). For Milestone 1 there's
just `0001_init.sql`.

---

## Option B — Supabase CLI

If you prefer the command line:

```bash
# install once: https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

`db push` applies the migrations in this folder to the linked project.

---

## What `0001_init.sql` creates

It's a deliberate **subset** of the full data model — the foundation that later
migrations extend without rework:

- **`tenants`, `principals`** — identity and multi-tenancy.
- **`requests`** — captured intent (the immutable starting point of any work).
- **`wp_status`** — the Work Package status type (the closed set of states).
- **`work_packages`** — the core records, with the document-shaped fields
  (`intent`, `spec`, `plan`) stored as JSON.
- **`events`** — the append-only audit log, globally ordered.

It also turns on two safety rules at the database level:

- **The event log is append-only.** Update and delete are revoked for the
  application roles, so history can be added to but never rewritten.
- **Tenants are isolated by default.** Row-level security is enabled on every
  table. With no policy yet defined, the default is deny — nothing is readable by
  the public roles until per-tenant policies are added (Phase 0). Server-side
  reads in Milestone 1 use the service role, which bypasses row-level security.

The migration is safe to run and only creates objects that don't already exist.

---

## Generating TypeScript types (optional)

Once the schema is live you can generate types for it and replace the
placeholder in `src/lib/supabase/types.ts`:

```bash
supabase gen types typescript --linked > src/lib/supabase/types.ts
```

This gives the Supabase client full type-safety against your actual schema.
