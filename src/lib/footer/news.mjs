import { load } from 'cheerio';

// The footer news block shows headlines from an RSS feed. Each language's
// block can set its own feed in the CMS (footer_widgets.options.feed);
// without one it shows CNBC finance news, as the original site did.
export const defaultFeed = {
  url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
  count: 3,
  source: 'CNBC',
  sourceUrl: 'https://www.cnbc.com/finance/',
};
export const feedUrl = defaultFeed.url;

// Only public https addresses: no credentials, ports, IP literals or local names.
export function isPublicHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      url.hostname.includes('.') && !/^[\d.]+$|^\[|\.(local|internal|localhost)$/i.test(url.hostname);
  } catch { return false; }
}

// Feed settings with defaults filled in; returns an error message when invalid.
export function feedSettings(input = {}) {
  const feed = { ...defaultFeed, ...Object.fromEntries(Object.entries(input ?? {}).filter(([, v]) => v !== '' && v != null)) };
  feed.count = Number(feed.count);
  feed.source = String(feed.source).trim();
  if (!isPublicHttps(feed.url)) return { error: 'The news feed needs a full https:// address.' };
  if (!Number.isInteger(feed.count) || feed.count < 1 || feed.count > 10) return { error: 'Show between 1 and 10 headlines.' };
  if (!feed.source || feed.source.length > 60) return { error: 'Give the news source a short name.' };
  if (!isPublicHttps(feed.sourceUrl)) return { error: 'The news source link needs a full https:// address.' };
  return { feed: { url: feed.url, count: feed.count, source: feed.source, sourceUrl: feed.sourceUrl } };
}

export function parseNews(xml, count = defaultFeed.count) {
  const $ = load(xml, { xml: true }), items = [], seen = new Set();
  $('item, entry').each((_, item) => {
    const title = $(item).find('title').first().text().replace(/\s+/g, ' ').trim().slice(0, 300);
    const linkEl = $(item).find('link').first();
    const link = (linkEl.text() || linkEl.attr('href') || '').trim();
    try {
      const url = new URL(link);
      if (url.protocol !== 'https:' || !title || seen.has(url.href)) return;
      const published = new Date($(item).find('pubDate, published, updated').first().text().trim());
      const publishedAt = Number.isNaN(published.getTime()) ? null : published.toISOString();
      seen.add(url.href); items.push({ title, url: url.href, publishedAt });
    } catch {}
  });
  return items.slice(0, count);
}

export async function fetchNews(url, count) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(6000), headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
  if (!response.ok) throw new Error(`The feed answered ${response.status}.`);
  const xml = await response.text();
  if (xml.length > 2_000_000) throw new Error('The feed is too large.');
  const items = parseNews(xml, count);
  if (!items.length) throw new Error('No headlines found at that address.');
  return items;
}

// Headlines per feed, kept for 10 minutes (1 minute after a failure, keeping
// the last good headlines meanwhile).
const feeds = new Map();
export async function getNews(feed = defaultFeed) {
  const key = `${feed.url} ${feed.count}`;
  const entry = feeds.get(key) ?? { items: [], expires: 0 };
  feeds.set(key, entry);
  if (Date.now() < entry.expires) return entry.items;
  entry.pending ??= fetchNews(feed.url, feed.count)
    .then(items => { entry.items = items; entry.expires = Date.now() + 600_000; })
    .catch(() => { entry.expires = Date.now() + 60_000; })
    .then(() => entry.items)
    .finally(() => { entry.pending = undefined; });
  return entry.pending;
}
