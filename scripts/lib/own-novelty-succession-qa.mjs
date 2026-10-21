// Pure projection onto the caller's existing canonical190/193/194/196 schema.
// Does not create another population, actor, capability or transport.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildOwnNoveltySuccessionInstallation,ownNoveltySuccessionHeader} from './own-novelty-succession-installation.mjs';
import {ownNoveltySuccessionFunctionPin} from './own-novelty-succession-metadata.mjs';
import {monthlyFixedQaHeader,monthlyFixedQaRpc} from './own-monthly-day-fixed-composition-qa.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex'),q=v=>"'"+String(v).replaceAll("'","''")+"'";
const body=d=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(d);assert.ok(m,'NOVELTY197_QA_BODY_REQUIRED');return m[2];};
const validSchema=s=>assert.match(s,/^mc_qa_fixed_092_[a-f0-9]{32}$/,'NOVELTY197_EXACT_QA_SCHEMA_REQUIRED');

// Hashes are derived solely from immutable source definitions and the canonical
// relocation function. Observed catalogue output is never an expected value.
export function ownNoveltySuccessionQaProjection({schema,baseNormalize,definitions}){
 validSchema(schema);assert.equal(typeof baseNormalize,'function');assert.equal(definitions.length,15);
 const sourcePins=definitions.map(d=>ownNoveltySuccessionFunctionPin(ownNoveltySuccessionHeader(d)));
 assert.equal(new Set(sourcePins.map(p=>p.signature)).size,15,'NOVELTY197_QA_DUPLICATE_DEFINITION');
 const hashes={};let stable=false;
 const base=s=>baseNormalize(monthlyFixedQaHeader(s));
 for(let pass=0;pass<32;pass++){
  let changed=false;const next={...hashes};
  for(const d of definitions){let local=base(d);for(const[a,b]of Object.entries(hashes))local=local.replaceAll(a,b);const raw=hash(body(d)),projected=hash(body(local));if(next[raw]!==projected){next[raw]=projected;changed=true;}}
  Object.assign(hashes,next);if(!changed){stable=true;break;}
 }
 assert.ok(stable,'NOVELTY197_QA_HASH_GRAPH_CYCLE');
 const normalized=sql=>{let local=base(sql);for(const[a,b]of Object.entries(hashes))local=local.replaceAll(a,b);return local;};
 const localPin=(d,runtime)=>{
  const local=normalized(d),at=local.search(/\bAS\s+\$/);assert.ok(at>0);
  // The parser's public function-name prefix is a source convention. Preserve
  // every QA argument/result/configuration and the entire projected AS body.
  const header=local.slice(0,at),needle='FUNCTION '+schema+'.';assert.ok(header.includes(needle),'NOVELTY197_QA_FUNCTION_NAMESPACE_CHANGED');
  const parsed=ownNoveltySuccessionFunctionPin(header.replace(needle,'FUNCTION public.')+local.slice(at));
  return{...parsed,signature:parsed.signature.replace(/^public\./,schema+'.'),runtime};
 };
 const ledger=definitions.map((d,n)=>{const publicPin=sourcePins[n],qaPin=localPin(d,false);assert.equal(qaPin.sha256,hashes[publicPin.sha256]);return{signature:publicPin.signature,expectedQaSignature:qaPin.signature,sourceProsrcSha256:publicPin.sha256,projectedProsrcSha256:qaPin.sha256,sourceDefinitionSha256:hash(d),projectedDefinitionSha256:hash(normalized(d))};});
 return{normalized,localPin,hashes,ledger,sourceDerived:true,observedMetadataUsed:false,connects:false,executesSql:false};
}

export function buildOwnNoveltySuccessionQa({qa,read,sourceCommit}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);validSchema(qa?.schema);assert.equal(qa.sourceCommit,sourceCommit);
 assert.equal(qa.run7Included,false);assert.equal(qa.fixedComposition?.run7Included,false);assert.equal(typeof qa.normalized,'function');
 assert.ok(qa.actor?.membershipId&&qa.checker?.membershipId);assert.notEqual(qa.actor.membershipId,qa.checker.membershipId,'NOVELTY197_INDEPENDENT_ACTORS_REQUIRED');
 const prerequisiteDefinitions=qa.qa193?.foundation?.base?.definitions;assert.ok(Array.isArray(prerequisiteDefinitions),'NOVELTY197_QA_CANONICAL_DEFINITIONS_REQUIRED');
 const prerequisitePins=qa.batch?.declaration?.prerequisitePins;assert.ok(Array.isArray(prerequisitePins));
 const batch=buildOwnNoveltySuccessionInstallation({read,sourceCommit,operationalPairBaseline:qa.operationalPairBaseline,prerequisiteDefinitions,prerequisiteRuntime:prerequisitePins.filter(p=>p.runtime).map(p=>p.signature)});
 assert.deepEqual(batch.previous.preservedCapturePin,qa.fixedComposition.preservedCapturePin,'NOVELTY197_QA_CAPTURE_PREDECESSOR_CHANGED');
 assert.deepEqual(batch.priorReadinessPin,qa.fixedComposition.preservedReadinessPin,'NOVELTY197_QA_READINESS_PREDECESSOR_CHANGED');
 const projection=ownNoveltySuccessionQaProjection({schema:qa.schema,baseNormalize:qa.normalized,definitions:[...batch.adapted,batch.ready,...batch.newDefinitions]});
 const normalized=projection.normalized,phases=['rehearsal','installation','repetition','verification','rollback','rollbackVerification'];
 const local197=Object.fromEntries(phases.map(k=>[k,batch[k].map(normalized)]));
 const projectPins=(definitions,pins)=>definitions.map((d,n)=>projection.localPin(d,pins[n].runtime));
 const expectedQaBeforePins=projectPins([...batch.originals,batch.oldReady],batch.beforePins),expectedQaAfterPins=projectPins([...batch.adapted,batch.ready],batch.afterPins),expectedQaNewPins=projectPins(batch.newDefinitions,batch.newPins),expectedQaSupportPins=projectPins(batch.supportDefinitions,batch.supportPins);
 for(const pin of [...expectedQaBeforePins,...expectedQaAfterPins,...expectedQaNewPins,...expectedQaSupportPins])assert.ok(pin.signature.startsWith(qa.schema+'.'),'NOVELTY197_FOREIGN_QA_PIN');
 for(const pin of [...expectedQaAfterPins,...expectedQaNewPins])assert.ok(local197.verification.join('\n').includes(pin.sha256),'NOVELTY197_EXPECTED_QA_PIN_MISSING:'+pin.signature);
 // These phase arrays are already localized by their own builders. Preserve
 // their exact identity and bytes; only the new197 phases use the extension.
 return{...qa,version:'own-novelty-succession-qa.v1',novelty197:batch,local197,normalized,novelty197Hashes:projection.hashes,novelty197ProjectionLedger:projection.ledger,expectedQaBeforePins,expectedQaAfterPins,expectedQaNewPins,expectedQaSupportPins,sourceHashes:{...qa.sourceHashes,...batch.sourceHashes},canonical190PhasesPreserved:true,canonical192To196PhasesPreserved:true,fixtureCapabilitySeed:qa.fixtureCapabilitySeed,actor:qa.actor,checker:qa.checker,schema:qa.schema,connects:false,executesSql:false,executionAdmitted:false,run7Included:false};
}

// Exactly one new read façade. The prior mapper retains all existing scopes.
export function ownNoveltySuccessionQaRpc(text,values,schema){
 if(!text.startsWith('SELECT public.own_novelty_succession_context_v1('))return monthlyFixedQaRpc(text,values,schema);
 validSchema(schema);assert.equal(text,'SELECT public.own_novelty_succession_context_v1($1::jsonb,$2::uuid) AS result','NOVELTY197_QA_RPC_REQUIRED');
 assert.ok(Array.isArray(values)&&values.length===2&&values.every(v=>typeof v==='string'),'NOVELTY197_QA_RPC_VALUES_REQUIRED');
 return text.replace('public.',schema+'.').replace(/\$(\d+)\b/g,(_,n)=>q(values[Number(n)-1]));
}
