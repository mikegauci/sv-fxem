import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { load } from 'cheerio';

// An offline, editable snapshot. No WordPress requests happen at build or runtime.
const origin = 'https://sv.fxem.com/';
const source = 'migration/source/home.html';
await fs.mkdir(path.dirname(source), { recursive: true });
if (process.argv.includes('--refresh')) {
  const response = await fetch(origin);
  if (!response.ok) throw Error(`Homepage: ${response.status}`);
  await fs.writeFile(source, await response.text());
}
const $ = load(await fs.readFile(source, 'utf8'));
// Stylesheet URLs change when font references are localized; source SRI hashes
// no longer describe those bytes. Assets are served from the same origin.
$('[integrity]').removeAttr('integrity');
const assets = new Map();
const jobs = new Map();
const failures = [];
const normalize = (value, base = origin) => {
  const u = new URL(value.replaceAll('&amp;', '&'), base);
  if (u.hostname === 'sv.fxem.com') u.protocol = 'https:';
  return u.href;
};
async function localize(value, base = origin) {
  if (!value || /^(data:|#|mailto:|tel:|javascript:)/i.test(value)) return value;
  const url = normalize(value, base);
  if (jobs.has(url)) return jobs.get(url);
  const job = (async () => {
    const u = new URL(url);
    const basename = path.basename(u.pathname).replace(/[^a-zA-Z0-9._-]/g, '-');
    const name = `${crypto.createHash('sha256').update(url).digest('hex').slice(0, 12)}-${basename}`;
    const output = `/assets/${name}`;
    const target = `public${output}`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      let bytes = Buffer.from(await response.arrayBuffer());
      if (/\.css$/i.test(u.pathname)) bytes = Buffer.from(await css(bytes.toString(), url));
      await fs.writeFile(target, bytes);
      assets.set(url, output);
      return output;
    } catch (error) {
      failures.push({ url, error: error.message });
      return url;
    }
  })();
  jobs.set(url, job);
  return job;
}
async function css(text, base) {
  const matches = [...text.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)];
  for (const match of matches) {
    const replacement = await localize(match[2], base);
    text = text.replace(match[0], `url("${replacement}")`);
  }
  return text;
}

// Keep the visual stylesheet order exactly as served by the original site.
// Remove publishing endpoints and scripts for plugins with no homepage behavior.
$('link[rel="https://api.w.org/"], link[rel="EditURI"], link[rel="shortlink"], link[rel="alternate"][type], link[rel="profile"], link[rel="dns-prefetch"], meta[name="generator"], meta[name="robots"]').remove();
const keepScripts = new Set(['jquery-core-js', 'jquery-migrate-js', 'astra-theme-js-js-extra', 'astra-theme-js-js', 'hoverIntent-js', 'megamenu-js-extra', 'megamenu-js', 'carousel-block-slick-js', 'carousel-block-view-js']);
$('script').each((_, e) => {
  const el = $(e);
  const src = el.attr('src') || '';
  const inline = el.html() || '';
  if (!keepScripts.has(el.attr('id')) && !src.includes('s3.tradingview.com/') && !inline.includes('window.__lc')) el.remove();
  else el.removeAttr('type').removeAttr('data-cfasync');
});
$('script[data-cf-settings]').remove();
// Decode the public email without a Cloudflare runtime dependency.
$('[data-cfemail]').each((_, e) => {
  const encoded = $(e).attr('data-cfemail');
  const key = parseInt(encoded.slice(0, 2), 16);
  let email = '';
  for (let i = 2; i < encoded.length; i += 2) email += String.fromCharCode(parseInt(encoded.slice(i, i + 2), 16) ^ key);
  $(e).closest('a').attr('href', `mailto:${email}`);
  $(e).replaceWith(email);
});

const tasks = [];
function task(fn) { tasks.push(fn); }
$('link[href]').each((_, e) => {
  const el = $(e);
  if (/stylesheet|icon|preload/.test(el.attr('rel'))) task(async () => el.attr('href', await localize(el.attr('href'))));
});
$('script[src]').each((_, e) => {
  const el = $(e);
  if (!el.attr('src').includes('s3.tradingview.com/')) task(async () => el.attr('src', await localize(el.attr('src'))));
});
$('img, source').each((_, e) => {
  const el = $(e);
  for (const attr of ['src', 'data-src']) if (el.attr(attr)) task(async () => el.attr(attr, await localize(el.attr(attr))));
  if (el.attr('srcset')) task(async () => {
    const values = [];
    for (const entry of el.attr('srcset').split(',')) {
      const [url, descriptor] = entry.trim().split(/\s+/);
      values.push(`${await localize(url)}${descriptor ? ` ${descriptor}` : ''}`);
    }
    el.attr('srcset', values.join(', '));
  });
});
$('style').each((_, e) => task(async () => $(e).text(await css($(e).html(), origin))));
$('[style*="url("]').each((_, e) => task(async () => $(e).attr('style', await css($(e).attr('style'), origin))));
$('a[href]').each((_, e) => {
  const el = $(e);
  const href = el.attr('href');
  if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) return;
  const u = new URL(normalize(href));
  if (u.hostname !== 'sv.fxem.com') return;
  // Keep out-of-scope pages on WordPress, but Home links stay on the preview.
  el.attr('href', u.pathname === '/' && !u.search ? '/' : u.href);
  if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(u.pathname)) task(async () => el.attr('href', await localize(href)));
});
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < tasks.length) await tasks[next++]();
}));
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  throw Error(`${failures.length} assets could not be localized`);
}

// Preview indexing is disabled in both HTML and Vercel response headers.
$('head').append('<meta name="robots" content="noindex, nofollow"><link rel="canonical" href="https://sv.fxem.com/">');
const footerStyles = $('body > style, body > link[rel=stylesheet]').toArray().map(e => $.html(e)).join('\n');
await fs.writeFile('src/content/head.html', $('head').html() + '\n' + footerStyles);
await fs.writeFile('src/content/body.json', JSON.stringify($('body').attr(), null, 2) + '\n');
await fs.writeFile('src/content/header.html', $('#page > .en-content, #page > .ar-content, #masthead').toArray().map(e => $.html(e)).join('\n'));
await fs.writeFile('src/content/homepage.html', $.html($('#content')));
await fs.writeFile('src/content/footer.html', $.html($('#colophon')));
await fs.writeFile('src/content/scripts.html', $('body > script, body > noscript').toArray().map(e => $.html(e)).join('\n'));
await fs.writeFile('migration/assets.json', JSON.stringify(Object.fromEntries(assets), null, 2) + '\n');
console.log(`Imported homepage and ${assets.size} local assets.`);
