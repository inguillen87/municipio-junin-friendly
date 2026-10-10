import {test} from 'node:test';
import assert from 'node:assert/strict';
import {programWorkspaceGuidance} from '../assets/own-payroll-program-workspace-model.js';
import {bootstrap,program,command,uid,hash,definitions} from './fixtures/own-payroll-program-synthetic.js';

const approved=()=>({version:hash('b'),revision:1,definition:program(),salaryVersion:hash('c'),proposalId:uid(1),approvalId:uid(2)});
function pending(index,patch={}){
 return {id:uid(100+index),requestSha256:hash('d'),baseVersion:hash('b'),salaryVersion:hash('c'),salaryItems:definitions(),baseDefinition:null,definition:program(),reason:command().reason,createdAt:'2026-10-10T12:00:00Z',authorLabel:'Operador sintético QA',canReview:true,status:'pending',decision:null,...patch};
}
test('sin catálogo aprobado explica el requisito y no permite preparar aun con permiso',()=>{
 const boot=bootstrap({salaryCatalog:{version:hash('c'),revision:0,items:[]}}),before=structuredClone(boot),v=programWorkspaceGuidance(boot);
 assert.equal(v.state,'catalog_required');assert.equal(v.preparationAllowed,true);assert.equal(v.canPrepare,false);assert.equal(v.pendingCount,0);assert.deepEqual(boot,before);
});
test('un catálogo aprobado habilita preparación pero no se presenta como programa homologado',()=>{
 const v=programWorkspaceGuidance(bootstrap());assert.equal(v.state,'program_required');assert.equal(v.canPrepare,true);assert.equal(v.programRevision,0);
});
test('mantiene separados el permiso de consultar, preparar y revisar',()=>{
 const v=programWorkspaceGuidance(bootstrap({permissions:{canPropose:false,canReview:true}}));assert.equal(v.canPrepare,false);assert.equal(v.reviewAllowed,true);assert.equal(v.state,'program_required');
});
test('programa aprobado de otra revisión requiere volver a revisar sus fuentes, sin cambiarlo',()=>{
 const boot=bootstrap({program:approved(),salaryCatalog:{version:hash('e'),revision:2,items:definitions()}}),before=structuredClone(boot);
 assert.equal(programWorkspaceGuidance(boot).state,'catalog_changed');assert.deepEqual(boot,before);
});
test('misma versión describe sólo el vínculo, sin afirmar elegibilidad ni aceptación salarial',()=>{
 const v=programWorkspaceGuidance(bootstrap({program:approved()}));assert.equal(v.state,'linked');assert.equal(v.catalogRevision,1);assert.equal(v.programRevision,1);
 assert.equal(Object.hasOwn(v,'payrollEligible'),false);assert.equal(Object.hasOwn(v,'accepted'),false);
});
test('cuenta todas las pendientes y distingue autoaprobación, base y catálogo obsoletos',()=>{
 const proposals=Array.from({length:71},(_,i)=>pending(i));proposals[3].canReview=false;proposals[50].baseVersion=hash('e');proposals[70].salaryVersion=hash('f');
 const decided=pending(72,{status:'rejected',canReview:false,decision:{command:'reject',reason:'Rechazo sintético completo QA',actorLabel:'Otra persona QA',recordedAt:'2026-10-10T13:00:00Z',revision:0}});
 const boot=bootstrap({proposals:[decided,...proposals],permissions:{canPropose:true,canReview:true}}),v=programWorkspaceGuidance(boot);
 assert.equal(v.pendingCount,71);assert.equal(v.reviewableCount,68);boot.permissions.canReview=false;assert.equal(programWorkspaceGuidance(boot).reviewableCount,0);
});
test('una respuesta incompleta o inválida no produce orientación ni cantidades supuestas',()=>{
 for(const change of [b=>delete b.permissions,b=>b.salaryCatalog.revision=-1,b=>b.program.salaryVersion='inventado',b=>b.proposals=[{status:'pending'}]]){
  const boot=bootstrap();change(boot);assert.throws(()=>programWorkspaceGuidance(boot));
 }
});
