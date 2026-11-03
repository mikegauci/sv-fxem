import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLinkFields, checkItem, newColumn, newLink, newRow, nextNumber, setDropdown, syncMobile } from '../src/lib/admin/menu-items.mjs';
import { markCurrent, renderMega, renderMobile, renderNav } from '../src/lib/site/menus.mjs';
const toggle = '<button class="ast-menu-toggle" aria-expanded="false"><span class="screen-reader-text">Menu Toggle</span><span class="ast-icon icon-arrow"></span></button>';
test('a new top-level link renders like the theme in both menus', () => {
  const link = newLink({ id: 'a', number: 900001, label: 'Promotions & offers', url: '/promotions/', placement: 'top' });
  assert.equal(renderMega([link]), '<li class="mega-menu-item mega-menu-item-type-custom mega-menu-item-object-custom mega-align-bottom-left mega-menu-flyout mega-menu-item-900001" id="mega-menu-item-900001"><a class="mega-menu-link" href="/promotions/" tabindex="0">Promotions &amp; offers</a></li>');
  assert.equal(renderMobile([link]), '<li id="menu-item-900001" class="menu-item menu-item-type-custom menu-item-object-custom menu-item-900001"><a href="/promotions/" class="menu-link">Promotions &amp; offers</a></li>');
  assert.match(markCurrent(`<ul>${renderMobile([link])}</ul>`, '/promotions/', null), /menu-item-object-custom current-menu-item menu-item-900001/);
});
test('adding a dropdown builds a grid with a row, a column and links, and mobile lists them', () => {
  let top = newLink({ id: 't', number: 900010, label: 'Tools', url: '#', placement: 'top' });
  top = setDropdown(top, true, toggle);
  const row = newRow({ id: 'r', parent: 't', wpNumber: 900010, index: 0 });
  const col = newColumn({ id: 'c', parent: 'r', wpNumber: 900010, rowIndex: 0, index: 0, span: 6 });
  const a = { ...newLink({ id: 'l1', number: 900011, label: 'Calendar', url: '/economic-calendar/', placement: 'column' }), parent_id: 'c', position: 0 };
  const b = { ...newLink({ id: 'l2', number: 900012, label: 'Calculators', url: '/forex-calculators/', placement: 'column' }), parent_id: 'c', position: 1 };
  const items = syncMobile([top, row, col, a, b]);
  const mega = renderMega(items);
  assert.match(mega, /mega-menu-item-has-children mega-menu-megamenu mega-align-bottom-left mega-menu-grid mega-menu-item-900010/);
  assert.match(mega, /aria-haspopup="true" aria-expanded="false" tabindex="0">Tools<span class="mega-indicator"><\/span><\/a><ul class="mega-sub-menu"><li class="mega-menu-row" id="mega-menu-900010-0">/);
  assert.match(mega, /mega-menu-columns-6-of-12/);
  const mobile = renderMobile(items);
  assert.ok(mobile.indexOf('Calendar') < mobile.indexOf('Calculators'));
  assert.match(mobile, /menu-item-has-children menu-item-900010"><a href="#" class="menu-link">Tools<\/a><button/);
  const back = setDropdown(top, false);
  assert.equal(renderMega([back]), renderMega([newLink({ id: 't', number: 900010, label: 'Tools', url: '#', placement: 'top' })]));
});
test('editing fields updates every rendering; validation catches unsafe links', () => {
  const link = applyLinkFields({ ...newLink({ id: 'n', number: nextNumber([{ wp_id: 26620 }]), label: 'News', url: '/news/', placement: 'nav' }), url: 'https://www.cnbc.com/', open_in_new_tab: true });
  assert.equal(renderNav([link]), '<li id="menu-item-900001" class="menu-item menu-item-type-custom menu-item-object-custom menu-item-900001"><a href="https://www.cnbc.com/" class="menu-link" target="_blank" rel="noopener">News</a></li>');
  assert.ok(checkItem({ ...link, url: 'javascript:alert(1)' }));
  assert.ok(checkItem({ ...link, label: ' ' }));
  assert.equal(checkItem(link), null);
});
