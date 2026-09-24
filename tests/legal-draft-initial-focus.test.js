import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/islands/legal-registry-entry.tsx',import.meta.url),'utf8');
test('new legal drafts do not schedule an asynchronous focus that can steal number entry',()=>{
 const start=source.indexOf(' const begin='),end=source.indexOf('\n const cancel=',start);assert.ok(start>=0&&end>start);const begin=source.slice(start,end);
 assert.doesNotMatch(begin,/setTimeout|requestAnimationFrame/);assert.match(begin,/setDraft\(nextDraft\)/);assert.match(begin,/if\(!boot\?\.canRegister\|\|busy\|\|blocked\)return/);
});
test('legal editor initial focus runs only on opening, not on every field update',()=>{
 assert.match(source,/const draftOpen=draft!==null/);assert.match(source,/useLayoutEffect\(\(\)=>\{if\(draftOpen\).*input\[name="title"\].*\},\[draftOpen\]\)/);
 assert.match(source,/const update=.*setDraft\(d=>d\?/);assert.doesNotMatch(source,/useLayoutEffect\([^\n]*\},\[draft\]\)/);
});
test('focus regression exercises repeated quick first-field entry without modifying a municipal record',()=>{
 const qa=fs.readFileSync(new URL('../scripts/verify-legal-registry-browser.mjs',import.meta.url),'utf8');assert.match(qa,/pressSequentially\(value,\{delay:8\}\)/);assert.match(qa,/assert\.equal\(await number\.inputValue\(\),value\)/);assert.match(qa,/four fresh drafts without saving anything/);
});
