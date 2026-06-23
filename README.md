# Generador de Horarios

Next.js 16 (App Router) + TypeScript + Tailwind CSS + Supabase. Generates monthly
minister schedules for a parish, with a management UI for ministers, fixed rules,
pairs and unavailability, plus a styled Excel "rol" export.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env file and fill in your Supabase project values:

   ```bash
   cp .env.example .env.local
   ```

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable/anon key)

3. Apply the database migrations (Supabase SQL editor) — see
   [`supabase/migrations`](supabase/migrations). The base tables already exist;
   `0001_add_week_ordinals.sql` adds recurrence support to fixed rules.

4. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

1. Push this repository to GitHub.
2. In [vercel.com/new](https://vercel.com/new), import the repo. Vercel
   auto-detects Next.js — no extra build config needed (`next build`).
3. Add the environment variables (Project Settings → Environment Variables), for
   the Production (and Preview) environments:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase publishable/anon key |

4. Make sure the migrations in [`supabase/migrations`](supabase/migrations) have
   been applied to the Supabase project that production points to.
5. Deploy. Subsequent pushes to the default branch trigger automatic deploys.

> The Excel exports (`/api/schedules/export`, `/api/schedules/export-rol`) use
> `xlsx`/`exceljs` and run on Vercel's Node.js serverless runtime (the default
> for Route Handlers) — no edge runtime configuration required.
