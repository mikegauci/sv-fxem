import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { seoDocument } from "@/lib/seo/document.mjs";
import {
  renderSnapshot,
  attributes,
  siteStyles,
  footer,
} from "@/lib/site/document.mjs";
import { routes, snapshot } from "@/lib/site/snapshots.mjs";
import { searchIndex, searchShells } from "@/lib/search/pages.mjs";
import { searchPages, searchPath } from "@/lib/search/query.mjs";

export type Rendered = { status: number; html: string };

const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export function pagePaths() {
  return routes().map((page) => page.slug);
}

// One public page, cached until its content changes.
export async function renderPage(slug: string): Promise<Rendered> {
  "use cache";
  cacheLife("max");
  cacheTag("pages", `page:${slug}`);
  const page = snapshot(slug);
  if (!page) return renderNotFound();
  const inventory = routes();
  const route = inventory.find((p) => p.slug === slug)!;
  const html = await seoDocument(renderSnapshot(page), route, inventory);
  return { status: 200, html };
}

export async function renderNotFound(): Promise<Rendered> {
  "use cache";
  cacheLife("max");
  cacheTag("pages");
  const home = snapshot("")!;
  const styles = home.head
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<link[^>]*(?:hreflang|rel="canonical")[^>]*>/g, "")
    .replace(/<meta[^>]*name="robots"[^>]*>/g, "");
  const html = `<!DOCTYPE html><html lang="en"><head>${styles}${siteStyles}<title>Page Not Found | FXEM</title><meta name="robots" content="noindex, nofollow"><style>.fxem-not-found{text-align:center;padding:80px 24px;min-height:50vh}.fxem-not-found .code{color:#55b8c4;font-size:64px;font-weight:700;margin-bottom:12px}.fxem-not-found h1 span{display:block;margin-top:16px}.fxem-not-found nav{display:flex;gap:20px;justify-content:center;flex-wrap:wrap;margin-top:30px}.fxem-not-found nav a{background:#55b8c4;color:white;border-radius:24px;padding:10px 24px}</style></head><body${attributes(home.bodyAttributes)}><a class="skip-link screen-reader-text" href="#content">Skip to content</a><div class="hfeed site" id="page">${home.header}<main id="content" class="fxem-not-found"><p class="code">404</p><h1>Page not found <span lang="ar" dir="rtl">الصفحة غير موجودة</span></h1><p>The page may have moved or the address may be incorrect.</p><p lang="ar" dir="rtl">ربما تم نقل الصفحة أو أن العنوان غير صحيح.</p><nav aria-label="Return to homepage"><a href="/">English homepage</a><a href="/ar/" lang="ar">الرئيسية بالعربية</a></nav></main>${footer(home.footer)}</div>${home.scripts}</body></html>`;
  return { status: 404, html };
}

export function renderSearch(
  language: "en" | "ar",
  query: string | null,
  requestedPage: string | null,
): string {
  const shell = searchShells()[language];
  const result = searchPages(
    searchIndex(),
    query,
    language,
    Number(requestedPage) || 1,
  );
  const ar = language === "ar";
  const path = ar ? "/ar/search/" : "/search/";
  const header = shell.header
    .replaceAll("__SEARCH_EN__", searchPath("en", result.query))
    .replaceAll("__SEARCH_AR__", searchPath("ar", result.query));
  const pageUrl = (page: number) =>
    `${path}?s=${encodeURIComponent(result.query)}&paged=${page}`;
  const results = result.results
    .map(
      (page: { url: string; title: string }) =>
        `<article class="page type-page status-publish hentry ast-col-sm-12 ast-article-post"><div class="ast-post-format- ast-no-thumb blog-layout-1"><div class="post-content ast-col-md-12"><header class="entry-header"><h2 class="entry-title"><a href="${escape(page.url)}" rel="bookmark">${escape(page.title)}</a></h2></header></div></div></article>`,
    )
    .join("");
  const empty = result.total
    ? ""
    : `<section class="no-results not-found ast-col-sm-12"><div class="page-content"><p>${ar ? "لم يتم العثور على نتائج. جرّب كلمات بحث أخرى." : "No results found. Try another search."}</p><form role="search" method="get" class="search-form" action="${path}"><label><span class="screen-reader-text">${ar ? "بحث" : "Search"}</span><input type="search" class="search-field" placeholder="${ar ? "بحث …" : "Search …"}" name="s" value="${escape(result.query)}"></label><button type="submit" class="search-submit">${ar ? "بحث" : "Search"}</button></form></div></section>`;
  const pagination =
    result.pageCount > 1
      ? `<nav class="navigation pagination" aria-label="${ar ? "صفحات النتائج" : "Results pages"}"><div class="nav-links">${Array.from(
          { length: result.pageCount },
          (_, i) => i + 1,
        )
          .map((page) =>
            page === result.page
              ? `<span class="page-numbers current" aria-current="page">${page}</span>`
              : `<a class="page-numbers" href="${escape(pageUrl(page))}">${page}</a>`,
          )
          .join("")}</div></nav>`
      : "";
  return `<!DOCTYPE html><html${attributes(shell.htmlAttributes)}><head>${shell.head}${siteStyles}<title>${ar ? "نتائج البحث | FXEM" : "Search Results | FXEM"}</title><meta name="robots" content="noindex, nofollow"><meta name="description" content="${ar ? "ابحث في صفحات ومقالات موقع FXEM." : "Search the pages and articles on the FXEM website."}"><link rel="canonical" href="https://sv.fxem.com${path}"></head><body${attributes(shell.bodyAttributes)}><a class="skip-link screen-reader-text" href="#content">${ar ? "تخطي إلى المحتوى" : "Skip to content"}</a><div class="hfeed site" id="page">${header}<div id="content" class="site-content"><div class="ast-container"><div id="primary" class="content-area primary"><section class="ast-archive-description"><h1 class="page-title ast-archive-title">${ar ? "نتائج البحث عن: " : "Search Results for: "}<span>${escape(result.query)}</span></h1></section><main id="main" class="site-main"><div class="ast-row">${results}${empty}</div>${pagination}</main></div></div></div>${footer(shell.footer)}</div>${shell.scripts}</body></html>`;
}

export function htmlResponse(
  { status, html }: Rendered,
  headers: Record<string, string> = {},
) {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
  });
}
