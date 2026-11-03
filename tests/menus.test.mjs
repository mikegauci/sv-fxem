import test from 'node:test';
import assert from 'node:assert/strict';
import { markCurrent, renderMobile, renderNav } from '../src/lib/site/menus.mjs';
const item = (id, label, url, mobile, extra = {}) => ({ id, label, url, position: 0, parent_id: null, options: { kind: 'item', mobile, ...extra } });
test('the mobile menu keeps its own order and nesting', () => {
  const li = n => [['id', `menu-item-${n}`], ['class', `menu-item menu-item-object-page menu-item-${n}`]];
  const a = [['href', ''], ['class', 'menu-link']];
  const items = [
    item('p', 'Platforms', '/trading-platforms/', { parent: null, position: 0, li: li(1), a, toggle: '<button></button>', sub: [['class', 'sub-menu']] }),
    item('b', 'Android', '/mt4-for-android/', { parent: 'p', position: 0, li: li(3), a }),
    item('a', 'iOS & iPad', '/mt4-for-ios/', { parent: 'p', position: 1, li: li(2), a }),
  ];
  const html = renderMobile(items);
  assert.ok(html.indexOf('Android') < html.indexOf('iOS'));
  assert.match(html, /iOS &amp; iPad/);
  assert.match(html, /<button><\/button><ul class="sub-menu">/);
});
test('current page classes follow WordPress, and external links are never current', () => {
  const nav = [
    { id: 'n', label: 'News', url: '/news/', position: 0, parent_id: null, options: { kind: 'item', nav: { li: [['id', 'menu-item-1'], ['class', 'menu-item menu-item-type-post_type menu-item-object-page menu-item-1']], a: [['href', ''], ['class', 'menu-link']] } } },
    { id: 'x', label: 'Login', url: 'https://login.fxem.com/', position: 1, parent_id: null, options: { kind: 'item', nav: { li: [['id', 'menu-item-2'], ['class', 'menu-item menu-item-type-custom menu-item-object-custom menu-item-2']], a: [['href', ''], ['class', 'menu-link']] } } },
  ];
  const html = markCurrent(`<ul>${renderNav(nav)}</ul>`, '/news/', 99);
  assert.match(html, /menu-item-object-page current-menu-item page_item page-item-99 current_page_item menu-item-1/);
  assert.match(html, /href="\/news\/" aria-current="page"/);
  assert.equal(markCurrent(`<ul>${renderNav(nav)}</ul>`, '/', 1).includes('current'), false);
});
