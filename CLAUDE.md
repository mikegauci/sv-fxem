# FXEM — sv.fxem.com

Bilingual (English + Arabic, RTL) site for FXEM on **Next.js + Supabase (Vercel)** with an in-house CMS modelled on `~/GitHub/batteryfactory` and `~/GitHub/rotta`. Read `README.md` for the form integrations (CurrentDesk, Mailjet), SEO policy and source issues kept on purpose.

## Ground rules

- Exact 1:1 design and content with the original site. `node scripts/compare-parity.mjs <astro .vercel/output/static> [base URL]` compares every page with a build of the old Astro preview (`git worktree add <dir> 752a21b && npm ci && npm run build`).
- **Never promote to production, attach sv.fxem.com or change DNS without explicit go-ahead from Mike.**
- Never commit `.env`/`.env.local` (CurrentDesk and Mailjet credentials). The repo is public.
- Every piece of content exists per language: pages and categories pair through `translation_id`; menus (`location`) and footer widgets are per language. The editor toggles EN/AR.
- One admin to start: mikegauci@gmail.com (username `admin`).
- One PR per CMS stage (branch `pr/NN-name`): 01 foundation, 02 content import, 03 site reads from Supabase, 04 page editor (sections + rich text, SEO), 05 menus + footer, 06 news, 07 checks + preview deploy.

## Conventions

- Next.js 16: middleware is `src/proxy.ts`; `cacheComponents` is on. Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
- `trailingSlash: true`; internal links and API calls end with a slash.
- Public pages are route handlers (`src/app/[[...path]]`, `search`, `ar/search`) returning full HTML documents with the original theme markup. The CMS has its own root layout in `src/app/(cms)`.
- Legacy site modules are plain `.mjs` (`src/lib/{contact,currentdesk,footer,search,security,seo,site}`) so `node --test` can import them; keep their compact style.
- Supabase clients: `@/lib/supabase/server`, `@/lib/supabase/client`; `createAdminClient()` bypasses RLS (server only). Roles: `profiles.role` is `admin` or `member`; `admin_capabilities` null = full admin, else `pages`, `menus`, `media`.
- DB changes are SQL files in `supabase/migrations/`, applied with the Supabase connector (project ref `ugzcbnjgftthksxeglqc`). Regenerate `src/lib/supabase/database.types.ts` after schema changes.
