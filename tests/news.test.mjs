import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultFeed, feedSettings, isPublicHttps, parseNews } from '../src/lib/footer/news.mjs';
import { footerMarkup, newsBlock } from '../src/lib/footer/markup.mjs';

const block = '<section id="block-28" class="widget widget_block widget_rss"><div>RSS Error</div></section>';

test('feed settings default to CNBC and reject unsafe addresses', () => {
  assert.deepEqual(feedSettings(undefined).feed, defaultFeed);
  assert.equal(feedSettings({ count: '5', source: 'Reuters' }).feed.count, 5);
  for (const url of ['http://example.com/rss', 'https://localhost/rss', 'https://127.0.0.1/rss', 'https://user:pw@example.com/', 'https://example.com:8443/', 'javascript:alert(1)'])
    assert.equal(isPublicHttps(url), false, url);
  assert.match(feedSettings({ url: 'http://example.com/rss' }).error, /https/);
  assert.match(feedSettings({ count: 11 }).error, /between 1 and 10/);
  assert.match(feedSettings({ source: ' ' }).error, /short name/);
});

test('parses RSS and Atom headlines, https links only', () => {
  const rss = '<rss><channel><item><title>One</title><link>https://a.example/1</link><pubDate>Tue, 03 Nov 2026 10:00:00 GMT</pubDate></item><item><title>Two</title><link>http://a.example/2</link></item><item><title>Three</title><link>https://a.example/3</link></item></channel></rss>';
  assert.deepEqual(parseNews(rss, 5).map(i => i.title), ['One', 'Three']);
  assert.equal(parseNews(rss, 1).length, 1);
  assert.equal(parseNews(rss)[0].publishedAt, '2026-11-03T10:00:00.000Z');
  const atom = '<feed><entry><title>Atom</title><link href="https://b.example/x"/><updated>2026-11-03T09:00:00Z</updated></entry></feed>';
  assert.deepEqual(parseNews(atom), [{ title: 'Atom', url: 'https://b.example/x', publishedAt: '2026-11-03T09:00:00.000Z' }]);
});

test('the default news block renders as before; a custom source is named', () => {
  assert.equal(newsBlock(block, defaultFeed), block);
  assert.match(footerMarkup(block), /CNBC — Finance news<\/a>.*<small><a href="https:\/\/www.cnbc.com\/finance\/"/);
  const custom = footerMarkup(newsBlock(block, { ...defaultFeed, source: 'Reuters "Markets"', sourceUrl: 'https://www.reuters.com/markets/' }));
  assert.match(custom, /data-news-source="Reuters &quot;Markets&quot;"/);
  assert.match(custom, /aria-label="Reuters &quot;Markets&quot; news"/);
  assert.match(custom, /<small><a href="https:\/\/www.reuters.com\/markets\/"/);
});
