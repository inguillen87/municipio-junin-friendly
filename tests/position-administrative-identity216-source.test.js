// Proposed SOURCE tests. No SQL/native/browser availability is asserted here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildPositionAdministrativeIdentity216Source,projectPositionAdministrativeIdentity216Pins,POSITION_ADMIN216_SQL_PATH} from '../scripts/lib/position-administrative-identity216-source.mjs';
import {buildPositionInstallation} from '../scripts/lib/position-assignment-installation.mjs';
const sourceCommit='d05d3c6a47c1426395452175882fc57904677a87';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const beforeBodyHashes=["d45a3311f65f1cdf0de6c767a6ca9e596bb4c5a877a518a45eb0c64d0b241697", "4e11ca452ff4a162000270b97e8b81fff99078f1c3d8c58418de37738f8acd0e", "7104445501f2f1d8b9bcdccf5032acc8db38b3cf84ab4e7d6d768de1c664977b", "0a4ddf468f1ec784b45fedcbd546bb0fcfd1e81292b72a6b9dc8deca6f6a80c4", "65793bd5dd8b14053c78d2344651fe450bea34501f1b072c5acdc77398819cfb", "4db91c549090d6e8e739c4c3552b2660291905d979b883fdd06ec4178fc74a33", "12f23a2f6c7c4a54fc7d787f90ffaca5f4f1a5964360e2fef8021f75d9c84dbb"];
const make=customRead=>buildPositionAdministrativeIdentity216Source({read:customRead??read,sourceCommit});
const withoutBody=pin=>({...pin,sha256:null});

test('216 derives the complete seven-body successor from the adapted-v2 epoch, including adoption locks',()=>{
 const seen=[],plan=make(file=>{seen.push(file);return read(file);});
 assert.equal(new Set(seen).size,7);assert.equal(seen.length,7);
 assert.deepEqual(plan.beforePins.map(pin=>pin.sha256),beforeBodyHashes);
 assert.deepEqual(plan.beforePins.map(withoutBody),plan.afterPins.map(withoutBody));
 assert.deepEqual(plan.changes,{newTables:0,newFunctions:1,adaptedFunctions:7,newRuntimeFacades:0,newCapabilities:0,roleAssignments:0,existingAclChanges:0,associationWrites:0,businessWrites:0});
 assert.equal(plan.migration.length,9);assert.equal(plan.afterDefinitions.length,7);assert.equal(plan.helperPin.runtime,false);
 assert.equal(plan.afterPins.filter(pin=>pin.runtime).length,4);
 const command=plan.afterDefinitions.find(value=>value.startsWith('CREATE OR REPLACE FUNCTION public.position_assignment_command_v1('));
 assert.ok(command.includes('public.payroll_fixed_registry_subject_v2('));
 assert.ok(command.includes('public.native_employment_lifecycle_review,public.employment_adoption_application,public.employment_adoption_decision,public.employment_adoption_proposal IN SHARE MODE NOWAIT'));
 assert.ok(!command.includes('public.native_employment_change_subject_v1(ctx,'));
 assert.equal(plan.sourceOnly,true);assert.equal(plan.requiresFuturePreservationInstaller,true);assert.equal(plan.executesSql,false);
});

test('216 never substitutes annual norm, beneficiary eligibility, SoD, receipt, attempt or fingerprint guards',()=>{
 const plan=make();
 for(let index=0;index<plan.beforeDefinitions.length;index++){
  const before=plan.beforeDefinitions[index],after=plan.afterDefinitions[index];
  // Compare ALL bytes after undoing ONLY this reviewed compatibility change.
  let inverse=after.replace(/^CREATE OR REPLACE FUNCTION /,before.startsWith('CREATE FUNCTION ')?'CREATE FUNCTION ':'CREATE OR REPLACE FUNCTION ');
  if(index===0)inverse=inverse.replace('ctx:=public.position_administrative_context_v1(p);','ctx:=public.native_employment_change_context_v1(p);');
  else if(before.includes("ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL"))inverse=inverse.replace("ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'positionActorVerified')::boolean,false)","ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL");
  else inverse=inverse.replaceAll("ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'positionActorVerified')::boolean,false)","ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL");
  assert.equal(inverse,before,'Every other byte must be conserved for '+plan.beforePins[index].signature);
 }
 for(const name of ['annual_budget_command_v1','position_assignment_command_v1']){
  const definition=plan.afterDefinitions.find(value=>value.startsWith('CREATE OR REPLACE FUNCTION public.'+name+'('));
  assert.match(definition,/EMPLOYMENT_REQUIRED/);assert.match(definition,/IDEMPOTENCY_REUSE/);assert.match(definition,/INDEPENDENT_REQUIRED/);
 }
});

test('the administrative helper preserves the approved whole resolver except the finite M10 permission/identity substitutions',()=>{
 const plan=make(),helper=plan.helperDefinition;
 const source=read('scripts/lib/salary-administrative-identity-installation.mjs').replace(/\r\n?/g,'\n');
 const approved=/export const SALARY_ADMINISTRATIVE_CONTEXT=\x60([\s\S]*?)\x60;/.exec(source)[1];
 let inverse=helper.replace('position_administrative_context_v1','native_salary_administrative_context_v1').replaceAll('positionActorVerified','parameterActorVerified')
  .replace("'actorPersonId',person_value,'employmentContractId',NULL,'parameterActorVerified'","'actorPersonId',person_value,'parameterActorVerified'")
  .replace("IF NOT public.action_center_context_has_capability(ctx,'workforce.employee.read') OR NOT public.action_center_context_has_capability(ctx,'workforce.structure.read') THEN RAISE EXCEPTION 'ANNUAL_BUDGET_FORBIDDEN'; END IF;","IF NOT public.action_center_context_has_capability(ctx,'payroll.parameter.read') THEN RAISE EXCEPTION 'NATIVE_SALARY_FORBIDDEN'; END IF;")
  .replaceAll("WHEN TOO_MANY_ROWS THEN RAISE EXCEPTION 'ANNUAL_BUDGET_FORBIDDEN'","WHEN TOO_MANY_ROWS THEN RAISE EXCEPTION 'NATIVE_SALARY_IDENTITY_CHANGED'");
 assert.equal(inverse,approved);
 assert.ok(helper.includes("'employmentContractId',NULL"));
 assert.ok(!helper.includes("ctx,'payroll.parameter.read'"));
 assert.ok(!helper.includes('UPDATE public.')&&!helper.includes('INSERT INTO')&&!helper.includes('DELETE FROM'));
 assert.equal(plan.migration[1],'REVOKE ALL ON FUNCTION public.position_administrative_context_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app');
 assert.ok(!plan.migration.some(statement=>/^GRANT /.test(statement)));
});

test('all six historical producers and the full candidate SQL reject any unreviewed bytes before returning a source plan',()=>{
 const plan=make();
 for(const file of Object.keys(plan.sourceHashes)){
  assert.throws(()=>make(wanted=>read(wanted)+(wanted===file?'\n-- unreviewed source change':'')),/POSITION_ADMIN216_(SOURCE|SQL)_(BYTES|SHA)/);
 }
 // A nominally identical name with changed ownership/semantics cannot become the expected predecessor.
 const file='scripts/migrations/128-own-position-assignments.sql';
 assert.throws(()=>make(wanted=>wanted===file?read(wanted).replace("e.actor_email<>ctx->>'actorEmail'",'true'):read(wanted)),/POSITION_ADMIN216_SOURCE_(BYTES|SHA)/);
 assert.throws(()=>make(wanted=>wanted===POSITION_ADMIN216_SQL_PATH?read(wanted).replace('SECURITY DEFINER','SECURITY INVOKER'):read(wanted)),/POSITION_ADMIN216_SQL_(BYTES|SHA)/);
});

test('finite post-216 projection requires the genuine source plan and the full exact predecessor metadata',()=>{
 const plan=make(),byName=new Map(plan.beforePins.map(pin=>[pin.name,pin]));
 const before=structuredClone(plan.beforePins.filter(pin=>pin.name.startsWith('annual_')));
 for(let index=0;index<7;index++)before.push({...structuredClone(before[0]),name:'unaffected_'+index,signature:'public.unaffected_'+index+'(jsonb)'});
 const snapshot=structuredClone(before),projected=projectPositionAdministrativeIdentity216Pins(plan,before,'127-own');
 assert.deepEqual(before,snapshot);assert.ok(!Object.isFrozen(before[0].config));
 assert.equal(projected.length,11);assert.deepEqual(projected.slice(0,4),plan.afterPins.filter(pin=>pin.name.startsWith('annual_')));
 assert.deepEqual(projected.slice(4),before.slice(4));
 for(const edit of [pin=>pin.sha256='f'.repeat(64),pin=>pin.runtime=!pin.runtime,pin=>pin.config.push('statement_timeout=0'),pin=>pin.argNames=['forged']]){
  const foreign=structuredClone(before);edit(foreign[0]);assert.throws(()=>projectPositionAdministrativeIdentity216Pins(plan,foreign,'127-own'),/POSITION_ADMIN216_FOREIGN_PREDECESSOR/);
 }
 assert.throws(()=>projectPositionAdministrativeIdentity216Pins({...plan},before,'127-own'),/POSITION_ADMIN216_SOURCE_PLAN_REQUIRED/);
 assert.throws(()=>projectPositionAdministrativeIdentity216Pins(plan,before,'anything'),/POSITION_ADMIN216_PROJECTION_EPOCH/);
 assert.throws(()=>projectPositionAdministrativeIdentity216Pins(plan,[...before.slice(0,10),before[0]],'127-own'),/POSITION_ADMIN216_DUPLICATE_PIN/);
});

test('source projection cannot erase a target or accept an already-forward/partial epoch',()=>{
 const plan=make();
 const pins=structuredClone(plan.beforePins.filter(pin=>pin.name.startsWith('annual_')));
 for(let index=0;index<7;index++)pins.push({...structuredClone(pins[0]),name:'unaffected_'+index,signature:'public.unaffected_'+index+'(jsonb)'});
 pins[0]=structuredClone(plan.afterPins[0]);assert.throws(()=>projectPositionAdministrativeIdentity216Pins(plan,pins,'127-own'),/POSITION_ADMIN216_FOREIGN_PREDECESSOR/);
 pins[0]={...structuredClone(pins[4]),name:'unaffected_7',signature:'public.unaffected_7(jsonb)'};assert.throws(()=>projectPositionAdministrativeIdentity216Pins(plan,pins,'127-own'),/POSITION_ADMIN216_PROJECTION_TARGETS/);
 assert.equal(hash(read('scripts/migrations/210-own-position-population-proof.sql').replace(/\r\n?/g,'\n')),plan.sourceHashes['scripts/migrations/210-own-position-population-proof.sql']);
});


test('128-own consumes the REAL original128 ownPins and inherits only the approved resolve-v2 plus three216 targets',()=>{
 const plan=make(),source128=buildPositionInstallation({read,sourceCommit});
 assert.equal(source128.ownPins.length,11);
 const originalByName=new Map(source128.ownPins.map(pin=>[pin.name,pin]));
 assert.equal(originalByName.get('position_assignment_bootstrap_v1').sha256,'e5789ee9aa3f4e6a13c3fe0298bce9318b6f8ae9032b64dea03fb52677bfcd96');
 assert.equal(originalByName.get('position_assignment_command_v1').sha256,'b249f806ad56e0025b050783fc5d54f7366068aac38fec6e5ff3bc8e1f1c4558');
 assert.notEqual(originalByName.get('position_assignment_bootstrap_v1').sha256,plan.beforePins.find(pin=>pin.name==='position_assignment_bootstrap_v1').sha256);
 assert.notEqual(originalByName.get('position_assignment_command_v1').sha256,plan.beforePins.find(pin=>pin.name==='position_assignment_command_v1').sha256);
 const snapshot=structuredClone(source128.ownPins),projected=projectPositionAdministrativeIdentity216Pins(plan,source128.ownPins,'128-own');
 assert.deepEqual(source128.ownPins,snapshot);assert.equal(projected.length,11);
 const projectedByName=new Map(projected.map(pin=>[pin.name,pin])),changed=[];
 for(const before of source128.ownPins){const after=projectedByName.get(before.name);assert.deepEqual({...before,sha256:null},{...after,sha256:null});if(before.sha256!==after.sha256)changed.push(before.name);}
 assert.deepEqual(changed.sort(),['position_assignment_resolve_v1','position_assignment_proposal_v1','position_assignment_bootstrap_v1','position_assignment_command_v1'].sort());
 assert.equal(projectedByName.get('position_assignment_resolve_v1').sha256,'a60140ecbc0492f386d836f6b1881011ae0496e7c08787c40298a3fb1154672a');
 for(const pin of plan.afterPins.filter(pin=>pin.name.startsWith('position_assignment_')))assert.deepEqual(projectedByName.get(pin.name),pin);
 // The capture trigger belongs to128 and was NOT replaced by adopted-v2/216.
 assert.deepEqual(projectedByName.get('position_assignment_capture_trigger_v1'),originalByName.get('position_assignment_capture_trigger_v1'));
 // Accept neither a mixed v2/original128 input nor the already216 epoch.
 const mixed=structuredClone(source128.ownPins),index=mixed.findIndex(pin=>pin.name==='position_assignment_bootstrap_v1');mixed[index]=structuredClone(plan.beforePins.find(pin=>pin.name==='position_assignment_bootstrap_v1'));
 assert.throws(()=>projectPositionAdministrativeIdentity216Pins(plan,mixed,'128-own'),/POSITION_ADMIN216_FOREIGN_PREDECESSOR/);
 assert.throws(()=>projectPositionAdministrativeIdentity216Pins(plan,projected,'128-own'),/POSITION_ADMIN216_FOREIGN_PREDECESSOR/);
 // Conversely, v2/210 projections continue to demand the v2 preimage.
 const wrongV2=[originalByName.get('position_assignment_bootstrap_v1'),originalByName.get('position_assignment_command_v1'),originalByName.get('position_assignment_date_v1'),originalByName.get('position_assignment_state_v1'),originalByName.get('position_assignment_resolve_v1')];
 assert.throws(()=>projectPositionAdministrativeIdentity216Pins(plan,wrongV2,'adopted-v2-after'),/POSITION_ADMIN216_FOREIGN_PREDECESSOR/);
});
