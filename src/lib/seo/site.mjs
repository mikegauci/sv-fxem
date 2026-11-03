import { metadata } from './metadata.mjs';
export const origin = 'https://sv.fxem.com';
export const brandLogo = '/assets/e486f0721487-fxem-final-logo-1024x351.png';
export const isProduction = env => env.VERCEL_ENV === 'production';
export const languageOf = slug => slug === 'ar' || slug.startsWith('ar/') ? 'ar' : 'en';
export const baseOf = slug => (slug === 'ar' ? '' : slug.replace(/^ar\//, '')).replace('category/posts-ar', 'category/posts').replace('category/غير-مصنف', 'category/uncategorized');
export const pathOf = slug => slug ? `/${slug}/` : '/';
export const urlOf = slug => new URL(pathOf(slug), origin).href;
// Vercel preserves incoming queries on redirects. Never redirect a homepage
// short link back to the same path with its matching query still attached.
export const shortLinkPattern = page => page.slug === '' ? null : page.slug === 'ar' ? '^/(?:index\\.php)?$' : '^/(?:ar/)?(?:index\\.php)?$';
export const indexable = page => page.slug !== '404' && page.kind !== 'standalone' && page.kind !== 'archive' && !page.seo?.noindex && !/account-created-successfully$/.test(page.slug);
// CMS pages carry their own SEO fields; the original inventory uses metadata.mjs.
export function details(page) {
  if (page.seo?.title) return { title: page.seo.title, description: page.seo.description ?? '' };
  const row = metadata[baseOf(page.slug)];
  // New CMS pages without SEO fields fall back to their title.
  if (!row && page.title) return { title: `${page.title} | FXEM`, description: page.seo?.description ?? '' };
  if (!row) throw Error(`Missing SEO metadata: ${page.slug}`);
  const offset = languageOf(page.slug) === 'ar' ? 2 : 0;
  return { title: row[offset], description: row[offset + 1] };
}
// Language versions of a page: CMS pages are linked by translation_id.
export function alternates(page, pages) {
  const same = page.translation_id ? p => p.translation_id === page.translation_id : p => baseOf(p.slug) === baseOf(page.slug);
  return pages.filter(same).map(p => ({ language: languageOf(p.slug), url: urlOf(p.slug) }));
}
export const xml = value => String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
export function sitemap(pages) {
  const included = pages.filter(indexable);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + included.map(page => {
    const links = alternates(page, included), en = links.find(p => p.language === 'en');
    return `<url><loc>${xml(urlOf(page.slug))}</loc>${links.map(p => `<xhtml:link rel="alternate" hreflang="${p.language}" href="${xml(p.url)}"/>`).join('')}${en ? `<xhtml:link rel="alternate" hreflang="x-default" href="${xml(en.url)}"/>` : ''}</url>`;
  }).join('\n') + '\n</urlset>\n';
}
export function robots(env) {
  return isProduction(env) ? `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n';
}
export function robotsDirective(page, env) { return isProduction(env) && indexable(page) ? 'index, follow, max-image-preview:large' : 'noindex, nofollow'; }
export function graph(page, pages, $) {
  const { title, description } = details(page), url = urlOf(page.slug), lang = languageOf(page.slug);
  // Use only real, visible business identity; no invented ratings, licences or dates.
  const organization = { '@type': 'Organization', '@id': `${origin}/#organization`, name: 'FXEM', url: origin + '/', logo: new URL(brandLogo, origin).href, email: 'support@fxem.com' };
  const website = { '@type': 'WebSite', '@id': `${origin}/#website`, url: origin + '/', name: 'FXEM', inLanguage: ['en', 'ar'], publisher: { '@id': organization['@id'] } };
  const webpage = { '@type': baseOf(page.slug) === 'contact-us' ? 'ContactPage' : baseOf(page.slug) === 'about-us' ? 'AboutPage' : 'WebPage', '@id': url + '#webpage', url, name: title, description, inLanguage: lang, isPartOf: { '@id': website['@id'] }, about: { '@id': organization['@id'] } };
  const nodes = [organization, website, webpage];
  if (baseOf(page.slug)) {
    const home = pages.find(p => p.slug === (lang === 'ar' ? 'ar' : ''));
    const trail = [{ '@type': 'ListItem', position: 1, name: lang === 'ar' ? 'الرئيسية' : 'Home', item: urlOf(home.slug) }, { '@type': 'ListItem', position: 2, name: title.replace(/\s*[|–]\s*FXEM.*$/, ''), item: url }];
    const breadcrumb = { '@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: trail }; nodes.push(breadcrumb); webpage.breadcrumb = { '@id': breadcrumb['@id'] };
  }
  if (page.kind === 'post') {
    const headline = $('h1.entry-title').first().text().trim();
    const author = $('.entry-meta .author a').first();
    const image = $('article .post-thumb-img-content img, article .ast-blog-featured-section img').first().attr('src');
    const text = $('article .entry-content').first().text();
    nodes.push({ '@type': 'Article', '@id': url + '#article', headline, description, mainEntityOfPage: { '@id': webpage['@id'] }, publisher: { '@id': organization['@id'] }, inLanguage: /[\u0600-\u06ff]/.test(text) ? 'ar' : 'en', ...(author.text().trim() ? { author: { '@type': 'Person', name: author.text().trim(), url: urlOf(lang === 'ar' ? 'ar/author/admin' : 'author/admin') } } : {}), ...(image?.startsWith('/assets/') ? { image: [new URL(image, origin).href] } : {}) });
  }
  return { '@context': 'https://schema.org', '@graph': nodes };
}
