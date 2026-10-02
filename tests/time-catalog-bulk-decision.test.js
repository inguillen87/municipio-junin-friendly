import test from 'node:test';
import assert from 'node:assert/strict';
import {assignmentDecisionPlan,assignmentDecisionSnapshot,restoreAssignmentDecisionAttempt} from '../assets/time-catalog-bulk-decision.js';
import {TimeCatalogReviewSession} from '../assets/time-catalog-review-model.js';
import {ID,payload,record,command,scopeVersion,flags} from './fixtures/time-catalog-synthetic.js';
const id=n=>`aaaaaaaa-0000-4000-8000-${String(n).padStart(12,'0')}`;
const permissions=action=>({canPropose:action==='submit',canApprove:action!=='submit',canAudit:action!=='submit',canReadAssignments:true});
function detail(n=1,action='submit'){
 const p=payload('assignment'),r=record(command({kind:'assignment',payload:p}));r.id=id(n);r.status=action==='submit'?'draft':'submitted';r.version=action==='submit'?1:2;
 const dependencies=Object.fromEntries([['shift','shift'],['calendar','calendar'],['ruleProfile','rule_profile']].map(([key,kind],i)=>{const dep=record(command({kind,payload:payload(kind)}));dep.id=id(1000+i);dep.status='approved';dep.version=3;p.spec[key+'EntryId']=dep.id;return[key,dep];}));
 p.spec.employmentContractId=id(2000+n);
 return{version:'time-catalog.v1',scopeVersion,permissions:permissions(action),record:r,assignment:{target:{contractId:p.spec.employmentContractId,legajo:String(900000+n),name:'Contrato sintético '+n},...dependencies},editPayload:action==='submit'?p:null,allowedCommands:action==='submit'?['update_draft','submit']:['approve','reject'],timeline:[],auditAvailable:action!=='submit',timelineLimit:100,timelineMayBeIncomplete:false};
}
const options=(action='submit',count=26)=>({details:Array.from({length:count},(_,i)=>detail(i+1,action)),scope:scopeVersion,permissions:permissions(action),action,reasonCode:({submit:'ready_for_review',approve:'configuration_verified',reject:'configuration_invalid'})[action],reason:'Configuraciones sintéticas contrastadas para QA.'});
for(const action of ['submit','approve','reject'])test(action+': every selected assignment has its own existing command and exact version',()=>{
 const input=options(action),plan=assignmentDecisionPlan(input);assert.equal(plan.total,26);assert.equal(plan.entries.length,26);assert.equal(plan.dependencies.length,3);assert.equal(new Set(plan.entries.map(entry=>entry.body.id)).size,26);
 for(const entry of plan.entries){assert.equal(entry.body.command,action);assert.equal(entry.body.expectedVersion,entry.record.version);assert.equal(entry.body.payload,null);assert.equal(entry.body.kind,null);assert.equal(entry.body.manualValidationConfirmed,action==='approve');}
 input.details[0].assignment.target.name='Cambio';assert.equal(plan.entries[0].assignment.target.name,'Contrato sintético 1');assert.throws(()=>{plan.entries[0].record.version=99;});
});
test('100 retained,101 or empty rejected completely; records never deduplicated by legajo',()=>{
 assert.equal(assignmentDecisionPlan(options('submit',100)).total,100);assert.throws(()=>assignmentDecisionPlan(options('submit',101)),/no se recorta/);assert.throws(()=>assignmentDecisionPlan(options('submit',0)));
 const input=options('submit',2);input.details[1].assignment.target.legajo=input.details[0].assignment.target.legajo;assert.equal(assignmentDecisionPlan(input).entries.length,2);
});
test('same entry repeated case-insensitively cannot produce two decisions',()=>{const input=options('submit',2);input.details[1].record.id=input.details[0].record.id.toUpperCase();assert.throws(()=>assignmentDecisionPlan(input),/repetida/);});
for(const action of ['submit','approve','reject'])test(action+': unauthorized, malformed or changed scope fails before a command',()=>{
 for(const mutate of [input=>input.details[0].scopeVersion='f'.repeat(64),input=>input.details[0].permissions.canReadAssignments=false,input=>input.details[0].assignment=null,input=>input.details[0].allowedCommands=[],input=>input.details[0].record.version=0,input=>input.details[0].record.kind='calendar']){const input=options(action,2);mutate(input);assert.throws(()=>assignmentDecisionPlan(input));}
});
for(const key of ['shift','calendar','ruleProfile'])test(key+': retired or short dependency blocks submission/approval, but stays visible for rejection',()=>{
 for(const action of ['submit','approve'])for(const mutate of [dep=>dep.status='retired',dep=>dep.effectiveFrom='2026-10-02',dep=>dep.effectiveTo='2026-10-30']){const input=options(action,1);mutate(input.details[0].assignment[key]);assert.throws(()=>assignmentDecisionPlan(input),/cubrir/);}
 const input=options('reject',1);input.details[0].assignment[key].status='retired';assert.equal(assignmentDecisionPlan(input).dependencies.find(dep=>dep.record.kind===({shift:'shift',calendar:'calendar',ruleProfile:'rule_profile'})[key]).record.status,'retired');
});
test('one shared dependency changing during the full comparison invalidates the whole group',()=>{const input=options('approve',2);input.details[1].assignment.shift.version++;assert.throws(()=>assignmentDecisionPlan(input),/durante/);});
test('semantic snapshot ignores object key ordering and detects target, dates and exact dependency values',()=>{
 const entry=assignmentDecisionPlan(options('approve',1)).entries[0];assert.equal(assignmentDecisionSnapshot(entry),assignmentDecisionSnapshot({...entry,record:Object.fromEntries(Object.entries(entry.record).reverse())}));
 for(const change of [copy=>copy.record.effectiveTo='2026-10-30',copy=>copy.record.version++,copy=>copy.assignment.target.contractId=id(2999),copy=>copy.assignment.ruleProfile.configuration.parameters[0].booleanValue=true]){const copy=structuredClone(entry);change(copy);assert.notEqual(assignmentDecisionSnapshot(entry),assignmentDecisionSnapshot(copy));}
});
test('readiness flags never change or appear as calculation in planned decisions',()=>{for(const entry of assignmentDecisionPlan(options('approve',2)).entries)for(const flag of Object.keys(flags))assert.equal(Object.hasOwn(entry.body,flag),false);});
function sessionFor(data){const s=new TimeCatalogReviewSession();s.bootstrap({version:data.version,scopeVersion:data.scopeVersion,permissions:data.permissions,summary:{calendar:1,shift:1,ruleProfile:1,assignment:0,submitted:0},...flags});s.detail(data,data.record.id);return s;}
for(const action of ['submit','approve','reject'])test(action+': withdrawn view recovers exactly one original body/key after fresh same-assignment read',()=>{
 const data=detail(1,action),s=sessionFor(data),attempt=s.prepare(action,options(action,1).reasonCode,'Decisión sintética contrastada.',action==='approve',ID);s.invalidate();
 const current=structuredClone(data);current.record.status=({submit:'submitted',approve:'approved',reject:'rejected'})[action];current.record.version++;current.editPayload=null;current.allowedCommands=[];const fresh=sessionFor(current);
 const recovered=restoreAssignmentDecisionAttempt(fresh,attempt);assert.equal(recovered.key,attempt.key);assert.equal(recovered.body,attempt.body);assert.equal(recovered.scope,attempt.scope);assert.throws(()=>restoreAssignmentDecisionAttempt(fresh,attempt));
});
test('revoked capability, another contract or scope cannot recover an approval',()=>{
 const data=detail(1,'approve'),s=sessionFor(data),attempt=s.prepare('approve','configuration_verified','Decisión sintética contrastada.',true,ID);
 for(const change of [fresh=>fresh.scope='f'.repeat(64),fresh=>fresh.permissions.canApprove=false,fresh=>fresh.permissions.canReadAssignments=false,fresh=>fresh.selected.id=id(2),fresh=>fresh.assignment=null,fresh=>fresh.selected.kind='shift']){const fresh=sessionFor(data);change(fresh);assert.throws(()=>restoreAssignmentDecisionAttempt(fresh,attempt));assert.equal(fresh.pending,null);}
});
test('recovery rejects creation, retirement and tampered decision envelopes',()=>{
 const data=detail(1,'approve'),s=sessionFor(data),attempt=s.prepare('approve','configuration_verified','Decisión sintética contrastada.',true,ID);
 for(const change of [copy=>copy.body='broken',copy=>copy.extra=true,copy=>copy.key='broken',copy=>{const value=JSON.parse(copy.body);value.operation='other';copy.body=JSON.stringify(value);},copy=>{const value=JSON.parse(copy.body);value.payload.manualValidationConfirmed=false;copy.body=JSON.stringify(value);},copy=>{const value=JSON.parse(copy.body);value.payload.command='retire';value.payload.reasonCode='catalog_retired';value.payload.manualValidationConfirmed=false;copy.body=JSON.stringify(value);}]){const copy={...attempt};change(copy);assert.throws(()=>restoreAssignmentDecisionAttempt(sessionFor(data),copy));}
});
