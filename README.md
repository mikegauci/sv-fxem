# FXEM — Astro design preview

The English content from `https://sv.fxem.com/` is reproduced in a static Astro site. The preview contains 31 routes: the homepage, 23 additional WordPress content pages, three articles, three article archives, and the standalone English CashU deposit-request design.

Original copy, page-specific styles, body classes, spacing, imagery, fonts, icons, menus, accordions, tabs, tables and third-party embeds are retained. No PHP or WordPress server is needed to build or serve the Astro pages.

## Scope

The following remain on the existing site and are intentionally not migrated:

- All Arabic translations.
- Open Live Account and Open Demo Account, including their success pages.
- Become Our Partner.
- Contact Us.

Navigation between migrated English pages stays within the preview. Deferred pages, client/partner logins, platform downloads and external services keep their original destinations. Search uses the original search endpoint.

Comments and the CashU request form retain their visual design, but preview submission is disabled. No payment processing, comment posting, account creation or email integration is enabled. A status message appears if one of these preview forms is submitted.

The original TradingView, Investing.com calculator and LiveChat embeds remain external services. No chat messages or account/payment submissions were sent during verification.

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

Homepage fragments live in `src/content/`. Other page snapshots live in `src/data/pages/`, rendered with their individual head styles, header, content, footer and body classes by `src/pages/[...slug].astro`.

The original visual assets and browser-side vendor scripts are in `public/assets/`; original vendor license headers are retained. `migration/assets.json` records the source URL for each asset. `migration/routes.json` records the English route inventory.

`npm run import:site` rebuilds editable page snapshots and localizes media/CSS/font references. Missing raw sources are fetched from their public original URLs. Add `-- --refresh` to capture pages again. Raw source HTML is gitignored. `import:homepage` is a compatibility alias to the full importer so homepage links stay consistent with the migrated route inventory.

## Deployment boundaries

- Dedicated Vercel project: `sv-fxem` under `mikegaucis-projects`.
- Deploy with `npx vercel deploy --scope mikegaucis-projects --project sv-fxem --environment preview --yes`.
- Do not promote to production, attach `sv.fxem.com`, or modify DNS during this phase.
- Preview indexing is disabled through robots.txt, HTML robots metadata and X-Robots-Tag headers.
- Vercel's existing deployment protection is retained; the preview may require Vercel sign-in.
- The current preview deployment is recorded in `migration/preview.json`.
