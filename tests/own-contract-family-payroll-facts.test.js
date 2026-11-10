import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {FAMILY_PAYROLL_FACTS_VERSION,FAMILY_PAYROLL_FACT_QUANTITIES,familyPayrollFactsDefinition,familyPayrollFactsItems,familyPayrollFactsBootstrap,familyPayrollFactsCommand,familyPayrollFactsCapture,prepareFamilyPayrollFacts,decideFamilyPayrollFacts} from '../assets/own-contract-family-payroll-facts-model.js';
import {FAMILY_FACT_FIELDS,FAMILY_FACTS_CSV_HEADER,familyFactsDraft,familyFactsView,familyFactsTotals,familyFactsCsv,familyFactsFile,familyFactsComparison,familyFactsPreparationFile} from '../assets/own-contract-family-payroll-facts-workspace.js';
import {syntheticFamilyBootstrap as boot,syntheticFamilyItems as items,syntheticFamilyDefinition as definition,syntheticFamilyDetail as detail,familyReason as reason,familyId,familyHash} from './fixtures/own-contract-family-payroll-facts-synthetic.js';

const withQuantity=(key,value)=>{const d=definition();d.quantities[key]=value;return d;};

test('the contract names the thirteen GRH quantities once each and keeps tariffs out of the per-contract facts',()=>{
 assert.equal(FAMILY_PAYROLL_FACTS_VERSION,'own-contract-family-payroll-facts.v1');
 assert.deepEqual(FAMILY_FACT_FIELDS.map(f=>f.key),[...FAMILY_PAYROLL_FACT_QUANTITIES]);
 assert.deepEqual(FAMILY_FACT_FIELDS.map(f=>f.variable),['L60','L61','L62','L63','L64','L65','L66','L67','L68','L69','L70','L75']);
 assert.equal(new Set(FAMILY_FACTS_CSV_HEADER).size,FAMILY_FACTS_CSV_HEADER.length);
 assert.deepEqual(Object.keys(definition()).sort(),['asOfDate','documentReference','prenatalAdjustmentMonths','quantities','tariffSelection']);
 assert.ok(!JSON.stringify(definition()).match(/amount|tariff"|importe/i),'los importes de tarifa no son un hecho del legajo');
});

test('not reported, declared zero and a declared quantity are three different facts',()=>{
 for(const value of [null,'0','1','12','99'])assert.equal(familyPayrollFactsDefinition(withQuantity('children',value),'2026-10').quantities.children,value);
 for(const value of [0,1,'','00','01','100','-1','1.0','1e1',' 1',true,undefined])assert.throws(()=>familyPayrollFactsDefinition(withQuantity('children',value),'2026-10'),/sin informar no equivale a cero/);
});

test('prenatal adjustment months, region and semester average are declared, exact and optional',()=>{
 const ok=(patch)=>{const d={...definition(),...patch};return familyPayrollFactsDefinition(d,'2026-10');};
 for(const m of [null,'0','3','24'])assert.equal(ok({prenatalAdjustmentMonths:m}).prenatalAdjustmentMonths,m);
 for(const m of ['25','03',3,'1.5'])assert.throws(()=>ok({prenatalAdjustmentMonths:m}),/ajuste prenatal/);
 for(const t of [{region:null,semesterAverage:null},{region:'1',semesterAverage:'0'},{region:'004',semesterAverage:'1234567.89'},{region:null,semesterAverage:'850000.5'}])assert.deepEqual(ok({tariffSelection:t}).tariffSelection,t);
 for(const t of [{region:'A',semesterAverage:null},{region:null,semesterAverage:850000},{region:null,semesterAverage:'850000.123'},{region:null,semesterAverage:'1e6'},{region:null,semesterAverage:'-1'},{region:null},{region:null,semesterAverage:null,bracket:'1'}])assert.throws(()=>ok({tariffSelection:t}),/promedio semestral/);
});

test('a definition with a missing, extra or renamed quantity is rejected whole',()=>{
 const missing=definition();delete missing.quantities.dependants;assert.throws(()=>familyPayrollFactsDefinition(missing,'2026-10'));
 const extra=definition();extra.quantities.grandchildren=null;assert.throws(()=>familyPayrollFactsDefinition(extra,'2026-10'));
 const amount=definition();amount.spouseAmount='1000';assert.throws(()=>familyPayrollFactsDefinition(amount,'2026-10'));
 assert.throws(()=>familyPayrollFactsDefinition({...definition(),asOfDate:'2026-11-01'},'2026-10'),/constancia municipal/);
 assert.throws(()=>familyPayrollFactsDefinition({...definition(),documentReference:'x'},'2026-10'),/constancia municipal/);
});

test('the complete set keeps order, identities and the 10.000-row ceiling of the other approved facts',()=>{
 assert.equal(familyPayrollFactsItems(items(855),'2026-10').length,855);
 const repeated=items(2);repeated[1].contractId=repeated[0].contractId;assert.throws(()=>familyPayrollFactsItems(repeated,'2026-10'),/sin duplicados/);
 assert.throws(()=>familyPayrollFactsItems(items(2).reverse(),'2026-10'),/ordenadas/);
 assert.throws(()=>familyPayrollFactsItems([],'2026-10',{empty:false}));
 assert.equal(familyPayrollFactsBootstrap(boot(3)).source.subjects.length,3);
 assert.throws(()=>familyPayrollFactsBootstrap({...boot(1),version:'own-contract-salary-conditions.v1'}));
});

test('preparing keeps a proposal for another person and an unchanged set is not a proposal',async()=>{
 const b=boot(2),d=items(2);d[1].definition.quantities.children='2';
 const command=prepareFamilyPayrollFacts(b,d,reason);
 assert.equal(command.command,'propose');assert.equal(command.reviewConfirmed,false);assert.equal(command.proposalId,null);assert.deepEqual(command.items,d);assert.notEqual(command.items[1].definition,d[1].definition);
 assert.throws(()=>prepareFamilyPayrollFacts({...b,permissions:{canPropose:false,canReview:false}},d,reason),/no permite preparar/);
 assert.throws(()=>prepareFamilyPayrollFacts(b,d.slice(0,1),reason),/todos los contratos/);
 const approved={...b,configuration:{version:familyHash,revision:1,items:structuredClone(d),proposalId:familyId(9001),approvalId:familyId(9002)}};
 assert.throws(()=>prepareFamilyPayrollFacts(approved,d,reason),/no contiene cambios/);
 const dt=await detail(2),reviewer={...boot(2),permissions:{canPropose:false,canReview:true},proposals:[dt.proposal]};
 const decision=await decideFamilyPayrollFacts(reviewer,dt,'approve','Revisión independiente exclusivamente sintética');
 assert.equal(decision.command,'approve');assert.equal(decision.items,null);assert.equal(decision.reviewConfirmed,true);
 await assert.rejects(decideFamilyPayrollFacts({...reviewer,permissions:{canPropose:true,canReview:false}},dt,'approve','Revisión independiente exclusivamente sintética'),/otra persona/);
 assert.throws(()=>familyPayrollFactsCommand({...command,reviewConfirmed:true}));
});

test('an approved capture never turns an absent declaration into zero',()=>{
 const employees=[{contractId:familyId(1),identityToken:familyHash},{contractId:familyId(2),identityToken:familyHash}];
 const capture={complete:true,version:familyHash,records:[{contractId:familyId(1),identityToken:familyHash,revision:1,definition:withQuantity('spouse','1'),approvalId:familyId(9002)},{contractId:familyId(2),identityToken:familyHash,revision:0,definition:null,approvalId:null}]};
 assert.equal(familyPayrollFactsCapture(capture,employees,'2026-10').records[1].definition,null);
 const invented=structuredClone(capture);invented.records[1].definition=definition();assert.throws(()=>familyPayrollFactsCapture(invented,employees,'2026-10'),/ausencia no equivale a cero/);
 assert.throws(()=>familyPayrollFactsCapture({...capture,records:capture.records.slice(0,1)},employees,'2026-10'),/todo el conjunto/);
});

test('the editable draft starts every contract as not reported, without a date or a constancy',()=>{
 const d=familyFactsDraft(boot(855));assert.equal(d.length,855);
 assert.ok(Object.values(d.at(-1).definition.quantities).every(v=>v===null));assert.equal(d.at(-1).definition.prenatalAdjustmentMonths,null);assert.deepEqual(d.at(-1).definition.tariffSelection,{region:null,semesterAverage:null});assert.equal(d.at(-1).definition.asOfDate,'');assert.equal(d.at(-1).definition.documentReference,'');
 const b=boot(2),approved=items(2);approved[0].definition.quantities.primary='3';b.configuration={version:familyHash,revision:1,items:approved,proposalId:familyId(9001),approvalId:familyId(9002)};
 const next=familyFactsDraft(b);assert.equal(next[0].definition.quantities.primary,'3');assert.notEqual(next[0],approved[0]);
});

test('search and pages never crop the complete set',()=>{
 const b=boot(855),d=items(855),last=familyFactsView(b,d,'QA-855');
 assert.equal(last.total,855);assert.equal(last.filtered,1);assert.equal(last.rows[0].index,854);assert.equal(familyFactsView(b,d,'',35).rows.length,5);assert.equal(familyFactsView(b,d,'',99).page,35);assert.equal(d.length,855);
 assert.throws(()=>familyFactsView(b,d,'',0));assert.throws(()=>familyFactsView(b,d.slice(1)));
});

test('review totals count not reported, zero and declared separately',()=>{
 const d=items(5);d[0].definition.quantities.children='0';d[1].definition.quantities.children='2';d[2].definition.quantities.children='3';d[4].definition.quantities.spouse='1';
 const totals=familyFactsTotals(d),children=totals.find(t=>t.key==='children'),spouse=totals.find(t=>t.key==='spouse'),primary=totals.find(t=>t.key==='primary');
 assert.deepEqual({n:children.notReported,z:children.zero,d:children.declared,u:children.units},{n:2,z:1,d:2,u:5});
 assert.deepEqual({n:spouse.notReported,z:spouse.zero,d:spouse.declared,u:spouse.units},{n:4,z:0,d:1,u:1});
 assert.deepEqual({n:primary.notReported,z:primary.zero,d:primary.declared,u:primary.units},{n:5,z:0,d:0,u:0});
 assert.equal(totals.length,12);assert.equal(children.label,'Hijos');assert.equal(children.variable,'L61');
});

test('the whole planilla round-trips null, zero, quantities, months, region and an exact average',()=>{
 const b=boot(855),d=items(855);Object.assign(d.at(-1).definition,{prenatalAdjustmentMonths:'0',tariffSelection:{region:'004',semesterAverage:'1234567.89'}});d.at(-1).definition.quantities.children='0';d.at(-1).definition.quantities.primaryWithDisability='12';d[0].definition.quantities.spouse='1';
 const csv=familyFactsCsv(b,d);assert.ok(csv.startsWith('﻿"contrato";"identidad";"legajo";"conyuge";"hijos";'));assert.equal(csv.split('\r\n').length,857);
 assert.deepEqual(familyFactsFile(b,csv),d);
});

test('the planilla writes literal cells and refuses anything that is not the complete, ordered template',()=>{
 const b=boot(2),d=items(2);b.source.subjects[0].legajo='=QA';d[0].definition.documentReference='=SUM(1;2) "constancia municipal"';d[1].definition.quantities.children='2';d[1].definition.tariffSelection.semesterAverage='900000.50';
 const csv=familyFactsCsv(b,d);assert.ok(csv.includes('"\'=QA"'));assert.ok(csv.includes('"\'=SUM'));assert.deepEqual(familyFactsFile(b,csv),d);
 const original=structuredClone(d);
 for(const change of [v=>v.split('\r\n').slice(0,-2).join('\r\n')+'\r\n',v=>v.replace('"contrato"','"dni"'),v=>v.replace("'QA-2","'QA-3"),v=>v.replace("'900000.50","'9e5"),v=>v.replace("'900000.50","'900000.505"),v=>v.replace(/"'2";/,'"\'dos";'),v=>v.slice(0,-3),v=>v.replace('"contrato";','"contrato"x;'),v=>v.replace('"constancia"\r\n','"constancia";"extra"\r\n')])assert.throws(()=>familyFactsFile(b,change(csv)));
 assert.deepEqual(d,original);
 assert.throws(()=>familyFactsCsv(b,d.slice(0,1)));const moved=structuredClone(d);moved[1].identityToken='d'.repeat(64);assert.throws(()=>familyFactsCsv(b,moved));
});

test('the comparison lists every changed contract, including the last page and removed identities',()=>{
 const a=items(855),b=structuredClone(a);b.at(-1).definition.quantities.dependants='1';
 const diff=familyFactsComparison(a,b);assert.equal(diff.length,1);assert.equal(diff[0].contractId,a.at(-1).contractId);assert.equal(familyFactsComparison(a,b.slice(0,-1)).at(-1).after,null);assert.equal(familyFactsComparison(a,structuredClone(a)).length,0);
});

test('a preparation emitted from the municipal source is matched by contract and legajo, never by position',()=>{
 const b=boot(3),d=items(3);d[2].definition.quantities.secondary='1';
 const file=(patch={},rows=d.map((r,i)=>({contractId:r.contractId,legajo:b.source.subjects[i].legajo,definition:r.definition})))=>JSON.stringify({version:'own-contract-family-payroll-facts-preparation.v1',nativeDefinitionVersion:'own-contract-family-payroll-facts.v1',period:'2026-10',readyToPost:false,rows,...patch});
 assert.deepEqual(familyFactsPreparationFile(b,file()),d);
 const shuffled=d.map((r,i)=>({contractId:r.contractId,legajo:b.source.subjects[i].legajo,definition:r.definition})).reverse();assert.deepEqual(familyFactsPreparationFile(b,file({},shuffled)),d);
 assert.throws(()=>familyFactsPreparationFile(b,file({period:'2026-09'})),/mismo período/);
 assert.throws(()=>familyFactsPreparationFile(b,file({readyToPost:true})),/admitida/);
 assert.throws(()=>familyFactsPreparationFile(b,file({nativeDefinitionVersion:'own-contract-salary-conditions.v1'})),/admitida/);
 assert.throws(()=>familyFactsPreparationFile(b,file({},shuffled.slice(1))),/Rehacé la preparación/);
 const wrong=structuredClone(shuffled);wrong[0].legajo='QA-9';assert.throws(()=>familyFactsPreparationFile(b,file({},wrong)),/no coincide/);
 assert.throws(()=>familyFactsPreparationFile(b,'{'),/JSON válido/);
});

// Guarda de estado: mientras sea una propuesta de contrato sin backend, no llega a ninguna pantalla. Al conectar la
// API y la tarea de Liquidaciones, esta prueba se reemplaza por las de la pantalla.
test('the proposal stays unwired: no screen, route or build entry ships it before its backend exists',()=>{
 const build=fs.readFileSync('scripts/build-friendly.mjs','utf8'),page=fs.readFileSync('nomina-control.html','utf8'),navigation=fs.readFileSync('assets/payroll-navigation.js','utf8');
 for(const source of [build,page,navigation])assert.ok(!source.includes('own-contract-family-payroll-facts'));
 assert.ok(!fs.existsSync('api/internal-own-contract-family-payroll-facts.js'));
});

test('the proposed screen keeps an empty box as not reported and folds people ten per page',()=>{
 const panel=fs.readFileSync('assets/own-contract-family-payroll-facts-panel.js','utf8'),css=fs.readFileSync('assets/own-contract-family-payroll-facts-panel.css','utf8');
 assert.ok(panel.includes("onChange:v=>{d.quantities[f.key]=v===''?null:v;changed();}"));
 assert.ok(panel.includes("familyFactsView(boot,draft,$('search').value,page,10)"));
 assert.ok(panel.includes("const endpoint='/api/internal-own-contract-family-payroll-facts'"));
 assert.ok(panel.includes("e.detail?.id==='familia'"));
 assert.ok(!/Number\(|parseInt|parseFloat|\|\|0\b/.test(panel),'la pantalla no convierte ni completa valores');
 assert.equal((panel.match(/innerHTML/g)||[]).length,1,'sólo la plantilla fija usa innerHTML');
 assert.match(css,/:has\(\[data-family-facts-comparison\]:not\(\[hidden\]\)\)/);
 assert.ok(!/conditions/.test(css)&&!/data-conditions-|salaryConditions/.test(panel));
});
