// Explicit SOURCE profile. Legacy104 builders remain byte-identical.
// Generates text only; no transport, fixture write, admission or connection.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {buildAnnualBudgetInstallation,assertAnnualBudgetDurability} from './annual-position-budget-installation.mjs';
import {buildPositionInstallation,assertPositionDurability} from './position-assignment-installation.mjs';
import {buildComparisonInstallation,assertComparisonDurability} from './position-comparison-installation.mjs';
import {monthlyQaRuntimeAcl} from './own-monthly-participation-qa.mjs';
import {monthlyFixedQaHeader} from './own-monthly-day-fixed-composition-qa.mjs';

export const CANONICAL_POSITION_PROFILE='canonical190193.v1';
const hash=s=>createHash('sha256').update(s).digest('hex'),lf=s=>s.replace(/\r\n?/g,'\n');
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const strip=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const body=s=>{const m=/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?\s*$/.exec(s);assert.ok(m,'M10_PROFILE_FUNCTION_BODY');return m[2];};
const fixed=s=>s.replace(/^CREATE OR REPLACE FUNCTION /,'CREATE FUNCTION ');
const one=(s,a,b,label)=>{assert.equal(s.split(a).length,2,'M10_PROFILE_ANCHOR:'+label);return s.replace(a,()=>b);};
const names199=['annual_budget_context_v1','annual_budget_proposal_v1','annual_budget_bootstrap_v1','annual_budget_command_v1','position_assignment_proposal_v1','position_assignment_bootstrap_v1','position_assignment_command_v1'];
const new198=['position_comparison_annual_value_v2','position_comparison_annual_v2','position_comparison_positions_v2','position_comparison_detail_v2'];
const runtime198=new Set(['position_comparison_annual_v2','position_comparison_detail_v2']);
const sqlFiles={127:'scripts/migrations/127-annual-position-budget.sql',128:'scripts/migrations/128-own-position-assignments.sql',129:'scripts/migrations/129-own-position-comparison.sql',198:'scripts/migrations/198-own-position-comparison-v2.sql',199:'scripts/migrations/199-structure-administrative-operator.sql'};
const sourceHashesRequired=Object.freeze({
 'scripts/migrations/127-annual-position-budget.sql':'43466ffdfa8a93b5aa03066bbc275a5d0e247e2965def21278b338d65988f89d',
 'scripts/migrations/128-own-position-assignments.sql':'d50a2a14e478868b4086514fc0ddd47bd116ba761a88b0a2ff28e36866ce1e78',
 'scripts/migrations/129-own-position-comparison.sql':'023ad52a441df027ea8121a404777fbe4424dbbcfcdbeca6ca30b7475e17bc3c',
 'scripts/migrations/198-own-position-comparison-v2.sql':'6d478ec7655a55963c36ce6f8b78712b7343f149901edd5b326b34bc3bbb1370',
 'scripts/migrations/199-structure-administrative-operator.sql':'038d2b5ae18a018bea4f0bfcfecc408c2617512842f6ddb74c8b0d4ab7b35988',
 'scripts/migrations/104-native-employment-changes.sql':'0f3e408bb12ef64c0d197826ce4331b263987c6d7f36719e528648f4b750de4a',
 'scripts/migrations/137-adopted-operator-context.sql':'b1db803f7d50d6a744cfdf8bf5fcc8af08395ca9b6d67f8704cde4b7eab64d0f',
 'scripts/migrations/006-tenant-action-authority.sql':'0d00147d965884f163b614d2fc1f8f167c27dd91060b101495c08b2275563e4a'
});
const definition=(source,name)=>{const rows=splitPostgresStatements(source).map(strip).filter(s=>new RegExp('^CREATE(?: OR REPLACE)? FUNCTION public\\.'+name+'\\(').test(s));assert.equal(rows.length,1,'M10_PROFILE_DEFINITION:'+name);return rows[0];};

// Exact104->137 source derivation; no catalogue input and no alternate hash.
export function canonicalPositionContext137({source104,source137}){
 assert.equal(hash(lf(source104)),sourceHashesRequired['scripts/migrations/104-native-employment-changes.sql']);
 assert.equal(hash(lf(source137)),sourceHashesRequired['scripts/migrations/137-adopted-operator-context.sql']);
 const prior=definition(lf(source104),'native_employment_change_context_v1');
 const calls=[...source137.matchAll(/(?:old_call|new_call) text:='((?:[^']|'')*)';/g)].map(m=>m[1].replaceAll("''","'"));assert.equal(calls.length,2);
 const after=one(prior,calls[0],calls[1],'context137');
 assert.equal(ownInstallationFunctionPin(prior).sha256,'b821464173f73ed7457a2892e246febfe6ab8535df4f37778b2366283c84cb7d');
 assert.equal(ownInstallationFunctionPin(after).sha256,'2e333bd185ce509f3f4715d83f48ce6a37341dfd32ef3e56e21942ff6995fe7b');
 assert.equal(one(after,calls[1],calls[0],'context137-inverse'),prior);
 return {before:fixed(prior),after:fixed(after),inverseExact:true};
}

// Every prerequisite must be in the SOURCE foundation/stages. Unknown differences
// stop, rather than turning observed state or an arbitrary caller pin into expected.
export function composeCanonicalPositionPrerequisites({pins,definitions,context137}){
 const map=new Map();for(const value of definitions){const d=fixed(strip(value)),m=/^CREATE FUNCTION public\.(\w+)\(/.exec(d);if(!m)continue;map.set(m[1],[...(map.get(m[1])??[]),d]);}
 const beforeContext=ownInstallationFunctionPin(context137.before),afterContext=ownInstallationFunctionPin(context137.after);
 return pins.map(p=>{
  let expected=p;if(p.signature===beforeContext.signature){assert.deepEqual({...p,runtime:false},{...beforeContext,runtime:false},'M10_PROFILE_LEGACY104_PIN');expected={...p,sha256:afterContext.sha256};}
  const candidates=map.get(expected.name);assert.ok(candidates,'M10_PROFILE_SOURCE_PREREQUISITE_MISSING:'+expected.signature);assert.equal(candidates.length,1,'M10_PROFILE_DUPLICATE_SOURCE:'+expected.signature);const d=candidates[0];
  assert.deepEqual({...ownInstallationFunctionPin(d),runtime:expected.runtime},expected,'M10_PROFILE_SOURCE_PREREQUISITE_CHANGED:'+expected.signature);
  return expected;
 });
}

export function canonicalPositionProjection({definitions,normalized,schema}){
 assert.equal(typeof normalized,'function');assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const rows=definitions.map(d=>({definition:d,pin:ownInstallationFunctionPin(d)}));assert.equal(rows.length,37,'M10_PROFILE_ALL37_SOURCE_VERSIONS_REQUIRED');
 const hashes={},base=rows.map(r=>normalized(r.definition)),apply=s=>{let out=s;for(const[a,b]of Object.entries(hashes))out=out.replaceAll(a,b);return out;};let stable=false;
 for(let pass=0;pass<32;pass++){const next={...hashes};let changed=false;for(let n=0;n<rows.length;n++){const from=rows[n].pin.sha256,to=hash(body(apply(base[n])));if(next[from]!==to){next[from]=to;changed=true;}}Object.assign(hashes,next);if(!changed){stable=true;break;}}
 assert.ok(stable,'M10_PROFILE_HASH_GRAPH_CYCLE');for(const[a,b]of Object.entries(hashes))assert.ok(a===b||!Object.hasOwn(hashes,b),'M10_PROFILE_HASH_ALIAS');
 const project=s=>apply(normalized(s));
 const localPin=(d,runtime)=>{const local=project(d),at=local.search(/\bAS\s+\$/);assert.ok(at>0);const h=one(local.slice(0,at),'FUNCTION '+schema+'.','FUNCTION public.','QA-header');const p=ownInstallationFunctionPin(h+local.slice(at));return{...p,signature:p.signature.replace(/^public\./,schema+'.'),runtime};};
 const ledger=rows.map(r=>{const local=project(r.definition);assert.equal(hash(body(local)),hashes[r.pin.sha256]);return{sourceSignature:r.pin.signature,sourceDefinitionSha256:hash(r.definition),sourceProsrcSha256:r.pin.sha256,expectedQaSignature:localPin(r.definition,false).signature,expectedQaProsrcSha256:hash(body(local)),projectedDefinitionSha256:hash(local)};});
 return {normalized:project,localPin,hashes,ledger,observedMetadataUsed:false};
}
const transactionGuard=readOnly=>`DO $m10_transaction$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${readOnly?"'on'":"'off'"} OR current_setting('standard_conforming_strings')<>'on' THEN RAISE EXCEPTION 'M10_PROFILE_TRANSACTION_REQUIRED';END IF;END $m10_transaction$`;
const namespaceCounts=`DO $m10_counts$ BEGIN IF(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'annual_budget_%')<>11 OR(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'position_assignment_%')<>11 OR(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'position_comparison_%')<>8 THEN RAISE EXCEPTION 'M10_PROFILE_FUNCTION_COUNT';END IF;END $m10_counts$`;
// This profile's seed explicitly extracts006. It does not claim that the product
// schema009 has this PK, and does not accept either version as a fallback.
const fixtureIdentityGuard=`DO $m10_identity$ DECLARE r oid:=to_regclass('public.tenant_action_employment_link');BEGIN
 IF r IS NULL OR(SELECT count(*) FROM pg_constraint k JOIN pg_index i ON i.indexrelid=k.conindid AND i.indrelid=k.conrelid WHERE k.conrelid=r AND k.contype='p' AND k.convalidated AND NOT k.condeferrable AND NOT k.condeferred AND k.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=r AND attname='membership_id' AND NOT attisdropped)]::smallint[] AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate AND i.indexprs IS NULL AND i.indpred IS NULL AND i.indnatts=i.indnkeyatts)<>1 THEN RAISE EXCEPTION 'M10_PROFILE_FIXTURE006_LINK_UNIQUENESS';END IF;
 IF EXISTS(SELECT 1 FROM public.tenant_action_employment_link WHERE active AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'M10_PROFILE_LINK_STATE';END IF;END $m10_identity$`;

function replacePrerequisitePhase(values,prior,next,count){assert.equal(values.filter(s=>s===prior).length,count,'M10_PROFILE_PHASE_GUARD_COUNT');return values.map(s=>s===prior?next:s);}
function fullSnapshot(slot,label,excluded){
 let s=preservationSnapshot(slot);const table="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";assert.equal(s.split(table).length,3);s=s.replaceAll(table,'true');
 s=one(s,"NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')","NOT(s.nspname='public' AND p.proname IN("+excluded.map(q).join(',')+"))",'snapshot-functions');
 return s.replaceAll('municontrol_sql111.',label+'.');
}
const noHistory=`DO $m10_no_history$ BEGIN IF EXISTS(SELECT 1 FROM public.annual_position_budget_event) OR EXISTS(SELECT 1 FROM public.own_position_assignment_event) OR EXISTS(SELECT 1 FROM public.own_payroll_run_position_capture) OR EXISTS(SELECT 1 FROM public.own_payroll_run_position_dimensions) OR EXISTS(SELECT 1 FROM public.own_payroll_run_capture) OR EXISTS(SELECT 1 FROM public.own_payroll_run_result) OR EXISTS(SELECT 1 FROM public.own_payroll_close_event) THEN RAISE EXCEPTION 'M10_PROFILE_REVERSAL_HISTORY_EXISTS';END IF;END $m10_no_history$`;
// Rehearsal executes every installation expression under one ROLLBACK.
// Phase proofs remain evaluated but do not create extra transport rows; only
// the final complete-profile verification is returned by the strict parser.
export function composeCanonicalPositionRehearsal(stages,verification){
 assert.deepEqual(stages.map(s=>s.number),[127,128,129,199,198],'M10_PROFILE_REHEARSAL_STAGES');
 assert.equal(verification.filter(s=>/^SELECT\b/.test(s)).length,1,'M10_PROFILE_REHEARSAL_FINAL_PROOF');assert.ok(/^SELECT\b/.test(verification.at(-1)),'M10_PROFILE_REHEARSAL_FINAL_PROOF_LAST');
 return [...stages.flatMap(stage=>{
  const statements=stage.installation,proofs=statements.filter(s=>/^SELECT\b/.test(s));assert.equal(proofs.length,1,'M10_PROFILE_REHEARSAL_PHASE_PROOF');assert.equal(statements.at(-1),proofs[0],'M10_PROFILE_REHEARSAL_PHASE_PROOF_LAST');
  assert.ok(proofs[0].startsWith('SELECT jsonb_'),'M10_PROFILE_REHEARSAL_PROOF_EXPRESSION');
  const expression=proofs[0].slice('SELECT '.length).replace(/ AS proof$/,'');
  return [...statements.slice(0,-1),'DO $m10_rehearsal_phase$ BEGIN PERFORM '+expression+';END $m10_rehearsal_phase$'];
 }),...verification];
}

function additiveStage({number,source,originals,definitions,oldPins,newPins,normalize,sourceCommit}){
 const label='municontrol_m10_'+number,names=definitions.map(d=>ownInstallationFunctionPin(d).name),before=fullSnapshot('before',label,names),after=fullSnapshot('after',label,names);
 const prior=`DO $m10_prior$ BEGIN IF current_setting('${label}.before')::jsonb IS DISTINCT FROM current_setting('${label}.after')::jsonb THEN RAISE EXCEPTION 'M10_PROFILE_PRIOR_STATE_CHANGED';END IF;END $m10_prior$`;
 const oldCheck=pinsCheck(oldPins,'M10_PROFILE_BEFORE_METADATA'),newCheck=pinsCheck(newPins,'M10_PROFILE_AFTER_METADATA');
 const metadata=`(SELECT encode(public.digest(coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]')::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid IN(SELECT to_regprocedure(value->>'signature') FROM jsonb_array_elements(${q(JSON.stringify(newPins))}::jsonb)))`;
 const proof=installed=>`SELECT jsonb_build_object('version','m10-canonical-composition-proof.v1','sourceCommit',${q(sourceCommit)},'phase',${number},'sourceSha256',${q(hash(source))},'allChecksPassed',true,${installed?"'beforeFingerprint',encode(public.digest(current_setting('"+label+".before'),'sha256'),'hex'),":''}'afterFingerprint',encode(public.digest(current_setting('${label}.after'),'sha256'),'hex'),'metadataFingerprint',${metadata},'rowsWritten',0,'identityAssignmentsAdded',0)`;
 const preserveMeta=slot=>`DO $m10_preserve_meta$ BEGIN PERFORM set_config('${label}.${slot}',(SELECT coalesce(jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid),'[]')::text FROM pg_proc p WHERE p.oid IN(SELECT to_regprocedure(value->>'signature') FROM jsonb_array_elements(${q(JSON.stringify(oldPins))}::jsonb))),true);END $m10_preserve_meta$`;
 const metaCheck=`DO $m10_identity$ BEGIN IF current_setting('${label}.function_before') IS DISTINCT FROM current_setting('${label}.function_after') THEN RAISE EXCEPTION 'M10_PROFILE_REPLACEMENT_METADATA_CHANGED';END IF;END $m10_identity$`;
 const mutations=splitPostgresStatements(source);assert.ok(mutations.every(s=>!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/.test(s)));
 const install=[transactionGuard(false),fixtureIdentityGuard,oldCheck,before,...(number===199?[preserveMeta('function_before')]:[]),...mutations,after,prior,...(number===199?[preserveMeta('function_after'),metaCheck]:[]),newCheck,proof(true)];
 const durable=[transactionGuard(true),fixtureIdentityGuard,newCheck,after,proof(false)];
 const reversal=number===199?originals.map(d=>one(d,'CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ','reversal199-header')):[...definitions].reverse().map(d=>'DROP FUNCTION '+ownInstallationFunctionPin(d).signature+' RESTRICT');
 return {number,sourceCommit,sourceSha256:hash(source),originals,definitions,oldPins,newPins,installation:install.map(normalize),durableVerification:durable.map(normalize),
  repetition:{expectedError:'M10_PROFILE_ALREADY_INSTALLED',statements:[transactionGuard(false),newCheck,"DO $repeat$ BEGIN RAISE EXCEPTION 'M10_PROFILE_ALREADY_INSTALLED';END $repeat$"].map(normalize)},
  reversalWithoutHistory:[transactionGuard(false),noHistory,newCheck,before,...(number===199?[preserveMeta('function_before')]:[]),...reversal,after,prior,...(number===199?[preserveMeta('function_after'),metaCheck,oldCheck]:[])].map(normalize),connects:false,executesSql:false};
}

export function buildCanonicalPositionComparisonInstallation({qa,read,sourceCommit,profile}){
 assert.equal(profile,CANONICAL_POSITION_PROFILE,'M10_PROFILE_EXPLICIT_SELECTION_REQUIRED');assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.equal(qa.sourceCommit,sourceCommit);
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok(['own-monthly-day-fixed-composition-qa.v1','own-novelty-succession-qa.v1'].includes(qa.version));assert.equal(typeof qa.normalized,'function');assert.equal(qa.run7Included,false);
 const sourceHashes={},cache=new Map(),load=file=>{if(!cache.has(file)){const s=lf(read(file));if(Object.hasOwn(sourceHashesRequired,file))assert.equal(hash(s),sourceHashesRequired[file],'M10_PROFILE_SOURCE_CHANGED:'+file);sourceHashes[file]=hash(s);cache.set(file,s);}return cache.get(file);};
 for(const f of Object.keys(sourceHashesRequired))load(f);
 const canonical=qa.qa193?.foundation?.base?.definitions;assert.ok(Array.isArray(canonical)&&canonical.length>0,'M10_PROFILE_CANONICAL190_DEFINITIONS_REQUIRED');const available=[...canonical];
 const context137=canonicalPositionContext137({source104:load('scripts/migrations/104-native-employment-changes.sql'),source137:load('scripts/migrations/137-adopted-operator-context.sql')});
 const batches=[[127,buildAnnualBudgetInstallation],[128,buildPositionInstallation],[129,buildComparisonInstallation]].map(([number,build])=>({number,batch:build({read:load,sourceCommit})}));
 const sourceDefinitions=batches.flatMap(({number})=>splitPostgresStatements(load(sqlFiles[number])).map(strip).filter(s=>/^CREATE FUNCTION public\./.test(s)));assert.equal(sourceDefinitions.length,26);
 const after199=splitPostgresStatements(load(sqlFiles[199])).map(strip).filter(s=>/^CREATE OR REPLACE FUNCTION public\./.test(s));assert.deepEqual(after199.map(s=>ownInstallationFunctionPin(s).name),names199);
 const defs198=splitPostgresStatements(load(sqlFiles[198])).map(strip).filter(s=>/^CREATE FUNCTION public\./.test(s));assert.deepEqual(defs198.map(s=>ownInstallationFunctionPin(s).name),new198);
 const projection=canonicalPositionProjection({definitions:[...sourceDefinitions,...after199,...defs198],normalized:qa.normalized,schema:qa.schema}),normalize=projection.normalized,stages=[],ledger=[];
 // Current source versions after190->194->196->197, not a pg_proc observation.
 // Inspect only requested names; unrelated canonical helpers may have headers
 // outside the old metadata parser's domain and must not be parsed by accident.
 const currentDefinitions=new Map();for(const d of [...canonical,...(qa.batch?.adapted??[]),...(qa.fixedComposition?.adapted??[]),...(qa.novelty197?.adapted??[])]){const clean=monthlyFixedQaHeader(fixed(strip(d))),m=/^CREATE FUNCTION public\.(\w+)\(/.exec(clean);if(m)currentDefinitions.set(m[1],clean);}
 const runtimeSource=monthlyQaRuntimeAcl(qa.qa193.foundation.seed,qa.schema);
 const supportNames=['native_employee_context_v1','native_employee_read_projection_v1','action_center_context_has_capability','own_run_context_v1','own_close_context_v1','own_run_hash_v1','own_run_receipt_v1','own_run_saved_v1','own_program_definition_v1','own_program_exact_v1','own_participation_rules_v1'];
 const supportDefinitions=supportNames.map(name=>{const d=currentDefinitions.get(name);assert.ok(d,'M10_PROFILE_CURRENT_SUPPORT_SOURCE_MISSING:'+name);return d;});
 const supportPins=supportDefinitions.map(d=>{const p=ownInstallationFunctionPin(d),key=p.signature.replace(/^public\./,qa.schema+'.');return{...p,runtime:runtimeSource.has(key)};});
 const supportCheck=pinsCheck(supportPins,'M10_PROFILE_CURRENT_SUPPORT_CHANGED');
 for(const{number,batch}of batches){
  const prerequisites=composeCanonicalPositionPrerequisites({pins:batch.prerequisitePins,definitions:available,context137});const oldCheck=pinsCheck(batch.prerequisitePins,'SQL'+number+'_PREREQUISITE_CHANGED'),newCheck=pinsCheck(prerequisites,'SQL'+number+'_PREREQUISITE_CHANGED');
  const compose=(values,count,ro)=>[transactionGuard(ro),fixtureIdentityGuard,supportCheck,...replacePrerequisitePhase(values,oldCheck,newCheck,count)].map(normalize);
  const installation=compose(batch.installation,2,false),durableVerification=compose(batch.durableVerification,1,true);
  ledger.push({phase:number,originalPrerequisitePins:batch.prerequisitePins,prerequisitePins:prerequisites,changed:prerequisites.filter((p,n)=>p.sha256!==batch.prerequisitePins[n].sha256),installationOtherStatementsUnchanged:true,durableOtherStatementsUnchanged:true});
  stages.push({number,sourceCommit,sourceSha256:hash(load(sqlFiles[number])),installation,durableVerification,repetition:{statements:installation,expectedError:'SQL'+number+'_OBJECT_CONFLICT'},ownPins:batch.ownPins,prerequisitePins:prerequisites,expectedQaOwnPins:JSON.parse(normalize(JSON.stringify(batch.ownPins))),original:batch,connects:false,executesSql:false});
  for(const d of sourceDefinitions.filter(d=>batch.ownPins.some(p=>p.signature===ownInstallationFunctionPin(d).signature)))available.push(d);
 }
 const before199=after199.map(d=>{const name=ownInstallationFunctionPin(d).name;const old=sourceDefinitions.filter(s=>ownInstallationFunctionPin(s).name===name);assert.equal(old.length,1);return old[0];});
 const pinOf=(d,runtime)=>({...ownInstallationFunctionPin(d),runtime});const runtimeAll=new Map(batches.flatMap(({batch})=>batch.ownPins.map(p=>[p.signature,p.runtime])));
 const old199Pins=before199.map(d=>pinOf(d,runtimeAll.get(ownInstallationFunctionPin(d).signature))),new199Pins=after199.map((d,n)=>pinOf(d,old199Pins[n].runtime));
 stages.push(additiveStage({number:199,source:load(sqlFiles[199]),originals:before199,definitions:after199,oldPins:old199Pins,newPins:new199Pins,normalize,sourceCommit}));
 stages.push(additiveStage({number:198,source:load(sqlFiles[198]),originals:[],definitions:defs198,oldPins:[],newPins:defs198.map(d=>pinOf(d,runtime198.has(ownInstallationFunctionPin(d).name))),normalize,sourceCommit}));
 const final=new Map(sourceDefinitions.map(d=>[ownInstallationFunctionPin(d).signature,d]));for(const d of [...after199,...defs198])final.set(ownInstallationFunctionPin(d).signature,d);assert.equal(final.size,30);
 const finalPins=[...final.values()].map(d=>pinOf(d,runtime198.has(ownInstallationFunctionPin(d).name)||runtimeAll.get(ownInstallationFunctionPin(d).signature)===true));
 const objects=batches.map(({number,batch})=>number===129?one(batch.objectsCheck,"proname LIKE 'position_comparison_%')<>4","proname LIKE 'position_comparison_%')<>8",'final129-count'):batch.objectsCheck);
 const sourceFingerprint=hash(JSON.stringify(Object.entries(sourceHashes).sort(([a],[b])=>a<b?-1:1)));
 const expectedVerification={version:'m10-canonical-composition-verification.v1',profile,sourceCommit,schema:qa.schema,sourceFingerprint,functions:30,tables:4,standardConformingStrings:'on',beforeB0:true};
 const finalProof=`SELECT ${q(JSON.stringify(expectedVerification))}::jsonb||jsonb_build_object('stateFingerprint',encode(public.digest(jsonb_build_object('functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(SELECT to_regprocedure(value->>'signature') FROM jsonb_array_elements(${q(JSON.stringify([...finalPins,...supportPins]))}::jsonb))),'tables',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c WHERE c.oid IN('public.annual_position_budget_event'::regclass,'public.own_position_assignment_event'::regclass,'public.own_payroll_run_position_capture'::regclass,'public.own_payroll_run_position_dimensions'::regclass)))::text,'sha256'),'hex'))`;
 // The two later phases additionally pin the same pre-existing support bodies.
 for(const stage of stages.filter(s=>s.number===199||s.number===198))for(const key of ['installation','durableVerification','reversalWithoutHistory'])stage[key].splice(1,0,normalize(supportCheck));
 const verification=[transactionGuard(true),fixtureIdentityGuard,supportCheck,...objects,pinsCheck(finalPins,'M10_PROFILE_FINAL_METADATA'),namespaceCounts,finalProof].map(normalize);
 const rehearsalVerification=verification.map(s=>s===normalize(transactionGuard(true))?normalize(transactionGuard(false)):s);
 return {version:'m10-canonical-composition-plan.v1',profile,sourceCommit,schema:qa.schema,normalized:normalize,sourceHashes,context137,projectionLedger:projection.ledger,projectionHashes:projection.hashes,prerequisiteLedger:ledger,stages,supportDefinitions,supportPins,
  verification,rehearsal:{statements:composeCanonicalPositionRehearsal(stages,rehearsalVerification),requiredIsolation:'repeatable read',requiredReadOnly:false,requiredEnd:'ROLLBACK'},expectedVerification,finalPins,expectedQaFinalPins:[...final.values()].map(d=>projection.localPin(d,finalPins.find(p=>p.signature===ownInstallationFunctionPin(d).signature).runtime)),
  beforeB0Required:true,prior190To197PhaseArraysRewritten:false,legacy104BuildersChanged:false,transportPreconditions:{standardConformingStrings:'on',observed:null,statement:'SELECT current_setting(\'standard_conforming_strings\') AS standard_conforming_strings',mustObserveOnEachNativeConnectionBeforeRendering:true},
  fixtureCapabilitiesOrRolesWritten:0,fixtureIdentityContract:'006 membership_id PRIMARY KEY; production009 active index is not an accepted alternative in this profile',executionAdmitted:false,connects:false,executesSql:false};
}

export function assertCanonicalPositionStageDurability({stage,installed,durable}){
 assert.ok(stage&&[127,128,129,199,198].includes(stage.number),'M10_PROFILE_STAGE_REQUIRED');
 if(stage.number===127)return assertAnnualBudgetDurability({installed,durable,sourceCommit:stage.sourceCommit});
 if(stage.number===128)return assertPositionDurability({installed,durable,sourceCommit:stage.sourceCommit});
 if(stage.number===129)return assertComparisonDurability({installed,durable,sourceCommit:stage.sourceCommit});
 assert.deepEqual(Object.keys(installed).sort(),['version','sourceCommit','phase','sourceSha256','allChecksPassed','beforeFingerprint','afterFingerprint','metadataFingerprint','rowsWritten','identityAssignmentsAdded'].sort());
 for(const key of ['sourceSha256','beforeFingerprint','afterFingerprint','metadataFingerprint'])assert.match(installed[key],/^[a-f0-9]{64}$/);
 assert.equal(installed.sourceCommit,stage.sourceCommit);assert.equal(installed.phase,stage.number);assert.equal(installed.sourceSha256,stage.sourceSha256);
 assert.equal(installed.version,'m10-canonical-composition-proof.v1');assert.equal(installed.allChecksPassed,true);assert.equal(installed.beforeFingerprint,installed.afterFingerprint);assert.equal(installed.rowsWritten,0);assert.equal(installed.identityAssignmentsAdded,0);
 assert.deepEqual(durable,Object.fromEntries(Object.entries(installed).filter(([k])=>k!=='beforeFingerprint')));return{priorStatePreserved:true,independentDurableMetadataVerified:true};
}

// A plan is never an execution receipt. The future native gate must also bind
// its closed captures/connections/source bookends, outside this pure validator.
export function assertCanonicalPositionCompositionVerification({plan,verification,stageReceipts}){
 assert.equal(plan?.version,'m10-canonical-composition-plan.v1');assert.equal(plan.executionAdmitted,false);
 assert.ok(Array.isArray(stageReceipts)&&stageReceipts.length===5,'M10_PROFILE_ALL_STAGE_RECEIPTS_REQUIRED');
 assert.deepEqual(plan.stages.map(s=>s.number),[127,128,129,199,198]);
 for(let n=0;n<5;n++){const r=stageReceipts[n];assert.deepEqual(Object.keys(r).sort(),['durable','installed']);assertCanonicalPositionStageDurability({stage:plan.stages[n],installed:r.installed,durable:r.durable});}
 assert.deepEqual(Object.keys(verification).sort(),[...Object.keys(plan.expectedVerification),'stateFingerprint'].sort());
 assert.match(verification.stateFingerprint,/^[a-f0-9]{64}$/);for(const[k,v]of Object.entries(plan.expectedVerification))assert.equal(verification[k],v,'M10_PROFILE_VERIFICATION_BINDING:'+k);
 return {sourceDerivedVerificationMatches:true,allIndependentStageReceiptsMatch:true,nativeCaptureProvenanceStillRequired:true};
}
