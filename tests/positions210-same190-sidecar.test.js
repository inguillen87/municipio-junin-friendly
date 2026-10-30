// Source-unit contract only. Root must execute after adoption; these synthetic
// observations do not prove PostgreSQL metadata, triggers or transaction frames.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildOwnerProgramQa} from '../scripts/lib/municipal-owner-program-qa.mjs';
import {composePositions210Same190} from '../scripts/lib/positions210-same190-installation.mjs';
import {composePositions210SidecarPlan,readPositions210SidecarSnapshot,assertPositions210SidecarDelta} from '../scripts/lib/positions210-same190-sidecar.mjs';
const sourceCommit='a'.repeat(40),read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
let source;
function plans(){
 if(source)return source;
 const qa=buildOwnerProgramQa({major:17,sourceCommit,read,schema:'mc_qa_fixed_092_'+'6'.repeat(32),operationalPairBaseline:'published107'});
 const installation=composePositions210Same190({qa,major:17,sourceCommit,read});
 const plan=composePositions210SidecarPlan({qa,major:17,sourceCommit,read,positions210Plan:installation});
 return source={qa,installation,plan};
}
const uuid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0'),sha=n=>String(n).repeat(64);
const tables=['own_payroll_run_capture','own_payroll_run_result','own_payroll_run_position_capture','own_payroll_run_position_dimensions','own_payroll_liquidation_event','own_payroll_annul_event','own_payroll_close_event','iam_role_capability'];
function observation(ids=[],{pending=[],changedOld=false,iamChanged=false,decisionAdded=false}={}){
 const {qa}=plans(),population={count:2,distinctContracts:2,valid:true,sha256:sha(7)};
 const captures=ids.map(id=>({id,tenantId:qa.actor.tenantId,bindingId:qa.ids.binding,payloadSha256:sha(1),calculatedPayloadSha256:sha(1),populationVersion:sha(2),population:{...population},rowSha256:changedOld&&id===ids[0]?sha(8):sha(3)}));
 const side=(version)=>captures.map(c=>({captureId:c.id,tenantId:c.tenantId,bindingId:c.bindingId,capturePayloadSha256:c.payloadSha256,payloadSha256:sha(4),calculatedPayloadSha256:sha(4),version,complete:true,populationVersion:c.populationVersion,employeeCount:c.population.count,population:{...c.population},rowSha256:sha(5)}));
 const count=name=>name==='own_payroll_run_capture'||name.includes('position_capture')||name.endsWith('position_dimensions')?ids.length:name==='own_payroll_run_result'?ids.length-pending.length:name==='iam_role_capability'?1+(iamChanged?1:0):name==='own_payroll_liquidation_event'&&decisionAdded?1:0;
 return {version:'positions210-same190-sidecar-snapshot.v1',schema:qa.schema,sourceCommit,captures,positions:side('own-position-population.v1'),dimensions:side('own-position-dimensions.v1'),
  preservation:{tables:tables.map((name,index)=>({schema:qa.schema,name,oid:index+1,owner:'postgres',acl:'owner-only',rows:count(name),rowsSha256:sha(count(name)+1)}))},
  prefix:tables.map((name,index)=>({name,oid:index+1,hashes:Array.from({length:count(name)},(_,n)=>({sha256:String(n+1).padStart(64,'0'),count:1}))}))};
}
function host(){
 const {qa,installation,plan}=plans();let next,calls=[];const db={};
 const h={qa,major:17,sourceCommit,sourceCustody:{sourceCommit},prepared:{positions210:installation,positions210Sidecar:plan},json(statements,options){calls.push({statements,options});return structuredClone(next);}};
 return {h,db,plan,calls,mint(value){next=value;return readPositions210SidecarSnapshot({h,db,plan});}};
}
function delta(x,before,after,phase='calculation',newCaptureIds=[]){return assertPositions210SidecarDelta({h:x.h,db:x.db,plan:x.plan,before,after,phase,newCaptureIds});}

test('complete capture inventory includes an ordinary unsaved capture and both sidecars',()=>{
 const x=host(),before=x.mint(observation()),after=x.mint(observation([uuid(1)],{pending:[uuid(1)]}));
 const proof=delta(x,before,after,'calculation',[uuid(1)]);assert.equal(proof.addedCaptures,1);assert.equal(proof.addedPositionSidecars,1);assert.equal(proof.addedDimensionSidecars,1);assert.equal(proof.pendingCapturesIncluded,true);
 assert.deepEqual(x.calls.map(c=>c.options),[{readOnly:true,fullJson:true},{readOnly:true,fullJson:true}]);
 assert.throws(()=>delta(x,before,after,'calculation',[]),/POSITIONS210_SIDECAR_UNEXPECTED_CAPTURE_DELTA/);
});

test('missing, duplicated, detached or foreign sidecars reject the whole observation',()=>{
 for(const change of [v=>v.positions.pop(),v=>v.dimensions.push({...v.dimensions[0]}),v=>v.positions[0].captureId=uuid(2),v=>v.dimensions[0].bindingId=uuid(99),v=>v.positions[0].capturePayloadSha256=sha(9),v=>v.captures[0].calculatedPayloadSha256=sha(9),v=>v.dimensions[0].population.sha256=sha(9)]){
  const x=host(),value=observation([uuid(1)]);change(value);assert.throws(()=>x.mint(value));
 }
});

test('a new sidecar cannot conceal mutation of any old immutable capture or sidecar',()=>{
 const x=host(),before=x.mint(observation([uuid(1)]));
 const changed=observation([uuid(1),uuid(2)],{changedOld:true}),after=x.mint(changed);
 assert.throws(()=>delta(x,before,after,'calculation',[uuid(2)]),/POSITIONS210_SIDECAR_OLD_CAPTURE_CHANGED/);
 const sideChanged=observation([uuid(1),uuid(2)]);sideChanged.dimensions[0].rowSha256=sha(9);
 assert.throws(()=>delta(x,before,x.mint(sideChanged),'calculation',[uuid(2)]),/POSITIONS210_SIDECAR_OLD_SIDECAR_CHANGED/);
});

test('finite phases preserve IAM, metadata and prior hash multiplicities',()=>{
 const x=host(),before=x.mint(observation([uuid(1)]));
 assert.throws(()=>delta(x,before,x.mint(observation([uuid(1),uuid(2)],{iamChanged:true})),'calculation',[uuid(2)]),/POSITIONS210_SIDECAR_OTHER_ROWS_CHANGED|POSITIONS210_SIDECAR_METADATA_IAM_OR_OTHER_STATE_CHANGED/);
 const changedMetadata=observation([uuid(1),uuid(2)]);changedMetadata.preservation.tables[0].owner='other-owner';
 assert.throws(()=>delta(x,before,x.mint(changedMetadata),'calculation',[uuid(2)]),/POSITIONS210_SIDECAR_METADATA_IAM_OR_OTHER_STATE_CHANGED/);
 const missingPrior=observation([uuid(1),uuid(2)]);missingPrior.prefix[0].hashes.shift();
 assert.throws(()=>delta(x,before,x.mint(missingPrior),'calculation',[uuid(2)]),/POSITIONS210_SIDECAR_PRIOR_ROW_CHANGED_OR_REMOVED/);
 const decision=x.mint(observation([uuid(1),uuid(2)],{decisionAdded:true}));
 assert.throws(()=>delta(x,before,decision,'calculation',[uuid(2)]),/POSITIONS210_SIDECAR_OTHER_ROWS_CHANGED/);
 assert.equal(delta(x,before,decision,'annul208',[uuid(2)]).addedCaptures,1);
});

test('snapshots are confined to the actual minted host, binding and source plan',()=>{
 const x=host(),before=x.mint(observation()),after=x.mint(observation([uuid(1)]));
 assert.throws(()=>delta(x,structuredClone(before),after,'calculation',[uuid(1)]),/POSITIONS210_SIDECAR_UNMINTED_SNAPSHOT/);
 assert.throws(()=>assertPositions210SidecarDelta({h:{...x.h},db:x.db,plan:x.plan,before,after,phase:'calculation',newCaptureIds:[uuid(1)]}));
 assert.throws(()=>assertPositions210SidecarDelta({h:x.h,db:{},plan:x.plan,before,after,phase:'calculation',newCaptureIds:[uuid(1)]}));
 assert.throws(()=>assertPositions210SidecarDelta({h:x.h,db:x.db,plan:{...x.plan},before,after,phase:'calculation',newCaptureIds:[uuid(1)]}),/POSITIONS210_SIDECAR_UNMINTED_PLAN/);
 assert.throws(()=>delta(x,before,after,'arbitrary-exemption',[uuid(1)]),/POSITIONS210_SIDECAR_PHASE_INVALID/);
 assert.throws(()=>delta(x,before,after,'calculation',[uuid(1),uuid(1)]));
});
