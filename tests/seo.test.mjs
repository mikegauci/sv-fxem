import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { load } from 'cheerio';
import { metadata } from '../src/lib/seo/metadata.mjs';
import { origin, shortLinkPattern, isProduction, languageOf, baseOf, urlOf, indexable, details, alternates, sitemap, robots, robotsDirective, graph } from '../src/lib/seo/site.mjs';
const pages = [{ slug: '', kind: 'page' }, ...JSON.parse(await fs.readFile('migration/routes.json', 'utf8'))];
test('WordPress short-link redirects cannot loop when Vercel preserves the query', () => {
  for (const page of pages) {
    const pattern = shortLinkPattern(page);
    if (pattern) assert.equal(new RegExp(pattern).test(new URL(urlOf(page.slug)).pathname), false, page.slug);
  }
});
test('every route has unique localized metadata without placeholders', () => {
  const titles = new Set(), descriptions = new Set();
  for (const page of pages) {
    const d = details(page); assert.ok(d.title.length >= 15 && d.title.length < 90, page.slug); assert.ok(d.description.length >= 50 && d.description.length <= 210, page.slug);
    assert.ok(!titles.has(d.title), page.slug); titles.add(d.title); assert.ok(!descriptions.has(d.description), page.slug); descriptions.add(d.description);
    if (languageOf(page.slug) === 'ar') assert.match(d.title, /[\u0600-\u06ff]/);
  }
});
test('canonical URLs and language pairs are reciprocal and resolve to migrated routes', () => {
  for (const page of pages) for (const alt of alternates(page, pages)) {
    assert.equal(new URL(alt.url).origin, origin); const target = pages.find(p => urlOf(p.slug) === alt.url); assert.ok(target); assert.ok(alternates(target, pages).some(a => a.url === urlOf(page.slug)));
  }
  assert.equal(baseOf('ar/category/غير-مصنف'), 'category/uncategorized'); assert.equal(baseOf('ar/category/posts-ar'), 'category/posts');
});
test('sitemap contains only canonical indexable pages with language annotations', () => {
  const $ = load(sitemap(pages), { xmlMode: true });
  assert.equal($('url').length, pages.filter(indexable).length); assert.equal($('url').length, 62);
  for (const el of $('url').toArray()) { const url = $(el).find('loc').text(); const page = pages.find(p => urlOf(p.slug) === url); assert.ok(indexable(page)); assert.ok($(el).find('xhtml\\:link').length); }
  assert.ok(!sitemap(pages).includes('/api/')); assert.ok(!sitemap(pages).includes('account-created-successfully')); assert.ok(!sitemap(pages).includes('/author/'));
});
test('indexing opens only for explicitly production builds and only for content pages', () => {
  const home = pages[0], utility = pages.find(p => p.kind === 'standalone');
  for (const env of [{}, { NODE_ENV: 'production' }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }]) { assert.equal(isProduction(env), false); assert.match(robots(env), /Disallow: \//); assert.equal(robotsDirective(home, env), 'noindex, nofollow'); }
  assert.match(robots({ VERCEL_ENV: 'production' }), /Allow: \/\n/); assert.match(robots({ VERCEL_ENV: 'production' }), /Sitemap: https:\/\/sv.fxem.com\/sitemap.xml/);
  assert.match(robotsDirective(home, { VERCEL_ENV: 'production' }), /^index, follow/); assert.equal(robotsDirective(utility, { VERCEL_ENV: 'production' }), 'noindex, nofollow');
});
test('structured data uses real identity and page content without invented article dates or ratings', async () => {
  for (const page of pages) {
    const data = page.slug ? JSON.parse(await fs.readFile(`src/data/pages/${page.slug.replaceAll('/', '__')}.json`, 'utf8')) : { header: await fs.readFile('src/content/header.html', 'utf8'), content: await fs.readFile('src/content/homepage.html', 'utf8') };
    const $ = load(data.header + data.content); const schema = graph(page, pages, $); const nodes = schema['@graph'];
    const organization = nodes.find(n => n['@type'] === 'Organization');
    assert.equal(organization.name, 'FXEM'); assert.ok(nodes.some(n => n['@type'] === 'WebSite'));
    if (page.kind !== 'standalone') assert.match(organization.logo, /fxem.*logo/i);
    if (baseOf(page.slug)) assert.equal(nodes.find(n => n['@type'] === 'BreadcrumbList').itemListElement.length, 2);
    if (page.kind === 'post') { const article = nodes.find(n => n['@type'] === 'Article'); assert.equal(article.headline, $('h1.entry-title').text().trim()); assert.equal(article.datePublished, undefined); assert.equal(article.aggregateRating, undefined); }
  }
});
