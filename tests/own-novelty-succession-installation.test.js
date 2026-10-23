// Proposed pure tests. No native/database process, connection or SQL executor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildMonthlyDayFixedCompositionQa} from '../scripts/lib/own-monthly-day-fixed-composition-qa.mjs';
import {buildOwnNoveltySuccessionInstallation,assertOwnNoveltySuccessionDurability,composeOwnNoveltySuccessionAncestor,NOVELTY197_SQL} from '../scripts/lib/own-novelty-succession-installation.mjs';
import {buildOwnNoveltySuccessionQa,ownNoveltySuccessionQaProjection,ownNoveltySuccessionQaRpc} from '../scripts/lib/own-novelty-succession-qa.mjs';
import {composeOwnNoveltySuccessionPins} from '../scripts/lib/own-novelty-succession-metadata.mjs';
import {buildMonthlyDayCircuitFixture} from '../scripts/lib/own-monthly-day-engine-circuit-fixture.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const root=new URL('../',import.meta.url),read=file=>readFileSync(new URL(file,root),'utf8').replace(/\r\n?/g,'\n');
// Source commit metadata is explicit; definitions and all predecessors are
// independently pinned by the builders. This does not claim a native run.
const sourceCommit='22e5e6da38ba9b32be98df2b3016163fa4d90573';
const hash=s=>createHash('sha256').update(s).digest('hex');
const body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(d);assert.ok(m);return m[2];};
let fixture,fixtureError,fixtureAttempted=false,fixtureFailed=false;
function plan(){
 if(fixtureAttempted){if(fixtureFailed)throw fixtureError;return fixture;}
 fixtureAttempted=true;
 try{const qa=buildMonthlyDayFixedCompositionQa({major:17,sourceCommit,read,operationalPairBaseline:'pre107',schema:'mc_qa_fixed_092_19719719719719719719719719719719'});const projected=buildOwnNoveltySuccessionQa({qa,read,sourceCommit});fixture={qa,projected,batch:projected.novelty197};}
 catch(error){fixtureFailed=true;fixtureError=error;throw error;}
 return fixture;
}

test('197 inventories present ancestor pins and requires real194 readiness while explicitly checking all seven changed functions',t=>{
 const{batch}=plan();assert.equal(batch.readinessOrigin,'previous.days.adapted / previous.preservedReadinessPin');
 assert.equal(batch.prerequisiteDefinitionsProperty,'qa.qa193.foundation.base.definitions');
 assert.equal(batch.beforePins.length,7);assert.equal(batch.supportPins.length,16);assert.equal(batch.newPins.length,8);assert.equal(batch.mutations.length,18);
 assert.deepEqual(batch.newPins.filter(p=>p.runtime).map(p=>p.name),['own_novelty_succession_context_v1']);
 assert.equal(batch.newPins.find(p=>p.name==='own_novelty_succession_validate_v1').resultType,'uuid[]');
 for(let n=0;n<7;n++)assert.deepEqual({...batch.beforePins[n],sha256:null},{...batch.afterPins[n],sha256:null});
 assert.equal(composeOwnNoveltySuccessionPins(batch.ancestorObjectCounts.value,batch.afterPins,batch.beforePins).value.includes(batch.priorReadinessPin.sha256),true);
 assert.deepEqual(batch.preservedCapturePin,batch.previous.preservedCapturePin);assert.equal(batch.run7Included,false);assert.equal(batch.executionAdmitted,false);
 const ledger=batch.ancestorMetadataLedger;assert.equal(ledger.pins.length,7);assert.equal(ledger.sourceSha256,hash(batch.previous.afterCheck));assert.equal(ledger.metadataInverseExact,true);assert.ok(ledger.present.includes(batch.priorReadinessPin.signature));assert.equal(ledger.present.length+ledger.absent.length,7);
 for(const row of ledger.pins){assert.equal(row.present,row.occurrences>0);assert.equal(row.occurrences,batch.ancestorPins[row.signature]);assert.ok(batch.beforeCheck.includes(row.beforeSha256));assert.ok(batch.afterCheck.includes(row.afterSha256));}
 t.diagnostic(JSON.stringify(ledger));
 assert.equal(batch.readyComposition.objectCounts.priorUniqueIndexes,4);assert.equal(batch.readyComposition.objectCounts.newUniqueIndexes,5);
 assert.equal(batch.readyComposition.objectCounts.priorFunctionFamilyCount,16);assert.equal(batch.readyComposition.objectCounts.newFunctionFamilyCount,24);
});

test('197 conservation restores the old190 table and helper scope and retains all incoming old dependencies',()=>{
 const{batch}=plan(),sql=batch.before;
 assert.equal(sql.includes("to_regclass('public.municipal_owner_program_provenance')"),false);
 assert.equal(sql.includes("left(p.proname,24)='municipal_owner_program_'"),false);
 assert.ok(sql.includes("relation.relkind IN('r','p','m') ORDER BY relation.oid"));
 assert.ok(sql.includes('FROM %I.%I r) hashed'));assert.equal(sql.includes('WHERE r.'),false);
 for(const key of ['tables','sequences','triggers','roles','memberships','defaultAcl','types','attributes','indexes','dependencies','sharedDependencies','descriptions','securityLabels','rewrites','extensions'])assert.ok(sql.includes("'"+key+"'"),key);
 assert.ok(sql.includes("d.classid='pg_proc'::regclass AND d.objid IN("));assert.equal(/d\.refobjid\s+(?:IN|=)\s*\(?to_regprocedure/.test(sql),false);
 assert.ok(sql.includes("datname=current_database()"));
 for(const pin of [...batch.beforePins,...batch.newPins])assert.ok(sql.includes(pin.signature));
 assert.ok(batch.rollback.indexOf(batch.noHistory)<batch.rollback.findIndex(s=>s.startsWith('DROP FUNCTION ')));
 assert.ok(batch.noHistory.includes("{monthly,nativeBatches}"));assert.ok(batch.noHistory.includes("snapshot?'supersedes'"));
});

test('197 QA expects each projected prosrc from static definitions and leaves190 through196 phase arrays exact',()=>{
 const{qa,projected,batch}=plan();assert.equal(projected.schema,qa.schema);assert.equal(projected.actor,qa.actor);assert.equal(projected.checker,qa.checker);
 assert.equal(projected.local,qa.local);assert.equal(projected.local193,qa.local193);assert.equal(projected.localFixed,qa.localFixed);assert.equal(projected.qa192,qa.qa192);
 assert.equal(projected.novelty197ProjectionLedger.length,15);
 for(const[d,n]of [...batch.adapted,batch.ready,...batch.newDefinitions].map((d,n)=>[d,n])){
  const entry=projected.novelty197ProjectionLedger[n];assert.equal(entry.sourceProsrcSha256,hash(body(d)));assert.equal(entry.projectedProsrcSha256,hash(body(projected.normalized(d))));
  assert.ok(projected.local197.verification.join('\n').includes(entry.projectedProsrcSha256));
 }
 for(const pin of [...projected.expectedQaAfterPins,...projected.expectedQaNewPins])assert.ok(pin.signature.startsWith(qa.schema+'.'));
 assert.ok(projected.normalized('SELECT public.digest(\'synthetic\',\'sha256\')').includes('public.digest('));
 assert.equal(projected.executionAdmitted,false);
});

test('197 rejects a changed migration before constructing its predecessor, and rejects foreign schema',()=>{
 const invalidRead=file=>file===NOVELTY197_SQL?read(file)+'\n-- drift':read(file);
 assert.throws(()=>buildOwnNoveltySuccessionInstallation({read:invalidRead,sourceCommit,operationalPairBaseline:'pre107',prerequisiteDefinitions:[],prerequisiteRuntime:[]}),/NOVELTY197_REVIEWED_SOURCE_CHANGED/);
 assert.throws(()=>buildOwnNoveltySuccessionQa({qa:{schema:'public'},read,sourceCommit}),/NOVELTY197_EXACT_QA_SCHEMA_REQUIRED/);
 const definitions=Array.from({length:15},(_,n)=>`CREATE FUNCTION public.synthetic_${n}() RETURNS text LANGUAGE sql AS $$SELECT 'synthetic'$$`);
 assert.throws(()=>ownNoveltySuccessionQaProjection({schema:'public',baseNormalize:s=>s,definitions}),/NOVELTY197_EXACT_QA_SCHEMA_REQUIRED/);
});

test('197 installation mode projects all seven predecessor hashes as well as their replacements',()=>{
 const{projected,batch}=plan(),mode=projected.normalized(batch.mode);
 assert.equal(projected.expectedQaBeforePins.length,7);
 for(let n=0;n<7;n++){
  const before=projected.expectedQaBeforePins[n],after=projected.expectedQaAfterPins[n];
  assert.equal(projected.novelty197Hashes[batch.beforePins[n].sha256],before.sha256,'source-derived predecessor '+before.signature);
  assert.ok(mode.includes(before.sha256),'installation mode predecessor '+before.signature);
  assert.ok(mode.includes(after.sha256),'verification mode replacement '+after.signature);
 }
 assert.equal(projected.novelty197ProjectionLedger.length,15,'the posterior ledger keeps its original scope');
});

test('197 predecessor pins match the two close125 bodies actually installed by the circuit fixture',()=>{
 const{qa,projected}=plan(),fixture=buildMonthlyDayCircuitFixture({read,normalized:qa.normalized,schema:qa.schema,foundationSeed:qa.qa192.qa.seed,actors:{maker:qa.actor,checker:qa.checker}});
 const latest=new Map();
 for(const s of [qa.qa192.qa.seed,...fixture.statements].flatMap(sql=>splitPostgresStatements(sql))){
  const d=s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim(),m=new RegExp('^CREATE(?: OR REPLACE)? FUNCTION '+qa.schema+'\\.([a-z0-9_]+)\\(').exec(d);
  if(m)latest.set(m[1],d);
 }
 assert.equal(fixture.existingFunctionsReplaced,2);assert.equal(fixture.closeAdaptationLedger.length,2);
 for(const row of fixture.closeAdaptationLedger){
  const pin=projected.expectedQaBeforePins.find(p=>p.name===row.name);assert.ok(pin);
  assert.equal(hash(body(latest.get(row.name))),pin.sha256,'source-built installed predecessor '+row.name);
  assert.equal(row.projectedAfterProsrcSha256,pin.sha256);assert.notEqual(row.projectedBeforeProsrcSha256,pin.sha256,'old124 seed cannot satisfy125');
 }
});

test('197 maps only its exact read façade and rejects additional SQL or arguments',()=>{
 const schema='mc_qa_fixed_092_19719719719719719719719719719719',sql='SELECT public.own_novelty_succession_context_v1($1::jsonb,$2::uuid) AS result',args=['{}','19719719-7197-4197-8197-197197197197'];
 assert.equal(ownNoveltySuccessionQaRpc(sql,args,schema),`SELECT ${schema}.own_novelty_succession_context_v1('{}'::jsonb,'${args[1]}'::uuid) AS result`);
 assert.throws(()=>ownNoveltySuccessionQaRpc(sql+';SELECT 1',args,schema),/NOVELTY197_QA_RPC_REQUIRED/);
 assert.throws(()=>ownNoveltySuccessionQaRpc(sql,[...args,'extra'],schema),/NOVELTY197_QA_RPC_VALUES_REQUIRED/);
 assert.throws(()=>ownNoveltySuccessionQaRpc(sql,args,'foreign_schema'),/NOVELTY197_EXACT_QA_SCHEMA_REQUIRED/);
});

test('197 requires independent durable metadata equality without claiming whole data is static between connections',()=>{
 const{batch}=plan(),receipt=(mode,transactionDataPreserved,preservationSha256)=>({version:batch.version,sourceCommit:batch.sourceCommit,sourceHashes:batch.sourceHashes,operationalPairBaseline:batch.operationalPairBaseline,mode,...batch.counters,transactionDataPreserved,preservationSha256,priorMetadataSha256:'b'.repeat(64),objectSha256:'c'.repeat(64)});
 const installed=receipt('install',true,'1'.repeat(64)),durable=receipt('verify',false,'2'.repeat(64)),repeated=receipt('verify',true,'3'.repeat(64));
 assert.equal(assertOwnNoveltySuccessionDurability({installed,durable,repeated,batch}).wholeDatabaseStaticAcrossConnections,false);
 assert.throws(()=>assertOwnNoveltySuccessionDurability({installed,durable:{...durable,objectSha256:'d'.repeat(64)},repeated,batch}));
 assert.throws(()=>assertOwnNoveltySuccessionDurability({installed,durable,repeated:{...repeated,priorMetadataSha256:null},batch}));
 assert.throws(()=>assertOwnNoveltySuccessionDurability({installed,durable:{...durable,transactionDataPreserved:true},repeated,batch}));
});

test('real ancestor selector preserves absent explicit pins, replaces every present occurrence and fails closed on changed metadata/130 guard',()=>{
 const names=['own_novelty_command_v1','own_novelty_conflict_v1','own_novelty_sources_v1','own_liquidation_rows_v1','own_liquidation_state_v1','own_liquidation_command_v1','municipal_adoption_ready_v1'];
 const beforePins=names.map((name,n)=>({name,signature:'public.'+name+'()',sha256:hash('synthetic-before-'+n),argNames:[],defaults:'',resultType:'jsonb',language:'plpgsql',returnsSet:false,strict:false,definer:true,volatility:'v',config:['search_path=pg_catalog, public, pg_temp'],runtime:false})),afterPins=beforePins.map((p,n)=>({...p,sha256:hash('synthetic-after-'+n)}));
 // Complete metadata records are synthetic. This is a pure source selector,
 // not a fabricated catalogue or a substitute for canonical constructor pins.
 const readinessSignature=beforePins[6].signature,untouched={...beforePins[0],name:'unrelated_source_v1',signature:'public.unrelated_source_v1()'},source='SELECT '+JSON.stringify([beforePins[2],beforePins[6],beforePins[2],untouched]);
 const projected=composeOwnNoveltySuccessionAncestor({source,beforePins,afterPins,readinessSignature});
 assert.deepEqual(projected.ledger.present,[beforePins[2].signature,readinessSignature]);assert.equal(projected.ledger.absent.length,5);assert.equal(projected.counts[beforePins[2].signature],2);assert.equal(projected.objectCounts.blocks,0);assert.equal(projected.objectCounts.scopeAbsent,true);assert.ok(projected.value.includes(JSON.stringify(untouched)));
 assert.equal(composeOwnNoveltySuccessionPins(projected.value,[afterPins[2],afterPins[6]],[beforePins[2],beforePins[6]]).value,source);
 assert.throws(()=>composeOwnNoveltySuccessionAncestor({source:JSON.stringify([beforePins[2]]),beforePins,afterPins,readinessSignature}),/NOVELTY197_ANCESTOR_READY_MISSING/);
 assert.throws(()=>composeOwnNoveltySuccessionAncestor({source:source.replace(JSON.stringify(beforePins[2]),JSON.stringify({...beforePins[2],language:'sql'})),beforePins,afterPins,readinessSignature}),/NOVELTY197_ANCESTOR_METADATA_CHANGED/);
 const guard="DO $objects$ DECLARE r oid:=to_regclass('public.own_payroll_novelty_event');BEGIN IF (SELECT count(*) FROM pg_index WHERE indrelid=r AND indisunique AND indisvalid AND indisready AND indislive)<>4 OR (SELECT count(*) FROM pg_proc WHERE proname LIKE 'own_novelty_%')<>16 THEN RAISE EXCEPTION 'synthetic';END IF;END $objects$";
 const counted=composeOwnNoveltySuccessionAncestor({source:source+';'+guard,beforePins,afterPins,readinessSignature});assert.equal(counted.objectCounts.blocks,1);assert.equal(counted.objectCounts.newUniqueIndexes,5);assert.equal(counted.objectCounts.newFunctionFamilyCount,24);
 assert.throws(()=>composeOwnNoveltySuccessionAncestor({source:source+';'+guard.replace(')<>4',')<>9'),beforePins,afterPins,readinessSignature}),/NOVELTY197_PRIOR_INDEX_COUNT_CHANGED/);
 assert.throws(()=>composeOwnNoveltySuccessionAncestor({source:source+';'+guard.replace(';BEGIN','; BEGIN'),beforePins,afterPins,readinessSignature}),/NOVELTY197_RELATION_GUARD_MISSING/);
});

test('actual plan cache preserves the first constructor failure by identity and never rebuilds it for four callers',()=>{
 const source=read('tests/own-novelty-succession-installation.test.js'),start=source.indexOf('let fixture,fixtureError,fixtureAttempted=false,fixtureFailed=false;'),end=source.indexOf('\n\ntest(',start);assert.ok(start>0&&end>start);
 const create=Function('buildMonthlyDayFixedCompositionQa','buildOwnNoveltySuccessionQa','sourceCommit','read',source.slice(start,end)+';return plan;');
 const primary=Error('exclusively synthetic first constructor failure');let attempts=0,projectedCalls=0;
 const failing=create(()=>{attempts++;return{synthetic:true};},()=>{projectedCalls++;throw primary;},sourceCommit,()=>{throw Error('source read must remain inert');});
 for(let n=0;n<4;n++)assert.throws(()=>failing(),error=>error===primary);assert.equal(attempts,1);assert.equal(projectedCalls,1);
 const value={novelty197:{synthetic:true}};let successfulBuilds=0;const succeeding=create(()=>({synthetic:true}),()=>{successfulBuilds++;return value;},sourceCommit,()=>{throw Error('source read must remain inert');}),first=succeeding();
 for(let n=0;n<4;n++)assert.equal(succeeding(),first);assert.equal(first.projected,value);assert.equal(successfulBuilds,1);
});
