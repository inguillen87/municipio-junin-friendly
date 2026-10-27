// Private complete text candidate; not imported/constructed/executed by its author.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildAnnualBudgetInstallation,assertAnnualBudgetDurability} from './annual-position-budget-installation.mjs';
import {buildPositionInstallation,assertPositionDurability} from './position-assignment-installation.mjs';
import {buildComparisonInstallation,assertComparisonDurability} from './position-comparison-installation.mjs';
import {buildAdoptedPositionsInstallation,assertAdoptedPositionsDurability} from './adopted-positions-installation.mjs';
import {buildPositionPopulationInstallation,assertPositionPopulationDurability} from './position-population-installation.mjs';
import {CONSUMER_BEFORE_PINS,CONSUMER_AFTER_PINS} from './adopted-consumers-installation-pins.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';

const plans=new WeakMap();
const ACL_PRODUCER="scripts/lib/municipal-owner-adoption-decision-qa.mjs";
const ACL_PRODUCER_SHA256="3818ada20ee500085c8045e683b29c9bb55a4eaa03fc2137f7d817228f72136a";
const ACL_PRODUCER_STATEMENT=" const acl=graph.definitions.map(d=>{const p=identity(d),pin=graph.desired.find(x=>x.signature===p.signature)??graph.pinHints.get(p.signature+'|'+p.sha256);return `REVOKE ALL ON FUNCTION ${r(p.signature)} FROM PUBLIC,municontrol_actions_runtime_app`+(pin?.runtime?`;GRANT EXECUTE ON FUNCTION ${r(p.signature)} TO municontrol_actions_runtime_app`:'');});";
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const hash=s=>createHash('sha256').update(s).digest('hex');
const lf=s=>s.replace(/\r\n?/g,'\n');
const body=d=>{
 const m=/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?\s*$/.exec(d);
 assert.ok(m,'POSITIONS210_BODY'); return m[2];
};
const clean=d=>d.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim();
const header=d=>{
 const at=d.search(/\bAS\s+\$/);assert.ok(at>0);
 return d.slice(0,at)
  .replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp')
  .replace(/SET (?:"TimeZone"|timezone) TO 'UTC'/i,"SET timezone='UTC'")
  .replace(/\s+/g,' ')+d.slice(at);
};
const pin=d=>ownInstallationFunctionPin(header(clean(d)));
const one=(rows,predicate,label)=>{
 const found=rows.filter(predicate);assert.equal(found.length,1,label);return found[0];
};
function rewriteGuard(batch,oldCheck,newCheck,counts){
 const out={...batch};
 for(const [field,count] of Object.entries(counts)){
  assert.ok(Array.isArray(batch[field]));
  let seen=0;
  out[field]=batch[field].map(s=>{
   const n=s.split(oldCheck).length-1;assert.ok(n===0||n===1);
   seen+=n;return n?s.replace(oldCheck,()=>newCheck):s;
  });
  assert.equal(seen,count,'POSITIONS210_GUARD_COUNT:'+field);
 }
 return out;
}
function canonicalRecord(graph,expected,sourceAcl){
 const d=one(graph.definitions,d=>{const match=/^CREATE(?: OR REPLACE)? FUNCTION public\.([a-z0-9_]+)\(/.exec(clean(d));return match?.[1]===expected.name&&pin(d).signature===expected.signature;},
  'POSITIONS210_CANONICAL_SOURCE:'+expected.signature);
 const actual=pin(d);
 const acl=graph.desired.find(p=>p.signature===actual.signature)
  ??graph.pinHints.get(actual.signature+'|'+actual.sha256);
 // The pinned seed producer revokes both grantees for every definition and
 // grants runtime only for an existing selected pin whose runtime is true.
 // An absent hint is therefore a source-proven private function, not a guess.
 assert.ok(sourceAcl&&sourceAcl.path===ACL_PRODUCER&&sourceAcl.sha256===ACL_PRODUCER_SHA256,'POSITIONS210_ACL_PRODUCER_REQUIRED');
 const runtime=acl?acl.runtime:sourceAcl.unselectedRuntime;
 assert.equal(typeof runtime,'boolean','POSITIONS210_ACL_SOURCE');
 assert.deepEqual({...actual,runtime},expected,
  'POSITIONS210_CANONICAL_PIN:'+expected.signature);
 return d;
}
function substitute(pins,allow){
 return pins.map(p=>{
  const change=allow.find(c=>c.before.signature===p.signature);
  if(!change)return p;
  assert.deepEqual(p,change.before,'POSITIONS210_OLD_METADATA');
  assert.deepEqual({...p,sha256:null},{...change.after,sha256:null},
   'POSITIONS210_ONLY_BODY_SUCCESSOR');
  return change.after;
 });
}
function adapt127or128(batch,allow,code){
 const oldCheck=pinsCheck(batch.prerequisitePins,code);
 const prerequisitePins=substitute(batch.prerequisitePins,allow);
 const out=rewriteGuard(batch,oldCheck,pinsCheck(prerequisitePins,code),
  {preflight:1,installation:2,durableVerification:1});
 return {...out,prerequisitePins};
}
function assertStagePrerequisites(pins,known,label){
 for(const p of pins){
  const actual=known.get(p.signature);assert.ok(actual,label+':'+p.signature);
  assert.deepEqual(actual,p,label+':'+p.signature);
 }
}
function makePositions210Normalizer(qa,records){
 const defs=records.map(r=>r.definition),extra=new Map();let stable=false;
 const mapHashes=s=>extra.size?s.replace(new RegExp([...extra.keys()].join('|'),'g'),value=>extra.get(value)):s;
 // Replace source-derived child digests BEFORE canonical relocation. Never
 // extend qa.hashes or normalize an already localized statement a second time.
 const normalized=s=>qa.normalized(mapHashes(s));
 for(let pass=0;pass<12;pass++){
  let changed=false;
  for(const d of defs){
   const from=hash(body(d)),to=hash(body(normalized(d)));
   if(extra.get(from)!==to){extra.set(from,to);changed=true;}
  }
  if(!changed){stable=true;break;}
 }
 assert.ok(stable,'POSITIONS210_HASH_GRAPH_CYCLE');
 const ledger=records.map(({stage,definition})=>({stage,
  signature:pin(definition).signature,
  publicSha256:hash(body(definition)),
  localSha256:hash(body(normalized(definition)))}));
 assert.equal(ledger.length,33);
 assert.equal(ledger.filter(r=>r.stage==='127-129').length,26);
 assert.equal(ledger.filter(r=>r.stage==='adopted-v2').length,5);
 assert.equal(ledger.filter(r=>r.stage==='210').length,2);
 for(const row of ledger)assert.equal(extra.get(row.publicSha256),row.localSha256);
 return {normalized,ledger};
}

export function composePositions210Same190({qa,major,sourceCommit,read}){
 assert.ok(qa&&[17,18].includes(major));
 assert.equal(qa.major,major);assert.equal(qa.sourceCommit,sourceCommit);
 assert.equal(qa.operationalPairBaseline,'published107');
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const originalHashes={...qa.hashes},seen=new Map();
 const load=file=>{
  assert.ok(/^(?:scripts|assets|lib|tests)\//.test(file)&&!file.includes('..'));
  const text=lf(read(file));const previous=seen.get(file);
  if(previous!==undefined)assert.equal(previous,text,'POSITIONS210_SOURCE_CHANGED');
  seen.set(file,text);return text;
 };
 const aclProducer=load(ACL_PRODUCER);
 assert.equal(hash(aclProducer),ACL_PRODUCER_SHA256,'POSITIONS210_ACL_PRODUCER_CHANGED');
 assert.equal(aclProducer.split(ACL_PRODUCER_STATEMENT).length,2,'POSITIONS210_ACL_PRODUCER_CONTRACT_CHANGED');
 const sourceAcl=Object.freeze({path:ACL_PRODUCER,sha256:ACL_PRODUCER_SHA256,unselectedRuntime:false});
 const options={read:load,sourceCommit};
 const annual0=buildAnnualBudgetInstallation(options);
 const assignment0=buildPositionInstallation(options);
 const comparison=buildComparisonInstallation(options);
 const adapted0=buildAdoptedPositionsInstallation(options);
 const population0=buildPositionPopulationInstallation(options);
 const graph=qa.foundation.foundation.foundation.owner.graph;
 assert.ok(graph.pool instanceof Map);
 const period177=graph.prior.previous;
 assert.ok(Array.isArray(period177.afterConsumerPins));
 assert.equal(period177.afterConsumerPins.length,6);
 const byName=(rows,name)=>one(rows,p=>p.name===name,'POSITIONS210_PIN:'+name);
 const contextBefore=byName(CONSUMER_BEFORE_PINS,'native_employment_change_context_v1');
 const contextAfter=byName(CONSUMER_AFTER_PINS,'native_employment_change_context_v1');
 canonicalRecord(graph,contextAfter,sourceAcl);
 const rangeBefore=byName(period177.beforePins,'payroll_fixed_registry_range_v2');
 const rangeAfter=byName(period177.afterConsumerPins,'payroll_fixed_registry_range_v2');
 const rangeDefinition=one(period177.changed,d=>pin(d).name===rangeAfter.name,'POSITIONS210_RANGE177');
 assert.deepEqual({...pin(rangeDefinition),runtime:false},rangeAfter);
 canonicalRecord(graph,rangeAfter,sourceAcl);
 const oldSubject=byName(adapted0.dependencies,'payroll_fixed_registry_adopted_subject_v1');
 assert.equal(oldSubject.sha256,'83b3f8944c437424ed97ba277094af4a68d4b14af197e9371223eedb40d5f4fa');
 const subjectDefinition=one(period177.lifecyclePrerequisiteDefinitions,
  d=>pin(d).name==='payroll_fixed_registry_adopted_subject_v1','POSITIONS210_SUBJECT177');
 const subjectAfter={...pin(subjectDefinition),runtime:false};
 assert.equal(subjectAfter.sha256,'47aa5dda0e474a3efa9279d526d86855d670dce0f0c47097cd6d97e7e4e32672');
 canonicalRecord(graph,subjectAfter,sourceAcl);
 const contextAllow=[{before:contextBefore,after:contextAfter}];
 const helperAllow=[{before:oldSubject,after:subjectAfter},{before:rangeBefore,after:rangeAfter}];
 const annual=adapt127or128(annual0,contextAllow,'SQL127_PREREQUISITE_CHANGED');
 const assignment=adapt127or128(assignment0,contextAllow,'SQL128_PREREQUISITE_CHANGED');
 const dependencies=substitute(adapted0.dependencies,helperAllow);
 assert.equal(dependencies.length,27);
 const oldDependencyCheck=pinsCheck(adapted0.dependencies,'ADOPTED_POSITIONS_PREREQUISITE_CHANGED');
 const adapted={...rewriteGuard(adapted0,oldDependencyCheck,
  pinsCheck(dependencies,'ADOPTED_POSITIONS_PREREQUISITE_CHANGED'),
  {installation:2,durableVerification:1}),dependencies};
 const prerequisitePins=[...adapted.afterPins,...dependencies];
 assert.equal(prerequisitePins.length,32);
 assert.equal(new Set(prerequisitePins.map(p=>p.signature)).size,32);
 const newPre=pinsCheck(prerequisitePins,'POSITION_POPULATION_PREDECESSOR_CHANGED');
 const population={...rewriteGuard(population0,population0.beforeCheck,newPre,
  {installation:2,durableVerification:2}),prerequisitePins,
  beforeCheck:newPre,
  afterCheck:population0.afterCheck.replace(population0.beforeCheck,()=>newPre)};
 assert.equal(population0.afterCheck.split(population0.beforeCheck).length,2);
 assert.deepEqual(population.previousPins,adapted.afterPins);
 const newDefinitions=[127,128,129].flatMap(id=>{
  const file={127:'127-annual-position-budget.sql',128:'128-own-position-assignments.sql',
   129:'129-own-position-comparison.sql'}[id];
  return splitPostgresStatements(load('scripts/migrations/'+file))
   .map(clean).filter(d=>/^CREATE FUNCTION public\./.test(d));
 });
 assert.equal(newDefinitions.length,26);
 assert.equal(adapted.migration.length,5);
 const populationDefinitions=population.migration.filter(d=>/^CREATE FUNCTION public\./.test(d));
 assert.equal(populationDefinitions.length,2);
 const records=[
  ...newDefinitions.map(definition=>({stage:'127-129',definition})),
  ...adapted.migration.map(definition=>({stage:'adopted-v2',definition})),
  ...populationDefinitions.map(definition=>({stage:'210',definition}))
 ];
 const {normalized,ledger}=makePositions210Normalizer(qa,records);
 // Cada prerrequisito preexistente debe demostrarse por el grafo canónico;
 // cada prerrequisito de etapa nueva por su pin productor anterior.
 const known=new Map();
 const wanted=[...annual.prerequisitePins,...assignment.prerequisitePins,
  ...comparison.prerequisitePins,...dependencies];
 const created=new Set(newDefinitions.map(d=>pin(d).signature));
 for(const p of wanted){
  if(created.has(p.signature))continue;
  canonicalRecord(graph,p,sourceAcl);known.set(p.signature,p);
 }
 const stages=[
  {id:'127',batch:annual,prerequisites:annual.prerequisitePins,after:annual.ownPins},
  {id:'128',batch:assignment,prerequisites:assignment.prerequisitePins,after:assignment.ownPins},
  {id:'129',batch:comparison,prerequisites:comparison.prerequisitePins,after:comparison.ownPins},
  {id:'adopted-v2',batch:adapted,prerequisites:adapted.dependencies,after:adapted.afterPins},
  {id:'210',batch:population,prerequisites:population.prerequisitePins,after:population.ownPins}
 ];
 for(const stage of stages){
  assertStagePrerequisites(stage.prerequisites,known,'POSITIONS210_STAGE:'+stage.id);
  if(stage.id==='adopted-v2')assertStagePrerequisites(adapted.beforePins,known,'POSITIONS210_V2_BEFORE');
  for(const p of stage.after)known.set(p.signature,p);
  stage.installation=stage.batch.installation.map(normalized);
  const durable=stage.batch.durableVerification;
  stage.durableVerification=(durable[0]==='SET TRANSACTION READ ONLY'?durable.slice(1):durable).map(normalized);
  assert.ok(!stage.durableVerification.some(value=>/^SET TRANSACTION\b/.test(value)),'POSITIONS210_UNEXPECTED_TRANSACTION_DIRECTIVE');
 }
 assert.deepEqual(qa.hashes,originalHashes,'POSITIONS210_FOUNDATION_HASHES_MUTATED');
 const finalPins=[...population.prerequisitePins,...population.ownPins];
 assert.equal(finalPins.length,34);
 const explicit=[
  'scripts/lib/positions210-same190-installation.mjs',
  'scripts/lib/annual-position-budget-installation.mjs',
  'scripts/lib/position-assignment-installation.mjs',
  'scripts/lib/position-comparison-installation.mjs',
  'scripts/lib/adopted-positions-installation.mjs',
  'scripts/lib/position-population-installation.mjs',
  'scripts/lib/adopted-consumers-installation-pins.mjs',
  'scripts/lib/own-period-classification-installation.mjs',
  'tests/positions210-same190-source.test.js',
  'scripts/lib/positions210-same190-actors.mjs',
  'scripts/lib/positions210-same190-native-continuation.mjs',
  'scripts/lib/positions210-same190-sidecar.mjs',
  'tests/fixtures/annual-position-budget-synthetic.js',
  'tests/fixtures/position-assignment-synthetic.js'
 ];
 for(const file of explicit)if(!file.startsWith('tests/positions210-'))load(file);
 const sourceEntries=[...new Set([...explicit,...seen.keys()])];
 const plan={version:'positions210-same190-source-plan.v1',foundation:qa,
  schema:qa.schema,major,sourceCommit,stages,ledger,sourceEntries,normalized,
  sourceHashes:Object.fromEntries([...seen].map(([f,s])=>[f,hash(s)])),
  substitutions:[...contextAllow,...helperAllow],
  finalMetadata:[normalized(pinsCheck(finalPins,'POSITIONS210_FINAL_METADATA_CHANGED'))],
  connects:false,executesSql:false,production:false};
 for(const stage of stages){Object.freeze(stage.installation);Object.freeze(stage.durableVerification);Object.freeze(stage);}Object.freeze(stages);Object.freeze(ledger);Object.freeze(plan.sourceHashes);Object.freeze(sourceEntries);Object.freeze(plan);
 plans.set(plan,{read,sourceHashes:plan.sourceHashes});return plan;
}

function verifyDurableStage(stage,installed,durable,sourceCommit){
 switch(stage.id){
  case '127':return assertAnnualBudgetDurability({installed,durable,sourceCommit});
  case '128':return assertPositionDurability({installed,durable,sourceCommit});
  case '129':return assertComparisonDurability({installed,durable,sourceCommit});
  case 'adopted-v2':return assertAdoptedPositionsDurability({installed,durable,batch:stage.batch});
  case '210':return assertPositionPopulationDurability({installed,durable,batch:stage.batch});
  default:assert.fail('POSITIONS210_UNKNOWN_STAGE');
 }
}

export function assertPositions210SourcePlan(h,plan=h.prepared?.positions210){
 const record=plans.get(plan);assert.ok(record,'POSITIONS210_UNMINTED_PLAN');
 assert.strictEqual(h.prepared?.positions210,plan,'POSITIONS210_HOST_PLAN_CHANGED');
 assert.strictEqual(plan.foundation,h.qa);assert.equal(plan.schema,h.qa.schema);
 assert.equal(plan.major,h.major);assert.equal(plan.sourceCommit,h.sourceCommit);
 assert.equal(h.sourceCustody?.sourceCommit,h.sourceCommit,'POSITIONS210_HOST_CUSTODY_REQUIRED');
 for(const[file,expected]of Object.entries(record.sourceHashes))assert.equal(hash(lf(record.read(file))),expected,'POSITIONS210_SOURCE_BOOKEND:'+file);
 return plan;
}

export function installPositions210Same190(h){
 const plan=assertPositions210SourcePlan(h),record=plans.get(plan);
 assert.ok(record,'POSITIONS210_UNMINTED_PLAN');assert.strictEqual(plan.foundation,h.qa);
 assert.equal(plan.schema,h.qa.schema);assert.equal(plan.major,h.major);assert.equal(plan.sourceCommit,h.sourceCommit);
 assert.equal(h.sourceCustody?.sourceCommit,h.sourceCommit,'POSITIONS210_HOST_CUSTODY_REQUIRED');
 assert.deepEqual(plan.stages.map(stage=>stage.id),['127','128','129','adopted-v2','210']);
 for(const [file,expected]of Object.entries(record.sourceHashes))assert.equal(hash(lf(record.read(file))),expected,'POSITIONS210_SOURCE_BOOKEND:'+file);
 const proofs={};
 const tokens={'127':'QA_POSITIONS210_127_LATE_FAULT','128':'QA_POSITIONS210_128_LATE_FAULT','129':'QA_POSITIONS210_129_LATE_FAULT','adopted-v2':'QA_POSITIONS210_V2_LATE_FAULT','210':'QA_POSITIONS210_210_LATE_FAULT'};
 for(const stage of plan.stages){
  const baseline=h.readFullSnapshot();h.setPhase('positions210-'+stage.id+'-rehearsal');
  const rehearsal=h.json(stage.installation,{end:'ROLLBACK',fullJson:true});
  assert.equal(rehearsal.sourceCommit,h.sourceCommit);assert.deepEqual(h.readFullSnapshot(),baseline,'POSITIONS210_REHEARSAL_CHANGED:'+stage.id);
  const token=tokens[stage.id],late=[...stage.installation.slice(0,-1),`DO $positions210_late_fault$ BEGIN RAISE EXCEPTION '${token}';END $positions210_late_fault$`,stage.installation.at(-1)];
  h.setPhase('positions210-'+stage.id+'-late-rollback');const rejected=h.expectRollback(late,token);
  assert.equal(rejected.status,3);assert.match(rejected.stderr,new RegExp('\\bERROR:[^\\r\\n]*\\b'+token+'\\b'));
  assert.deepEqual(h.readFullSnapshot(),baseline,'POSITIONS210_LATE_ROLLBACK_CHANGED:'+stage.id);
  h.setPhase('positions210-'+stage.id+'-installation');const installed=h.json(stage.installation,{fullJson:true});
  h.setPhase('positions210-'+stage.id+'-durable-readonly');const durable=h.json(stage.durableVerification,{readOnly:true,fullJson:true});
  const durability=verifyDurableStage(stage,installed,durable,h.sourceCommit);
  // No assertion for an earlier stage is delayed beyond the next DDL epoch.
  proofs[stage.id]={rehearsal,lateRollback:{status:rejected.status,expectedNativeCode:token},installed,durable,durability};
 }
 const finalStage=plan.stages.at(-1),baseline=h.readFullSnapshot();h.setPhase('positions210-exact-repetition');
 const repeated=h.json(finalStage.installation,{fullJson:true});
 assertPositionPopulationDurability({installed:repeated,durable:proofs['210'].durable,batch:finalStage.batch});
 assert.deepEqual(h.readFullSnapshot(),baseline,'POSITIONS210_REPETITION_CHANGED_STATE');
 h.setPhase('positions210-final-metadata-readonly');
 const final=h.json([...plan.finalMetadata,"SELECT jsonb_build_object('version','positions210-final-metadata.v1','sourceCommit',"+q(h.sourceCommit)+",'metadataPins',34,'newRuntimeFacades',9,'complete',true)"],{readOnly:true});
 assert.deepEqual(final,{version:'positions210-final-metadata.v1',sourceCommit:h.sourceCommit,metadataPins:34,newRuntimeFacades:9,complete:true});
 h.check('same190 installs127/128/129/adopted-v2/210 with immediate durable windows, whole32 predecessor pins and two capture triggers before the first855 capture');
 return Object.freeze({version:'positions210-same190-installation.v1',passed:true,sourceCommit:h.sourceCommit,schema:h.qa.schema,proofs,repeated,finalMetadata:final,
  newTables:4,newFunctions:28,adaptedFunctions:5,newCapabilityDefinitions:4,runtimeFacades:9,captureTriggers:2,roleAssignmentsAdded:0,businessOperations:0,sourceHashes:plan.sourceHashes,synthetic:true,productionWrites:0,municipalAcceptance:false});
}
