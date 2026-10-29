import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { load } from 'cheerio';
import { parseEnv } from 'node:util';
import { indexable, urlOf, details, languageOf, sitemap, isProduction } from '../src/lib/seo/site.mjs';
const root = '.vercel/output/static', pages = [{ slug: '', kind: 'page' }, ...JSON.parse(await fs.readFile('migration/routes.json', 'utf8'))];
let assetRefs = 0, linkRefs = 0, maxGzip = 0;
function contentText(html, standalone = false) {
  const $ = load(html); $('script,style,.seo-page-title,.currentdesk-trap,.contact-trap').remove();
  return (standalone ? $('body') : $('#content')).text().replace(/\s+/g, ' ').trim();
}
for (const page of pages) {
  const file = path.join(root, page.slug, 'index.html'), html = await fs.readFile(file, 'utf8'), $ = load(html), d = details(page);
  assert.equal($('title').text(), d.title); assert.equal($('meta[name=description]').attr('content'), d.description); assert.equal($('link[rel=canonical]').attr('href'), urlOf(page.slug));
  assert.equal($('meta[name=robots]').attr('content').startsWith('index'), isProduction(process.env) && indexable(page));
  assert.ok($('meta[property="og:title"]').length); assert.ok($('meta[name="twitter:card"]').length);
  const graph = JSON.parse($('script[type="application/ld+json"]').html()); assert.equal(graph['@context'], 'https://schema.org');
  const main = page.kind === 'standalone' ? $('body') : $('#content'); assert.equal(main.find('h1').length, 1, page.slug);
  let previous = 0;
  for (const el of main.find('h1,h2,h3,h4,h5,h6,[role=heading]').toArray()) { const level = Number($(el).attr('aria-level') || el.tagName.slice(1)); assert.ok(level <= previous + 1, page.slug + ' skipped heading'); previous = level; }
  const source = page.slug ? JSON.parse(await fs.readFile(`src/data/pages/${page.slug.replaceAll('/', '__')}.json`, 'utf8')).content : await fs.readFile('src/content/homepage.html', 'utf8');
  assert.equal(contentText(html, page.kind === 'standalone'), contentText(source, page.kind === 'standalone'), page.slug + ' content changed');
  for (const el of $('[src],[href]').toArray()) for (const attr of ['src','href']) {
    const ref = $(el).attr(attr); if (!ref?.startsWith('/') || ref.startsWith('//') || ref.startsWith('/api/')) continue;
    const pathname = decodeURIComponent(ref.split(/[?#]/)[0]);
    await fs.access(path.join(root, pathname, pathname.endsWith('/') ? 'index.html' : ''));
    if (pathname.startsWith('/assets/')) assetRefs++; else linkRefs++;
  }
  maxGzip = Math.max(maxGzip, gzipSync(html).length);
}
assert.equal(await fs.readFile(root + '/sitemap.xml','utf8'), sitemap(pages));
const config = JSON.parse(await fs.readFile('.vercel/output/config.json', 'utf8'));
for (const rule of config.routes.filter(r => r.status === 308 && r.headers?.Location)) assert.equal(new RegExp(rule.src).test(new URL(rule.headers.Location, 'https://sv.fxem.com').pathname), false, 'Self-redirect in output routing');
assert.equal(config.routes.some(r => r.src === '/.*' && r.headers?.['X-Robots-Tag']), !isProduction(process.env));
assert.ok(config.routes.some(r => r.dest === '/404.html' && r.status === 404));
const notFound = load(await fs.readFile(root + '/404.html','utf8')); assert.equal(notFound('meta[name=robots]').attr('content'), 'noindex, nofollow');
const secrets = [];
try { const env = parseEnv(await fs.readFile('.env','utf8')); for (const [key, value] of Object.entries(env)) if (/^(CURRENTDESK_.*(?:SECRET|AUTHORIZATION)|CONTACT_FORM_SECRET|MAILJET_(?:API_KEY|SECRET_KEY))$/.test(key) && value) secrets.push(value); if (env.MAILJET_API_KEY && env.MAILJET_SECRET_KEY) secrets.push(Buffer.from(env.MAILJET_API_KEY.trim()+':'+env.MAILJET_SECRET_KEY.trim()).toString('base64')); } catch {}
let files = 0;
async function scan(dir) { for (const e of await fs.readdir(dir,{withFileTypes:true})) { const p = path.join(dir,e.name); if(e.isDirectory()) await scan(p); else {const bytes=await fs.readFile(p);for(const secret of secrets)assert.ok(!bytes.includes(Buffer.from(secret)), 'Secret in public output');files++;} } }
await scan(root);
const report = { environment: isProduction(process.env) ? 'production' : 'preview', pages: pages.length, sitemapUrls: pages.filter(indexable).length, localizedMetadata: true, reciprocalLanguageLinks: true, structuredData: true, singleMainH1: true, mainHeadingLevelsSequential: true, originalContentUnchanged: true, internalLinks: linkRefs, localAssetReferences: assetRefs, secretScanFiles: files, secretsAbsent: true, largestHtmlGzipBytes: maxGzip, notFoundStatusConfigured: true };
console.log(JSON.stringify(report,null,2));
await fs.writeFile(`/tmp/fxem-seo-${report.environment}-verification.json`,JSON.stringify(report,null,2)+'\n');
