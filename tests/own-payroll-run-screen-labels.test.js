import test from 'node:test';
import assert from 'node:assert/strict';
import {capture,saved} from './fixtures/own-payroll-run-synthetic.js';
import {detail} from './fixtures/own-payroll-liquidation-synthetic.js';
import {namespaceCapture,seal} from './fixtures/own-payroll-screen-labels-synthetic.js';
import {formatOwnRunValue,ownRunConceptLabels,ownRunWorkspaceRows,ownRunWorkspaceCsv,verifiedWorkspaceCapture} from '../assets/own-payroll-run-workspace-model.js';
import {ownLiquidationIndividual} from '../assets/own-payroll-liquidation-model.js';
const full=()=>{const c=capture();c.saved=saved(c);return c;};
const catalog=c=>c.payload.programState.salaryCatalog.items;
const firstRow=c=>c.saved.result.rows[0];
const definitionFor=(c,row=firstRow(c))=>catalog(c).find(d=>d.kind==='concept'&&d.agreementCode===row.agreementCode&&d.code===row.conceptCode);
const labelFor=(c,row=firstRow(c))=>ownRunWorkspaceRows(c).labelOf(row);


test('screen values use every admitted numeric unit without changing decimal precision',()=>{
 for(const [unit,label]of [['hours','Horas'],['minutes','Minutos'],['days','Días'],['percent','Porcentaje'],['units','Unidades'],['coefficient','Coeficiente']])assert.equal(formatOwnRunValue('7.50',unit),'7,50 · '+label);
 assert.equal(formatOwnRunValue('1234.50','money'),'$ 1.234,50');
 assert.equal(formatOwnRunValue('9007199254740993.00000001','days'),'9.007.199.254.740.993,00000001 · Días');
 for(const unit of ['ratio','code','boolean','toString',null,undefined,{}])assert.throws(()=>formatOwnRunValue('1',unit),/unidad sin verificar/);
 assert.throws(()=>formatOwnRunValue('1e2','days'),/importe sin verificar/);
});

test('labels use the entire captured catalogue and do not mutate rows, filtering, pagination or CSV',()=>{
 const c=full(),before=structuredClone(c),csv=ownRunWorkspaceCsv(c),all=ownRunConceptLabels(c),view=ownRunWorkspaceRows(c,'1001',2,2);
 assert.equal(all.size,c.saved.result.rowCount);assert.equal(view.total,12);assert.equal(view.filtered,6);assert.equal(view.page,2);assert.equal(view.pages,3);
 assert.deepEqual(view.rows,c.saved.result.rows.filter(r=>r.employeeNumber==='1001').slice(2,4));
 assert.ok(view.rows.every(r=>view.labelOf(r)==='Concepto inventado QA'));
 assert.deepEqual(c,before);assert.equal(ownRunWorkspaceCsv(c),csv);
 assert.equal(view.labelOf({...firstRow(c),contractId:'00000000-0000-4000-8000-000000000000'}),null);
});

test('missing, inactive, future, expired, malformed or blank captured descriptions remain explicitly absent',()=>{
 const changes=[
  (c,d)=>{c.payload.programState.salaryCatalog.items=catalog(c).filter(r=>r!==d);},
  (_c,d)=>{d.active=false;},(_c,d)=>{d.active='yes';},(_c,d)=>{d.validFrom='2026-11';},
  (_c,d)=>{d.validFrom='2026-01';d.validUntil='2026-09';},(_c,d)=>{d.validUntil='2026-00';},
  (_c,d)=>{d.validFrom='2026-13';},(_c,d)=>{delete d.validUntil;},(_c,d)=>{d.label='   ';},(_c,d)=>{d.label=null;},
  (c)=>{c.payload.programState.salaryCatalog.items=null;}
 ];
 for(const change of changes){const c=full();change(c,definitionFor(c));assert.equal(labelFor(c),null);}
 const inclusive=full();definitionFor(inclusive).validUntil='2026-10';assert.equal(labelFor(inclusive),'Concepto inventado QA');
});

test('two or three simultaneous descriptions are ambiguous; unrelated agreements and ineligible rows cannot win',()=>{
 for(const count of [2,3]){const c=full(),d=definitionFor(c);for(let n=1;n<count;n++)catalog(c).push({...d,label:'Descripción ambigua '+n});assert.equal(labelFor(c),null);}
 const c=full(),d=definitionFor(c);d.label='Descripción conservada';
 catalog(c).push({...d,agreementCode:'2',label:'Otro convenio'}, {...d,kind:'scale',categoryCode:'6',label:'Escala ajena'}, {...d,active:false,label:'Inactiva'}, {...d,validFrom:'2026-11',label:'Futura'}, {...d,validFrom:'2026-01',validUntil:'2026-09',label:'Vencida'});
 assert.equal(labelFor(c),'Descripción conservada');
 const wrong=full();definitionFor(wrong).nature='deduction';assert.equal(labelFor(wrong),null);
});

test('v2 separates concept and auxiliary sharing code100; legacy auxiliary remains in its original kind',async()=>{
 const c=namespaceCapture();await verifiedWorkspaceCapture(c);
 const view=ownRunWorkspaceRows(c),pair=view.rows.filter(r=>r.contractId===c.saved.input.employees[0].contractId);
 assert.equal(pair.length,2);assert.equal(pair[0].conceptCode,pair[1].conceptCode);
 assert.equal(view.labelOf(pair.find(r=>r.nature==='auxiliary')),'Días sintéticos conservados');
 assert.equal(view.labelOf(pair.find(r=>r.nature!=='auxiliary')),'Haber sintético conservado');
 const alias={...catalog(c).find(d=>d.kind==='auxiliary'),kind:'concept',label:'Alias legado excluido'};catalog(c).push(alias);
 assert.equal(labelFor(c,pair.find(r=>r.nature!=='auxiliary')),'Haber sintético conservado');
 const old=full(),aux=old.saved.result.rows.find(r=>r.nature==='auxiliary');
 assert.equal(catalog(old).find(d=>d.code===aux.conceptCode).kind,'concept');
 assert.equal(labelFor(old,aux),'Concepto inventado QA');
});

test('historical descriptions are independent of a distinct current catalogue; adulterating the capture still fails its verifier',async()=>{
 const historical=full();definitionFor(historical).label='Descripción histórica conservada';seal(historical);
 const currentCatalogue=structuredClone(historical.payload.programState.salaryCatalog);currentCatalogue.items.find(d=>d.code===firstRow(historical).conceptCode).label='Descripción actual distinta';
 const fetchDescriptor=Object.getOwnPropertyDescriptor(globalThis,'fetch');let requests=0;
 Object.defineProperty(globalThis,'fetch',{configurable:true,writable:true,value:()=>{requests++;throw Error('Current catalogue must not be requested');}});
 try{await verifiedWorkspaceCapture(historical);assert.equal(labelFor(historical),'Descripción histórica conservada');currentCatalogue.items.length=0;assert.equal(labelFor(historical),'Descripción histórica conservada');assert.equal(requests,0);}
 finally{if(fetchDescriptor)Object.defineProperty(globalThis,'fetch',fetchDescriptor);else delete globalThis.fetch;}
 const changed=structuredClone(historical);definitionFor(changed).label='Adulterada sin nuevo digest';
 // Structural projection is not a substitute for this mandatory UI boundary.
 await assert.rejects(verifiedWorkspaceCapture(changed),/integridad/);
});

test('individual descriptions stay aligned with the original filtered row order and never trim full legajo detail',()=>{
 const d=detail(6),id=d.employees.at(-1).contractId;
 for(const item of catalog(d.capture))item.label='Descripción conservada '+item.code;
 d.capture.saved.result.rows.reverse();seal(d.capture);const before=structuredClone(d);
 ownRunWorkspaceRows(d.capture,'1001',2,2);
 const summary=ownLiquidationIndividual(d,id),expected=d.capture.saved.result.rows.filter(r=>r.contractId===id);
 assert.deepEqual(summary.rows,expected);assert.equal(summary.labels.length,6);
 assert.deepEqual(summary.labels,expected.map(r=>'Descripción conservada '+r.conceptCode));assert.deepEqual(d,before);
 summary.labels[0]='Editada sólo en la vista';assert.deepEqual(d,before);
 const missing=definitionFor(d.capture,expected[1]);d.capture.payload.programState.salaryCatalog.items=catalog(d.capture).filter(v=>v!==missing);
 assert.equal(ownLiquidationIndividual(d,id).labels[1],null);
});
