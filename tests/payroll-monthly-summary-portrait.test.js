import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlySummaryData,monthlySummaryFilter} from '../assets/payroll-monthly-summary-model.js';
import {monthlySummaryPdf} from '../assets/payroll-monthly-summary-export.js';
import {monthlyFixture} from './fixtures/payroll-monthly-summary-synthetic.js';
const when='2026-10-28T23:28:33.897Z';
function report(count=100){const p=monthlyFixture(count);for(const [i,r]of p.data.rows.entries()){r.description='ASIGNACIÓN REMUNERATIVA '+String(i+1).padStart(4,'0');r.quantity='22634.00';r.amount='341788349.13';r.missingAmounts=0;r.missingQuantities=0;}const d=monthlySummaryData(p,{resource:'summary',period:'2026-08',datasetIds:p.data.sources.map(s=>s.datasetId)});return {d,raw:new TextDecoder().decode(monthlySummaryPdf(d,monthlySummaryFilter(d),when))};}
function texts(raw){return [...raw.matchAll(/<([0-9a-f]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').toString('latin1'));}
test('monthly PDF is portrait, packs a hundred concepts without dropping rows or exact source/control values',()=>{const {d,raw}=report();assert.doesNotMatch(raw,/\/MediaBox \[0 0 842 595\]/);assert.match(raw,/\/MediaBox \[0 0 595 842\]/);const pages=Number(/\/Type \/Pages[^]*?\/Count (\d+)/.exec(raw)[1]);assert.ok(pages<=6,'100 ordinary concepts and complete custody fit in at most six A4 portrait pages');const content=texts(raw).join(' ');for(const row of d.rows)assert.ok(content.includes(row.description),'missing concept '+row.code);assert.equal(texts(raw).filter(x=>x==='341.788.349,13').length,100);for(const source of d.sources)for(const v of[source.datasetId,source.sourceSha256,source.payloadHash,source.importedAt])assert.ok(content.replace(/\s/g,'').includes(v.replace(/\s/g,'')));assert.ok(content.includes('Un concepto ausente no equivale a cero.'));assert.ok(content.includes('No se suman conceptos entre sí'));});import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
test('portrait PDF retains maximum-length concepts and source labels inside page margins at the full 1000-concept limit',async()=>{
  const p=monthlyFixture(1000);
  for(const row of p.data.rows){row.description='W'.repeat(240);}
  for(const source of p.data.sources)source.sourceLabel='W'.repeat(240);
  const d=monthlySummaryData(p,{resource:'summary',period:'2026-08',datasetIds:p.data.sources.map(s=>s.datasetId)});
  const loading=getDocument({data:monthlySummaryPdf(d,monthlySummaryFilter(d),when),useSystemFonts:true});
  const pdf=await loading.promise;let codeRows=0;
  try{for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);assert.deepEqual(page.view,[0,0,595,842]);
    const content=await page.getTextContent({disableNormalization:true});
    for(const item of content.items.filter(item=>item.str?.trim())){
      const [,,,,x,y]=item.transform;
      assert.ok(x>=31&&x+item.width<=564,'text outside portrait margin: '+item.str);
      if(y>30&&y<760)assert.ok(y>=54,'body overlaps footer: '+item.str);
      if(/^\d{3,4} \u00b7(?: |$)/.test(item.str))codeRows++;
    }
  }assert.equal(codeRows,1000);}finally{await loading.destroy();}
});
