import test from 'node:test';
import assert from 'node:assert/strict';
import {OWN_PAYROLL_READINESS_FILTERS,OWN_PAYROLL_READINESS_ROSTER_URL,ownPayrollReadiness,ownPayrollReadinessUnavailable,ownPayrollReadinessAllowsNew,ownPayrollReadinessUnchanged,ownPayrollProgramSummary} from '../assets/own-payroll-readiness-model.js';
import {bootstrap,program,uid,hash,definitions,command} from './fixtures/own-payroll-program-synthetic.js';
import {roster} from './fixtures/native-roster-synthetic.js';

const approved=()=>({version:hash('b'),revision:1,definition:program(),salaryVersion:hash('c'),proposalId:uid(1),approvalId:uid(2)});
const sources=(patch={})=>({run:{version:'own-payroll-bootstrap.v2',scopeVersion:hash('a'),programVersion:hash('b'),canCalculate:true,runs:[],complete:true},program:bootstrap({program:approved()}),roster:roster(1),...patch});
const read=value=>ownPayrollReadiness(value,value.roster.scope.tenantId);
const pending=()=>({id:uid(100),requestSha256:hash('d'),baseVersion:hash('b'),salaryVersion:hash('c'),salaryItems:definitions(),baseDefinition:null,definition:program(),reason:command().reason,createdAt:'2026-10-10T12:00:00Z',authorLabel:'Otra persona sintética QA',canReview:true,status:'pending',decision:null});

test('consulta completa propia sin filtros; cero histórico o de una búsqueda no certifica un padrón vacío',()=>{
 const query=new URL(OWN_PAYROLL_READINESS_ROSTER_URL,'https://example.invalid').searchParams;
 assert.equal(query.get('schema'),'2');assert.equal(query.get('resource'),'nativeroster');
 for(const [key,value]of Object.entries(OWN_PAYROLL_READINESS_FILTERS))assert.equal(query.get(key),value);
 for(const filters of [{search:'NO COINCIDE'},{status:'active'},{sector:'otra'}])assert.throws(()=>read(sources({roster:roster(0,{filters:{...OWN_PAYROLL_READINESS_FILTERS,...filters}})})));
 assert.throws(()=>read(sources({roster:roster(0,{origin:'GRH'})})));
});
test('cero real registrado o adoptado guía a Personas, sin inventar empleados o aprobar propuestas',()=>{
 const values=sources({roster:roster(0)}),before=structuredClone(values),result=read(values);
 assert.equal(result.state,'roster_required');assert.equal(result.rosterTotal,0);assert.equal(result.href,'/personal?adopcion=pendientes#legajos');assert.equal(ownPayrollReadinessAllowsNew(result),false);assert.deepEqual(values,before);
 assert.doesNotMatch(result.description,/855|860|adoptado automáticamente/);
});
test('cero activos hoy no implica cero registros elegibles para otro período',()=>{
 const n=roster(1,{rows:roster(1).rows.map(r=>({...r,endDate:'2026-09-30',status:'inactive'})),counts:{active:0,pending_start:0,inactive:1,state_error:0}}),result=read(sources({roster:n}));
 assert.equal(result.state,'linked');assert.equal(result.rosterTotal,1);assert.equal(ownPayrollReadinessAllowsNew(result),true);
});
test('legajo adoptado con fechas nulas cuenta como propio, sin inferir vigencia o aprobar encuadre',()=>{
 const n=roster(1),r=n.rows[0];n.version='native-roster.v2';n.rows=[{...r,recordKind:'adopted',startDate:null,status:'unknown'}];n.counts={active:0,pending_start:0,inactive:0,state_error:0,unknown:1};
 const result=read(sources({roster:n}));assert.equal(result.state,'linked');assert.equal(result.rosterTotal,1);assert.match(result.description,/no certifica su elegibilidad/);assert.equal(Object.hasOwn(result,'payrollEligible'),false);
});
test('maestro y programa pendientes llevan al módulo exacto y no habilitan nuevos cálculos',()=>{
 const noCatalog=bootstrap({salaryCatalog:{version:hash('c'),revision:0,items:[]}}),noProgram=bootstrap({proposals:[pending()]});
 for(const [p,state,href]of [[noCatalog,'catalog_required','/nomina#parametros'],[noProgram,'program_required','/nomina#reglas']]){const result=read(sources({program:p}));assert.equal(result.state,state);assert.equal(result.href,href);assert.equal(ownPayrollReadinessAllowsNew(result),false);}
});
test('programa aprobado conserva su revisión, pero cambiar maestro obliga a revisar sus reglas',()=>{
 const p=bootstrap({program:approved(),salaryCatalog:{version:hash('e'),revision:2,items:definitions()}}),before=structuredClone(p),result=read(sources({program:p}));
 assert.equal(result.state,'catalog_changed');assert.equal(result.programRevision,1);assert.equal(result.href,'/nomina#reglas');assert.equal(ownPayrollReadinessAllowsNew(result),false);assert.deepEqual(p,before);
});
test('errores o contratos parciales nunca producen cero ni una falsa aprobación',()=>{
 for(const alter of [v=>v.roster=null,v=>v.program=null,v=>v.run=null,v=>v.roster.complete=false,v=>delete v.program.program,v=>v.roster.total=0]){const v=sources();alter(v);assert.throws(()=>read(v));}
 const unavailable=ownPayrollReadinessUnavailable();assert.equal(unavailable.state,'unverified');assert.equal(unavailable.rosterTotal,null);assert.equal(unavailable.catalogRevision,null);assert.equal(unavailable.programRevision,null);assert.equal(ownPayrollReadinessAllowsNew(unavailable),false);assert.equal(ownPayrollReadinessAllowsNew({state:'linked'}),false);
});
test('rechaza ámbito, tenant o programa distintos entre consultas',()=>{
 for(const alter of [v=>v.program.scopeVersion=hash('e'),v=>v.run.programVersion=hash('e'),v=>v.roster.scope.tenantId=uid(700)]){const v=sources();alter(v);assert.throws(()=>ownPayrollReadiness(v,roster(1).scope.tenantId),/ámbito o el programa/);}
});
test('antes del envío exige la misma versión de padrón, maestro y programa, no sólo permiso',()=>{
 const a=read(sources()),b=read(sources());assert.equal(ownPayrollReadinessUnchanged(a,b),true);
 const changed=sources();changed.roster.snapshot=hash('e');assert.equal(ownPayrollReadinessUnchanged(a,read(changed)),false);
 assert.equal(ownPayrollReadinessUnchanged(a,ownPayrollReadinessUnavailable()),false);
 assert.equal(ownPayrollReadinessUnchanged(a,{...a}),false);
 assert.equal(Object.isFrozen(a),true);
});
test('revisión cero se presenta como pendiente y no como programa aprobado',()=>{
 assert.equal(ownPayrollProgramSummary(bootstrap({salaryCatalog:{version:hash('c'),revision:0,items:[]}})),'Sin programa aprobado. Maestro salarial pendiente de aprobación.');
 assert.equal(ownPayrollProgramSummary(bootstrap()),'Sin programa aprobado. Maestro salarial aprobado: revisión 1.');
 assert.equal(ownPayrollProgramSummary(bootstrap({program:approved()})),'Programa aprobado: revisión 1. Maestro salarial aprobado: revisión 1.');
});
