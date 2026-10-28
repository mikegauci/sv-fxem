# FXEM homepage — Astro preview

This first migration phase reproduces the English homepage at `https://sv.fxem.com/`, including its existing copy, announcement, header, carousel, sections and footer. It uses a static Astro build; no PHP, WordPress server or WordPress API is needed to build or serve it.

## Development

```sh
npm ci
npm run dev
npm run build
```

Homepage content lives in `src/content/` and is rendered by the Header, Homepage and Footer Astro components. The original design styles, fonts, icons and media are stored in `public/assets/`. `migration/assets.json` records their source URLs. Vendor license headers are retained.

The existing TradingView widgets and LiveChat embed remain external services, as on the original site. No chat messages or account submissions were sent during verification. The existing RSS error in the footer is preserved because this phase requires unchanged content.

Only `/` is migrated. Links to other pages and Arabic content still go to the existing site; homepage links stay on the preview. Search still goes to the original search endpoint.

## Deployment boundaries

- Dedicated Vercel project: `sv-fxem` under `mikegaucis-projects`.
- Deploy with `npx vercel deploy --scope mikegaucis-projects --project sv-fxem --environment preview --yes`.
- Do not use production promotion, attach `sv.fxem.com`, or change DNS during this phase.
- Preview indexing is disabled with robots.txt, HTML robots metadata and X-Robots-Tag headers.
- Vercel's existing deployment protection is retained; the preview may require Vercel sign-in.

The source importer can rebuild the editable snapshot with `npm run import:homepage -- --refresh`. It reads the public homepage and downloads visual assets, retaining the original style order and localizing CSS font/image references. The captured raw source is gitignored.
