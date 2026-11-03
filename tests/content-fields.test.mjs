import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { routes, snapshot } from '../src/lib/site/snapshots.mjs';
import { splitContent } from '../src/lib/site/sections.mjs';
import { scriptSignature } from '../src/lib/admin/embeds.mjs';
import { sameMarkup } from '../src/lib/site/chrome.mjs';
import { collectFields, parseSection } from '../src/lib/admin/content-fields.mjs';
const { document } = new JSDOM('').window;

test('all 324 imported sections round-trip through the editor DOM without changing markup', () => {
  let count = 0;
  for (const route of routes()) {
    for (const { html } of splitContent(snapshot(route.slug).content).sections) {
      const template = parseSection(document, html);
      const fields = collectFields(template.content);
      assert.deepEqual(scriptSignature(template.innerHTML), scriptSignature(html), `/${route.slug}: executable content remains unchanged`);
      assert.ok(sameMarkup(html, template.innerHTML), `/${route.slug} section ${count}`);
      // Opening editors never writes their normalized output back to the section.
      assert.ok(fields.every(f => f.node)); count++;
    }
  }
  assert.equal(count, 324);
});
test('inline blocks keep their outer attributes; unsupported markup and links use plain text fields', () => {
  const template = parseSection(document, '<p id="theme" class="col" style="color:red">Hello <span class="accent" style="color:blue"><strong>world</strong></span></p><a href="/">Button</a><p>Other <code>code</code></p>');
  const fields = collectFields(template.content);
  const rich = fields.find(f => f.kind === 'inline');
  assert.equal(rich.node.id, 'theme');
  rich.node.innerHTML = 'Edited <em>text</em>';
  assert.equal(rich.node.getAttribute('style'), 'color:red'); assert.equal(rich.node.className, 'col');
  assert.ok(fields.some(f => f.kind === 'link')); assert.ok(fields.some(f => f.kind === 'text' && f.node.nodeValue === 'Button'));
  assert.equal(fields.filter(f => f.kind === 'inline').length, 1);
});
test('script and iframe content stays inert and outside editable fields', () => {
  const template = parseSection(document, '<script>globalThis.executed = true</script><iframe srcdoc="<script>bad()</script>"></iframe><p>Safe</p>');
  assert.equal(collectFields(template.content).length, 1);
  assert.equal(globalThis.executed, undefined);
});
