# Eden — Deployment

This is a step-by-step guide to getting Eden live. It assumes no prior Vercel or
Supabase experience. Eden runs perfectly well with **nothing configured**, so
you can deploy first and add the database and AI pieces whenever you're ready.

There are two parts:

- **Part 1 — Deploy the app to Vercel.** Gets Eden online. ~5 minutes.
- **Part 2 — Connect Supabase and AI (optional).** Needed only when later
  milestones start using the database and reasoning. You can skip it for now.

---

## Part 1 — Deploy to Vercel (GitHub → Vercel)

### Step 1: Put the code on GitHub

If you haven't already, create a new repository on GitHub and push this project
to it. From the project folder:

```bash
git init
git add .
git commit -m "Eden — Milestone 1 foundation"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

(If the repo already exists on GitHub, just `git add`, `git commit`, and
`git push`.)

### Step 2: Import the repo into Vercel

1. Go to <https://vercel.com> and sign in (you can sign in with GitHub).
2. Click **Add New… → Project**.
3. Find your repository in the list and click **Import**.

### Step 3: Deploy

Vercel automatically detects this is a **Next.js** app and fills in the right
build settings. You don't need to change anything.

- Leave the **Framework Preset** as *Next.js*.
- Leave the build and output settings at their defaults.
- Click **Deploy**.

After a minute or two you'll get a live URL (something like
`https://your-repo.vercel.app`). Open it — you should see the Eden console
reporting that the system is online. **That's a complete, successful
deployment.**

### Step 4 (optional): check the health endpoint

Visit `https://your-url.vercel.app/api/health`. You should get a small JSON
response with `"status": "online"` and a `capabilities` section showing which
features are configured (all `false` until Part 2 — that's expected).

---

## Part 2 — Connect Supabase and AI (optional, for later milestones)

Milestone 1 doesn't require any of this. Do it when you want the database and
reasoning features that later milestones add.

### Step 1: Create a Supabase project

1. Go to <https://supabase.com> and create a project.
2. Choose a region close to your Vercel deployment for best performance.
3. Wait for the project to finish provisioning.

### Step 2: Run the database migration

1. In your Supabase project, open the **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open the file [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql)
   from this project, copy its entire contents, and paste it into the editor.
4. Click **Run**.

This creates the foundation tables and turns on the safety rules (the event log
becomes append-only; tenant isolation is enabled). It's safe to run, and it only
creates things that don't already exist. More detail is in
[`supabase/README.md`](../supabase/README.md).

### Step 3: Collect your keys

In Supabase, go to **Project Settings → API**. You'll need:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **`anon` public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **`service_role` secret key** → `SUPABASE_SERVICE_ROLE_KEY`
  *(keep this one secret — it has full access)*

For AI features, get an OpenAI key at
<https://platform.openai.com/api-keys> → `OPENAI_API_KEY`.

### Step 4: Add the variables to Vercel

1. In Vercel, open your project → **Settings → Environment Variables**.
2. Add each variable name and value from Step 3 (and any optional ones you want
   from `.env.example`).
3. Apply them to the environments you want (Production, Preview, Development).
4. **Redeploy** so the new variables take effect: go to the **Deployments** tab,
   open the latest deployment's menu, and choose **Redeploy**.

### Step 5: confirm

Visit `/api/health` again. The relevant entries under `capabilities` should now
read `true`.

---

## Local development

To run Eden on your own machine:

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

For local database/AI work, copy `.env.example` to a file named `.env.local` and
fill in the same values you'd put in Vercel. (`.env.local` is git-ignored, so it
won't be committed.)

---

## A few good-to-knows

- **Node version.** Eden targets Node 22 (pinned in `.nvmrc`). Vercel honours
  this automatically.
- **Zero-config is intentional.** If a variable is missing, the related feature
  is simply disabled, and any endpoint that needs it returns a clear
  configuration error — the app won't crash on boot.
- **The run endpoint is a scaffold in M1.** `POST /api/eden/run` validates your
  input and returns `501 Not Implemented` on purpose; it does not yet execute
  anything. This is by design for Milestone 1.
- **Secrets stay server-side.** Never put a real `SUPABASE_SERVICE_ROLE_KEY` or
  `OPENAI_API_KEY` in a `NEXT_PUBLIC_` variable — that would expose it to the
  browser.
