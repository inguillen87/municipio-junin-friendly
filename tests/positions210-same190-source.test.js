// Proposed executable source focals. Not run by the author; no native transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildOwnerProgramQa} from '../scripts/lib/municipal-owner-program-qa.mjs';
import {composePositions210Same190,assertPositions210SourcePlan} from '../scripts/lib/positions210-same190-installation.mjs';
const sourceCommit='a'.repeat(40),read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
let foundation;
const qa=()=>foundation??=(buildOwnerProgramQa({major:17,sourceCommit,read,schema:'mc_qa_fixed_092_'+'7'.repeat(32),operationalPairBaseline:'published107'}));
const build=(reader=read)=>composePositions210Same190({qa:qa(),major:17,sourceCommit,read:reader});
const host=plan=>({qa:qa(),major:17,sourceCommit,sourceCustody:{sourceCommit},prepared:{positions210:plan}});

test('same190 composes each predecessor before its successor without changing foundation hashes or actors',()=>{
 const q=qa(),hashes=structuredClone(q.hashes),actor=q.actor,checker=q.checker,p=build();
 assert.strictEqual(p.foundation,q);assert.strictEqual(q.actor,actor);assert.strictEqual(q.checker,checker);assert.deepEqual(q.hashes,hashes);
 assert.deepEqual(p.stages.map(s=>s.id),['127','128','129','adopted-v2','210']);
 const population=p.stages.at(-1).batch;
 assert.equal(population.prerequisitePins.length,32);assert.equal(new Set(population.prerequisitePins.map(p=>p.signature)).size,32);
 assert.deepEqual(population.previousPins,p.stages[3].batch.afterPins);
 for(const stage of p.stages)assert.ok(stage.durableVerification.every(s=>!/^SET TRANSACTION\b/.test(s)));
 const sourceRange=q.foundation.foundation.foundation.owner.graph.prior.previous.afterConsumerPins.find(p=>p.name==='payroll_fixed_registry_range_v2');
 assert.deepEqual(population.prerequisitePins.find(p=>p.signature===sourceRange.signature),sourceRange);
 assert.equal(p.substitutions.length,3);assert.equal(p.connects,false);assert.equal(p.executesSql,false);
});

test('every localized metadata digest is tied to a source-body ledger, with no foundation-map mutation',()=>{
 const p=build();assert.equal(p.ledger.length,33);
 assert.deepEqual(p.ledger.reduce((r,x)=>(r[x.stage]=(r[x.stage]??0)+1,r),{}),{'127-129':26,'adopted-v2':5,'210':2});
 for(const row of p.ledger){assert.match(row.publicSha256,/^[a-f0-9]{64}$/);assert.match(row.localSha256,/^[a-f0-9]{64}$/);assert.equal(p.normalized("SELECT '"+row.publicSha256+"'"),qa().normalized("SELECT '"+row.localSha256+"'"));}
 assert.equal(p.finalMetadata.length,1);assert.ok(p.finalMetadata[0].includes('POSITIONS210_FINAL_METADATA_CHANGED'));
 assert.equal(hash(read('scripts/migrations/210-own-position-population-proof.sql').replace(/\r\n?/g,'\n')),'743a4962e6162016c467ccb5c4212a5a4cd9e905b8bb31bbe4bb85e0c2dceefd');
});

test('unreviewed210 source is rejected before a plan can be minted',()=>{
 assert.throws(()=>build(file=>read(file)+(file==='scripts/migrations/210-own-position-population-proof.sql'?'\n-- changed source':'')),/Unreviewed SQL210/);
});

test('source-plan brand and live readback reject copied plans or source drift',()=>{
 let drift=false;const reader=file=>read(file)+(drift&&file==='scripts/migrations/127-annual-position-budget.sql'?'\n':'');
 const p=build(reader),h=host(p);assert.strictEqual(assertPositions210SourcePlan(h),p);
 assert.throws(()=>assertPositions210SourcePlan({...h,prepared:{positions210:{...p}}}),/POSITIONS210_UNMINTED_PLAN/);
 drift=true;assert.throws(()=>assertPositions210SourcePlan(h),/POSITIONS210_SOURCE_BOOKEND/);
});


test('a missing ACL hint is private only under the exact canonical seed producer contract',()=>{
 const q=qa(),owner=q.foundation.foundation.foundation.owner,graph=owner.graph,p=build();
 const producer='scripts/lib/municipal-owner-adoption-decision-qa.mjs';
 assert.equal(p.sourceHashes[producer],'e6d9d39d1dee48d24f01148d07997d85e51d8ca62ff5eefb4a6dc00679d99624');
 assert.ok(p.sourceEntries.includes(producer));
 const missing=p.stages.flatMap(stage=>stage.prerequisites).find(pin=>
  graph.definitions.some(d=>d.includes('FUNCTION public.'+pin.name+'('))&&
  !graph.desired.some(candidate=>candidate.signature===pin.signature)&&
  !graph.pinHints.has(pin.signature+'|'+pin.sha256));
 assert.ok(missing,'the real source graph must exercise an unselected prerequisite');
 assert.equal(missing.runtime,false);
 const local=owner.relocate(missing.signature);
 const revoke='REVOKE ALL ON FUNCTION '+local+' FROM PUBLIC,municontrol_actions_runtime_app';
 const grant='GRANT EXECUTE ON FUNCTION '+local+' TO municontrol_actions_runtime_app';
 assert.ok(owner.seed.lastIndexOf(revoke)>=0);
 assert.ok(owner.seed.lastIndexOf(revoke)>owner.seed.lastIndexOf(grant),'the actual producer seed ends with explicit private ACL');
 const key=missing.signature+'|'+missing.sha256;
 try{
  graph.pinHints.set(key,{...missing,runtime:true});
  assert.throws(()=>build(),/POSITIONS210_CANONICAL_PIN/,'a conflicting runtime hint cannot be replaced by the private policy');
 }finally{graph.pinHints.delete(key);}
 assert.throws(()=>build(file=>read(file)+(file===producer?'\n':'')),/POSITIONS210_ACL_PRODUCER_CHANGED/);
});


// Native339 regression: only the two source-pinned capability rows of the exact
// IAM relation may be omitted. The relation must follow the real QA relocation.
test('127 and128 conserve prior state around their exact capability additions after real schema relocation',()=>{
 const p=build(),schema=qa().schema;
 const sourceTarget="CASE WHEN c.oid='public.iam_capability'::regclass THEN ";
 const localTarget="CASE WHEN c.oid='"+schema+".iam_capability'::regclass THEN ";
 const families=[['127',['workforce.structure.prepare','workforce.structure.approve']],
  ['128',['workforce.structure.assignment.prepare','workforce.structure.assignment.approve']]];
 for(const [id,keys]of families){
  const stage=p.stages.find(value=>value.id===id),batch=stage.batch;
  const filter="'WHERE r.capability_key NOT IN("+keys.map(key=>"''"+key+"''").join(',')+")'";
  for(const slot of ['before','after']){
   const raw=batch[slot],local=p.normalized(raw);
   assert.equal(raw.split(sourceTarget).length-1,1,id+':'+slot+' has one source OID gate');
   assert.equal(local.split(localTarget).length-1,1,id+':'+slot+' targets the relocated relation');
   assert.ok(raw.includes(sourceTarget+filter+" ELSE '' END) INTO n,h;"));
   assert.ok(local.includes(localTarget+filter+" ELSE '' END) INTO n,h;"));
   assert.doesNotMatch(local,/CASE WHEN c\.nspname='public' AND c\.relname='iam_capability'/);
   assert.doesNotMatch(raw,/c\.relname='iam_capability'/,'same-name tables outside the exact OID retain all rows');
   assert.equal(stage.installation.filter(sql=>sql===local).length,1,'actual '+id+' installation emits '+slot);
   if(slot==='after')assert.equal(stage.durableVerification.filter(sql=>sql===local).length,1);
   // The IAM relation itself, metadata, ACL and all other old rows remain in
   // the ordinary snapshot; no table-level or security exclusion is added.
   assert.ok(raw.includes("'columns',(SELECT jsonb_agg(jsonb_build_object('attribute',to_jsonb(a),'default',pg_get_expr(d.adbin,d.adrelid))"));
   assert.ok(raw.includes("'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid=c.oid)"));
   assert.ok(raw.includes("'acl',c.relacl"));
  }
  assert.ok(batch.priorAudit.includes("IF old-'triggers' IS DISTINCT FROM new-'triggers' THEN RAISE EXCEPTION 'SQL"+id+"_PRIOR_STATE_CHANGED';END IF;"));
  assert.ok(batch.priorAudit.includes("IF x IS DISTINCT FROM y THEN RAISE EXCEPTION 'SQL"+id+"_PRIOR_TRIGGER_CHANGED';END IF;"));
  assert.ok(batch.priorAudit.includes('SQL'+id+'_UNEXPECTED_TRIGGER'));
  assert.ok(batch.objectsCheck.includes('SQL'+id+'_CAPABILITY_DEFINITION'));
  const source=read('scripts/migrations/'+(id==='127'?'127-annual-position-budget.sql':'128-own-position-assignments.sql'));
  assert.equal(hash(source.replace(/\r\n?/g,'\n')),id==='127'?'43466ffdfa8a93b5aa03066bbc275a5d0e247e2965def21278b338d65988f89d':'d50a2a14e478868b4086514fc0ddd47bd116ba761a88b0a2ff28e36866ce1e78');
 }
 // These three stages add no IAM capabilities and must retain the complete
 // IAM data snapshot rather than inheriting either predecessor's exception.
 for(const id of ['129','adopted-v2','210']){
  const stage=p.stages.find(value=>value.id===id),snapshots=stage.installation.filter(sql=>sql.startsWith('DO $snapshot$'));
  assert.equal(snapshots.length,2,id+' emits before and after snapshots');
  for(const snapshot of snapshots){
   assert.doesNotMatch(snapshot,/CASE WHEN c\.nspname='public' AND c\.relname='iam_capability'/);
   assert.ok(!snapshot.includes('WHERE r.capability_key NOT IN('),id+' keeps all existing capabilities');
  }
 }
});
