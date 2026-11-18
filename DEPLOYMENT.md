# Deploying MultiFe on Vercel

Vercel builds the Next.js app itself, so there is no Dockerfile. The app is in `frontend/`. It
imports `@multife/backend` from `backend/` through npm workspaces, and Vercel installs the
workspaces from the repo root.

## 1. Create the project
1. Vercel → **Add New → Project** → import the GitHub repo.
2. **Root Directory:** `frontend`. Leave **"Include files outside the root directory"** on,
   because the app needs `backend/`.
3. Framework preset: **Next.js**. Leave the build, install and output commands at their
   defaults.
4. Node.js version: pinned to **22.x** by `engines` in `frontend/package.json`, so Vercel uses
   it whatever the project setting says.

`frontend/vercel.json` already sets two things:
- **Region `bom1` (Mumbai):** this is next to the Supabase project (`ap-south-1`).
- **Daily cron for `/api/cron/notifications`:** it re-sends queued emails that failed.
  Emails are also sent straight away when each action happens. The Hobby plan only allows
  daily crons. On Pro, change the schedule to `*/5 * * * *`.

## 2. Environment variables (Settings → Environment Variables)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **secret**, server only. Do not give it a `NEXT_PUBLIC_` prefix |
| `NEXT_PUBLIC_SITE_URL` | yes | the live address, e.g. `https://multife.vercel.app` (no trailing slash). Used in auth email links |
| `CRON_SECRET` | yes | any long random string. Vercel Cron sends it automatically as `Authorization: Bearer …` |
| `RESEND_API_KEY` | for email | without it, emails stay queued |
| `NOTIFY_FROM_EMAIL` | for email | sender on a domain verified in Resend, e.g. `MultiFe <orders@yourdomain>` |
| `MULTIFE_CONTACT_EMAIL`, `MULTIFE_CONTACT_PHONE` | optional | shown on /register-brand |
| `MULTIFE_COLLECTION_ADDRESS` | optional | blank = delivery only |
| `NEXT_PUBLIC_SENTRY_DSN` | optional | turns on error reporting. Sentry is off without it |

`DATABASE_URL` is **not** needed on Vercel. It is only used by the local `npm run db:*`
scripts.

`NEXT_PUBLIC_*` values are built into the app at build time. After changing one, redeploy.

## 3. Supabase settings (dashboard of the client project)
- **Authentication → URL Configuration:**
  - Site URL = the live address.
  - Add `https://<your-domain>/**` to Redirect URLs. Without this, sign-up confirmation,
    password reset and invite links point to localhost.
- **Authentication → SMTP:** Supabase's built-in mailer is rate-limited and not meant for
  production. Set up custom SMTP, for example Resend.

## 4. Before every deploy
- Apply new migrations to the database from your machine: `npm run db:setup -- --no-seed`.
  Vercel does not run migrations.
- Run `npm test`, `npm run lint` and `npm run build` locally.

## 5. After the first deploy
- Open the site and check sign-in, a store page, and placing a COD order.
- Response headers should include `Strict-Transport-Security` and
  `Content-Security-Policy-Report-Only`.
- Watch the browser console for CSP reports for about a week. Then rename the header to
  `Content-Security-Policy` in `frontend/lib/security-headers.ts` so it is enforced.
- Before the site is public: the demo brands use real retailer names. Confirm with the client
  first (see STATUS.md, "Known issues").
