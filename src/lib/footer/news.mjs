import { load } from 'cheerio';
export const feedUrl = 'https://www.cnbc.com/id/100003114/device/rss/rss.html';
export function parseNews(xml) {
  const $ = load(xml, { xml: true }), items = [], seen = new Set();
  $('item').each((_, item) => {
    const title = $(item).find('title').first().text().replace(/\s+/g, ' ').trim().slice(0, 300);
    const link = $(item).find('link').first().text().trim();
    try {
      const url = new URL(link);
      if (url.protocol !== 'https:' || !/(^|\.)cnbc\.com$/.test(url.hostname) || !title || seen.has(url.href)) return;
      const published = new Date($(item).find('pubDate').first().text().trim());
      const publishedAt = Number.isNaN(published.getTime()) ? null : published.toISOString();
      seen.add(url.href); items.push({ title, url: url.href, publishedAt });
    } catch {}
  });
  return items.slice(0, 3);
}
let cached = [], expires = 0, pending;
export async function getNews() {
  if (Date.now() < expires) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch(feedUrl, { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
      if (!response.ok) throw new Error('Feed unavailable');
      const xml = await response.text();
      if (xml.length > 2_000_000) throw new Error('Feed too large');
      const items = parseNews(xml);
      if (!items.length) throw new Error('Empty feed');
      cached = items; expires = Date.now() + 600_000;
    } catch { expires = Date.now() + 60_000; }
    return cached;
  })().finally(() => { pending = undefined; });
  return pending;
}
