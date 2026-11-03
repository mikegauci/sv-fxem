import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { scriptSignature } from '../src/lib/admin/embeds.mjs';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://editor.example.com', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'MutationObserver', 'getComputedStyle', 'DOMParser']) globalThis[key] = key === 'getComputedStyle' ? dom.window[key].bind(dom.window) : dom.window[key];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
const result = await build({ stdin: { contents: `export { richTextExtensions, convertToRichText, embedNodeCode } from './src/components/admin/rich-text-schema.tsx'; export { inlineExtensions } from './src/components/admin/inline-rich-text.tsx'; export { generateJSON, Editor } from '@tiptap/core'; import { generateHTML as generateSchemaHTML } from '@tiptap/core'; import { expandRichEmbeds } from './src/lib/admin/embeds.mjs'; export { generateSchemaHTML }; export const generateHTML = (json, extensions) => expandRichEmbeds(generateSchemaHTML(json, extensions));`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'browser', format: 'esm', write: false });
const { richTextExtensions, convertToRichText, embedNodeCode, inlineExtensions, generateSchemaHTML, generateHTML, generateJSON, Editor } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

test('code atom preserves exact scripts through schema parse/serialize and uses inert node views', () => {
  const code = '<script src="https://example.com/widget.js"></script><script>globalThis.snippetRan = true; const config = { text: "<&", dollar: "$&" };\n</script><div onclick="test()">Widget</div>';
  const html = `<div data-fxem-embed="code">${code}</div>`;
  const extensions = richTextExtensions(true);
  const json = generateJSON(html, extensions);
  assert.equal(json.content[0].type, 'embed'); assert.equal(json.content[0].attrs.code, code);
  const inert = generateSchemaHTML(json, extensions);
  assert.doesNotMatch(inert, /<script|<img|onerror=|onclick=/);
  assert.match(inert, /data-code=/);
  const saved = generateHTML(json, extensions);
  assert.deepEqual(scriptSignature(saved), scriptSignature(html));
  assert.equal(generateJSON(saved, extensions).content[0].attrs.code, code);
  assert.equal(globalThis.snippetRan, undefined);
  assert.equal(extensions.at(-1).config.atom, true);
  assert.ok(extensions.at(-1).config.addNodeView);
});
test('conversion preserves text, headings, lists, images, links and all raw iframe/script content', () => {
  const html = '<section class="columns"><h2>Title</h2><p>Hello <strong>world</strong> <a href="https://example.com">Link</a></p><ul><li>One</li></ul><img src="https://example.com/image.jpg" alt="Image"><iframe src="https://example.com/chart" title="Chart"></iframe><script>const widget = { enabled: true };</script></section>';
  const saved = convertToRichText(html, true);
  for (const fragment of ['<h2>Title</h2>', '<strong>world</strong>', '<ul>', '<img ', '<iframe ', '<script>const widget']) assert.ok(saved.includes(fragment), fragment);
  assert.doesNotMatch(saved, /class="columns"/);
  assert.deepEqual(scriptSignature(saved), scriptSignature(html));
  const json = generateJSON(saved, richTextExtensions(true));
  assert.equal(json.content.filter(node => node.type === 'embed').length, 2);
});
test('inline schema retains span class/style, marks, links, superscript/subscript and breaks', () => {
  const html = '<p>Hello <span class="theme-accent" style="color: red"><strong>bold</strong></span> <u>underlined</u> <sup>2</sup><sub>n</sub><br><a href="https://example.com" target="_blank">Link</a></p>';
  const extensions = inlineExtensions();
  const json = generateJSON(html, extensions), saved = generateHTML(json, extensions);
  for (const fragment of ['class="theme-accent"', 'style="color: red', '<strong>', '<u>', '<sup>', '<sub>', '<br>', 'target="_blank"']) assert.ok(saved.includes(fragment), fragment);
  assert.equal(json.content.length, 1);
});
test('mounting a rich-text editor never creates script/iframe/event-handler content in the editor DOM', () => {
  const editor = new Editor({ element: document.createElement('div'), extensions: richTextExtensions(true), content: '<div data-fxem-embed="code"><script>globalThis.snippetRan = true</script><img src="x" onerror="globalThis.snippetRan=true"><iframe src="https://example.com"></iframe></div>' });
  assert.equal(editor.view.dom.querySelectorAll('script,iframe,[onerror]').length, 0);
  assert.equal(globalThis.snippetRan, undefined);
  editor.destroy();
});

test('rich iframe and code embeds retain one container across repeated saves', async () => {
  const { buildIframeEmbed, wrapCode, normalizeRichEmbeds } = await import('../src/lib/admin/embeds.mjs');
  const extensions = richTextExtensions(true);
  for (const mode of ['iframe', 'code']) {
    const options = mode === 'iframe' ? { mode, src: 'https://example.com', title: 'Chart', aspect: '16:9' } : { mode, wrap: true };
    const code = mode === 'iframe' ? buildIframeEmbed(options) : wrapCode('<script>chart()</script>');
    let html = generateHTML({ type: 'doc', content: [{ type: 'embed', attrs: { mode, code: embedNodeCode(code, options), options } }] }, extensions);
    for (let i = 0; i < 3; i++) {
      html = normalizeRichEmbeds(generateHTML(generateJSON(html, extensions), extensions));
      const template = document.createElement('template'); template.innerHTML = html;
      assert.equal(template.content.querySelectorAll('.fxem-embed').length, 1);
      assert.equal(template.content.querySelectorAll('[data-fxem-embed]').length, 1);
      if (mode === 'iframe') assert.equal(template.content.querySelectorAll('iframe').length, 1);
      else assert.match(html, /<script>chart\(\)<\/script>/);
    }
  }
});

test('code atom preserves a snippet that deliberately contains its own embed container', () => {
  const code = '<div class="fxem-embed fxem-embed--code"><script>nested()</script></div>';
  const options = { mode: 'code', wrap: true }, extensions = richTextExtensions(true);
  let html = generateHTML({ type: 'doc', content: [{ type: 'embed', attrs: { mode: 'code', code, options } }] }, extensions);
  for (let i = 0; i < 3; i++) {
    const json = generateJSON(html, extensions);
    assert.equal(json.content[0].attrs.code, code);
    html = generateHTML(json, extensions);
  }
});
