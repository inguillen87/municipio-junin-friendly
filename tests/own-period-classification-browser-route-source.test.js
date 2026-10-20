// Evaluate only the real route expression as source data; never import the
// browser module, runner, SQL adapter, factory or launch a browser.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../scripts/lib/own-period-classification-browser.mjs',import.meta.url),'utf8');
const matches=[...source.matchAll(/^\s*const kind=([^;\n]+);\s*$/gm)];
assert.equal(matches.length,1,'one actual classification browser dispatcher is required');
const dispatch=new Function('url','return ('+matches[0][1]+');');

test('classification browser forwards the actual complete native roster v2 request to its directory handler',()=>{
 const readiness=fs.readFileSync(new URL('../assets/own-payroll-readiness-model.js',import.meta.url),'utf8');
 assert.ok(readiness.includes("export const OWN_PAYROLL_READINESS_ROSTER_URL='/api/internal-data?'+new URLSearchParams({resource:'nativeroster',schema:'2',...OWN_PAYROLL_READINESS_FILTERS});"),'the canonical picker request contract must stay explicit');
 const url=new URL('/api/internal-data?'+new URLSearchParams({resource:'nativeroster',schema:'2',search:'',status:'all',jurisdiction:'',organization:'',sector:'',agreement:''}),'http://fixture.invalid'),before=url.href;
 assert.equal(dispatch(url),'directory','the complete roster request must not fall into the synthetic dashboard fallback');
 assert.equal(url.href,before,'routing does not edit the whole query or its filters');
 assert.equal(dispatch(new URL('/api/internal-data?resource=employees&view=novelty-selector','http://fixture.invalid')),'directory');
});

test('classification routing keeps the existing handler and excludes unknown roster versions and other APIs',()=>{
 assert.equal(dispatch(new URL('/api/internal-own-period-classification?resource=bootstrap','http://fixture.invalid')),'classification');
 for(const raw of ['/api/internal-data?resource=nativeroster','/api/internal-data?resource=nativeroster&schema=1','/api/internal-data?resource=nativeroster&schema=3','/api/internal-data?resource=unknown&schema=2','/api/unrelated?resource=nativeroster&schema=2','/api/internal-auth'])assert.equal(dispatch(new URL(raw,'http://fixture.invalid')),null,raw);
 assert.ok(source.includes("await handlers[kind]({method:req.method(),url:url.pathname+url.search,query:Object.fromEntries(url.searchParams),headers:req.headers(),body:req.postData()}"),'the real handler still receives the original method, URL, complete query, headers and body');
 assert.ok(source.indexOf('if(kind){')<source.indexOf("if(url.pathname==='/api/internal-data')return route.fulfill("),'the real directory handler must precede the unrelated dashboard fixture fallback');
});
