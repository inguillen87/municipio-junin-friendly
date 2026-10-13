import {test} from 'node:test';import assert from 'node:assert/strict';
import {programCoverage,programCoverageCsv} from '../assets/own-program-coverage-model.js';
import {bootstrap,program,uid,hash} from './fixtures/own-payroll-program-synthetic.js';
import {OWN_PAYROLL_NAMESPACE_VERSION} from '../assets/own-payroll-engine.js';
import {SALARY_MAX_ITEMS} from '../assets/native-salary-catalog-model.js';
const selection={period:'2026-10',liquidationType:'monthly'},clone=v=>structuredClone(v);
const approved=()=>bootstrap({program:{version:hash('b'),revision:1,definition:program(),salaryVersion:hash('c'),proposalId:uid(81),approvalId:uid(82)}});
const row=(code,patch={})=>({...bootstrap().salaryCatalog.items.find(r=>r.code==='100'),code,...patch});
const find=(r,code,kind='concept')=>r.rows.find(row=>row.code===code&&row.kind===kind);
test('el cotejo íntegro distingue resultados y entradas sin homologar ni alterar el programa',()=>{
 const boot=approved(),before=clone(boot),r=programCoverage(boot,selection);assert.equal(r.rows.length,7);assert.equal(r.counts.rule_present,6);assert.equal(r.counts.source_only,1);assert.equal(find(r,'8800','legacy_auxiliary').state,'source_only');assert.equal(r.linked,true);assert.equal(r.homologated,false);assert.equal(r.payrollCalculated,false);assert.deepEqual(boot,before);assert.throws(()=>r.rows.pop());
});
test('más de una página conserva todas las definiciones sin regla y el CSV completo',()=>{
 const boot=approved();boot.salaryCatalog.items.push(...Array.from({length:71},(_,i)=>row(String(4000+i))));const r=programCoverage(boot,selection);assert.equal(r.rows.length,78);assert.equal(r.counts.not_defined,71);const csv=programCoverageCsv(r);assert.equal(csv.split('\r\n').length,80);assert.ok(csv.includes('"4070"'));assert.equal(find(r,'4070').state,'not_defined');
});
test('un tipo sin reglas no hereda las de mensual ni sus entradas',()=>{
 const r=programCoverage(approved(),{...selection,liquidationType:'supplementary'});assert.equal(r.counts.rule_present,0);assert.equal(r.counts.source_only,0);assert.equal(find(r,'100').state,'not_defined');assert.equal(find(r,'8800','legacy_auxiliary').state,'declared_value');
});
test('mes anterior y vigencia cerrada no se convierten en faltantes de regla',()=>{
 const boot=approved();const before=programCoverage(boot,{...selection,period:'2026-09'});assert.equal(before.counts.out_of_period,7);assert.equal(before.counts.not_defined,0);boot.salaryCatalog.items.push(row('4100',{validFrom:'2026-01',validUntil:'2026-09'}));assert.equal(find(programCoverage(boot,selection),'4100').state,'out_of_period');
});
test('un mismo código en otro convenio necesita su propia regla',()=>{
 const boot=approved();boot.salaryCatalog.items.push(row('100',{agreementCode:'2'}));const r=programCoverage(boot,selection);assert.equal(r.rows.find(x=>x.code==='100'&&x.agreementCode==='2').state,'not_defined');assert.equal(find(r,'100').state,'rule_present');
});
test('inactivos conservan su estado aunque haya una regla coincidente',()=>{
 const boot=approved();boot.salaryCatalog.items.find(x=>x.code==='100').active=false;assert.equal(find(programCoverage(boot,selection),'100').state,'inactive');
});
test('concepto y auxiliar con igual código nunca se resuelven como uno solo',()=>{
 const boot=approved();boot.program.definition={namespaceVersion:OWN_PAYROLL_NAMESPACE_VERSION,bindings:[],totalsPrecision:2,rules:[{...program().rules[0],code:'88',expression:{op:'literal',unit:'money',value:'1'}},{...program().rules[0],code:'88',nature:'auxiliary',expression:{op:'literal',unit:'money',value:'2'}}]};boot.salaryCatalog.items=[row('88'),row('88',{kind:'auxiliary',nature:'auxiliary',unit:'money'})];const r=programCoverage(boot,selection);assert.equal(r.rows.length,2);assert.equal(r.counts.rule_present,2);boot.program.definition.rules.pop();assert.equal(find(programCoverage(boot,selection),'88','auxiliary').state,'not_defined');
});
test('una entrada usada sólo por reglas futuras no cuenta para el mes consultado',()=>{
 const boot=approved();boot.program.definition.rules.forEach(r=>r.validFrom='2026-11');const r=programCoverage(boot,selection);assert.equal(r.counts.source_only,0);assert.equal(find(r,'8800','legacy_auxiliary').state,'declared_value');
});
test('las escalas se cuentan aparte y no se presentan como conceptos sin fórmula',()=>{
 const boot=approved();boot.salaryCatalog.items.push(row('5000',{kind:'scale',categoryCode:'1',nature:null,unit:'money',precision:2,value:'123.45'}));const r=programCoverage(boot,selection);assert.equal(r.catalogRows,8);assert.equal(r.scales,1);assert.equal(r.rows.length,7);assert.equal(r.rows.some(x=>x.code==='5000'),false);
});
test('la coincidencia con un programa de otra revisión queda identificada como referencia',()=>{
 const boot=approved();boot.salaryCatalog.version=hash('e');boot.salaryCatalog.revision=2;const r=programCoverage(boot,selection);assert.equal(r.state,'catalog_changed');assert.equal(r.linked,false);assert.ok(programCoverageCsv(r).includes('Revisar versiones'));assert.equal(r.homologated,false);
});
test('sin aprobaciones y sin filas no se inventan observaciones o resultados cero',()=>{
 const empty=bootstrap({salaryCatalog:{version:hash('c'),revision:0,items:[]}}),r=programCoverage(empty,selection);assert.equal(r.state,'catalog_required');assert.equal(r.rows.length,0);assert.equal(r.catalogRows,0);assert.equal(r.linked,false);assert.equal(programCoverageCsv(r).split('\r\n').length,2);assert.equal(programCoverage(bootstrap(),selection).state,'program_required');
});
test('cero auxiliar declarado sigue distinto de valor ausente',()=>{
 const boot=bootstrap();boot.salaryCatalog.items.push(row('4200',{kind:'auxiliary',nature:'auxiliary',unit:'money',precision:0,value:'0'}),row('4201',{kind:'auxiliary',nature:'auxiliary',unit:'money',value:null}));const r=programCoverage(boot,selection);assert.equal(find(r,'4200','auxiliary').state,'declared_value');assert.equal(find(r,'4201','auxiliary').state,'not_defined');
});
test('CSV cerrado excluye textos ejecutables, importes, nombres, referencias e identidades',()=>{
 const boot=approved();boot.salaryCatalog.items.find(r=>r.code==='8800').value='1234567.89';boot.salaryCatalog.items.forEach(r=>{r.label='=HYPERLINK("https://example.invalid")';r.ruleReference='Dato privado ficticio DNI 12345678';});const csv=programCoverageCsv(programCoverage(boot,selection));for(const text of['HYPERLINK','1234567.89','12345678',uid(81),hash('c')])assert.equal(csv.includes(text),false);assert.ok(csv.startsWith('\uFEFF"Periodo";'));assert.ok(csv.endsWith('\r\n'));assert.equal(csv.includes('\n')&&csv.replaceAll('\r\n','').includes('\n'),false);
});
test('no admite exportar una vista recortada, forjada o alterada',()=>{
 const r=programCoverage(approved(),selection);assert.throws(()=>programCoverageCsv({...r,rows:r.rows.slice(0,1)}));assert.throws(()=>programCoverageCsv(clone(r)));assert.throws(()=>r.rows[0].code='=1+1');assert.ok(programCoverageCsv(r));
});
test('respuestas incompletas, fechas/tipos inválidos y capacidad excedida fallan sin recortar',()=>{
 for(const s of[{...selection,period:'2026-13'},{...selection,period:null},{...selection,period:202610},{...selection,liquidationType:'all'}])assert.throws(()=>programCoverage(approved(),s));const bad=approved();bad.program.definition.rules[0].expression={op:'eval',code:'1'};assert.throws(()=>programCoverage(bad,selection));const many=approved();many.salaryCatalog.items=Array.from({length:SALARY_MAX_ITEMS+1},(_,i)=>row(String(5000+i)));assert.throws(()=>programCoverage(many,selection));assert.throws(()=>programCoverage({version:'own-payroll-program.v1'},selection));
});
