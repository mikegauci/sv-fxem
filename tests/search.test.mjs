import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanQuery, searchPages, searchPath } from '../src/lib/search/query.mjs';
const index = [
 {url:'/products/',title:'Products',text:'Forex and metals',language:'en'},
 {url:'/forex-seminars/',title:'Forex Seminars',text:'Education resources',language:'en'},
 {url:'/ar/products/',title:'Products',text:'تداول العملات والأسواق',language:'ar'},
];
test('localized search links retain and safely encode the query',()=>{
 assert.equal(searchPath('ar','forex & metals'),'/ar/search/?s=forex%20%26%20metals');
 assert.ok(!searchPath('en','"<miketest>').includes('"'));assert.ok(!searchPath('en','<miketest>').includes('<'));
});
test('search ranks matching titles ahead of body-only matches',()=>{
 assert.deepEqual(searchPages(index,'forex','en').results.map(p=>p.url),['/forex-seminars/','/products/']);
});
test('search stays within the selected language and normalizes Arabic marks',()=>{
 assert.equal(searchPages(index,'اَلْأَسْوَاق','ar').results[0].url,'/ar/products/');
 assert.equal(searchPages(index,'forex','ar').total,0);
});
test('multiple terms must all match and empty input returns no listing',()=>{
 assert.equal(searchPages(index,'forex metals','en').total,1);
 assert.equal(searchPages(index,'forex unavailable','en').total,0);
 assert.equal(searchPages(index,'  ','en').total,0);
});
test('search query input is bounded and control characters are normalized',()=>{
 assert.equal(cleanQuery('a\n\tb'),'a b');assert.equal(cleanQuery('x'.repeat(500)).length,160);
 assert.equal(cleanQuery('<miketest>'),'<miketest>'); // Rendering escapes text, never set:html.
});
test('pagination is bounded and keeps result order',()=>{
 const rows=Array.from({length:25},(_,i)=>({url:`/page-${i}/`,title:'Example',text:'',language:'en'}));
 const second=searchPages(rows,'example','en',2);assert.equal(second.results.length,10);assert.equal(second.results[0].url,'/page-10/');assert.equal(second.pageCount,3);
 assert.equal(searchPages(rows,'example','en',999).page,3);assert.equal(searchPages(rows,'example','en',-1).page,1);assert.equal(searchPages(rows,'example','en','invalid').page,1);
});
