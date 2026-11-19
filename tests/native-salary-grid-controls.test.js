import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/islands/NativeSalaryCatalog.jsx',import.meta.url),'utf8');
const css=source.match(/const css=`([^`]+)`;/)?.[1]??'';
const rule=(text,selector)=>{const at=text.indexOf(selector+'{');return at<0?null:text.slice(at+selector.length+1,text.indexOf('}',at));};
const minHeight=body=>Number(body?.match(/(?:^|;)min-height:(\d+)px/)?.[1]);

// Behaviour is exercised end to end by scripts/verify-municipal-owner-salary.mjs (real component, real SQL, 1366/390/320):
// every visible button of the master is at least 44px high and the page never scrolls sideways. These guards keep the
// grid's own styles from drifting below that contract in a change that never runs the browser verifier.
test('los encabezados para ordenar y los botones de exportación del maestro conservan el mínimo táctil de 44px',()=>{
 assert.ok(css.length>1000,'the component keeps its own stylesheet');
 assert.ok(minHeight(rule(css,'.sc-workspace button'))>=44,'base de todos los botones del maestro');
 for(const selector of['.sc-grid .sc-sort','.sc-filters .sc-export button'])assert.ok(minHeight(rule(css,selector))>=44,selector+' declara al menos 44px');
});

test('en pantallas angostas los filtros del maestro quedan en una sola columna y no ensanchan la página',()=>{
 const desktop=css.slice(0,css.indexOf('@media(max-width:700px){')),narrow=css.slice(css.indexOf('@media(max-width:700px){'));
 assert.ok(desktop.length>0&&narrow.startsWith('@media(max-width:700px){'),'the narrow rules come last, so they win the cascade');
 // On wide screens the count and the export buttons span fixed columns of the four-column filter bar.
 assert.equal(rule(desktop,'.sc-filters .sc-count'),'grid-column:1/3');assert.equal(rule(desktop,'.sc-filters .sc-export'),'grid-column:3/5');
 // Those spans must be released on narrow screens: kept, they recreate four implicit columns beside the single declared one
 // and the selects and export buttons spill out of the card (the document measured 644px wide at 320px and 390px).
 assert.equal(rule(narrow,'.sc-filters'),'grid-template-columns:minmax(0,1fr)');
 assert.equal(rule(narrow,'.sc-filters .sc-count,.sc-filters .sc-export'),'grid-column:auto');
});
