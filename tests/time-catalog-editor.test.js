import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogEditorPayload} from '../assets/time-catalog-editor.js';
import {timeCatalogReferenceKey, timeCatalogMatches} from '../assets/time-catalog-contract.js';
import {TimeCatalogReviewSession} from '../assets/time-catalog-review-model.js';
import {ID, payload, record, command, flags, scopeVersion} from './fixtures/time-catalog-synthetic.js';
const perms={canPropose:true,canApprove:false,canAudit:false,canReadAssignments:false};
const base={version:'time-catalog.v1',scopeVersion,permissions:perms};
const ready=()=>{const s=new TimeCatalogReviewSession();s.bootstrap({...base,summary:{calendar:0,shift:0,ruleProfile:0,assignment:0,submitted:0},...flags});return s;};
test('a visible reference is durable, kind-bound, and cannot change a draft identity',async()=>{
 const fields={title:'Turno sintético documentado',code:'qa-turno',legalReference:'Documento sintético QA',from:'2026-10-01',to:'2026-10-31',revision:'1'};
 const hash=await timeCatalogReferenceKey('shift',fields.code);
 const p=catalogEditorPayload('shift',fields,payload('shift').spec,null,hash);
 assert.match(hash,/^[a-f0-9]{64}$/);assert.notEqual(hash,await timeCatalogReferenceKey('calendar',fields.code));
 assert.equal(timeCatalogMatches(record(command({kind:'shift',payload:p})),command({kind:'shift',payload:p})).reference.title,fields.title);
 assert.throws(()=>catalogEditorPayload('shift',{...fields,code:'another-code'},p.spec,p,hash),/no puede cambiar/);
 for(const change of [{title:'=\nPRIVATE'},{legalReference:'Documento\tprivado'},{code:'UPPER'}])assert.throws(()=>catalogEditorPayload('shift',{...fields,...change},p.spec,null,hash));
});
test('correction preserves legacy opaque key, source, evidence and exact numeric values',()=>{
 for(const kind of ['calendar','rule_profile']){
  const p={...payload(kind),sourceContractId:ID};
  const result=catalogEditorPayload(kind,{title:'Referencia sintética anterior',code:'',legalReference:'',from:p.effectiveFrom,to:p.effectiveTo,revision:'999'},p.spec,p);
  assert.equal(result.logicalKeyHash,p.logicalKeyHash);assert.equal(result.sourceContractId,ID);assert.equal(result.revision,1);assert.deepEqual(result.spec,p.spec);
  if(kind==='rule_profile'){assert.equal(result.spec.parameters[0].value,'99999999999999.123456');assert.equal(result.spec.parameters[1].value,'999999999999999999');}
 }
});
test('new draft uncertain submission freezes its full body and key until matching acknowledgement',()=>{
 const s=ready(), p=payload(), attempt=s.prepareDraft('rule_profile',p,'catalog_onboarding','Borrador sintético documentado.',ID);
 const bytes=attempt.body;p.spec.parameters[0].value='1';assert.equal(s.attempt().body,bytes);
 assert.throws(()=>s.prepareDraft('calendar',payload('calendar'),'catalog_onboarding','Otro borrador sintético.',ID));
 const body=JSON.parse(bytes).payload;
 s.confirm({version:'time-catalog.v1',scopeVersion,data:record(body),replayed:false,requestSha256:'a'.repeat(64),attemptKey:ID,...flags});
 assert.equal(s.pending,null);assert.deepEqual(s.commands(),[]);assert.equal(s.editPayload,null);
});
test('editor requires a fresh owner payload; assignment needs verified nominal scope and matching target',()=>{
 const s=ready(), r=record();
 assert.throws(()=>s.prepareDraft('rule_profile',payload(),'draft_corrected','Corrección sintética.',ID,true));
 s.detail({...base,record:r,editPayload:payload(),assignment:null,allowedCommands:['update_draft','submit'],timeline:[],auditAvailable:false,timelineLimit:100,timelineMayBeIncomplete:false},ID);
 assert.equal(s.prepareDraft('rule_profile',payload(),'draft_corrected','Corrección sintética completa.',ID,true).key,ID);
 s.invalidate();assert.equal(s.editPayload,null);assert.equal(s.assignment,null);assert.throws(()=>s.attempt());
 assert.throws(()=>ready().prepareDraft('assignment',payload('assignment'),'catalog_onboarding','Asignación sintética.',ID));
});
