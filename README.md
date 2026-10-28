# FXEM — Astro design preview

The English and Arabic content from `https://sv.fxem.com/` is reproduced in Astro. The preview contains 67 content routes: 36 English and 31 Arabic. Content is statically generated; the English live-account, demo-account and partner forms use server-side Astro API endpoints on Vercel.

Original copy, page-specific styles, body classes, spacing, imagery, fonts, icons, menus, accordions, tabs, tables and third-party embeds are retained. No PHP or WordPress server is needed to build or serve the Astro pages.

## Scope

The following remain on the existing site and are intentionally not migrated:

- Arabic Open Live Account, Open Demo Account and Become Our Partner.
- Contact Us in both languages.

Navigation between migrated pages and both language switchers stays within the preview. Arabic pages retain the source `lang`, `dir`, RTL styles, menus, carousel settings and text. Existing source sections that are untranslated remain unchanged. Deferred pages in both languages, client/partner logins, platform downloads and external services keep their original destinations. Search uses the original search endpoint.

The Arabic CashU design is served at `/ar/deposit_request/`; a Vercel temporary redirect maps the original `/deposit_request/?lang=ar` request to that route. A small head script also supports this language-query URL on local/static servers. The English version remains at `/deposit_request/`.

Comments and the CashU request form retain their visual design, but their submissions remain disabled. A status message appears if one of these preview-only forms is submitted.

The three English registration forms are connected to CurrentDesk as described below. English live/demo success pages are included.

The original TradingView, Investing.com calculator and LiveChat embeds remain external services. No chat messages or account/payment submissions were sent during verification.

## CurrentDesk registration

The English `/open-live-account/`, `/open-demo-account/` and `/become-our-partner/` pages preserve their original fields and multistep design. Their PHP handlers have been replaced with `/api/currentdesk/live`, `/api/currentdesk/demo` and `/api/currentdesk/partner` Astro endpoints, using the Vercel adapter. PHP files, PHAR packages and source error logs are not deployed.

Credentials are server-only environment variables (`.env` locally, encrypted Preview variables on Vercel):

- `CURRENTDESK_LIVE_AUTHORIZATION`
- `CURRENTDESK_DEMO_AUTHORIZATION`
- `CURRENTDESK_PARTNER_AUTHORIZATION`
- `CURRENTDESK_FORM_SECRET` (separate random signing secret)

The supplied PHP authentication values were transferred directly into ignored/local and encrypted server configuration, never into application source, browser JavaScript or generated HTML. The API host is fixed to the original CurrentDesk host; clients cannot choose an upstream URL or override account category, currency or platform.

The original PHP registration contracts are retained:

| Form | CurrentDesk endpoint | Category | `account-demo-status` |
| --- | --- | --- | --- |
| Live | `/registration/client/individual` | 1 | `"true"` |
| Demo | `/registration/lead` | 1 | `"false"` |
| Partner | `/registration/partner/individual` | 2 | `"true"` |

All use platform 9 and currency 5. Live/partner retain the supplied phone/mobile mapping and address-months default. Live marketing query parameters retain the PHP field-name mappings. The demo English-contact checkbox now maps to `lead-english-status`, rather than being overwritten with the legacy hardcoded false value.

Dropdowns come from CurrentDesk dictionaries through the server, returning only IDs and labels. Submission validates required fields, email, telephone, full birth date/age, password strength/confirmation, selected dictionary IDs, radio values and terms consent. The browser has no password or personal-data persistence or logging.

The API requires same-origin JSON requests and a signed, form-specific token bound to an HttpOnly SameSite cookie. It also enforces a body-size limit, field allowlist, honeypot, submission throttle and duplicate-request handling. Throttle/deduplication state is held within each warm server instance; it is not a distributed queue. Ambiguous upstream failures are not automatically retried, and raw CurrentDesk records, credentials or success payloads are not returned to the browser.

The preview uses the existing CurrentDesk service. A visitor's final Submit action can create a real CurrentDesk registration. Verification used live read-only dictionary calls and mocked registration requests; no real accounts or leads were created, and email delivery was not tested.

Run `npm test` for the focused mock API/validation tests. Keep `.env` private; `.env.example` contains names only.

## Source issues preserved

This phase requires unchanged content and design rather than repairing unrelated source issues:

- The footer and news pages display the source site's unavailable RSS-feed messages.
- Two old articles contain escaped HTML in image URLs, so those images are already broken on WordPress. Their existing appearance is retained; exact cases are recorded in `migration/source-issues.json`.
- The original CashU request page's logo URL returns an HTML error page instead of an image; its missing-logo appearance is retained.
- The original `/credit-card-request/` destination returns 404. Its source link is retained without inventing a replacement page or payment integration.

## Development

```sh
npm ci
npm run dev
npm run build
```

English homepage fragments live in `src/content/`. Other page snapshots, including the Arabic homepage, live in `src/data/pages/`, rendered with their individual HTML language/direction, head styles, header, content, footer and body classes by `src/pages/[...slug].astro`.

The original visual assets and browser-side vendor scripts are in `public/assets/`; original vendor license headers are retained. `migration/assets.json` records the source URL for each asset. `migration/routes.json` records the bilingual route inventory.

`npm run import:site` rebuilds editable page snapshots and localizes media/CSS/font references. Missing raw sources are fetched from their public original URLs. Add `-- --refresh` to capture pages again. Raw source HTML is gitignored. `import:homepage` is a compatibility alias to the full importer so homepage links stay consistent with the migrated route inventory.

## Deployment boundaries

- Dedicated Vercel project: `sv-fxem` under `mikegaucis-projects`.
- Deploy with `npx vercel deploy --scope mikegaucis-projects --project sv-fxem --environment preview --yes`.
- Do not promote to production, attach `sv.fxem.com`, or modify DNS during this phase.
- Preview indexing is disabled through robots.txt, HTML robots metadata and X-Robots-Tag headers.
- Vercel's existing deployment protection is retained; the preview may require Vercel sign-in.
- The current preview deployment is recorded in `migration/preview.json`.
