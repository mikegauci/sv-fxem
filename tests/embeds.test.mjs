import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptSignature, scriptChanged, buildIframeEmbed, parseIframeSnippet, wrapCode, insertPageCode, normalizeRichEmbeds, hasUnsupportedRichMarkup } from '../src/lib/admin/embeds.mjs';

test('script multiset allows text edits and moving; detects adding, changing, copying and removal within a section', () => {
  const a = '<script src="https://widgets.test/a.js"></script>', b = '<script>const x = 1;</script>';
  assert.equal(scriptChanged(`<p>Old</p>${a}${b}`, `${b}<p>New</p>${a}`), false);
  for (const next of [a, a + a + b, a + b.replace('1', '2'), a + b + '<script type="application/json">{}</script>']) assert.equal(scriptChanged(a + b, next), true);
  assert.equal(scriptChanged('', a), true); // New/copied section has no saved signature.
  assert.deepEqual(scriptSignature('<iframe src="https://www.youtube.com/embed/a"></iframe>'), []);
});
test('detects dangerous tags, event handlers, obfuscated URLs and refresh', () => {
  for (const html of ['<img onerror="alert(1)" src="x">', '<a href="java&#x73;cript:alert(1)">x</a>', '<a href="java\nscript:alert(1)">x</a>', '<form action="javascript:x()"></form>', '<button formaction="javascript:x()">x</button>', '<svg><a xlink:href="javascript:x()">x</a></svg>', '<iframe srcdoc="<script>x()</script>"></iframe>', '<object data="x"></object>', '<embed src="x">', '<base href="https://evil.test">', '<meta http-equiv="refresh" content="0;url=x">', '<script/>alert(1)']) assert.ok(scriptSignature(html).length, html);
  assert.equal(scriptChanged('<SCRIPT src="x" type="text/javascript"></SCRIPT>', '<script type="text/javascript" src="x"></script>'), false);
  assert.equal(scriptChanged('<div onclick="x()">a</div>', '<div onclick="y()">a</div>'), true);
});
test('iframe builder validates, escapes and supports aspect, height, fullscreen and sandbox', () => {
  for (const src of ['http://example.com', 'javascript:alert(1)', 'https://localhost', 'https://127.0.0.1', 'https://user:password@example.com']) assert.throws(() => buildIframeEmbed({ src, title: 'Test' }));
  assert.throws(() => buildIframeEmbed({ src: 'https://example.com' }), /title/);
  assert.throws(() => buildIframeEmbed({ src: 'https://example.com', title: 'Test', height: 0 }), /Height/);
  const html = buildIframeEmbed({ src: 'https://example.com/?a=1&b=2', title: 'A "quoted" title', aspect: '16:9', allowFullscreen: true, sandbox: true });
  assert.match(html, /a=1&amp;b=2/); assert.match(html, /&quot;quoted&quot;/); assert.match(html, /aspect:16\/9/); assert.match(html, /allowfullscreen/); assert.match(html, /sandbox=/); assert.doesNotMatch(html, / height=/);
  assert.match(buildIframeEmbed({ src: 'https://example.com', title: 'Test', height: 450 }), /height="450"/);
});
test('snippet extraction and raw code retain intended content', () => {
  assert.deepEqual(parseIframeSnippet('<iframe src="https://example.com/?a=1&amp;b=2" title="Chart" height="500"></iframe>'), { src: 'https://example.com/?a=1&b=2', title: 'Chart', height: 500 });
  assert.equal(parseIframeSnippet('https://example.com'), null);
  assert.equal(wrapCode('<script>x()</script>', false), '<script>x()</script>');
  assert.match(wrapCode('<script>x()</script>'), /fxem-embed--code/);
});
test('page code is inserted after SEO and form scripts, also on standalone documents', () => {
  const html = '<html><head><meta name="description"></head><body><script src="forms.js"></script></body></html>';
  assert.equal(insertPageCode(html), html);
  assert.equal(insertPageCode(html, { head: '<meta name="custom">', bodyEnd: '<script>custom()</script>' }), '<html><head><meta name="description"><meta name="custom"></head><body><script src="forms.js"></script><script>custom()</script></body></html>');
  assert.ok(insertPageCode(html, { bodyEnd: '$&' }).includes('$&</body>'));
});
test('rich text iframe atoms are rebuilt, code atoms and unrelated markup remain exact', () => {
  const code = '<div data-fxem-embed="code"><script>const x = "<&";</script></div>';
  assert.equal(normalizeRichEmbeds(code), code);
  const html = '<p class="theme">A</p><div data-fxem-embed="iframe" data-options=\'{"src":"https://example.com","title":"Chart"}\'><script>bad()</script></div>';
  const normalized = normalizeRichEmbeds(html);
  assert.ok(normalized.startsWith('<p class="theme">A</p>')); assert.doesNotMatch(normalized, /<script>/); assert.match(normalized, /loading="lazy"/);
  assert.throws(() => normalizeRichEmbeds('<div data-fxem-embed="iframe"></div>'), /settings/);
  assert.equal(hasUnsupportedRichMarkup(code), false);
  assert.equal(hasUnsupportedRichMarkup('<div class="theme">x</div>'), true);
});

test('translations omit standalone and nested embeds without rewriting surrounding content', async () => {
  const { withoutEmbeds } = await import('../src/lib/admin/embeds.mjs');
  const html = '<p class="theme">Text</p>\n<div data-fxem-embed="code"><div><script>widget()</script></div></div><iframe src="https://example.com"></iframe><script>other()</script><p>End</p>';
  assert.equal(withoutEmbeds(html), '<p class="theme">Text</p>\n<p>End</p>');
});

test('page code ignores apparent closing tags inside script strings', () => {
  const html = '<html><head><script>const a = "</head>";</script></head><body><script>const b = "</body>";</script></body></html>';
  assert.equal(insertPageCode(html, { head: '<!-- head -->', bodyEnd: '<!-- end -->' }), '<html><head><script>const a = "</head>";</script><!-- head --></head><body><script>const b = "</body>";</script><!-- end --></body></html>');
});

test('encoded serializer placeholders expand losslessly, including Arabic, and reveal scripts to the guard', async () => {
  const { encodeEmbedCode, decodeEmbedCode, expandRichEmbeds } = await import('../src/lib/admin/embeds.mjs');
  const code = '<script>const label = "مرحبا 🌍";</script><img src="x" onerror="bad()">';
  const encoded = encodeEmbedCode(code);
  assert.equal(decodeEmbedCode(encoded), code);
  const placeholder = `<div data-fxem-embed="code" data-options='{"mode":"code","wrap":true}' data-code="${encoded}"></div>`;
  assert.deepEqual(scriptSignature(normalizeRichEmbeds(placeholder)), scriptSignature(code));
  assert.match(expandRichEmbeds(placeholder), /مرحبا 🌍/);
});
