import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const compiled = await build({ entryPoints: ['src/app/(cms)/admin/(panel)/pages/actions.ts'], bundle: true, platform: 'browser', format: 'esm', write: false, plugins: [{ name: 'server-action-fixtures', setup(builder) {
  builder.onResolve({ filter: /^(next\/cache|@\/lib\/(auth\/admin|site\/revalidate|supabase\/server))$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'next/cache' ? 'export const revalidatePath = () => {};' : args.path.includes('auth/admin') ? 'export const assertAdmin = async () => globalThis.pageSaveUser;' : args.path.includes('site/revalidate') ? 'export const revalidateContent = () => {};' : 'export const createClient = async () => globalThis.pageSaveDB;' }));
} }] });
const { savePage } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const script = '<script src="https://example.com/chart.js"></script>';
function fixture({ full = false, existing = [], customCode = {}, newPage = false } = {}) {
  globalThis.pageSaveUser = { role: 'admin', adminCapabilities: full ? null : ['pages'] };
  const calls = [];
  const previous = { path: 'about-us', language: 'en', custom_code: customCode, page_sections: existing };
  globalThis.pageSaveDB = { from() { return { select(selection) { this.selection = selection; return this; }, eq() { return this; }, single() { return Promise.resolve({ data: this.selection === 'layout' ? { layout: { head: '', scripts: '', contentShell: '<!--fxem:sections-->' } } : previous, error: null }); } }; }, async rpc(name, payload) { calls.push({ name, payload }); return { data: 'saved-page', error: null }; } };
  return { calls, input: { id: newPage ? null : 'page', language: 'en', translationId: null, path: 'about-us', title: 'About', status: 'draft', seo: {}, sections: existing.map(s => ({ kind: 'html', label: 'Chart', ...s })) } };
}
test('pages-only saves permit surrounding text edits, reorder and whole-section deletion', async () => {
  const { input, calls } = fixture({ existing: [{ id: 'a', html: `${script}<p>Old</p>` }, { id: 'b', html: '<p>Text</p>' }] });
  input.sections[0].html = `${script}<p>New</p>`;
  input.sections.reverse();
  assert.deepEqual(await savePage(input), { id: 'saved-page' }); assert.equal(calls.length, 1);
  input.sections = []; assert.deepEqual(await savePage(input), { id: 'saved-page' });
});
test('pages-only saves reject added, altered and copied scripts with a section label', async () => {
  for (const kind of ['added', 'changed', 'copied', 'handler', 'javascript', 'srcdoc']) {
    const { input, calls } = fixture({ existing: [{ id: 'a', html: `${script}<p>Text</p>` }] });
    if (kind === 'changed') input.sections[0].html = script.replace('chart.js','evil.js');
    else input.sections.push({ id: null, kind: 'html', label: 'New chart', html: kind === 'handler' ? '<img onerror="bad()">' : kind === 'javascript' ? '<a href="javascript:bad()">Link</a>' : kind === 'srcdoc' ? '<iframe srcdoc="bad"></iframe>' : script });
    const result = await savePage(input); assert.match(result.error, /Only full admins/); assert.match(result.error, /Chart|New chart/); assert.equal(calls.length, 0);
  }
});
test('section ids must belong to this page, and cannot be repeated', async () => {
  const { input } = fixture({ existing: [{ id: 'a', html: '<p>Text</p>' }] });
  input.sections.push({ ...input.sections[0] }); assert.match((await savePage(input)).error, /Invalid section id/);
  input.sections[1].id = 'other-page-section'; assert.match((await savePage(input)).error, /Invalid section id/);
});
test('limited iframe sections are rebuilt from trusted settings, code mode is restricted', async () => {
  const { input, calls } = fixture();
  input.sections = [{ id: null, kind: 'embed', label: 'Video', html: '<script>untrusted()</script>', options: { mode: 'iframe', src: 'https://www.youtube.com/embed/test', title: 'Video', height: 450 } }];
  assert.deepEqual(await savePage(input), { id: 'saved-page' });
  assert.doesNotMatch(calls[0].payload.new_sections[0].html, /script/);
  assert.match(calls[0].payload.new_sections[0].html, /loading="lazy"/);
  input.sections[0].options = { mode: 'code' }; input.sections[0].html = '<p>Code mode</p>';
  assert.match((await savePage(input)).error, /Only full admins/);
});
test('limited saves preserve existing page code and reject tampering; full admins can save code', async () => {
  let { input, calls } = fixture({ customCode: { head: script, bodyEnd: script } });
  assert.deepEqual(await savePage(input), { id: 'saved-page' }); assert.equal('custom_code' in calls[0].payload.fields, false);
  input.customCode = { head: 'changed' }; assert.match((await savePage(input)).error, /Only full admins/);
  ({ input, calls } = fixture({ full: true, newPage: true }));
  input.customCode = { head: script, bodyEnd: '<script>run()</script>' };
  input.sections = [{ id: null, kind: 'embed', label: 'Code', html: script, options: { mode: 'code' } }];
  assert.deepEqual(await savePage(input), { id: 'saved-page' }); assert.deepEqual(calls[0].payload.fields.custom_code, input.customCode);
});
test('embed size and rich-text iframe settings are validated on save', async () => {
  const { input, calls } = fixture({ full: true });
  input.sections = [{ id: null, kind: 'embed', label: 'Big code', html: 'x'.repeat(100_001), options: { mode: 'code' } }];
  assert.match((await savePage(input)).error, /100 KB/);
  input.sections = [{ id: null, kind: 'rich_text', label: 'Text', html: '<div data-fxem-embed="iframe" data-options=\'{"src":"http://example.com","title":"Chart"}\'></div>' }];
  assert.match((await savePage(input)).error, /https/); assert.equal(calls.length, 0);
});

test('encoded rich-text scripts cannot bypass permissions and Unicode embeds use a byte limit', async () => {
  const { encodeEmbedCode } = await import('../src/lib/admin/embeds.mjs');
  let { input, calls } = fixture();
  input.sections = [{ id: null, kind: 'rich_text', label: 'Encoded script', html: `<div data-fxem-embed="code" data-options='{"mode":"code"}' data-code="${encodeEmbedCode('<script>bad()</script>')}"></div>` }];
  assert.match((await savePage(input)).error, /Only full admins/); assert.equal(calls.length, 0);
  ({ input } = fixture({ full: true }));
  input.sections = [{ id: null, kind: 'embed', label: 'Large Unicode', html: 'ع'.repeat(50_001), options: { mode: 'code' } }];
  assert.match((await savePage(input)).error, /100 KB/);
});
