# FXEM SEO and responsive QA — 29 October 2026

The 72 migrated content pages retain their visible copy. The SEO build now includes unique English/Arabic titles and descriptions, canonical URLs, reciprocal hreflang with x-default, social metadata and JSON-LD. The 62-URL XML sitemap excludes six author/category archives, two CashU utilities and two registration confirmation pages. The branded bilingual 404 is an additional error document.

Organization and WebSite data use FXEM's visible identity and the existing 1024×351 logo. Non-home pages have breadcrumbs; six article pages have Article data using original headlines/authors and valid featured images where available. Original placeholder article copy remains unchanged. No dates, ratings or registration claims have been invented.

## Verification

- All 51 unit/API/SEO tests passed.
- Preview and local production-mode builds passed metadata, schema, main-heading, content-preservation, internal-link/asset and secret checks.
- 5,255 internal references and 2,516 local asset references resolve in the generated build.
- Each main content area has one H1 and sequential accessible heading levels. Repeated slider headings use accessible heading roles, with generated CSS preserving original typography.
- Desktop and phone homepage computed heading styles match the preceding preview.
- Phone/tablet checks covered 360, 390 and 768 pixel widths, including English/Arabic homepages, products, calculators, contact forms and representative registration, FAQ and article templates. The tested templates have no document-level horizontal overflow.
- Fixed mobile overflow from calculator masks, product tabs and RTL form honeypots. Desktop styles remain unchanged.
- Live Preview checks confirmed robots.txt, 62 sitemap entries, original WordPress short-link destinations, language-query destinations, trailing-slash redirects and the branded missing-page screen. Homepage short-link regressions were checked to prevent preserved-query redirect loops. HTTP 404 status is configured in Vercel output routing; unauthenticated network requests reach Vercel authentication before application routing.
- Preview remains protected by Vercel authentication and noindex headers/metadata. Production-mode policy was tested locally, without a production deployment: content can be indexed, utility pages and APIs remain noindex, and robots.txt references the canonical sitemap.

## Performance scope

The generated HTML is approximately 35 KiB gzip for the homepage and no more than 37 KiB gzip for any content page in the inspected build. The homepage references approximately 111 KB gzip of local CSS and 55 KB gzip of local JavaScript, before third-party widgets. Of 23 main-content homepage images, 22 are lazy-loaded; image decoding is asynchronous. These are build/resource budgets, not a measured page-speed score.

Responsive inspection and resource budgets are complete for this phase. A Lighthouse/field Core Web Vitals result has not been measured; Vercel authentication, the local computer and preview conditions are not representative production measurements. Search Console indexing/rich-result checks and real-user performance monitoring remain post-launch work. TradingView, Google Maps and LiveChat remain external performance dependencies. LiveChat reports a URL allowlist error on some preview hosts; no third-party settings were changed.

## Existing source issues and launch follow-ups

The original site contains unavailable RSS messages, malformed article image URLs, an unavailable CashU logo, a credit-card-request destination returning 404, and placeholder article copy. These are recorded in the migration source-issues inventory and remain unchanged under the original content/design requirement. Registration and actual enquiry-email delivery are not exercised by SEO QA.

A dependency audit flags eight packages in the existing framework tree (one critical, six high and one low). npm recommends major Astro/Vercel-adapter upgrades. This is a separate pre-launch maintenance task, not a confirmed exploit assessment. In particular, the installed Astro version falls within the reported range for [AVIF image optimization RCE](https://github.com/advisories/GHSA-26w7-cxv4-gfx2), and the adapter is affected by the reported [path override advisory](https://github.com/advisories/GHSA-mr6q-rp88-fx84). No major upgrade was included in this SEO change.

Production and DNS have not changed. The final Preview URL is recorded in `migration/preview.json`.
