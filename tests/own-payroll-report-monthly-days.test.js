// Monthly-day report regressions. Approvals/captures/closures are synthetic,
// never SQL/IAM execution, production data, publication or municipal acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticCapture} from './fixtures/own-monthly-days-capture-synthetic.js';
import {sealSources,hash,uid} from './fixtures/own-monthly-days-approved-synthetic.js';
import {reportGroup} from './fixtures/own-payroll-report-synthetic.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {ownCloseDetail,ownCloseReceipt,ownCloseSnapshot} from '../assets/own-payroll-close-model.js';
import {ownProgramBootstrap} from '../assets/own-payroll-program-model.js';
import {ownRunWorkspaceResult,verifiedWorkspaceCapture} from '../assets/own-payroll-run-workspace-model.js';
import {ownReportBundle,ownReportDocument,emptyOwnReportFilters} from '../assets/own-payroll-report-model.js';
import {ownReportVariableSources} from '../assets/own-payroll-report-variables.js';
import {reportCsv,reportXlsx,reportPdf} from '../assets/report-document.js';

const views=['legajo','variables','variable_usage','variable_sources'];
const labels={recognizedDays:'Días reconocidos',baseDays:'Base de días declarada'};
const origins={monthly_day_fact:'Días mensuales del programa aprobado',monthly_day_declaration_fact:'Declaración propia de días aprobada'};
const kindFor=variant=>variant==='sql192'?'monthly_day_fact':'monthly_day_declaration_fact';
const bundle=f=>ownReportBundle(f.query,f.details,f.receipts,f.captures);
const base=f=>ownReportBundle(f.query,f.details,f.receipts);
const document=(b,view='variables',filters=emptyOwnReportFilters())=>ownReportDocument(b,filters,view,'concept',[],'all');

// Existing factory accepts 16/30 only. Zero therefore has a separate, explicit
// synthetic approval, with its own source/configuration/proposal/approval ids.
// It uses the unchanged declared-days policy, base 30 and original formulae.
function dayCapture(variant,days){
 if(days!=='0')return syntheticCapture(variant,{days,saved:true,forcedFixed:false});
 assert.equal(variant,'sql193');
 const c=syntheticCapture('sql193',{days:'16',saved:false,forcedFixed:false});
 const {sourceInventory,...sources}=c.payload,record=sources.monthlyDayDeclarations.records[0];
 record.fullPeriod=false;record.sourceVersion=hash(['QA-193-source','0']);
 Object.assign(record.configuration,{version:hash(['QA-193-config','0']),proposalId:uid(132),approvalId:uid(133),sourceVersion:record.sourceVersion});
 Object.assign(record.configuration.definition,{recognizedDays:'0',fullMonthDeclared:false,documentReference:'Constancia de cero días exclusivamente sintética QA'});
 sealSources(sources);
 sourceInventory.monthlyDayDeclarations.version=sources.monthlyDayDeclarations.version;
 c.payload={...sources,sourceInventory};c.body.programVersion=sources.programState.program.version;
 c.bodySha256=ownRunHash(c.body);c.payloadSha256=ownRunHash(c.payload);
 const snapshot=createOwnPayrollSnapshot(prepareOwnPayrollInput(sources));
 c.saved={version:'own-payroll-saved.v1',id:c.id,algorithmSha256:c.algorithmSha256,inputSha256:snapshot.inputSha256,resultSha256:snapshot.resultSha256,input:snapshot.input,result:snapshot.result,recordedAt:'2026-10-18T12:00:01Z'};
 return c;
}

function closedFixture(variant,days){
 const c=dayCapture(variant,days),detail={version:'own-close-detail.v2',period:c.body.period,liquidationType:c.body.liquidationType,scopeVersion:c.body.scopeVersion,stateVersion:hash('M8-original-days-state'),populationDomain:'native_registered',rosterVersion:c.payload.population.version,
  rows:c.saved.input.employees.map(e=>({contractId:e.contractId,employeeNumber:e.employeeNumber,agreementCode:e.agreementCode,departmentCode:e.departmentCode,state:'confirmed',runId:c.id,resultSha256:c.saved.resultSha256,liquidationVersion:1,groupId:null,canClose:true})),captures:[structuredClone(c)],groups:[],canWrite:true,complete:true};
 ownCloseDetail(detail);
 const body={period:detail.period,liquidationType:detail.liquidationType,scopeVersion:detail.scopeVersion,stateVersion:detail.stateVersion,selection:{kind:'all',values:[]},command:'close',groupId:null,reason:'Cierre exclusivamente sintético de días originales M8',reviewConfirmed:true};
 const snapshot=ownCloseSnapshot(detail,body.selection),receipt={version:'own-close-receipt.v1',id:uid(810),key:uid(811),body,bodySha256:ownRunHash(body),groupId:uid(810),snapshot,snapshotSha256:ownRunHash(snapshot),recordedAt:'2026-10-18T12:01:00.000Z',replayed:false};
 detail.groups=[reportGroup(receipt)];for(const row of detail.rows)Object.assign(row,{state:'closed',groupId:receipt.groupId,canClose:false});
 ownCloseDetail(detail);ownCloseReceipt(receipt);
 return {query:{from:detail.period,to:detail.period,types:[detail.liquidationType]},details:[detail],receipts:[receipt],captures:[c]};
}

function originalDayVariables(f,b,variant){
 const c=f.captures[0],e=c.saved.input.employees[0],kind=kindFor(variant),originals=ownReportVariableSources(b,f.captures),p=originals.participations.get(c.body.period+':'+c.body.liquidationType+':'+e.contractId);
 return c.payload.programState.program.definition.bindings.filter(binding=>binding.sourceKind===kind).map(binding=>{
  const input=e.inputs.find(input=>input.key===binding.key),variable=p.variables.find(v=>v.input.key===binding.key);
  assert.ok(input&&variable);assert.equal(Object.hasOwn(binding,'sourceCode'),false,'un hecho de días no obtiene un código de catálogo inventado');
  return {binding,input,variable};
 });
}

for(const [variant,days]of [['sql192','30'],['sql193','16'],['sql193','0'],['sql193','30']])test('M8 days regression: '+variant+' conserva '+days+'/30 originales, unidad y procedencia en las cuatro vistas',async()=>{
 const f=closedFixture(variant,days),before=JSON.stringify(f),c=f.captures[0],person=c.saved.input.employees[0];
 await verifiedWorkspaceCapture(c);assert.ok(ownRunWorkspaceResult(c));
 const b=bundle(f),daysOriginals=originalDayVariables(f,b,variant),variables=document(b,'variables'),usage=document(b,'variable_usage');
 assert.equal(daysOriginals.length,2);
 for(const {binding,input,variable}of daysOriginals){
  const expected=binding.sourceField==='recognizedDays'?days:'30';
  assert.equal(input.value,expected);assert.equal(input.unit,'days');assert.deepEqual(variable.input,input);
  assert.equal(variable.label,labels[binding.sourceField]);assert.equal(variable.origin,origins[binding.sourceKind]+' / '+binding.sourceField);
  const rendered=variables.rows.find(r=>r[2].startsWith(binding.key+' / '));assert.ok(rendered);
  assert.equal(rendered[2],binding.key+' / '+labels[binding.sourceField]);assert.equal(rendered[3],expected);assert.equal(rendered[4],'Días');
  assert.equal(rendered[7],variable.origin+' / '+input.sourceReference);
  const used=usage.rows.filter(r=>r[2].startsWith(binding.key+' / '));assert.ok(used.length>0);assert.ok(used.every(r=>r[3]===expected&&r[4]==='Días'&&r[7]===variable.origin+' / '+input.sourceReference));
 }
 const byLegajo=document(b,'legajo'),totals=f.receipts[0].snapshot.employees[0].totals;
 assert.equal(byLegajo.rows.length,c.saved.result.rowCount+6);
 assert.deepEqual(byLegajo.rows.filter(r=>r[2].startsWith('Total cerrado:')).map(r=>r[7]),['remuneration','non_remuneration','deduction','employer_contribution','gross','net'].map(k=>totals[k]));
 assert.deepEqual(f.receipts[0].snapshot.concepts,c.saved.result.rows);assert.deepEqual(totals,c.saved.result.employeeTotals[0]);
 assert.equal(f.receipts[0].snapshot.employees[0].jurisdiction.code,'42');
 const sources=document(b,'variable_sources');assert.equal(sources.rows.length,1);assert.deepEqual(sources.rows[0].slice(5),[c.body.programVersion,c.payloadSha256,c.saved.inputSha256,c.saved.resultSha256]);
 assert.equal(sources.rows[0][4],1);assert.equal(person.contractId,f.receipts[0].snapshot.employees[0].contractId);
 for(const view of views)assert.ok(!document(b,view).rows.flat().some(value=>typeof value==='string'&&value.includes('undefined')));
 assert.equal(JSON.stringify(f),before,'los informes no modifican reglas, días, fuentes, hashes ni cierre');
});

test('M8 days: igual 30/30 conserva autoridades y referencias distintas de programa192 y declaración193',()=>{
 const a=closedFixture('sql192','30'),b=closedFixture('sql193','30');
 const av=originalDayVariables(a,bundle(a),'sql192'),bv=originalDayVariables(b,bundle(b),'sql193');
 for(const field of ['recognizedDays','baseDays']){
  const x=av.find(v=>v.binding.sourceField===field),y=bv.find(v=>v.binding.sourceField===field);
  assert.equal(x.input.value,y.input.value);assert.notEqual(x.variable.origin,y.variable.origin);assert.notEqual(x.input.sourceReference,y.input.sourceReference);
  assert.equal(x.input.sourceReference,['monthly-day',a.captures[0].payload.monthlyDays.version,a.captures[0].payload.monthlyDays.records[0].source.sha256,field].join(':'));
  const declaration=b.captures[0].payload.monthlyDayDeclarations.records[0];
  assert.equal(y.input.sourceReference,['Días propios aprobados',declaration.configuration.version,declaration.configuration.approvalId,b.query.from,field].join(':'));
 }
});

test('M8 days: un rango vacío no oculta fuente incompatible ni modifica el documento completo ya preparado',()=>{
 const f=closedFixture('sql193','16'),before=JSON.stringify(f),b=bundle(f),full=document(b,'variables'),fullBefore=JSON.stringify(full),csv=reportCsv(full),filters={...emptyOwnReportFilters(),departmentFrom:'999999999'};
 for(const view of views)assert.deepEqual(document(b,view,filters).rows,[],'el rango explícito sí define un alcance vacío');
 assert.equal(JSON.stringify(full),fullBefore);assert.equal(reportCsv(full),csv);assert.equal(csv.split('\r\n').length-2,full.rows.length);assert.ok(csv.includes('Días reconocidos')&&csv.includes('Base de días declarada'));
 assert.ok(reportXlsx(full) instanceof Uint8Array);assert.ok(reportPdf(full) instanceof Uint8Array);assert.equal(JSON.stringify(f),before);
 const changed=structuredClone(f);changed.captures[0].saved.inputSha256='f'.repeat(64);
 const withoutCaptureValidation={...base(changed),captures:changed.captures};
 for(const view of views)assert.throws(()=>document(withoutCaptureValidation,view,filters),/liquidación cerrada original/);
});

test('M8 days: campo de días desconocido no se etiqueta ni se convierte en un código de catálogo',()=>{
 const f=closedFixture('sql193','16'),c=f.captures[0],binding=c.payload.programState.program.definition.bindings.find(b=>b.sourceKind==='monthly_day_declaration_fact');
 binding.sourceField='workedDays';c.payloadSha256=ownRunHash(c.payload);
 assert.throws(()=>ownProgramBootstrap(c.payload.programState),{code:'BINDING_INVALID'});
 const b={...base(f),captures:f.captures},filters={...emptyOwnReportFilters(),departmentFrom:'999999999'};
 for(const view of views)assert.throws(()=>document(b,view,filters),{code:'BINDING_INVALID'});
});

test('M8 days: fuente193 sin aprobación sigue rechazada antes de etiquetas y de filtros',()=>{
 const f=closedFixture('sql193','16'),c=f.captures[0];c.payload.monthlyDayDeclarations.records[0].configuration.approvalId=null;c.payloadSha256=ownRunHash(c.payload);
 assert.throws(()=>ownRunWorkspaceResult(c),{code:'MONTHLY_DAY_DECLARATION_CONTRACT_INVALID'});
 const b={...base(f),captures:f.captures},filters={...emptyOwnReportFilters(),departmentFrom:'999999999'};
 for(const view of views)assert.throws(()=>document(b,view,filters),{code:'MONTHLY_DAY_DECLARATION_CONTRACT_INVALID'});
});
