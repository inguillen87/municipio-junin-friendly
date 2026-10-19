import test from 'node:test';
import assert from 'node:assert/strict';
import {ownReceiptScopeFilters,ownReceiptIssuer,ownReceiptParams,ownReceiptAttempt,ownReceiptSnapshot,ownReceiptCommand} from '../assets/own-payroll-receipt-model.js';
import {emptyOwnReportFilters} from '../assets/own-payroll-report-model.js';
import {receiptSnapshot,receiptCommand} from './fixtures/own-payroll-receipt-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';

test('sin elegir alcance no se convierte una selección vacía en todos',()=>{
 for(const kind of ['',null,undefined,'agreement','unknown'])assert.throws(()=>ownReceiptScopeFilters({kind,from:'',to:''}),/Elegí el alcance/);
 assert.throws(()=>ownReceiptScopeFilters({from:'',to:''}),/Elegí el alcance/);
});

test('un solo legajo conserva su código exacto en ambos límites',()=>{
 const scope={kind:'employee',from:'00123',to:''};
 const filters=ownReceiptScopeFilters(scope);
 assert.deepEqual(filters,{...emptyOwnReportFilters(),employeeFrom:'00123',employeeTo:'00123'});
 assert.deepEqual(scope,{kind:'employee',from:'00123',to:''});
});

test('el rango de legajos mantiene sus dos límites inclusivos',()=>{
 assert.deepEqual(ownReceiptScopeFilters({kind:'employee',from:'00001',to:'999999999'}),{...emptyOwnReportFilters(),employeeFrom:'00001',employeeTo:'999999999'});
 assert.throws(()=>ownReceiptScopeFilters({kind:'employee',from:'20',to:'10'}),/inicio de un rango/);
});

test('repartición individual y rango no agregan filtros de legajo ni convenio',()=>{
 assert.deepEqual(ownReceiptScopeFilters({kind:'department',from:'0042',to:''}),{...emptyOwnReportFilters(),departmentFrom:'0042',departmentTo:'0042'});
 assert.deepEqual(ownReceiptScopeFilters({kind:'department',from:'42',to:'55'}),{...emptyOwnReportFilters(),departmentFrom:'42',departmentTo:'55'});
 assert.throws(()=>ownReceiptScopeFilters({kind:'department',from:'55',to:'42'}),/inicio de un rango/);
});

test('todos requiere una elección expresa y no acepta rangos ocultos',()=>{
 assert.deepEqual(ownReceiptScopeFilters({kind:'all',from:'',to:''}),emptyOwnReportFilters());
 for(const [from,to] of [['1',''],['','2'],[null,null]])assert.throws(()=>ownReceiptScopeFilters({kind:'all',from,to}),/alcance explícito/);
});

test('legajo y repartición vacíos o inválidos no amplían el alcance',()=>{
 for(const kind of ['employee','department']){
  for(const [from,to] of [['',''],['','2'],['AB1',''],[' 1',''],['1',' 2'],['1000000000',''],['1','1000000000'],[1,''],['1',null]])assert.throws(()=>ownReceiptScopeFilters({kind,from,to}));
 }
});

test('búsqueda y página no forman parte del alcance operativo',()=>{
 const scope={kind:'employee',from:'1',to:'200'};
 for(const extra of [{search:'agente'},{page:2},{contracts:[uid(1)]}])assert.throws(()=>ownReceiptScopeFilters({...scope,...extra}),/Elegí el alcance/);
 assert.deepEqual(ownReceiptScopeFilters(scope),{...emptyOwnReportFilters(),employeeFrom:'1',employeeTo:'200'});
});

test('los filtros nuevos usan las claves publicadas y mantienen convenio sin filtro',()=>{
 const params=receiptSnapshot().params;
 for(const kind of ['employee','department','all']){
  const filters=ownReceiptScopeFilters({kind,from:kind==='all'?'':'42',to:''});
  const result=ownReceiptParams({...params,filters});
  assert.equal(result.filters.agreementFrom,'');
  assert.equal(result.filters.agreementTo,'');
  assert.deepEqual(Object.keys(result).sort(),Object.keys(params).sort());
 }
 assert.throws(()=>ownReceiptParams({...params,issuer:{...params.issuer,address:''}}));
});

test('los parámetros antiguos y el cuerpo y clave de un intento conservan sus filtros',()=>{
 const body=receiptCommand();
 body.params.filters.agreementFrom='1';body.params.filters.agreementTo='4';
 const original=structuredClone(body),key=uid(900),attempt=ownReceiptAttempt(key,body,'municipal-account');
 assert.deepEqual(ownReceiptParams(body.params),original.params);
 body.params.filters=ownReceiptScopeFilters({kind:'employee',from:'42',to:''});
 assert.deepEqual(attempt.body,original);
 assert.equal(attempt.key,key);
 assert.ok(Object.isFrozen(attempt.body.params.filters));
});

const issuerScope={tenantId:uid(800)};
const issuerResponse=()=>({version:'own-receipt-issuer.v1',scope:{...issuerScope},state:'configured',profile:{id:'municipio-sintetico',revision:1,version:'a'.repeat(64),issuer:{name:'MUNICIPIO IMAGINARIO QA',taxId:'30000000007',address:'CALLE IMAGINARIA 1, LOCALIDAD QA'},source:{kind:'municipal_official_backup',label:'Respaldo institucional inventado QA',cutoff:'2026-10-01T15:17:29',validityDeclared:false}}});

test('perfil institucional configurado conserva fuente y valores originales sin aprobarlos',()=>{
 const source=issuerResponse(),value=ownReceiptIssuer(source,issuerScope);
 assert.deepEqual(value,source);assert.ok(Object.isFrozen(value.profile.issuer));
 source.profile.issuer.name='OTRO MUNICIPIO IMAGINARIO';
 assert.equal(value.profile.issuer.name,'MUNICIPIO IMAGINARIO QA');
 assert.equal(value.profile.source.validityDeclared,false);
 const params=ownReceiptParams({...receiptSnapshot().params,issuer:value.profile.issuer});
 assert.deepEqual(params.issuer,value.profile.issuer);
});

test('municipio sin perfil permanece missing y null sin inventar emisor',()=>{
 const value=ownReceiptIssuer({version:'own-receipt-issuer.v1',scope:{...issuerScope},state:'missing',profile:null},issuerScope);
 assert.equal(value.state,'missing');assert.equal(value.profile,null);
 assert.throws(()=>ownReceiptParams({...receiptSnapshot().params,issuer:value.profile}));
});

test('una revisión institucional puede tener otra fecha local válida sin inferir zona horaria',()=>{
 const response=issuerResponse();response.profile.source.cutoff='2026-11-03T08:09:10';
 assert.equal(ownReceiptIssuer(response,issuerScope).profile.source.cutoff,'2026-11-03T08:09:10');
 for(const cutoff of ['2026-02-30T08:09:10','2026-11-03T24:00:00','2026-11-03T08:09:10Z','2026-11-03T08:09:10-03:00']){
  const invalid=issuerResponse();invalid.profile.source.cutoff=cutoff;
  assert.throws(()=>ownReceiptIssuer(invalid,issuerScope));
 }
});

test('perfil de otro municipio o ámbito ausente no se adopta como configuración',()=>{
 assert.throws(()=>ownReceiptIssuer(issuerResponse(),{tenantId:uid(801)}),/municipio/);
 for(const scope of [null,{}, {tenantId:''},{tenantId:uid(800),membershipId:uid(1)}])assert.throws(()=>ownReceiptIssuer({...issuerResponse(),scope},issuerScope),/municipio/);
 assert.throws(()=>ownReceiptIssuer(issuerResponse(),{}),/municipio/);
});

test('la estructura cerrada del perfil no admite identidades, fórmulas ni decisiones añadidas',()=>{
 for(const mutate of [v=>v.formulas=[],v=>v.profile.membershipId=uid(1),v=>v.profile.issuer.employeeName='Agente inventado',v=>v.profile.source.approved=true,v=>v.state='approved',v=>v.profile=null,v=>{v.state='missing';}]){
  const value=issuerResponse();mutate(value);assert.throws(()=>ownReceiptIssuer(value,issuerScope));
 }
});

test('perfil incompleto, versión inválida o procedencia no verificada se rechazan completos',()=>{
 for(const mutate of [v=>v.profile.id='',v=>v.profile.revision=0,v=>v.profile.revision=1.5,v=>v.profile.version='a',v=>v.profile.issuer.name='',v=>v.profile.issuer.taxId='123',v=>v.profile.issuer.address='',v=>v.profile.issuer.name='<script>',v=>v.profile.source.kind='grh_live',v=>v.profile.source.label='',v=>v.profile.source.cutoff='2026-09-01',v=>v.profile.source.validityDeclared=true]){
  const value=issuerResponse();mutate(value);assert.throws(()=>ownReceiptIssuer(value,issuerScope));
 }
});

test('un perfil nuevo no reescribe un intento previo ni sus datos de emisor',()=>{
 const body=receiptCommand(),original=structuredClone(body),key=uid(901),attempt=ownReceiptAttempt(key,body,'municipal-account');
 const profile=ownReceiptIssuer(issuerResponse(),issuerScope);
 ownReceiptParams({...body.params,issuer:profile.profile.issuer});
 assert.deepEqual(attempt.body,original);assert.equal(attempt.key,key);
});

test('legajos y reparticiones exige ambos inicios y conserva los seis filtros publicados',()=>{
 const scope={kind:'combined',employeeFrom:'00100',employeeTo:'00200',departmentFrom:'0035',departmentTo:''},before=structuredClone(scope),filters=ownReceiptScopeFilters(scope);
 assert.deepEqual(filters,{employeeFrom:'00100',employeeTo:'00200',departmentFrom:'0035',departmentTo:'0035',agreementFrom:'',agreementTo:''});assert.deepEqual(scope,before);
 const invalid=[{...scope,employeeFrom:''},{...scope,departmentFrom:''},{...scope,employeeTo:'99'},{...scope,departmentTo:'34'},{...scope,departmentFrom:'AB'},{...scope,employeeFrom:100},{...scope,agreementFrom:'1'},{...scope,from:'1',to:'2'}];
 for(const value of invalid)assert.throws(()=>ownReceiptScopeFilters(value));
 assert.deepEqual(ownReceiptScopeFilters({...scope,employeeTo:''}),{employeeFrom:'00100',employeeTo:'00100',departmentFrom:'0035',departmentTo:'0035',agreementFrom:'',agreementTo:''});
});

test('la copia real verifica la intersección inclusiva, sin admitir filas que sólo coinciden en un rango',()=>{
 const source=receiptSnapshot(5),codes=[['100','35'],['200','40'],['150','41'],['201','35'],['99','34']];source.records.forEach((record,i)=>{record.employeeNumber=codes[i][0];record.departmentCode=codes[i][1];});
 const original=structuredClone(source),filters=ownReceiptScopeFilters({kind:'combined',employeeFrom:'100',employeeTo:'200',departmentFrom:'35',departmentTo:'40'});
 const selection=indices=>{const value=structuredClone(source);value.params=ownReceiptParams({...value.params,filters});value.records=indices.map(i=>value.records[i]);value.recordCount=value.records.length;value.conceptCount=value.records.reduce((n,r)=>n+r.concepts.length,0);value.sources[0].selectedCount=value.recordCount;return value;};
 const selected=selection([0,1]);assert.equal(ownReceiptSnapshot(selected),selected);assert.deepEqual(selected.records.map(r=>[r.employeeNumber,r.departmentCode]),[['100','35'],['200','40']]);assert.equal(selected.sources[0].employeeCount,5);assert.equal(selected.sources[0].populationCount,5);assert.equal(selected.sources[0].selectedCount,2);
 for(const outside of [2,3,4])assert.throws(()=>ownReceiptSnapshot(selection([0,1,outside])),/límites inclusivos/);assert.deepEqual(source,original,'A view selection cannot rewrite the closed source');
});

test('el cuerpo combinado usa el contrato actual y no altera un envío histórico congelado',()=>{
 const body=receiptCommand(),oldBody=structuredClone(body),key=uid(910),historical=ownReceiptAttempt(key,body,'municipal-account-synthetic');
 const filters=ownReceiptScopeFilters({kind:'combined',employeeFrom:'100',employeeTo:'200',departmentFrom:'35',departmentTo:'40'}),next=ownReceiptCommand({...body,params:{...body.params,filters}});
 assert.deepEqual(Object.keys(next).sort(),Object.keys(oldBody).sort());assert.deepEqual(Object.keys(next.params).sort(),Object.keys(oldBody.params).sort());assert.deepEqual(next.params.filters,filters);assert.deepEqual(ownReceiptParams(next.params),next.params);assert.equal(next.reviewConfirmed,false);
 assert.deepEqual(historical.body,oldBody);assert.equal(historical.key,key);assert.ok(Object.isFrozen(historical.body.params.filters));assert.notDeepEqual(next.params.filters,historical.body.params.filters);
});
