# Eden — Environment Variables

Every variable below is **optional**. Eden builds and runs with none of them
set; each one unlocks a capability, and anything that needs a missing variable
fails with a clear configuration error instead of guessing or crashing on boot.

Copy [`.env.example`](../.env.example) to `.env.local` for local development, and
set the same keys in **Vercel → Project → Settings → Environment Variables** for
deployment.

---

## Public vs. server-only

This matters for security, so it's worth thirty seconds:

- **Public** variables are prefixed `NEXT_PUBLIC_`. Next.js ships these to the
  browser. Only put non-secret values here.
- **Server-only** variables have no prefix. They stay on the server and are
  never sent to the browser. All secrets belong here.

Eden enforces this in code: server-only values can't be read from browser code,
and a misuse throws rather than leaking.

---

## Reference

### `NEXT_PUBLIC_SUPABASE_URL`
- **Type:** public
- **What it is:** your Supabase project's API URL.
- **Where to find it:** Supabase → Project Settings → API → *Project URL*.
- **Enables:** all database features (browser and server Supabase clients).

### `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Type:** public
- **What it is:** the Supabase "anonymous" public key. It's designed to be
  public and works together with row-level security.
- **Where to find it:** Supabase → Project Settings → API → *Project API keys →
  `anon` `public`*.
- **Enables:** the browser-side Supabase client.

### `SUPABASE_SERVICE_ROLE_KEY`
- **Type:** server-only **(secret)**
- **What it is:** the Supabase service-role key. It has full access and
  **bypasses row-level security**, so it must never reach the browser or be
  committed.
- **Where to find it:** Supabase → Project Settings → API → *Project API keys →
  `service_role` `secret`*.
- **Enables:** the server-side admin Supabase client used for trusted
  server operations.

### `OPENAI_API_KEY`
- **Type:** server-only **(secret)**
- **What it is:** your OpenAI API key. Eden's reasoning layer is
  provider-agnostic, and OpenAI is the first supported provider.
- **Where to find it:** <https://platform.openai.com/api-keys>.
- **Enables:** the reasoning provider.

### `OPENAI_MODEL`
- **Type:** server-only
- **What it is:** an override for which OpenAI model to use.
- **Default:** `gpt-4o-mini`.
- **When to set it:** only if you want a different model than the default.

### `EDEN_REASONING_PROVIDER`
- **Type:** server-only
- **What it is:** which registered reasoning provider Eden should use.
- **Default:** `openai`.
- **When to set it:** once additional providers are registered in a later
  milestone and you want to switch.

### `EDEN_LOG_LEVEL`
- **Type:** server-only
- **What it is:** how verbose the structured logs are. One of `debug`, `info`,
  `warn`, `error`.
- **Default:** `info`.
- **When to set it:** `debug` while diagnosing something; `warn` or `error` to
  quieten logs in production.

---

## Built-in variables (you don't set these)

Vercel provides some variables automatically; Eden reads one of them:

- **`VERCEL_GIT_COMMIT_SHA`** — the git commit a deployment was built from.
  Surfaced by `/api/version` so you can tell exactly what's live. Set
  automatically by Vercel; nothing to configure.
