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
function firstSourceBoundaryFixture(count=28){
  const p=monthlyFixture(count);
  for(const [index,row]of p.data.rows.entries()){
    row.description='Concepto breve '+String(index+1).padStart(4,'0');
    row.quantity='2.00';row.amount='3456.78';row.missingAmounts=0;row.missingQuantities=0;
  }
  p.data.sources[0].sourceLabel='W'.repeat(240);
  return monthlySummaryData(p,{resource:'summary',period:'2026-08',datasetIds:p.data.sources.map(s=>s.datasetId)});
}
async function parsedPageTexts(bytes){
  const loading=getDocument({data:bytes,useSystemFonts:true});
  try{
    const pdf=await loading.promise,pages=[];
    for(let number=1;number<=pdf.numPages;number++){
      const page=await pdf.getPage(number),content=await page.getTextContent({disableNormalization:true});
      pages.push(content.items.filter(item=>typeof item.str==='string').map(item=>item.str).join(' '));
    }
    return pages;
  }finally{await loading.destroy();}
}
test('a source section keeps its headings with the complete first source row at the compact-concept page boundary',async()=>{
  const d=firstSourceBoundaryFixture(),bytes=monthlySummaryPdf(d,monthlySummaryFilter(d),when);
  const raw=new TextDecoder().decode(bytes),rendered=texts(raw),pages=await parsedPageTexts(bytes);
  const headingPage=pages.findIndex(page=>page.includes('Corrida y origen'));
  const firstSourcePage=pages.findIndex(page=>page.includes(d.sources[0].datasetId));
  assert.ok(headingPage>=0,'source column headings are present');
  assert.equal(headingPage,firstSourcePage,'the first source headings must not be stranded on the preceding concept page');
  assert.equal(pages.filter(page=>page.includes('Corrida y origen')).length,1,'the two complete source rows fit together without an orphan heading page');
  const content=rendered.join(' '),compact=content.replace(/\s/g,'');
  for(const row of d.rows)assert.ok(content.includes(row.description),'missing concept '+row.code);
  assert.equal(rendered.filter(value=>value==='3.456,78').length,28,'every original amount is preserved once');
  for(const source of d.sources)for(const value of[source.datasetId,source.sourceLabel,source.sourceSha256,source.payloadHash,source.importedAt])assert.ok(compact.includes(value.replace(/\s/g,'')),'missing exact source field');
});
test('a first source cell taller than a page starts with its headings and progresses without dropping text or creating a header-only page',async()=>{
  const base=firstSourceBoundaryFixture(1);
  // Defensive renderer boundary beyond the upstream source-label field limit:
  // this does not change or relax the validated municipal data contract.
  const d={...base,sources:base.sources.map((source,index)=>index?source:{...source,sourceLabel:'W'.repeat(4000)})};
  const bytes=monthlySummaryPdf(d,monthlySummaryFilter(d),when),raw=new TextDecoder().decode(bytes),rendered=texts(raw);
  const pages=await parsedPageTexts(bytes),headingPage=pages.findIndex(page=>page.includes('Corrida y origen'));
  assert.ok(pages.length>2&&pages.length<20,'the oversized first row is split into a finite, bounded document');
  assert.equal(headingPage,pages.findIndex(page=>page.includes(d.sources[0].datasetId)),'the first row begins on the same page as its section headings');
  assert.equal(rendered.reduce((total,value)=>total+(value.match(/W/g)||[]).length,0),4000,'every wide source character survives the row continuation');
  assert.equal(rendered.filter(value=>value==='3.456,78').length,1,'the original concept amount is preserved once');
  const compact=rendered.join('').replace(/\s/g,'');
  for(const source of d.sources)for(const value of[source.datasetId,source.sourceSha256,source.payloadHash,source.importedAt])assert.ok(compact.includes(value.replace(/\s/g,'')),'missing exact source field');
});
