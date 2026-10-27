// Source construction only. No connection, host execution, role or data operation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const lf=value=>String(value).replace(/\r\n?/g,'\n');
const clean=value=>value.replace(/^(?:\s*--[^\n]*(?:\n|$))*/, '').trim();
const sourcePins={"scripts/migrations/127-annual-position-budget.sql":{"rawBytes":19816,"rawSha256":"43466ffdfa8a93b5aa03066bbc275a5d0e247e2965def21278b338d65988f89d","lfBytes":19816,"lfSha256":"43466ffdfa8a93b5aa03066bbc275a5d0e247e2965def21278b338d65988f89d"},"scripts/migrations/128-own-position-assignments.sql":{"rawBytes":29134,"rawSha256":"d50a2a14e478868b4086514fc0ddd47bd116ba761a88b0a2ff28e36866ce1e78","lfBytes":29134,"lfSha256":"d50a2a14e478868b4086514fc0ddd47bd116ba761a88b0a2ff28e36866ce1e78"},"scripts/lib/salary-administrative-identity-installation.mjs":{"rawBytes":9980,"rawSha256":"eb898f02b87eeeeca5edde201c9a0a7d9b03d777fce80ef6a22eac7d93820a71","lfBytes":9980,"lfSha256":"eb898f02b87eeeeca5edde201c9a0a7d9b03d777fce80ef6a22eac7d93820a71"},"scripts/lib/adopted-positions-installation.mjs":{"rawBytes":9351,"rawSha256":"b5e1f9185e42c3a3372b443e8d6383d8259b155217e9db48b121f5d07cc56ab9","lfBytes":9351,"lfSha256":"b5e1f9185e42c3a3372b443e8d6383d8259b155217e9db48b121f5d07cc56ab9"},"assets/annual-position-budget-model.js":{"rawBytes":10549,"rawSha256":"55dd8b788ff77a6552985ac57d1a6896dd258b8d8a9c12cb212eee4c832bf8f9","lfBytes":10549,"lfSha256":"55dd8b788ff77a6552985ac57d1a6896dd258b8d8a9c12cb212eee4c832bf8f9"},"scripts/migrations/210-own-position-population-proof.sql":{"rawBytes":10676,"rawSha256":"743a4962e6162016c467ccb5c4212a5a4cd9e905b8bb31bbe4bb85e0c2dceefd","lfBytes":10676,"lfSha256":"743a4962e6162016c467ccb5c4212a5a4cd9e905b8bb31bbe4bb85e0c2dceefd"}};
const expectedDefinitions={"annual_budget_context_v1":{"originalRawDefinitionSha256":"6e4fce108b4bf7c196d77f603822d8df0e452c12300eed157378438c0ff501b6","beforeDefinitionSha256":"6e4fce108b4bf7c196d77f603822d8df0e452c12300eed157378438c0ff501b6","beforeBodySha256":"d45a3311f65f1cdf0de6c767a6ca9e596bb4c5a877a518a45eb0c64d0b241697","afterDefinitionSha256":"44f50d9eaff3405fdb49b12912ff18559e037ed74f42842b9545ef43179f60d7","afterBodySha256":"275cc6f3a61d407b7e28fb8a52749b28edff9c979e18b223a8e110f656dad623"},"annual_budget_proposal_v1":{"originalRawDefinitionSha256":"ff594ddfac8d4fce3c0ebc52f4e897ae39e2ce017ae955b5a22b90503728a8ec","beforeDefinitionSha256":"ff594ddfac8d4fce3c0ebc52f4e897ae39e2ce017ae955b5a22b90503728a8ec","beforeBodySha256":"4e11ca452ff4a162000270b97e8b81fff99078f1c3d8c58418de37738f8acd0e","afterDefinitionSha256":"180967b2c31b1a2650db5bae18318f466d9d0586d3c96ac5e66406d05ac1975f","afterBodySha256":"6a40f6984ce217d132ed8f1f6fac12ca4a71f71c144cb9ff649b4981bd2a5aed"},"annual_budget_bootstrap_v1":{"originalRawDefinitionSha256":"002b8f106ec0b0a9c5f2afb0c18b26e05ceb3146cf3f4d3ce732939a2d8cebbd","beforeDefinitionSha256":"002b8f106ec0b0a9c5f2afb0c18b26e05ceb3146cf3f4d3ce732939a2d8cebbd","beforeBodySha256":"7104445501f2f1d8b9bcdccf5032acc8db38b3cf84ab4e7d6d768de1c664977b","afterDefinitionSha256":"29fe9978a9546ff03bbbe7818961dc40c703ac7fea4feaf77ad531b13f34952a","afterBodySha256":"fd52d9197d9a37a538eb0a9e36b8524ffb84b0018d1dba0a227e94674f6280bb"},"annual_budget_command_v1":{"originalRawDefinitionSha256":"f04204c6b85d66b7b4f616b9a97d41205f0c71d1945f1b036e56290b8cc016cd","beforeDefinitionSha256":"f04204c6b85d66b7b4f616b9a97d41205f0c71d1945f1b036e56290b8cc016cd","beforeBodySha256":"0a4ddf468f1ec784b45fedcbd546bb0fcfd1e81292b72a6b9dc8deca6f6a80c4","afterDefinitionSha256":"3393a6213fb662679d95bc6e07ed5e1df5e73b32c90c212ec0bb9b09a873f4cc","afterBodySha256":"84de85f0608a3e11846170a9cfd1b2acc2fd0165c5867accc081e7e102c8cd9f"},"position_assignment_proposal_v1":{"originalRawDefinitionSha256":"32d2a325ed1e69608d325e320e51c45da40fed2c21da02ea481f2db311b77128","beforeDefinitionSha256":"32d2a325ed1e69608d325e320e51c45da40fed2c21da02ea481f2db311b77128","beforeBodySha256":"65793bd5dd8b14053c78d2344651fe450bea34501f1b072c5acdc77398819cfb","afterDefinitionSha256":"d79f2903a2665c9d992c13fdd86f008d53c8bf9f819d9ef8782165867ff7e2cc","afterBodySha256":"6db003e3ba7f98414aee20c3cb60b4a4a217364a2f1abb11be875b2aa6cc187b"},"position_assignment_bootstrap_v1":{"originalRawDefinitionSha256":"312989df97c92ea787119c3454474ffcc5ebd5fb1d6c8a21b1393f6744001a8f","beforeDefinitionSha256":"09000325372f1744a1be14905a82b99f5da5d8f0c0d1e2dc57322f91bdabc024","beforeBodySha256":"4db91c549090d6e8e739c4c3552b2660291905d979b883fdd06ec4178fc74a33","afterDefinitionSha256":"162935693cf36aa73198eb573d9cc98a46fb004f867f5a922f5d2bd853b93dac","afterBodySha256":"1edc69a9673bddd07bb3f383132b3274996a22bba8d66efd61ee889f3240bb19"},"position_assignment_command_v1":{"originalRawDefinitionSha256":"b805b5d0f34de3adc316db1027cabd6a1573901cd6e8900a0a9b411f0dca6c46","beforeDefinitionSha256":"4648517470d03cfbfe6c8ce39b0aef6ec9343d97d17a165c9a52e8a9f8813e6a","beforeBodySha256":"12f23a2f6c7c4a54fc7d787f90ffaca5f4f1a5964360e2fef8021f75d9c84dbb","afterDefinitionSha256":"94e01b1ccef1400ffa0fe3d345c681f24acfcdcd4527c43d95f6ba1cbc16fa36","afterBodySha256":"dc2a054fff722316035d19b94a1c77aab288e535b71eafc727620277ea27fd25"}};
const adoptedOperators=[{"name":"position_assignment_bootstrap_v1","before":"public.native_employment_change_subject_v1(ctx,","after":"(public.payroll_fixed_registry_subject_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),","count":1},{"name":"position_assignment_bootstrap_v1","before":"target);","after":"target,true)->'subject');","count":1},{"name":"position_assignment_bootstrap_v1","before":"CREATE FUNCTION ","after":"CREATE OR REPLACE FUNCTION ","count":1},{"name":"position_assignment_command_v1","before":"public.native_employment_change_subject_v1(ctx,","after":"(public.payroll_fixed_registry_subject_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),","count":1},{"name":"position_assignment_command_v1","before":"target);","after":"target,true)->'subject');","count":1},{"name":"position_assignment_command_v1","before":"public.native_employment_lifecycle_review IN SHARE MODE NOWAIT","after":"public.native_employment_lifecycle_review,public.employment_adoption_application,public.employment_adoption_decision,public.employment_adoption_proposal IN SHARE MODE NOWAIT","count":1},{"name":"position_assignment_command_v1","before":"CREATE FUNCTION ","after":"CREATE OR REPLACE FUNCTION ","count":1}];
const helperOperators=[{"before":"native_salary_administrative_context_v1","after":"position_administrative_context_v1","count":1},{"before":"parameterActorVerified","after":"positionActorVerified","count":2},{"before":"IF NOT public.action_center_context_has_capability(ctx,'payroll.parameter.read') THEN RAISE EXCEPTION 'NATIVE_SALARY_FORBIDDEN'; END IF;","after":"IF NOT public.action_center_context_has_capability(ctx,'workforce.employee.read') OR NOT public.action_center_context_has_capability(ctx,'workforce.structure.read') THEN RAISE EXCEPTION 'ANNUAL_BUDGET_FORBIDDEN'; END IF;","count":1},{"before":"WHEN TOO_MANY_ROWS THEN RAISE EXCEPTION 'NATIVE_SALARY_IDENTITY_CHANGED'","after":"WHEN TOO_MANY_ROWS THEN RAISE EXCEPTION 'ANNUAL_BUDGET_FORBIDDEN'","count":2},{"before":"RETURN ctx||jsonb_build_object('actorPersonId',person_value,'positionActorVerified',person_value IS NOT NULL,","after":"RETURN ctx||jsonb_build_object('actorPersonId',person_value,'employmentContractId',NULL,'positionActorVerified',person_value IS NOT NULL,","count":1}];
const forwardOperators=[{"name":"annual_budget_context_v1","before":"ctx:=public.native_employment_change_context_v1(p);","after":"ctx:=public.position_administrative_context_v1(p);","count":1},{"name":"annual_budget_context_v1","before":"CREATE FUNCTION ","after":"CREATE OR REPLACE FUNCTION ","count":1},{"name":"annual_budget_proposal_v1","before":"ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL","after":"ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'positionActorVerified')::boolean,false)","count":1},{"name":"annual_budget_proposal_v1","before":"CREATE FUNCTION ","after":"CREATE OR REPLACE FUNCTION ","count":1},{"name":"annual_budget_bootstrap_v1","before":"ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL","after":"ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'positionActorVerified')::boolean,false)","count":2},{"name":"annual_budget_bootstrap_v1","before":"CREATE FUNCTION ","after":"CREATE OR REPLACE FUNCTION ","count":1},{"name":"annual_budget_command_v1","before":"ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL","after":"ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'positionActorVerified')::boolean,false)","count":1},{"name":"annual_budget_command_v1","before":"CREATE FUNCTION ","after":"CREATE OR REPLACE FUNCTION ","count":1},{"name":"position_assignment_proposal_v1","before":"ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL","after":"ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'positionActorVerified')::boolean,false)","count":1},{"name":"position_assignment_proposal_v1","before":"CREATE FUNCTION ","after":"CREATE OR REPLACE FUNCTION ","count":1},{"name":"position_assignment_bootstrap_v1","before":"ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL","after":"ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'positionActorVerified')::boolean,false)","count":2},{"name":"position_assignment_command_v1","before":"ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL","after":"ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'positionActorVerified')::boolean,false)","count":1}];
const names=Object.freeze(Object.keys(expectedDefinitions));
const facades=new Set(['annual_budget_bootstrap_v1','annual_budget_attempt_v1','annual_budget_command_v1','position_assignment_bootstrap_v1','position_assignment_attempt_v1','position_assignment_command_v1','position_assignment_capture_v1']);
const projectionContracts=Object.freeze({'127-own':[11,4],'128-own':[11,4],'128-prerequisites':[13,2],'adopted-v2-after':[5,2],'adopted-v2-dependencies':[27,5],'210-prerequisites':[32,7],'210-final':[34,7]});
export const POSITION_ADMIN216_SQL_PATH='scripts/migrations/216-own-position-administrative-identity.sql';
export const POSITION_ADMIN216_SQL_SHA256='08cb2819b52a6da94ce8158a2b20c9d1739e0e742331dee171b92d11d6a66e68';
const helperHash='40e6479ce2c606cdf29a4a6ef96895abdb38c31c387450246dd1a8134b52f24d';
const inheritedV2ResolveProjection={"name":"position_assignment_resolve_v1","source":"scripts/migrations/128-own-position-assignments.sql","producer":"scripts/lib/adopted-positions-installation.mjs","operators":[{"before":"public.native_employment_lifecycle_range_v1(ctx,","after":"public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),","count":1},{"before":"CREATE FUNCTION ","after":"CREATE OR REPLACE FUNCTION ","count":1}],"originalDefinitionSha256":"aac7a3080eab684df8628403c27933944857d8ab066facf442b0d600819290a3","originalBodySha256":"16efa210515d6cbc7ac37ba777e984ce5adf4612eedf30563bba03d91a3ada69","adoptedV2DefinitionSha256":"98cf9e6cb63cfa6ce82578b5059f6c810595c5f09f23632573a32a76204a3698","adoptedV2BodySha256":"a60140ecbc0492f386d836f6b1881011ae0496e7c08787c40298a3fb1154672a","changesSql216":false,"projectionOnly":true};
const helperBodyHash='824ab34678fc322e0e4af3db02aea1411c6643460ec7262a1a6eb7a397455636';
const minted=new WeakSet();
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
const body=definition=>{const match=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*$/.exec(definition);assert.ok(match,'POSITION_ADMIN216_BODY_REQUIRED');return match[2];};
const apply=(value,operators,code)=>{for(const {before,after,count}of operators){assert.equal(value.split(before).length,count+1,code);value=value.replaceAll(before,()=>after);}return value;};
const invert=(value,operators)=>apply(value,[...operators].reverse().map(({before,after,count})=>({before:after,after:before,count})),'POSITION_ADMIN216_INVERSE_ANCHOR');
const pin=definition=>{const p=ownInstallationFunctionPin(definition);return {...p,runtime:facades.has(p.name)};};
const definition=(source,name)=>{const found=splitPostgresStatements(source).map(clean).filter(value=>value.startsWith('CREATE FUNCTION public.'+name+'('));assert.equal(found.length,1,'POSITION_ADMIN216_DEFINITION_REQUIRED:'+name);return found[0];};

export function buildPositionAdministrativeIdentity216Source({read,sourceCommit}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const sources=new Map(),sourceHashes={};
 for(const [file,expected]of Object.entries(sourcePins)){
  const value=lf(read(file));assert.equal(Buffer.byteLength(value),expected.lfBytes,'POSITION_ADMIN216_SOURCE_BYTES:'+file);
  assert.equal(hash(value),expected.lfSha256,'POSITION_ADMIN216_SOURCE_SHA:'+file);sources.set(file,value);sourceHashes[file]=expected.lfSha256;
 }
 // The approved BUDGET_READ contract is checked as source, not inferred from a role.
 assert.equal(sources.get('assets/annual-position-budget-model.js').split("export const BUDGET_READ=Object.freeze(['workforce.employee.read','workforce.structure.read']);").length,2,'POSITION_ADMIN216_BUDGET_READ_CHANGED');
 const rawHelper=[...sources.get('scripts/lib/salary-administrative-identity-installation.mjs').matchAll(/export const SALARY_ADMINISTRATIVE_CONTEXT=\x60([\s\S]*?)\x60;/g)];
 assert.equal(rawHelper.length,1,'POSITION_ADMIN216_APPROVED_HELPER_REQUIRED');
 const helperDefinition=apply(rawHelper[0][1],helperOperators,'POSITION_ADMIN216_HELPER_ANCHOR');
 assert.equal(invert(helperDefinition,helperOperators),rawHelper[0][1],'POSITION_ADMIN216_HELPER_WHOLE_INVERSE');
 assert.equal(hash(helperDefinition),helperHash);assert.equal(hash(body(helperDefinition)),helperBodyHash);
 const originalDefinitions=[],beforeDefinitions=[],afterDefinitions=[];
 for(const name of names){
  const source=sources.get(name.startsWith('annual_')?'scripts/migrations/127-annual-position-budget.sql':'scripts/migrations/128-own-position-assignments.sql');
  const original=definition(source,name),expected=expectedDefinitions[name];
  assert.equal(hash(original),expected.originalRawDefinitionSha256,'POSITION_ADMIN216_ORIGINAL_DEFINITION:'+name);
  const operators=adoptedOperators.filter(operator=>operator.name===name);
  const before=apply(original,operators,'POSITION_ADMIN216_ADOPTED_V2_ANCHOR');
  assert.equal(invert(before,operators),original,'POSITION_ADMIN216_ADOPTED_WHOLE_INVERSE');
  assert.equal(hash(before),expected.beforeDefinitionSha256);assert.equal(hash(body(before)),expected.beforeBodySha256);
  const forward=forwardOperators.filter(operator=>operator.name===name);
  const after=apply(before,forward,'POSITION_ADMIN216_FORWARD_ANCHOR');
  assert.equal(invert(after,forward),before,'POSITION_ADMIN216_FORWARD_WHOLE_INVERSE');
  assert.equal(hash(after),expected.afterDefinitionSha256);assert.equal(hash(body(after)),expected.afterBodySha256);
  assert.deepEqual({...pin(before),sha256:null},{...pin(after),sha256:null},'POSITION_ADMIN216_EXISTING_METADATA_CHANGED');
  originalDefinitions.push(original);beforeDefinitions.push(before);afterDefinitions.push(after);
 }
 const sql=lf(read(POSITION_ADMIN216_SQL_PATH));assert.equal(Buffer.byteLength(sql),23916,'POSITION_ADMIN216_SQL_BYTES');assert.equal(hash(sql),POSITION_ADMIN216_SQL_SHA256,'POSITION_ADMIN216_SQL_SHA');sourceHashes[POSITION_ADMIN216_SQL_PATH]=POSITION_ADMIN216_SQL_SHA256;
 const migration=splitPostgresStatements(sql).map(clean);
 const revoke='REVOKE ALL ON FUNCTION public.position_administrative_context_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app';
 assert.deepEqual(migration,[helperDefinition,revoke,...afterDefinitions],'POSITION_ADMIN216_COMPLETE_MIGRATION');
 const beforePins=beforeDefinitions.map(pin),afterPins=afterDefinitions.map(pin),helperPin={...ownInstallationFunctionPin(helperDefinition),runtime:false};
 // The 128-own producer is ORIGINAL128, not adopted-v2. Its later projection
 // also inherits resolve_v1 already installed by the separately pinned v2 stage.
 const own128Definitions=splitPostgresStatements(sources.get('scripts/migrations/128-own-position-assignments.sql')).map(clean).filter(value=>/^CREATE FUNCTION public\.position_assignment_/.test(value));
 assert.equal(own128Definitions.length,11,'POSITION_ADMIN216_128_SOURCE_COUNT');
 const resolveOriginal=own128Definitions.find(value=>value.startsWith('CREATE FUNCTION public.position_assignment_resolve_v1('));
 assert.ok(resolveOriginal,'POSITION_ADMIN216_128_RESOLVE_REQUIRED');
 assert.equal(hash(resolveOriginal),inheritedV2ResolveProjection.originalDefinitionSha256);
 const resolveV2=apply(resolveOriginal,inheritedV2ResolveProjection.operators,'POSITION_ADMIN216_V2_RESOLVE_ANCHOR');
 assert.equal(invert(resolveV2,inheritedV2ResolveProjection.operators),resolveOriginal,'POSITION_ADMIN216_V2_RESOLVE_WHOLE_INVERSE');
 assert.equal(hash(resolveV2),inheritedV2ResolveProjection.adoptedV2DefinitionSha256);assert.equal(hash(body(resolveV2)),inheritedV2ResolveProjection.adoptedV2BodySha256);
 assert.deepEqual({...pin(resolveOriginal),sha256:null},{...pin(resolveV2),sha256:null},'POSITION_ADMIN216_V2_RESOLVE_METADATA_CHANGED');
 const own128OriginalPins=own128Definitions.map(pin),target216=new Map(afterPins.map(value=>[value.name,value]));
 const own128AfterPins=own128OriginalPins.map(value=>target216.get(value.name)??(value.name==='position_assignment_resolve_v1'?pin(resolveV2):value));

 assert.equal(new Set(beforePins.map(value=>value.signature)).size,7);assert.equal(afterPins.filter(value=>value.runtime).length,4);
 const plan={version:'position-administrative-identity216-source.v1',sourceCommit,sourceHashes,sourceOnly:true,connects:false,executesSql:false,
  changes:{newTables:0,newFunctions:1,adaptedFunctions:7,newRuntimeFacades:0,newCapabilities:0,roleAssignments:0,existingAclChanges:0,associationWrites:0,businessWrites:0},
  originalDefinitions,beforeDefinitions,afterDefinitions,helperDefinition,helperPin,beforePins,afterPins,migration,own128OriginalPins,own128AfterPins,
  beforeCheck:pinsCheck(beforePins,'POSITION_ADMIN216_PREDECESSOR_CHANGED'),afterCheck:pinsCheck([...afterPins,helperPin],'POSITION_ADMIN216_SUCCESSOR_CHANGED'),
  predecessorEpoch:'127-128-129/adopted-positions-v2/210',requiresFuturePreservationInstaller:true};
 minted.add(plan);return freeze(plan);
}

// Exact, source-minted pin projection for LATER guards only. Apply before the
// canonical host localizes public schema/body/config. Historical plans stay intact.
// The helper must ALSO be checked privately using plan.afterCheck; it is not a facade.
export function projectPositionAdministrativeIdentity216Pins(plan,pins,epoch){
 assert.ok(minted.has(plan),'POSITION_ADMIN216_SOURCE_PLAN_REQUIRED');
 assert.ok(Object.hasOwn(projectionContracts,epoch),'POSITION_ADMIN216_PROJECTION_EPOCH');
 const [count,affected]=projectionContracts[epoch];assert.equal(pins.length,count,'POSITION_ADMIN216_PROJECTION_COUNT');
 assert.equal(new Set(pins.map(value=>value.signature)).size,count,'POSITION_ADMIN216_DUPLICATE_PIN');
 if(epoch==='128-own'){
  assert.deepEqual(pins,plan.own128OriginalPins,'POSITION_ADMIN216_FOREIGN_PREDECESSOR');
  assert.equal(plan.own128AfterPins.filter((value,index)=>value.sha256!==pins[index].sha256).length,affected,'POSITION_ADMIN216_PROJECTION_TARGETS');
  return freeze(plan.own128AfterPins.map(value=>structuredClone(value)));
 }

 const lookup=new Map(plan.beforePins.map((value,index)=>[value.signature,{before:value,after:plan.afterPins[index]}]));let changed=0;
 const projected=pins.map(value=>{const wanted=lookup.get(value.signature);if(!wanted)return structuredClone(value);assert.deepEqual(value,wanted.before,'POSITION_ADMIN216_FOREIGN_PREDECESSOR');changed++;return structuredClone(wanted.after);});
 assert.equal(changed,affected,'POSITION_ADMIN216_PROJECTION_TARGETS');return freeze(projected);
}
