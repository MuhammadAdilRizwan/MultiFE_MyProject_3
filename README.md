# MultiFe

A mobile-first, multi-vendor tailoring platform. A customer scans a shop's QR code, lands on that shop's storefront (`/s/{slug}`), browses the catalogue, provides body measurements (manual entry, or an AI scan in Phase 2) and places an order. The shopkeeper reviews and approves the measurements, then fulfils the order.

Roles: `customer`, `shopkeeper` (shop `owner` or `staff`), `admin`. Guests can only browse a public storefront.

## Stack

- Next.js 15 (App Router), React, TypeScript (strict), Tailwind CSS
- Supabase: Postgres + RLS, Auth, Storage, Edge Functions, Realtime, pg_cron
- Zod for validating all server input
- Vercel Pro for hosting; Resend for email

## Repository layout

npm-workspaces monorepo.

```
.
├─ package.json            workspaces: frontend, backend
├─ frontend/               Next.js app (Vercel root directory)
│  ├─ app/                 route groups: (storefront), (customer), (seller), (admin), (auth), api
│  ├─ components/
│  └─ lib/supabase/        browser + server clients
└─ backend/                @multife/backend
   ├─ supabase/            migrations, seed.sql, functions/, seed/
   ├─ modules/             framework-free domain logic (catalog, orders, measurements, ...)
   ├─ scripts/             db-setup, db-check
   ├─ types/               generated DB types
   └─ tests/               RLS and order-lifecycle tests
```

Server Actions in `frontend/` stay thin: validate with Zod, then call a function from `@multife/backend/modules/*`. Those functions take the Supabase client as a parameter and import nothing from Next.js.

## Getting started


```bash
npm install
cp .env.example .env.local     # fill in your Supabase keys and DATABASE_URL
npm run db:setup               # apply migrations + seed (add -- --no-seed to skip seed)
npm run db:check               # verify the app can reach Supabase
npm run dev                    # http://localhost:3000
```

Next.js reads env files from `frontend/`, so copy `.env.local` there too when running the app.

## Scripts (run from the repo root)

| Command | What it does |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build of the frontend |
| `npm run lint` | ESLint |
| `npm run db:setup` | Apply migrations and seed to the database in `DATABASE_URL` |
| `npm run db:check` | Check Supabase connectivity |

## Deployment

Vercel: set the project Root Directory to `frontend` and keep "Include source files outside of the Root Directory" enabled so `backend/` is available. Run the Supabase CLI from inside `backend/` (or pass `--workdir backend`).

## Key rules

- Order status changes only through the `fn_transition_order` DB function.
- Never trust client prices; orders are re-priced on the server.
- The service-role key is server-only.
- Never send measurements or PII to Sentry or PostHog.

## Project docs

- Requirements and design: `SRS SDS/`
