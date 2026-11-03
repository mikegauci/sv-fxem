// Compares the running site with a reference build of the original Astro
// preview, page by page. Usage:
//   node scripts/compare-parity.mjs <astro .vercel/output/static dir> [base URL]
import fs from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import { routes } from '../src/lib/site/snapshots.mjs';

const [reference, base = 'http://localhost:3002'] = process.argv.slice(2);
if (!reference) throw Error('Pass the Astro reference output directory.');

// Build-tool differences that do not change the page: bundled module scripts
// and the inlined component CSS (compared separately by rule content).
function normalize(html) {
  const $ = load(html);
  $('script[type=module]').remove();
  $('style').each((_, el) => { if (/\[data-(currentdesk|contact)-form\]|fxem-footer-news|fxem-not-found/.test($(el).html())) $(el).remove(); });
  $('[data-astro-cid]').removeAttr('data-astro-cid');
  $('*').each((_, el) => {
    for (const name of Object.keys(el.attribs || {})) if (name.startsWith('data-astro-cid')) $(el).removeAttr(name);
    const cls = $(el).attr('class');
    if (cls && /\bastro-/.test(cls)) $(el).attr('class', cls.split(/\s+/).filter(c => !c.startsWith('astro-')).join(' '));
  });
  const head = $('head').children().toArray().map(el => `${el.tagName} ${JSON.stringify(el.attribs)} ${el.tagName === 'title' || el.tagName === 'script' || el.tagName === 'style' ? $(el).html().replace(/\s+/g, ' ').trim().length : ''}`);
  const body = $('body').html().replace(/\s+/g, ' ').replace(/> </g, '><').trim();
  return { head, body, bodyAttrs: JSON.stringify($('body').attr()), htmlAttrs: JSON.stringify($('html').attr()) };
}

let failures = 0;
const targets = [...routes().map(r => r.slug), '404'];
for (const slug of targets) {
  const file = slug === '404' ? path.join(reference, '404.html') : path.join(reference, slug, 'index.html');
  const url = slug === '404' ? `${base}/this-page-does-not-exist/` : `${base}/${slug.split('/').map(encodeURIComponent).join('/')}${slug ? '/' : ''}`;
  const [expected, response] = await Promise.all([fs.readFile(file, 'utf8'), fetch(url)]);
  const a = normalize(expected), b = normalize(await response.text());
  const problems = [];
  if (response.status !== (slug === '404' ? 404 : 200)) problems.push(`status ${response.status}`);
  if (a.htmlAttrs !== b.htmlAttrs) problems.push(`html attrs ${a.htmlAttrs} vs ${b.htmlAttrs}`);
  if (a.bodyAttrs !== b.bodyAttrs) problems.push(`body attrs differ`);
  if (a.head.join('\n') !== b.head.join('\n')) {
    const missing = a.head.filter(x => !b.head.includes(x)), extra = b.head.filter(x => !a.head.includes(x));
    problems.push(`head: ${missing.length} missing, ${extra.length} extra${missing.length ? '\n    - ' + missing.slice(0, 3).join('\n    - ').slice(0, 600) : ''}${extra.length ? '\n    + ' + extra.slice(0, 3).join('\n    + ').slice(0, 600) : ''}`);
  }
  if (a.body !== b.body) {
    let i = 0; while (a.body[i] === b.body[i]) i++;
    problems.push(`body differs at ${i}:\n    astro: ${a.body.slice(Math.max(0, i - 80), i + 160)}\n    next:  ${b.body.slice(Math.max(0, i - 80), i + 160)}`);
  }
  if (problems.length) { failures++; console.log(`✗ /${slug}\n  ${problems.join('\n  ')}`); }
}
console.log(`${targets.length - failures}/${targets.length} pages match the Astro reference.`);
process.exitCode = failures ? 1 : 0;
