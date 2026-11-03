import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://editor.example.com', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'MutationObserver', 'DOMParser', 'localStorage']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.confirm = () => true;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// The bundled browser React scheduler creates MessageChannels for act().
// Close those browser resources after the simulated document is unmounted.
const NativeMessageChannel = globalThis.MessageChannel, channels = new Set();
globalThis.MessageChannel = class extends NativeMessageChannel {
  constructor() { super(); channels.add(this); }
};
const built = await build({ stdin: { contents: `export { PageEditor } from './src/components/admin/page-editor.tsx'; export { InlineRichText } from './src/components/admin/inline-rich-text.tsx'; export { RichTextEditor } from './src/components/admin/rich-text-editor.tsx'; export { EmbedForm } from './src/components/admin/embed-form.tsx'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'browser', format: 'esm', write: false, plugins: [{ name: 'ui-fixtures', setup(builder) {
  builder.onResolve({ filter: /^(next\/(link|navigation)|@\/components\/admin\/(media-picker|local-draft)|@\/lib\/media|@\/app\/.*pages\/actions)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents:
    args.path === 'next/link' ? `import { createElement } from 'react'; export default function Link(props) { return createElement('a', props); }` :
    args.path === 'next/navigation' ? 'export const useRouter = () => ({ push() {}, replace() {}, refresh() {} });' :
    args.path.endsWith('media-picker') ? 'export const MediaPicker = () => null;' :
    args.path.endsWith('local-draft') ? 'export const LocalDraft = () => null;' :
    args.path.endsWith('/media') ? 'export const mediaUrl = path => path;' :
    `export const savePage = async page => { globalThis.savedEditorPage = structuredClone(page); return { id: 'saved' }; }; export const deletePage = async () => {}; export const createTranslation = async () => ({ id: 'translation' });`, resolveDir: process.cwd() }));
} }] });
const { PageEditor, InlineRichText, RichTextEditor, EmbedForm, createElement: h, act, createRoot } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
async function mount(component, props) {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(h(component, props)));
  return { container, root, async close() { await act(async () => root.unmount()); container.remove(); } };
}
function button(container, text) { const result = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === text); assert.ok(result, text); return result; }
async function click(element) { await act(async () => element.click()); }
async function input(element, value) {
  const proto = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value); element.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
}
const initialPage = sections => ({ id: 'page', language: 'en', translationId: null, path: 'test', title: 'Test', status: 'draft', seo: {}, sections });

test('inline editor synchronizes a URL changed by the separate link field without emitting a content change', async () => {
  const changes = [];
  const view = await mount(InlineRichText, { value: '<a href="https://old.example.com">Link</a>', dir: 'rtl', onChange: value => changes.push(value) });
  assert.equal(view.container.querySelector('[contenteditable]').getAttribute('dir'), 'rtl');
  await act(async () => view.root.render(h(InlineRichText, { value: '<a href="https://new.example.com">Link</a>', dir: 'rtl', onChange: value => changes.push(value) })));
  assert.equal(view.container.querySelector('[contenteditable] a').getAttribute('href'), 'https://new.example.com');
  assert.deepEqual(changes, []);
  await view.close();
});
test('rich text mounts inert code cards with working Edit and Remove controls', async () => {
  const view = await mount(RichTextEditor, { value: '<p>Text</p><div data-fxem-embed="code"><script>globalThis.snippetRan=true</script><img src="x" onerror="globalThis.snippetRan=true"></div>', fullAdmin: true, onChange() {} });
  assert.equal(view.container.querySelectorAll('script,iframe,[onerror]').length, 0);
  assert.match(view.container.textContent, /Code:/);
  await click(button(view.container, 'Edit'));
  assert.match(view.container.querySelector('textarea').value, /globalThis.snippetRan/);
  await click(button(view.container, 'Cancel'));
  await click(button(view.container, 'Remove'));
  assert.doesNotMatch(view.container.textContent, /Code:/);
  assert.equal(globalThis.snippetRan, undefined);
  await view.close();
});
test('conversion can be undone to exact original markup before saving', async () => {
  const html = '<section class="columns"><h2>Title</h2><p>Original <strong>text</strong></p><script>globalThis.snippetRan=true</script></section>';
  const view = await mount(PageEditor, { initial: initialPage([{ id: 'section', kind: 'html', label: 'Designed', html }]), fullAdmin: true, translation: null, publicPath: null });
  await click(button(view.container, 'Convert to rich text'));
  assert.ok(button(view.container, 'Undo convert'));
  await click(button(view.container, 'Undo convert'));
  await click(button(view.container, 'Save'));
  assert.equal(globalThis.savedEditorPage.sections[0].kind, 'html');
  assert.equal(globalThis.savedEditorPage.sections[0].html, html);
  assert.equal(globalThis.snippetRan, undefined);
  await view.close();
});
test('limited admins see iframe mode, locked script sections and no custom-code panel', async () => {
  const view = await mount(PageEditor, { initial: initialPage([{ id: 'script', kind: 'html', label: 'Script section', html: '<p>Text</p><script>widget()</script>' }]), fullAdmin: false, translation: null, publicPath: null });
  await click(button(view.container, 'Script section'));
  assert.match(view.container.textContent, /Contains a script/);
  assert.doesNotMatch(view.container.textContent, /Custom code/);
  await click(button(view.container, 'Convert to rich text'));
  assert.match(view.container.textContent, /Only full admins/);
  await click(button(view.container, '+ Embed'));
  assert.equal(view.container.querySelector('option[value="code"]').disabled, true);
  await view.close();
});
test('new iframe section settings remain attached to the section when reordered', async () => {
  const sections = ['One', 'Two'].map(title => ({ id: null, kind: 'embed', label: title, html: '', options: { mode: 'iframe', src: 'https://example.com', title, height: 450 } }));
  const view = await mount(PageEditor, { initial: initialPage(sections), fullAdmin: true, translation: null, publicPath: null });
  await click(button(view.container, 'One'));
  const title = [...view.container.querySelectorAll('label')].find(label => label.textContent.startsWith('Accessible title')).querySelector('input');
  await input(title, 'Edited one');
  await click(view.container.querySelector('button[aria-label="Move down"]'));
  assert.equal([...view.container.querySelectorAll('label')].find(label => label.textContent.startsWith('Accessible title')).querySelector('input').value, 'Edited one');
  await click(button(view.container, 'Apply embed'));
  await click(button(view.container, 'Save'));
  assert.equal(globalThis.savedEditorPage.sections[1].options.title, 'Edited one');
  await view.close();
});
test('code form stores wrapping explicitly so reopening cannot add another container', async () => {
  let saved;
  const view = await mount(EmbedForm, { initial: { mode: 'code' }, code: '<script>widget()</script>', fullAdmin: true, onSave: (html, options) => { saved = { html, options }; } });
  await click(button(view.container, 'Apply embed'));
  assert.equal(saved.options.wrap, true);
  await view.close();
  const reopened = await mount(EmbedForm, { initial: saved.options, code: saved.html, fullAdmin: true, onSave() {} });
  assert.equal(reopened.container.querySelector('textarea').value, '<script>widget()</script>');
  await reopened.close();
});

test.after(() => { dom.window.close(); for (const channel of channels) { channel.port1.close(); channel.port2.close(); } globalThis.MessageChannel = NativeMessageChannel; });
