import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { load } from 'cheerio';

const origin = 'https://sv.fxem.com/';
const routes = JSON.parse(await fs.readFile('migration/routes.json', 'utf8'));
const included = new Set(['/', ...routes.map(page => `/${page.slug}/`)]);
const assets = new Map(Object.entries(JSON.parse(await fs.readFile('migration/assets.json', 'utf8'))));
const pending = new Map();
const failures = [];
const sourceIssues = [];
const inspectedImages = new Map();
async function recordSourceImageIssue(url, output, page) {
  if (!/\.(png|jpe?g|gif|webp|ico)$/i.test(new URL(url).pathname)) return;
  if (!inspectedImages.has(url)) {
    const bytes = await fs.readFile(`public${output}`);
    inspectedImages.set(url, /<!doctype html|<html/i.test(bytes.subarray(0, 600).toString()));
  }
  if (inspectedImages.get(url)) sourceIssues.push({ type: 'source-image-returns-html', url, page });
}
const scriptIds = new Set([
  'jquery-core-js', 'jquery-migrate-js', 'astra-theme-js-js-extra', 'astra-theme-js-js',
  'hoverIntent-js', 'megamenu-js-extra', 'megamenu-js', 'carousel-block-slick-js',
  'carousel-block-view-js', 'comment-reply-js',
]);
const normalize = (value, base) => {
  const url = new URL(value.replaceAll('&amp;', '&'), base);
  if (url.hostname === 'sv.fxem.com') url.protocol = 'https:';
  return url.href;
};
async function localize(value, base) {
  if (!value || /^(data:|#|mailto:|tel:|javascript:)/i.test(value)) return value;
  if (/[\\"]/.test(value)) {
    // Two old articles contain escaped HTML in their original image URLs.
    // Keep their current appearance instead of inventing replacement imagery.
    sourceIssues.push({ type: 'malformed-source-media-url', value, page: base });
    return value;
  }
  const url = normalize(value, base);
  const cached = assets.get(url);
  if (cached) {
    try {
      await fs.access(`public${cached}`);
      await recordSourceImageIssue(url, cached, base);
      return cached;
    } catch {}
  }
  if (pending.has(url)) return pending.get(url);
  const job = (async () => {
    const parsed = new URL(url);
    const basename = path.basename(parsed.pathname).replace(/[^a-zA-Z0-9._-]/g, '-');
    const name = `${crypto.createHash('sha256').update(url).digest('hex').slice(0, 12)}-${basename}`;
    const output = `/assets/${name}`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      let bytes = Buffer.from(await response.arrayBuffer());
      if (/\.css$/i.test(parsed.pathname)) bytes = Buffer.from(await css(bytes.toString(), url));
      await fs.writeFile(`public${output}`, bytes);
      await recordSourceImageIssue(url, output, base);
      assets.set(url, output);
      return output;
    } catch (error) {
      failures.push({ url, error: error.message });
      return url;
    }
  })();
  pending.set(url, job);
  return job;
}
async function css(text, base) {
  for (const match of [...text.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)]) {
    const replacement = await localize(match[2], base);
    text = text.replace(match[0], `url("${replacement}")`);
  }
  return text;
}
function routeLink(href, base) {
  if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) return href;
  // This relative Contact Us link in the source FAQ points at a nonexistent
  // child URL. Keep the deferred contact destination on the original site.
  if (href === 'contact-us') return `${origin}${new URL(base).pathname.startsWith('/ar/') ? 'ar/' : ''}contact-us/`;
  const url = new URL(normalize(href, base));
  if (url.hostname !== 'sv.fxem.com') return url.href;
  const decoded = decodeURIComponent(url.pathname);
  const pathname = decoded === '/' ? '/' : `${decoded.replace(/\/$/, '')}/`;
  if (pathname === '/deposit_request/' && url.searchParams.get('lang') === 'ar' && included.has('/ar/deposit_request/')) return '/ar/deposit_request/' + url.hash;
  if (included.has(pathname) && (!url.search || url.search === '?lang=en')) return pathname + url.hash;
  return url.href;
}
async function migrate(page) {
  const base = page.url;
  const filename = page.slug ? page.slug.replaceAll('/', '__') : 'home';
  const source = `migration/source/${filename}.html`;
  let captured;
  try { if (!process.argv.includes('--refresh')) captured = await fs.readFile(source, 'utf8'); } catch {}
  if (!captured) {
    const response = await fetch(base, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw Error(`Page ${base}: HTTP ${response.status}`);
    captured = await response.text();
    await fs.mkdir(path.dirname(source), { recursive: true });
    await fs.writeFile(source, captured);
  }
  const $ = load(captured);
  const standalone = page.kind === 'standalone';
  if (!standalone && (!$('#content').length || !$('#masthead').length)) throw Error(`Missing page structure: ${base}`);
  $('[integrity]').removeAttr('integrity');
  $('link[rel="https://api.w.org/"], link[rel="EditURI"], link[rel="shortlink"], link[rel="alternate"][type], link[rel="profile"], link[rel="dns-prefetch"], meta[name="generator"], meta[name="robots"], link[rel="canonical"]').remove();
  $('script').each((_, e) => {
    const el = $(e);
    const id = el.attr('id') || '';
    const src = el.attr('src') || '';
    if (el.attr('type') === 'application/ld+json') return;
    const standaloneVendor = standalone && /^(vendor\/)/.test(src);
    if (!standaloneVendor && !scriptIds.has(id) && !/^uagb?-/.test(id) && !src.includes('s3.tradingview.com/') && !el.html()?.includes('window.__lc')) el.remove();
    else el.removeAttr('type').removeAttr('data-cfasync');
  });
  $('[data-cfemail]').each((_, e) => {
    const encoded = $(e).attr('data-cfemail');
    const key = parseInt(encoded.slice(0, 2), 16);
    let email = '';
    for (let i = 2; i < encoded.length; i += 2) email += String.fromCharCode(parseInt(encoded.slice(i, i + 2), 16) ^ key);
    $(e).closest('a').attr('href', `mailto:${email}`);
    $(e).replaceWith(email);
  });
  const tasks = [];
  $('link[href]').each((_, e) => {
    const el = $(e);
    if (/stylesheet|icon|preload/.test(el.attr('rel'))) tasks.push(async () => el.attr('href', await localize(el.attr('href'), base)));
  });
  $('script[src]').each((_, e) => {
    const el = $(e);
    if (!el.attr('src').includes('s3.tradingview.com/')) tasks.push(async () => el.attr('src', await localize(el.attr('src'), base)));
  });
  $('img, source, video, audio').each((_, e) => {
    const el = $(e);
    for (const attr of ['src', 'data-src', 'poster']) {
      if (el.attr(attr)) tasks.push(async () => el.attr(attr, await localize(el.attr(attr), base)));
    }
    if (el.attr('srcset')) tasks.push(async () => {
      const entries = [];
      for (const item of el.attr('srcset').split(',')) {
        const [url, descriptor] = item.trim().split(/\s+/);
        entries.push(`${await localize(url, base)}${descriptor ? ` ${descriptor}` : ''}`);
      }
      el.attr('srcset', entries.join(', '));
    });
  });
  $('style').each((_, e) => tasks.push(async () => $(e).text(await css($(e).html(), base))));
  $('[style*="url("]').each((_, e) => tasks.push(async () => $(e).attr('style', await css($(e).attr('style'), base))));
  $('a[href]').each((_, e) => {
    const el = $(e);
    const href = el.attr('href');
    el.attr('href', routeLink(href, base));
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) return;
    const url = new URL(normalize(href, base));
    if (url.hostname === 'sv.fxem.com' && /\.(png|jpe?g|gif|webp|svg|pdf|docx?)$/i.test(url.pathname)) tasks.push(async () => el.attr('href', await localize(href, base)));
  });
  $('form').each((_, e) => {
    const form = $(e);
    if ((form.attr('method') || 'get').toLowerCase() === 'get') {
      if (form.attr('action')) form.attr('action', normalize(form.attr('action'), base));
    } else {
      // Preserve comment form design without posting preview data to WordPress.
      form.attr('action', '#').attr('data-preview-form', standalone ? 'deposit' : 'comments');
    }
  });
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < tasks.length) await tasks[next++]();
  }));
  $('head').append(`<meta name="robots" content="noindex, nofollow"><link rel="canonical" href="${base}">`);
  const footerStyles = $('body > style, body > link[rel=stylesheet]').toArray().map(e => $.html(e)).join('\n');
  // Static servers ignore language query strings when choosing an HTML file.
  // Route this legacy form URL before paint, including in local Astro previews.
  const legacyLanguageRedirect = page.slug === 'deposit_request' && included.has('/ar/deposit_request/')
    ? '<script>if(new URLSearchParams(location.search).get("lang")==="ar"){location.replace("/ar/deposit_request/"+location.search+location.hash);}</script>'
    : '';
  const rendered = {
    slug: page.slug,
    title: $('title').text(),
    kind: page.kind,
    htmlAttributes: $('html').attr(),
    skipLink: $('body > .skip-link').toArray().map(e => $.html(e)).join(''),
    sourceUrl: base,
    head: legacyLanguageRedirect + $('head').html() + '\n' + footerStyles,
    bodyAttributes: $('body').attr(),
    header: $('#page > .en-content, #page > .ar-content, #masthead').toArray().map(e => $.html(e)).join('\n'),
    standalone,
    content: standalone ? $('body').clone().find('script').remove().end().html() : $.html($('#content')),
    footer: $.html($('#colophon')),
    scripts: $('body > script, body > noscript').toArray().map(e => $.html(e)).join('\n'),
  };
  if ($('[data-preview-form]').length) rendered.scripts += '<script src="/preview-forms.js"></script>';
  if (page.slug) await fs.writeFile(`src/data/pages/${filename}.json`, JSON.stringify(rendered, null, 2) + '\n');
  else {
    for (const [key, file] of Object.entries({head:'head',header:'header',content:'homepage',footer:'footer',scripts:'scripts'})) {
      await fs.writeFile(`src/content/${file}.html`, rendered[key]);
    }
    await fs.writeFile('src/content/body.json', JSON.stringify(rendered.bodyAttributes, null, 2) + '\n');
  }
  console.log(`Imported ${base}`);
}
await fs.mkdir('src/data/pages', { recursive: true });
// Page-level styles and body classes remain separate to preserve each design.
for (const page of [{slug:'',url:origin,kind:'page'}, ...routes]) await migrate(page);
await fs.writeFile('migration/assets.json', JSON.stringify(Object.fromEntries(assets), null, 2) + '\n');
await fs.writeFile('migration/asset-errors.json', JSON.stringify(failures, null, 2) + '\n');
await fs.writeFile('migration/source-issues.json', JSON.stringify(sourceIssues, null, 2) + '\n');
if (failures.length) throw Error(`${failures.length} asset downloads failed; see migration/asset-errors.json`);
console.log(`${routes.length + 1} pages imported; ${assets.size} local assets.`);
