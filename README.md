# FXEM — sv.fxem.com

The English and Arabic site at `https://sv.fxem.com/`, rebuilt on **Next.js + Supabase** (Vercel) with an in-house bilingual CMS modelled on the Rotta and Battery Factory rebuilds. The site has 72 content routes: 37 English and 35 Arabic.

The CMS is being built in stages (one PR each): foundation → content import → site reads from Supabase → page editor → menus and footer → news. Public pages are rendered from the CMS content in Supabase, with the same markup as the earlier Astro preview (`node scripts/compare-parity.mjs <astro output dir>` checks every page). The original page snapshots in `src/data/pages/` and `src/content/` remain as the import source.

## Scope

The English and Arabic Contact Us pages are also migrated, with a server-side Mailjet handler. Mailjet credentials are configured for Preview; a non-delivering Mailjet sandbox validation has passed. Actual inbox delivery remains untested.

Navigation between migrated pages and both language switchers stays within the preview. Arabic pages retain the source `lang`, `dir`, RTL styles, menus, carousel settings and text. Existing source sections that are untranslated remain unchanged. Client/partner logins, platform downloads and external services keep their original destinations. Search uses the original search endpoint.

The Arabic CashU design is served at `/ar/deposit_request/`; a Vercel temporary redirect maps the original `/deposit_request/?lang=ar` request to that route. A small head script also supports this language-query URL on local/static servers. The English version remains at `/deposit_request/`.

Comments and the CashU request form retain their visual design, but their submissions remain disabled. A status message appears if one of these preview-only forms is submitted.

The six English and Arabic registration forms are connected to CurrentDesk as described below. English live/demo success pages are included. The original Arabic forms use the same CurrentDesk scripts, field contract and success destinations as English. Arabic page layout/copy and the Arabic demo registration heading are preserved; untranslated original form labels remain in English. The importer checks both language schemas match before sharing validation rules.

The original TradingView, Investing.com calculator and LiveChat embeds remain external services. No chat messages or payment submissions were sent during verification. One explicitly approved real demo registration was subsequently accepted by CurrentDesk on 29 October 2026.

## CurrentDesk registration

The `/open-live-account/`, `/open-demo-account/` and `/become-our-partner/` pages and their `/ar/` equivalents preserve their original fields and multistep design. Their PHP handlers have been replaced with `/api/currentdesk/live/`, `/api/currentdesk/demo/` and `/api/currentdesk/partner/` Next.js route handlers. PHP files, PHAR packages and source error logs are not deployed.

Credentials are server-only environment variables (`.env`/`.env.local` locally, encrypted Preview variables on Vercel):

- `CURRENTDESK_LIVE_AUTHORIZATION`
- `CURRENTDESK_DEMO_AUTHORIZATION`
- `CURRENTDESK_PARTNER_AUTHORIZATION`
- `CURRENTDESK_FORM_SECRET` (separate random signing secret)

The supplied PHP authentication values were transferred directly into ignored/local and encrypted server configuration, never into application source, browser JavaScript or generated HTML. The API host is fixed to the original CurrentDesk host; clients cannot choose an upstream URL or override account category, currency or platform.

The original PHP registration contracts are retained:

| Form    | CurrentDesk endpoint               | Category | `account-demo-status` |
| ------- | ---------------------------------- | -------- | --------------------- |
| Live    | `/registration/client/individual`  | 1        | `"true"`              |
| Demo    | `/registration/lead`               | 1        | `"false"`             |
| Partner | `/registration/partner/individual` | 2        | `"true"`              |

All use platform 9 and currency 5. Live/partner retain the supplied phone/mobile mapping and address-months default. Live marketing query parameters retain the PHP field-name mappings. The demo English-contact checkbox now maps to `lead-english-status`, rather than being overwritten with the legacy hardcoded false value.

Dropdowns come from CurrentDesk dictionaries through the server, returning only IDs and labels. Submission validates required fields, email, telephone, full birth date/age, password strength/confirmation, selected dictionary IDs, radio values and terms consent. The browser has no password or personal-data persistence or logging.

The API requires same-origin JSON requests and a signed, form-specific token bound to an HttpOnly SameSite cookie. It also enforces a body-size limit, field allowlist, honeypot, submission throttle and duplicate-request handling. Throttle/deduplication state is held within each warm server instance; it is not a distributed queue. Ambiguous upstream failures are not automatically retried, and raw CurrentDesk records, credentials or success payloads are not returned to the browser.

The preview uses the existing CurrentDesk service. A visitor's final Submit action can create a real CurrentDesk registration. Verification includes live read-only dictionaries, mocked registration requests, and one explicitly approved real demo request accepted on 29 October 2026. The browser reached the demo confirmation page. Inbox delivery and the back-office record have not been independently checked; live and partner registrations remain unsubmitted. See `migration/currentdesk-real-test.json`.

Run `pnpm test` for the focused mock API/validation tests. Keep `.env` private; `.env.example` contains names only.

## Contact forms / Mailjet

Both `/contact-us/` and `/ar/contact-us/` preserve the original layout, contact details and four form fields. The original Arabic page's English placeholders and submit label are preserved. Validation and delivery status messages follow the page language. Name and email are required; subject and message remain optional as in the original.

The server-only `/api/contact/` endpoint calls [Mailjet Send API v3.1](https://dev.mailjet.com/docs/email-api/send-api-v31/send-basic-email) over HTTPS using Basic authentication. It sends one plain-text message to a fixed configured inbox, from a verified configured sender, with the visitor as ReplyTo. User input cannot change the recipient or sender. No auto-reply is sent.

Required private server environment variables:

- `CONTACT_FORM_SECRET`: independent random signing secret (configured locally and in Vercel Preview).
- `MAILJET_API_KEY` and `MAILJET_SECRET_KEY`: the intended Mailjet account's API credentials.
- `MAILJET_FROM_EMAIL`: a sender already verified and active in that Mailjet account.
- `MAILJET_TO_EMAIL`: the FXEM inbox that should receive enquiries.

The sender is configured as `website@fxem.com` and the recipient as `info@fxem.com` locally and in Vercel Preview. Mailjet API credentials are stored locally and as encrypted Preview environment variables. Sandbox validation passed for these sender/recipient addresses. A visitor’s valid final submission now sends an enquiry through Mailjet. Never put credentials in frontend code or commit an .env file. Production and DNS are unchanged.

The handler validates field types/lengths/email and header controls, enforces same-origin JSON, signed language-bound CSRF tokens and an HttpOnly SameSite cookie, rejects honeypot submissions, caps bodies, throttles sends, and deduplicates concurrent requests. Rate/deduplication state is per warm instance rather than distributed storage. No visitor details, message bodies or credentials are logged or stored in the browser. No automatic sending retries occur after uncertain failures. Mailjet errors and message identifiers are not exposed. Success requires a message-level success status and delivery ID, and is not reported for a sandbox response or missing configuration.

The contact tests mock Mailjet requests, including success, failures, abuse controls and both languages. A real Mailjet Send API sandbox request passed without delivery. No actual enquiry email has been sent during verification, so inbox delivery remains untested.

## Source issues preserved

This phase requires unchanged content and design rather than repairing unrelated source issues:

- The shared footer replaces the failed DailyFX widget with three CNBC finance headlines, fetched through `/api/footer-news`. Headlines are clamped to two lines with a localized publication date underneath, inside a 180px block that fits within the existing footer navigation height; footer grid columns have zero minimum widths so long headlines cannot squeeze other columns; the source link remains available if the feed cannot load. Other source news-page widgets are unchanged.
- Copyright years use the current year at build time and update in the browser without redeployment, including on return to an open tab. These enhancements apply to English and Arabic footers, search and the 404 page.
- Two old articles contain escaped HTML in image URLs, so those images are already broken on WordPress. Their existing appearance is retained; exact cases are recorded in `migration/source-issues.json`.
- The original CashU request page's logo URL returns an HTML error page instead of an image; its missing-logo appearance is retained.
- The original `/credit-card-request/` destination returns 404. Its source link is retained without inventing a replacement page or payment integration.

## Development

```sh
pnpm install
pnpm dev          # http://localhost:3000 (the Claude preview runs it on 3002)
pnpm build        # production build (stop `pnpm dev` first)
pnpm test         # form, SEO, routing and search tests
pnpm typecheck
pnpm lint
```

Content import (CMS stage 2): `node --env-file=.env.local scripts/import-content.mjs` checks that every page's content, header and footer can be rebuilt from the extracted rows; `--apply` writes them to Supabase (pages + sections, categories, menus + items, footer widgets, the per-language header/footer templates in `settings` as `chrome:en`/`chrome:ar`, and 71 original images in the `media` bucket under `assets/`). It replaces imported content wholesale, so only re-run it before content is edited in the CMS. `node --env-file=.env.local scripts/verify-import.mjs` reads everything back with the public key and rebuilds all 72 pages. Renderers for menus, header, footer and sections are in `src/lib/site/menus.mjs` and `chrome.mjs`.

`scripts/prebuild.mjs` runs before `dev` and `build`: it bundles the browser form scripts into `public/_fxem/` and writes `src/generated/routing.json` for the proxy.

- Public pages: `src/app/[[...path]]/route.ts` loads the published page, its sections and the language's header/footer from Supabase (`src/lib/site/content.ts`), renders them (`render.ts`, `chrome.mjs`), applies the SEO layer (`src/lib/seo/document.mjs`) and caches the result (`"use cache"`, tags `cms`, `cms:page:<path>`, `cms:chrome:<lang>`, `cms:routes`). Admin saves call `revalidateContent()` (`src/lib/site/revalidate.ts`). Drafts are not public. Unknown paths get the bilingual 404 with HTTP 404. Search is `src/app/search` and `src/app/ar/search`.
- `src/proxy.ts`: WordPress short links (`?p=`, `?page_id=`), `?lang=`, `?s=` on the homepages, `/index.php`, the `redirects` table, the `X-Robots-Tag` policy, and the Supabase session refresh for `/admin` and `/auth`.
- CMS: `src/app/(cms)/admin` (sign-in at `/admin/login/`). Dashboard, Media, Users and Redirects are live; Pages, News, Menus and Footer follow in later PRs.
- Database: SQL in `supabase/migrations/`, applied with the Supabase connector to project `sv-fxem` (ref `ugzcbnjgftthksxeglqc`, eu-central-1). English and Arabic versions of a page share a `translation_id`; menus and footer widgets are per language.

The original visual assets and browser-side vendor scripts are in `public/assets/`; original vendor license headers are retained. `migration/assets.json` records the source URL for each asset. `migration/routes.json` records the bilingual route inventory. `npm run import:site` rebuilds the page snapshots from the original site.

## Deployment boundaries

- Dedicated Vercel project: `sv-fxem` under `mikegaucis-projects`.
- Preview deploys need `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` alongside the CurrentDesk/Mailjet variables.
- Do not promote to production, attach `sv.fxem.com`, or modify DNS during this phase.
- Preview/development builds block indexing through robots.txt, HTML robots metadata and X-Robots-Tag headers. Production-mode builds allow the 62 content URLs and keep utility pages and APIs out of search.
- Vercel's existing deployment protection is retained; the preview may require Vercel sign-in.
- The current preview deployment is recorded in `migration/preview.json`.

## SEO and launch checks

Every rendered page passes through `src/lib/seo/document.mjs` (dev and production alike). Titles and descriptions come from each page's SEO fields in the CMS (imported from `src/lib/seo/metadata.mjs`); language links come from the pages' translation groups. Content is stored unchanged; the served HTML receives the SEO layer.

- `src/lib/seo/metadata.mjs` contains individually written English and Arabic titles/descriptions for all 72 content routes. Visible copy is unchanged.
- Canonicals use `https://sv.fxem.com` and preserve existing permalink paths. Language alternatives are reciprocal and generated from the migrated inventory, with English as x-default. The two legacy Arabic category slugs are explicitly paired with their English equivalents.
- `/sitemap.xml` lists 62 canonical content URLs with language alternatives. Six duplicate/empty author/category archives, two CashU utility forms and two registration confirmation pages are excluded and remain noindex on production.
- JSON-LD includes Organization, WebSite, WebPage/ContactPage/AboutPage, BreadcrumbList on non-home pages, and Article on the six migrated article pages. Only source-backed identity, headlines, authors and valid featured images are used. Missing publication dates, ratings, broken media and unverified business claims are not invented. The original articles still contain placeholder copy; this phase does not rewrite it.
- Open Graph and Twitter metadata use the localized page titles/descriptions and existing FXEM logo. No new marketing images are invented.
- Each main content area has one H1. Repeated homepage slider titles and skipped heading levels use accessible heading roles with corrected levels. Build-generated CSS aliases preserve their original type styles at responsive breakpoints; a screen-reader-only primary heading supplies the homepage/utility H1.
- Indexing opens only when `VERCEL_ENV=production`. `NODE_ENV=production` alone is insufficient. Preview/development stays noindex with robots.txt blocking crawling and Vercel authentication retained. The proxy's `X-Robots-Tag` headers follow the same policy.
- WordPress `p`/`page_id` short links, `index.php` and opposite-language `lang` query links redirect to existing canonical paths. Existing permalinks do not move. A branded bilingual error page is served with HTTP 404 and noindex for unmatched paths.
- Images receive asynchronous decoding and offscreen image lazy loading. Calculator overlays and product tab widths are constrained on mobile, and offscreen honeypots are clipped inside the viewport to prevent RTL horizontal scrolling; desktop dimensions remain unchanged. Original external market widgets and LiveChat remain third-party performance dependencies.

`pnpm test` covers both environment policies, the SEO inventory and the routing rules alongside the form tests.

A production launch still requires explicit authorization, domain/DNS cutover and post-launch Search Console sitemap/URL inspection checks. Protected previews cannot establish Google indexing or real-user Core Web Vitals. Real registration and email delivery tests remain separate from this SEO work.

## Reverse-proxy host validation

The form APIs rebuild the request URL from the forwarded host only when that host is on an exact allowlist (`src/lib/security/request.mjs`, `hosts.mjs`): the original site, the project domain and Vercel-provided deployment/branch aliases. Unknown hosts get a localhost origin, so the same-origin and CSRF checks reject them. Local HTTP hosts are trusted only outside Vercel. There is no wildcard trust for arbitrary Vercel tenants.
