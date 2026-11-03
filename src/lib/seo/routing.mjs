// Request-time routing rules from the original Vercel build: WordPress short
// links, ?lang= links, search on the homepage, and the indexing policy headers.
import { languageOf, pathOf, alternates, indexable, isProduction, shortLinkPattern } from './site.mjs';

// pages: route inventory; ids: slug -> WordPress page/post ID.
export function createRouting(pages, ids, env = process.env) {
  const bySlug = new Map(pages.map(p => [pathOf(p.slug), p]));
  const shortLinks = [];
  for (const page of pages) {
    const pattern = shortLinkPattern(page), id = ids[page.slug];
    if (pattern && id) shortLinks.push({ pattern: new RegExp(pattern), id: String(id), to: pathOf(page.slug) });
  }
  const noindexPaths = new Set(pages.filter(p => !indexable(p)).map(p => pathOf(p.slug)));

  function redirect(pathname, search) {
    const params = new URLSearchParams(search);
    if (params.has('s')) {
      if (pathname === '/') return '/search/';
      if (pathname === '/ar' || pathname === '/ar/') return '/ar/search/';
    }
    const page = bySlug.get(pathname.endsWith('/') ? pathname : pathname + '/');
    const lang = params.get('lang');
    if (page && lang) {
      const other = alternates(page, pages).find(p => p.language !== languageOf(page.slug));
      if (other && other.language === lang) return new URL(other.url).pathname;
    }
    for (const key of ['p', 'page_id']) {
      const value = params.get(key);
      if (!value) continue;
      const rule = shortLinks.find(r => r.id === value && r.pattern.test(pathname));
      if (rule) return rule.to;
    }
    if (pathname === '/index.php') return '/';
    return null;
  }

  function robotsHeader(pathname, host) {
    if (!isProduction(env)) return 'noindex, nofollow';
    if (/\.vercel\.app$/i.test(host || '')) return 'noindex, nofollow';
    if (/^\/(api|admin|auth)(\/|$)/.test(pathname) || /^\/(?:ar\/)?search\/?$/.test(pathname)) return 'noindex, nofollow';
    if (noindexPaths.has(pathname.endsWith('/') ? pathname : pathname + '/')) return 'noindex, nofollow';
    return null;
  }

  return { redirect, robotsHeader };
}
