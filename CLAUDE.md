# FXEM — sv.fxem.com

Bilingual (English + Arabic, RTL) site for FXEM on **Next.js + Supabase (Vercel)** with an in-house CMS modelled on `~/GitHub/batteryfactory` and `~/GitHub/rotta`. Read `README.md` for the form integrations (CurrentDesk, Mailjet), SEO policy and source issues kept on purpose.

## Ground rules

- Exact 1:1 design and content with the original site. `node scripts/compare-parity.mjs <astro .vercel/output/static> [base URL]` compares every page with a build of the old Astro preview (`git worktree add <dir> 752a21b && npm ci && npm run build`).
- **Never promote to production, attach sv.fxem.com or change DNS without explicit go-ahead from Mike.**
- Never commit `.env`/`.env.local` (CurrentDesk and Mailjet credentials). The repo is public.
- Every piece of content exists per language: pages and categories pair through `translation_id`; menus (`location`) and footer widgets are per language. The editor toggles EN/AR.
- One admin to start: mikegauci@gmail.com (username `admin`).
- One PR per CMS stage (branch `pr/NN-name`): 01 foundation, 02 content import, 03 site reads from Supabase, 04 page editor (sections + rich text, SEO), 05 menus + footer, 06 news feed (the site's news is the footer RSS block; the 3 old WordPress posts are edited under Pages), 07 checks + preview deploy.

## Conventions

- Next.js 16: middleware is `src/proxy.ts`; `cacheComponents` is on. Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
- `trailingSlash: true`; internal links and API calls end with a slash.
- Public pages are route handlers (`src/app/[[...path]]`, `search`, `ar/search`) returning full HTML documents with the original theme markup. The CMS has its own root layout in `src/app/(cms)`.
- Legacy site modules are plain `.mjs` (`src/lib/{contact,currentdesk,footer,search,security,seo,site}`) so `node --test` can import them; keep their compact style.
- Supabase clients: `@/lib/supabase/server`, `@/lib/supabase/client`; `createAdminClient()` bypasses RLS (server only). Roles: `profiles.role` is `admin` or `member`; `admin_capabilities` null = full admin, else `pages`, `menus`, `media`.
- Header/footer/menus/sections are rendered from CMS rows by `src/lib/site/chrome.mjs` + `menus.mjs` (theme templates in `settings` `chrome:<lang>` with `<!--fxem:...-->` markers; menu item `options` keep the original attributes). Never re-run `scripts/import-content.mjs --apply` once content is edited in the CMS: it replaces all imported content.
- DB changes are SQL files in `supabase/migrations/`, applied with the Supabase connector (project ref `ugzcbnjgftthksxeglqc`). Regenerate `src/lib/supabase/database.types.ts` after schema changes.

## Rich text and embeds

- Section kinds are `html`, `rich_text`, and `embed`. `page_sections.options` stores iframe/code settings; the HTML is directly renderable. Rich-text embeds are atom nodes (`div[data-fxem-embed]`), with raw HTML held in a node attribute and an inert NodeView. DOM serialization uses encoded `data-code` placeholders, expanded as strings before saving, so raw event handlers never enter an active document during serialization. Never render user code into admin DOM.
- `pages.custom_code` contains per-language `{head, bodyEnd}` snippets, injected after SEO/theme/form scripts in public and saved-preview documents, including standalone pages. Search/404 do not receive them. Embeds and custom code are not copied to new translations.
- `src/lib/admin/embeds.mjs` owns script signatures, iframe validation/building, snippet extraction and page-code insertion. Full admins alone can add/change executable content; limited admins may retain existing signatures per section ID, reorder/delete sections and add HTTPS iframes. New IDs cannot inherit a script signature. Database triggers provide a conservative SQL backstop on sections, page code, menu widgets and footer widgets; service-role maintenance (`auth.uid() IS NULL`) is allowed.
- The shared `content-fields.mjs` DOM parser/collector and `inline-rich-text.tsx` preserve layout tags/attributes and theme span marks. Unsupported inline markup falls back to plain inputs. Do not serialize untouched fields back on mount. The import section splitter is shared in `src/lib/site/sections.mjs`.
- No CSP is introduced. Admin/public share an origin; scripts on a public/saved-preview page can act with an admin viewer's privileges. The saved-page preview must visibly warn that it runs scripts. A separate admin domain remains future work.
