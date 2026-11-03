# Plan: rich text editing and embeds (iframes / JS snippets)

Brief for implementing the client's request on **sv.fxem.com** (repo `mikegauci/sv-fxem`, public). It is self-contained: read it together with `CLAUDE.md` and `README.md` in the repo root.

## The request

The client wants:

1. **Rich text editing** of their page content.
2. **Iframes and JavaScript snippets** they can add to pages.

## Decisions already made (do not re-ask)

| Topic | Decision |
|---|---|
| Rich text | **Both:** (a) a rich text toolbar on each text block inside the existing designed sections, with the layout unchanged; and (b) a way to convert any section into a free rich text section. |
| Where embeds can go | **(1)** as a page section; **(2)** inside rich text; **(3)** per-page code in `<head>` and before `</body>`. **Not** site-wide (no global analytics/GTM slot in this work). |
| Who may add JS | **Full admins only** (`profiles.admin_capabilities IS NULL`). Admins with only the `pages` capability may add **iframes** but not scripts. |
| Iframes allowed | **Any `https://` address.** No allow-list. |
| Languages | Everything stays per language (EN and AR pages are separate rows linked by `translation_id`). Embeds and per-page code are set per language version, not copied automatically. |

## Current state (what exists today)

- **Stack.** Next.js 16 (`cacheComponents` on, `trailingSlash: true`, middleware in `src/proxy.ts`), Supabase project `ugzcbnjgftthksxeglqc`, deployed on Vercel. The package manager is pnpm.
- **Public pages** are route handlers (`src/app/[[...path]]/route.ts`) that return full HTML documents built from CMS rows:
  - `src/lib/site/render.ts`: `composeFrom`, `renderPage`, `renderPreview`, and `sectionHtml()`, which wraps `rich_text` sections with `richTextSection()`.
  - `src/lib/site/chrome.mjs`: `renderContent(shell, sections)` joins the section HTML into `layout.contentShell`.
  - `src/lib/site/document.mjs`: `siteStyles`, `richTextSection`, `footer`.
  - Cached loaders live in `src/lib/site/content.ts` (`"use cache"` with tags `cms:page:<path>`). Admin saves call `revalidateContent({ page })`.
- **Data.**
  - `pages`: `language`, `translation_id`, `path`, `title`, `kind`, `status`, `seo jsonb`, `layout jsonb`. `layout.head`/`layout.scripts` hold theme markup and are not for editors.
  - `page_sections`: `page_id`, `position`, `kind section_kind ('html' | 'rich_text')`, `label`, `html`.
  - Pages are saved through the RPC `admin_save_page(target_page, fields, new_sections)` (SECURITY INVOKER, so `auth.uid()` is the editor) from `src/app/(cms)/admin/(panel)/pages/actions.ts` (`savePage`).
  - RLS uses `private.has_admin_capability('pages')`.
  - Content history is captured by triggers.
- **Editor.**
  - `src/components/admin/page-editor.tsx` holds the page fields and the section list.
  - `src/components/admin/section-editor.tsx`:
    - `html` sections have a **Content** tab (`ContentFields`). It parses the section into a `<template>` and lists every text node, link, image and background image as a plain input. Edits write back into the DOM and `innerHTML`.
    - `html` sections also have an **HTML** tab: a raw textarea.
    - `rich_text` sections use `RichTextEditor`.
  - `src/components/admin/rich-text-editor.tsx` is TipTap 3 (`@tiptap/react`, `starter-kit`, `extension-image`). It offers headings 2–4, bold, italic, links, lists, quote, a horizontal rule, images from the media library, and undo/redo.
- **Imported content already contains scripts and iframes.** Of 324 sections, 8 contain `<script>` (on 6 pages) and 8 contain `<iframe>`, for example TradingView/market widgets. These must keep working and stay editable by full admins.
- **Security gap today.** Anyone with the `pages` capability can type a `<script>` into the HTML tab, and nothing strips it. This work must close that gap: see "Script guard" below.
- **No Content-Security-Policy** is set anywhere. Leave it that way, or embeds will break. Note it in the README.
- **Same origin.** The admin (`/admin`) and the public site share an origin, and the Supabase auth cookies (`@supabase/ssr`) are readable by JavaScript. So a snippet on a public page, or in the admin preview, could act as a signed-in admin who views that page. This is why scripts are restricted to full admins, and why the editor must **never execute snippet code** inside admin screens (show code and placeholders only). The preview route (`/admin/pages/[id]/preview/`) renders the page as the public site would, scripts included, so add a visible "This preview runs the page's scripts" note on the button. A separate admin subdomain is a possible later hardening: mention it in the README, don't build it.

## Design

### 1. Script guard (do this first)

Define what counts as **script content**, in one shared module `src/lib/admin/embeds.mjs` (plain `.mjs` so `node --test` can import it). Script content is any of:

- a `<script>` element (any type);
- an inline event handler attribute (`on[a-z]+=`);
- a `javascript:` URL in `href`, `src`, `action`, `formaction` or `xlink:href`;
- `<iframe srcdoc>`, `<object>`, `<embed>`, `<base>`, or a `<meta http-equiv="refresh">`.

Export `scriptSignature(html)`: a sorted list of normalized script fragments, compared as a multiset.

**Rule:** a save by a non-full admin is rejected if, for any section, page code or embed, the script signature of the new HTML differs from the signature of the currently saved version of the same section (matched by section id; a new section has an empty signature). In other words, pages-only admins can edit text around existing scripts, move and delete sections that contain them (deleting is allowed), and add iframes. They cannot add, change or copy scripts. Duplicating a section that contains a script counts as adding one, so reject it.

- **App layer.** Enforce this in `savePage` with `assertAdmin` / `hasAdminCapability(user)` (no capability argument means full admin). Return a clear error, for example: "Only full admins can add or change scripts. Remove the script from "<section label>" or ask a full admin."
- **Database layer (defence in depth).** Add a `BEFORE INSERT OR UPDATE` trigger on `page_sections`, and on `pages` for the new code column. If the caller is not a full admin, the trigger raises an exception when the script fragments change. Do the comparison in SQL with `regexp_matches(..., 'g')` over the same patterns. Approximate is fine: the app layer is the main guard.
  - Add a helper `private.is_full_admin()` that is true for `profiles.role = 'admin' AND admin_capabilities IS NULL`.
  - The trigger must allow the service role (imports and maintenance): `auth.uid() IS NULL`.
- **Editor UI.** For non-full admins, sections that contain scripts show a lock note ("Contains a script — only full admins can change it"). The HTML tab is still available, but saving a script change shows the error above.

### 2. Rich text inside designed sections (toolbar per text block)

Change `ContentFields` so that **text blocks** become small inline rich text fields instead of plain text-node inputs.

- **What counts as a text block.** The innermost elements whose children are only text and inline formatting: `p, h1–h6, li, td, th, dt, dd, blockquote, figcaption, label, span, a` with only `strong, b, em, i, u, a, br, span, sup, sub` inside.
  - Text nodes that are not in such a block keep today's plain input.
  - Buttons and links: the link's text keeps the existing link field. Don't put a toolbar inside `<a>`, because a nested link would be invalid.
- **The field.** A mini TipTap editor in a new component `inline-rich-text.tsx`:
  - Inline marks only: bold, italic, underline, link (with an "open in new tab" option), line break, and clear formatting. No block nodes.
  - Use the `Document`/`Paragraph`/`Text` extensions, serialize the inner HTML, and strip the single wrapping `<p>`.
  - On change, set the block element's `innerHTML` and keep its own tag and attributes (classes, ids, `style`) untouched.
- **Markup TipTap doesn't model.** Inline `<span class="...">` (theme colour spans, for example) must survive editing. Add a `Span` mark that keeps `class`/`style`.
  - If a block contains markup outside the supported set, fall back to the plain input for that block, so nothing is silently dropped.
- **RTL.** Arabic pages pass `dir="rtl"`. The toolbar mirrors and the text field gets `dir`.
- **Parity.** Unchanged content must serialize back byte-for-byte equivalent. A test round-trips every imported section through the parse/serialize path and asserts `sameMarkup` (in `src/lib/site/chrome.mjs`). Run it against `src/data/pages/*.json`, which holds the same HTML as the database import.

### 3. Convert a section to rich text

- Add a "Convert to rich text" action to each `html` section's menu in `page-editor.tsx`.
- **Confirmation.** It shows: "The section's text, headings, lists, links and images are kept; its design (columns, backgrounds, buttons styling) is replaced by plain formatted text. You can undo this until you save."
- **Conversion.** Run the section HTML through the `RichTextEditor` schema (TipTap's `generateJSON` and `generateHTML` with the same extensions) and set `kind: 'rich_text'`.
  - Every `<iframe>`/`<script>` inside becomes an **embed node** (see 5), so nothing is lost.
  - If the editor is not a full admin and the section contains scripts, block the conversion with the script-guard message.
- **Undo.** Keep the original HTML in component state so "Undo convert" restores it before saving.
- **Rendering.** No public-site rendering change: `rich_text` sections are already wrapped by `richTextSection()`.

### 4. Embed section (new section kind)

- **Migration.** `alter type public.section_kind add value 'embed';`. Update the kind check in `savePage`, the `admin_save_page` cast (already generic), and `database.types.ts`.
- **Stored shape.** `page_sections.html` holds the final embed HTML. Store the editor's settings as JSON in a new nullable column `page_sections.options jsonb` (add it in the same migration and pass it through `admin_save_page`).
  - Example for an iframe: `{"mode":"iframe","src":"https://…","title":"…","height":450,"width":"100%","allowFullscreen":true,"aspect":"16:9"|null}`
  - Example for code: `{"mode":"code"}`
- **Iframe mode** (pages admins and full admins). The editor has fields for:
  - the https URL (required, validated with `isPublicHttps` from `src/lib/footer/news.mjs`; move that helper to `src/lib/security/` or re-export it);
  - an accessible title (required);
  - a height in px, or an aspect ratio (16:9, 4:3, 1:1);
  - allow fullscreen.

  The server builds the HTML; never trust client HTML for this mode:

  ```html
  <div class="fxem-embed fxem-embed--iframe" style="--fxem-embed-aspect:16/9">
    <iframe src="…" title="…" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen></iframe>
  </div>
  ```

  Don't set `sandbox` by default: many widgets break under it. Add an optional "Sandbox" checkbox, which sets `sandbox="allow-scripts allow-same-origin allow-popups allow-forms"`.
  - Pasting a full `<iframe …>` snippet into the URL field should extract its `src` (and `height`/`title` where present).
- **Code mode** (full admins only; pages-only admins see the option disabled with a note).
  - A monospace textarea for raw HTML/JS, stored as is, plus a "Wrap in a container" toggle (default on) that wraps it in `<div class="fxem-embed fxem-embed--code">`.
  - The editor never renders it. It shows a placeholder card with the first line of code.
- **Public rendering.** In `sectionHtml()` (`render.ts`), embed sections render their `html` as is. Add to `siteStyles` in `document.mjs`:

  ```css
  .fxem-embed{max-width:1240px;margin:0 auto;padding:20px}
  .fxem-embed--iframe iframe{display:block;width:100%;border:0}
  .fxem-embed--iframe[style*=aspect] iframe{aspect-ratio:var(--fxem-embed-aspect);height:auto}
  ```

  Parity ignores this style block because it matches `fxem-…`; check `compare-parity.mjs` and extend its ignore regex if needed.
- **Validation.** Reject a code embed from a non-full admin, via the script guard. Cap embed HTML at 100 KB.

### 5. Embeds inside rich text

- Add a TipTap **atom node** `Embed` (block, not editable inline) to `RichTextEditor`, with attributes `mode`, `code` and the iframe settings above.
- **Storage.** In the saved section HTML it serializes as `<div class="fxem-embed …" data-fxem-embed="iframe|code">…final embed HTML…</div>` so the stored HTML is directly renderable.
  - `parseHTML` matches `div[data-fxem-embed]` and reads the inner HTML into `code`. Scripts are not executed during parsing, because the editor parses with `DOMParser`/TipTap.
  - Verify that TipTap does not drop `<script>` inside an atom node's stored attribute. If it does, store the code base64-encoded in `data-code` and expand it server-side in `sectionHtml()` instead. Pick whichever round-trips losslessly and document the choice in code.
- **Editor view.** A NodeView shows:
  - for an iframe: a non-interactive preview, either the iframe itself or a placeholder card with the host name (keep it a placeholder if unsure);
  - for code: a placeholder card with the first line of code.
  - Both have Edit and Remove buttons.
- **Toolbar.** An "Embed" toolbar button opens the same dialog as the embed section (shared component `embed-form.tsx`). Code mode is only available to full admins.
- The script guard covers rich text sections too.

### 6. Per-page head / end-of-body code

- **Migration.** Add a column `pages.custom_code jsonb not null default '{}'`, shaped `{"head": "", "bodyEnd": ""}`. Pass it through `admin_save_page` (`fields -> 'custom_code'`).
  - It is **full admins only**, enforced in `savePage` and by the `pages` trigger: if it changes, the caller must be a full admin.
  - Include it in content history (already automatic for `pages`).
- **Editor.** In `page-editor.tsx`, add a "Custom code" panel in the sidebar under SEO, shown only to full admins: two monospace textareas, "In `<head>`" and "Before `</body>`", with the helper "Runs on this page only, in this language."
  - Pages-only admins don't see the panel. Their saves must keep the existing value: send it unchanged, or omit it, and have the RPC keep the old value with `coalesce`.
- **Rendering.** In `render.ts`, insert `custom_code.head` just before `</head>` (after `siteStyles` and the SEO tags) and `custom_code.bodyEnd` just before `</body>` (after `layout.scripts` and form scripts). `pageContent()` in `content.ts` must select the column.
  - Standalone pages (`kind = 'standalone'`, for example `deposit_request`) get it too.
  - 404 and search pages: no.

### 7. Admin preview and caching

- Preview (`renderPreview`) includes embeds and custom code, like the public render.
- Saves already call `revalidateContent({ page })`. Nothing new is needed, because embeds are part of the page.

## Out of scope

- Site-wide code (analytics/GTM/chat on every page).
- A domain allow-list for iframes.
- A CSP.
- A separate admin domain.
- Footer or menu embeds. The footer editor already exposes HTML for widgets; if it lets pages-only/menus-only admins add scripts, apply the same script guard to `saveFooter` and `saveMenu` widget HTML. That is a small, related fix and should be included.

## Tasks (suggested order, one PR: `pr/08-rich-text-embeds`)

1. Migration `supabase/migrations/2026110x000100_embeds.sql`:
   - add `'embed'` to `section_kind`;
   - add `page_sections.options jsonb`;
   - add `pages.custom_code jsonb`;
   - add `private.is_full_admin()` and the script-guard triggers on `page_sections` and `pages`;
   - update `admin_save_page` to accept `options` per section and `custom_code` in fields.

   Apply it with the Supabase connector, then update `src/lib/supabase/database.types.ts`.
2. `src/lib/admin/embeds.mjs`: `scriptSignature`, `buildIframeEmbed`, `parseIframeSnippet`, `wrapCode`. Tests in `tests/embeds.test.mjs` cover the signature (adding, changing, moving and deleting scripts; handlers; `javascript:` URLs), the iframe builder (https only, escaping, title required) and snippet parsing.
3. Script guard in `savePage` and the footer/menu widget actions.
4. Embed section: editor (`embed-form.tsx`, a `SectionEditor` branch), the "Add section → Embed" option in `page-editor.tsx`, rendering and styles.
5. Rich text Embed node, toolbar button and NodeView.
6. Inline rich text in `ContentFields` (`inline-rich-text.tsx`) plus a round-trip test over all imported sections.
7. Convert to rich text, with undo.
8. Custom code panel and rendering.
9. Update the README (the editor guide, the security note about scripts and the same-origin admin, no CSP) and `CLAUDE.md` (new section kind, `custom_code`, script guard).

## Acceptance checks

- `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint` and `pnpm build` all pass.
- `node scripts/compare-parity.mjs <astro output> http://localhost:<port>` is still **73/73** before any content is edited, so no visual change on the live pages. To get the Astro reference, build commit `752a21b` in a worktree, as `CLAUDE.md` describes.
- Round trip: opening and saving every imported page without edits leaves `page_sections.html` unchanged (`scripts/verify-import.mjs` still reports 72/72).
- As a full admin you can:
  - add an iframe section (a YouTube URL) and a code section (a TradingView widget snippet), both rendering on the public page in EN and AR;
  - add an embed inside a rich text section;
  - add head/body-end code and see it in the page source in the right place;
  - edit bold/link text inside a designed section without the layout changing;
  - convert a section to rich text and undo.
- As a `pages`-only admin you can add an iframe and edit text around existing scripts. Adding, changing or duplicating a script is rejected with the clear message, by the app and by the database trigger. Simulate the database case in SQL with `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid of a pages-only profile>"}'` inside a transaction that is rolled back; don't create real test accounts.
- The admin editor never executes snippet code (check that no `<script>` from content runs in `/admin/pages/[id]/`).

## Ground rules from the repo (must follow)

- **Never** promote to production, attach `sv.fxem.com` or change DNS without Mike's explicit go-ahead.
- Never commit `.env`/`.env.local`; the repo is public. Never print secrets.
- **Never** run `scripts/import-content.mjs --apply`: it wipes CMS content.
- Keep the `.mjs` modules in their compact style; match the surrounding code; internal links and API calls end with `/`.
- Next.js 16: read `node_modules/next/dist/docs/` before using unfamiliar APIs. Admin pages set `export const instant = false`.
