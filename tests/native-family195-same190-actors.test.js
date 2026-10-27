/* TEXT CANDIDATE; destination tests/native-family195-same190-actors.test.js.
 * No imports/tests/SQL were executed to prepare it. Transport values below are
 * explicitly synthetic unit fixtures, not catalogue/IAM/native acceptance.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildOwnerProgramQa} from '../scripts/lib/municipal-owner-program-qa.mjs';
import {programOwnerQaId} from './fixtures/municipal-owner-program-synthetic.js';
import {
 buildNativeFamily195ActorsFixture,assertNativeFamily195ActorsProof,
 assertNativeFamily195ActorsRollback,readNativeFamily195ActorsDurable,
 readNativeFamily195ActorsContexts,readNativeFamily195BrowserActors,
 nativeFamily195FamilySnapshot,nativeFamily195NonFamilySnapshot,
 NATIVE_FAMILY195_ACTOR_NAMES,NATIVE_FAMILY195_ACTOR_CAPABILITIES,
 NATIVE_FAMILY195_TABLES,NATIVE_FAMILY195_SNAPSHOT_KEYS
} from '../scripts/lib/native-family195-same190-actors.mjs';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
const sourceCommit='a'.repeat(40),schema='mc_qa_fixed_092_'+'c'.repeat(32);
let qa,plan;
function fixture(){
 if(!qa)qa=buildOwnerProgramQa({major:17,sourceCommit,schema,read,operationalPairBaseline:'published107'});
 if(!plan)plan=buildNativeFamily195ActorsFixture({qa,read,contracts:Array.from({length:855},(_,i)=>programOwnerQaId(10000+i))});
 return {qa,plan};
}
function proofFor(p){
 const prior={native855:[...p.contracts],unitPriorFingerprint:'1'.repeat(64)};
 const actors=p.spec.map((row,index)=>({name:row.name,roleKey:row.role,capabilities:[...row.capabilities],
  user:{email:row.actor.actorEmail,tenant_iam_id:row.accountIdentityId,role:'EMPLEADO',password_hash:null},
  membership:{id:row.actor.membershipId,tenant_id:row.actor.tenantId,role_key:row.role},
  session:{id:row.actor.actorSessionId,auth_level:'mfa'},authority:{membership_id:row.actor.membershipId},
  links:row.contractId?[{employment_contract_id:row.contractId}]:[],
  native:row.contractId?{contract_id:row.contractId,person_id:programOwnerQaId(20000+index),registration_id:programOwnerQaId(30000+index)}:null
 }));
 const contexts=p.spec.flatMap(row=>(row.name==='selfreviewer'?['self','review']:[row.name==='reviewer'?'review':'self']).map(mode=>({
  name:row.name,mode,context:{roleKey:row.role,capabilities:[...row.capabilities],employmentContractId:row.contractId,
   actorPersonId:actors.find(a=>a.name===row.name).native?.person_id??null}
 })));
 const deltas={iam_role:4,iam_role_capability:16,internal_users:4,tenant_membership:4,
  tenant_identity_session:4,tenant_action_authority:4,tenant_action_employment_link:2};
 return {version:p.version,schema:p.schema,major:p.major,sourceCommit:p.sourceCommit,spec:structuredClone(p.spec),sourceHashes:{...p.sourceHashes},
  before:structuredClone(prior),after:structuredClone(prior),beforeCounts:{unitPriorRows:100},afterCounts:{unitPriorRows:100,...deltas},deltas,
  actors,contexts,bootstraps:contexts.map(c=>({name:c.name,mode:c.mode,unitBootstrap:true})),
  priorRowsPreserved:true,allMembershipSodChecked:true,authenticationFixture:true,accountProvisioningApiProven:false,
  newPeople:0,newContracts:0,newRegistrations:0,existingMembershipsChanged:0};
}

test('four actor roles reserve only the two original native contracts and emit exactly16 capability assignments',()=>{
 const {qa,plan:p}=fixture();
 assert.deepEqual(p.spec.map(a=>a.name),['employee','reviewer','unlinked','selfreviewer']);
 assert.deepEqual(NATIVE_FAMILY195_ACTOR_NAMES,p.spec.map(a=>a.name));
 assert.deepEqual(p.nativeIdentityContracts,{employee:p.contracts[7],selfreviewer:p.contracts[8]});
 assert.equal(new Set(p.contracts).size,855);assert.deepEqual(p.contracts,[...p.contracts].sort());
 assert.equal(p.spec.reduce((n,r)=>n+r.capabilities.length,0),16);
 assert.deepEqual(p.spec.map(r=>r.capabilities.length),[3,4,3,6]);
 for(const row of p.spec){
  assert.deepEqual(row.capabilities,NATIVE_FAMILY195_ACTOR_CAPABILITIES[row.name]);
  assert.ok(row.capabilities.every(c=>!/^payroll\.|^platform\.|^leave\./.test(c)));
  assert.equal(row.role,'QA_FAMILY195_'+row.name.toUpperCase());
  assert.equal(row.actor.tenantId,qa.actor.tenantId);assert.equal(row.actor.releaseSha,qa.actor.releaseSha);
  assert.notEqual(row.actor.membershipId,qa.actor.membershipId);
  assert.equal(row.contractId,row.name==='employee'?p.contracts[7]:row.name==='selfreviewer'?p.contracts[8]:null);
 }
 const count=table=>p.statements.filter(s=>s.startsWith('INSERT INTO '+schema+'.'+table+'(')).length;
 assert.equal(count('iam_role'),4);assert.equal(count('iam_role_capability'),16);
 assert.equal(count('tenant_action_employment_link'),2);assert.equal(count('internal_users'),4);
 for(const forbidden of ['person_identity','employment_contract','native_employee_registration','iam_capability'])assert.equal(count(forbidden),0);
 assert.ok(p.statements.every(s=>!/^DELETE\b|^TRUNCATE\b|^GRANT\b|^ALTER\b|^DROP\b/.test(s)));
 assert.match(p.statements[0],/FAMILY195_ACTORS_EXACT_NATIVE855_REQUIRED/);
 assert.match(p.statements[0],/FAMILY195_ACTORS_DISTINCT_RESERVED_PEOPLE/);
 assert.match(p.statements[0],/tenant_iam_assert_no_sod_conflict/);
 for(const [file,digest]of Object.entries(p.sourceHashes))assert.equal(digest,sha(read(file).replace(/\r\n?/g,'\n')),file);
 assert.equal(p.connects,false);assert.equal(p.executesSql,false);
});

test('bad existing population or widened actor DTO is rejected before any source read',()=>{
 const {qa,plan:p}=fixture();
 const bad=[p.contracts.slice(1),[p.contracts[1],p.contracts[0],...p.contracts.slice(2)],
  [p.contracts[0],p.contracts[0],...p.contracts.slice(2)]];
 for(const contracts of bad){let reads=0;assert.throws(()=>buildNativeFamily195ActorsFixture({qa,contracts,read:()=>{reads++;return '';}}));assert.equal(reads,0);}
 let reads=0;
 assert.throws(()=>buildNativeFamily195ActorsFixture({qa:{...qa,actor:{...qa.actor,roleKey:'ADMIN'}},contracts:p.contracts,read:()=>{reads++;return '';}}));
 assert.equal(reads,0);
 assert.throws(()=>buildNativeFamily195ActorsFixture({qa,contracts:p.contracts,read:()=>Buffer.from('unexpected binary')}));
});

test('actor proof rejects scope/capability/role/native identity drift and additional people',()=>{
 const {plan:p}=fixture(),proof=proofFor(p);
 assert.deepEqual(assertNativeFamily195ActorsProof(p,proof),{passed:true,sourceOnly:false,newPeople:0,newContracts:0,newRegistrations:0,newActors:4,newRoleCapabilities:16,newLinks:2});
 const mutations=[
  x=>{x.newPeople=1;},x=>{x.after.native855.pop();},x=>{x.actors[0].roleKey=x.actors[1].roleKey;},
  x=>{x.actors[0].capabilities.push('payroll.calculation.read');},
  x=>{x.actors[0].native.contract_id=p.contracts[8];},
  x=>{x.contexts[0].context.actorPersonId=p.spec[0].actor.membershipId;},
  x=>{x.actors[3].native.person_id=x.actors[0].native.person_id;},
  x=>{x.spec[0].actor.tenantId=programOwnerQaId(99999);}
 ];
 for(const mutate of mutations){const changed=structuredClone(proof);mutate(changed);assert.throws(()=>assertNativeFamily195ActorsProof(p,changed));}
 const readback={snapshot:{prior:proof.before,totals:proof.beforeCounts},users:0,memberships:0,sessions:0,roles:0,roleCapabilities:0,links:0};
 assert.equal(assertNativeFamily195ActorsRollback(p,proof,readback).passed,true);
 assert.throws(()=>assertNativeFamily195ActorsRollback(p,proof,{...readback,links:1}));
});

test('durable IAM uses READ ONLY while context/bootstrap readback keeps writable ROLLBACK and normalizes every statement',()=>{
 const {qa,plan:p}=fixture(),proof=proofFor(p),calls=[];
 const durable={snapshot:{prior:proof.after,totals:proof.afterCounts},actors:proof.actors};
 const contexts={contexts:proof.contexts,bootstraps:proof.bootstraps};
 const h={qa,json(sql,options){calls.push({sql,options});return calls.length===1?durable:contexts;}};
 assert.strictEqual(readNativeFamily195ActorsDurable(h,p,proof),durable);
 assert.strictEqual(readNativeFamily195ActorsContexts(h,p,proof),contexts);
 assert.deepEqual(calls[0],{sql:p.durableIamReadStatements.map(s=>qa.normalized(s)),options:{readOnly:true}});
 assert.deepEqual(calls[1],{sql:p.contextReadStatements.map(s=>qa.normalized(s)),options:{readOnly:false,end:'ROLLBACK'}});
 assert.ok(p.contextReadStatements.includes('SET LOCAL ROLE municontrol_actions_runtime_app'));
 assert.ok(p.contextReadStatements.includes('RESET ROLE'));
 assert.ok(!p.contextReadStatements.some(s=>/native_family_(?:self|review)_command_v1/.test(s)));
 const broken={qa,json(){return {...contexts,contexts:contexts.contexts.slice(1)};}};
 assert.throws(()=>readNativeFamily195ActorsContexts(broken,p,proof));
});

test('browser actors are built by real managed-principal and employeeContext adapters after IAM readback',()=>{
 const {qa,plan:p}=fixture(),proof=proofFor(p),calls=[];
 const durable={actors:proof.actors},contexts={contexts:proof.contexts};let cursor=0;
 const h={qa,json(sql,options){
  const row=p.spec[Math.floor(cursor/2)],access=cursor++%2===0;calls.push({sql,options,row});
  assert.equal(options.readOnly,true);assert.equal(sql.length,1);assert.ok(sql[0].includes(row.actor.membershipId));
  return access?{identityVersion:1,authLevel:'mfa',expiresAt:'2099-01-01T00:00:00Z',sessionId:row.actor.actorSessionId,
   sessionVersion:1,roles:[],platformCapabilities:[],tenantCapabilities:[...row.capabilities],ready:true,
   release:row.actor.releaseSha,sourceDatabase:'owner_qa_source',companyId:101,verified:true}:[{roleKey:row.role}];
 }};
 const actors=readNativeFamily195BrowserActors(h,p,proof,durable,contexts);
 assert.equal(calls.length,8);assert.deepEqual(Object.keys(actors),NATIVE_FAMILY195_ACTOR_NAMES);
 for(const row of p.spec){const a=actors[row.name];assert.deepEqual(Object.keys(a).sort(),['principal','raw','roleKey','session']);
  assert.deepEqual(a.raw,row.actor);assert.equal(a.roleKey,row.role);assert.equal(a.principal.session.mfa,true);
  assert.equal(a.principal.tenant.membershipId,row.actor.membershipId);assert.deepEqual(a.principal.tenant.effectiveCapabilities,row.capabilities);
 }
});

test('family/non-family snapshot adapters normalize SQL and reject a widened or nonnumeric count DTO',()=>{
 const {qa,plan:p}=fixture(),calls=[];
 assert.equal(NATIVE_FAMILY195_TABLES.length,11);assert.equal(new Set(NATIVE_FAMILY195_SNAPSHOT_KEYS).size,15);
 const values=Object.fromEntries(NATIVE_FAMILY195_SNAPSHOT_KEYS.map(k=>[k,0]));
 const h={qa,json(sql,options){calls.push({sql,options});return values;}};
 assert.strictEqual(nativeFamily195FamilySnapshot(h),values);assert.deepEqual(calls[0].options,{readOnly:true});
 assert.ok(calls[0].sql[0].includes(schema+'.native_family_request'));assert.ok(!calls[0].sql[0].includes('FROM public.'));
 assert.throws(()=>nativeFamily195FamilySnapshot({qa,json:()=>({...values,unplanned:0})}));
 assert.throws(()=>nativeFamily195FamilySnapshot({qa,json:()=>({...values,native_family_request:'0'})}));
 const nonFamily={native855:p.contracts,actors:proofFor(p).actors,excluded:11,tables:100,fingerprint:'2'.repeat(64)};
 const nh={qa,json(sql,options){calls.push({sql,options});return nonFamily;}};
 assert.strictEqual(nativeFamily195NonFamilySnapshot(nh,p),nonFamily);
 const sql=calls.at(-1).sql.join('\n');assert.ok(sql.includes(schema+'.native_employee_registration'));
 assert.ok(!sql.includes('municontrol_sql111.')&&!sql.includes('native_leave_'));
 assert.deepEqual(calls.at(-1).options,{readOnly:true});
 assert.throws(()=>nativeFamily195NonFamilySnapshot({qa,json:()=>({...nonFamily,excluded:10})},p));
});
