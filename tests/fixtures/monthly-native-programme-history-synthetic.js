// PROPOSED SOURCE ONLY. Eventual location:
// tests/fixtures/monthly-native-programme-history-synthetic.js
// No SQL, transport, admission, mutation of prior inputs, or municipal formula.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {salaryItems,salarySerialized} from '../../assets/native-salary-catalog-model.js';
import {ownProgramDefinition,ownProgramHistory,ownProgramRuleKey} from '../../assets/own-payroll-program-model.js';
import {ownFixedForcedRuleKey,fixedForcedExpressionSet} from '../../assets/own-payroll-engine.js';
import {participationRuleKey} from '../../assets/own-period-participation-program.js';

const PERIOD='2026-10',FROM='2026-09',CLOSED='2026-09';
const clone=v=>structuredClone(v);
const sha=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
const key=r=>ownProgramRuleKey(r,'own-payroll-namespaces.v2');
const merge=(before,after,keyOf)=>[...new Map([
 ...before.map(v=>[keyOf(v),clone(v)]),...after.map(v=>[keyOf(v),clone(v)])
]).values()];
const byKey=(a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0;
export const MONTHLY_NATIVE_HISTORY_FIXTURE_VERSION='monthly-native-programme-history-synthetic.v1';

export function monthlyNativeHistoryCatalogItems(raw){
 return salaryItems(raw.map(row=>{
  assert.equal(row.validFrom,PERIOD,'JOINT_HISTORY_CATALOG_TEMPLATE_CHANGED');
  assert.equal(row.validUntil,PERIOD,'JOINT_HISTORY_CATALOG_TEMPLATE_CHANGED');
  return{...row,validFrom:FROM};
 }));
}

export function monthlyNativeHistoryProgramme({before,template,catalogItems}){
 assert.equal(template.namespaceVersion,'own-payroll-namespaces.v2');
 const desired=clone(template),remap=new Map();
 desired.rules=template.rules.map(original=>{
  assert.equal(original.validFrom,PERIOD,'JOINT_HISTORY_RULE_TEMPLATE_CHANGED');
  assert.equal(original.validUntil,PERIOD,'JOINT_HISTORY_RULE_TEMPLATE_CHANGED');
  const next={...clone(original),validFrom:FROM};
  assert.equal(next.rounding.mode,'exact','JOINT_HISTORY_NEW_RULE_EXACT_REQUIRED');
  const exact=n=>{assert.ok(!((n.op==='round'||n.op==='quantity_phase'&&n.stage==='rounded')&&n.rounding.mode!=='exact')&&!(['concept','auxiliary'].includes(n.op)&&n.stage!=='exact'),'JOINT_HISTORY_NEW_RULE_EXACT_REQUIRED');for(const k of ['left','right','value','condition','then','else'])if(n[k]&&typeof n[k]==='object')exact(n[k]);};exact(next.expression);
  remap.set(participationRuleKey(original),participationRuleKey(next));
  remap.set(ownFixedForcedRuleKey(original),ownFixedForcedRuleKey(next));
  return next;
 });
 if(desired.periodParticipation)desired.periodParticipation.treatments=
  desired.periodParticipation.treatments.map(t=>({...t,ruleKey:remap.get(t.ruleKey)??t.ruleKey}));
 if(desired.fixedForcedAmountsPolicy)desired.fixedForcedAmountsPolicy.policies=
  desired.fixedForcedAmountsPolicy.policies.map(p=>({...p,ruleKey:remap.get(p.ruleKey)??p.ruleKey}));
 const prior=before??null,wanted=new Set(desired.rules.map(key));
 for(const r of prior?.rules??[])assert.equal(r.validFrom,FROM,
  'JOINT_HISTORY_PREEXISTING_PROGRAMME_STOP');
 const historical=(prior?.rules??[]).filter(r=>!wanted.has(key(r))).map(r=>
  ({...clone(r),validUntil:CLOSED}));
 const candidate={...(prior?clone(prior):{}),...desired,
  rules:[...historical,...desired.rules].sort(byKey),
  bindings:merge(prior?.bindings??[],desired.bindings,b=>b.agreementCode+':'+b.key)
   .sort((a,b)=>(a.agreementCode+':'+a.key).localeCompare(b.agreementCode+':'+b.key,'en'))
 };
 if(prior?.periodParticipation||desired.periodParticipation)candidate.periodParticipation={
  ...clone(prior?.periodParticipation??desired.periodParticipation),
  ...clone(desired.periodParticipation??{}),
  treatments:merge(prior?.periodParticipation?.treatments??[],
   desired.periodParticipation?.treatments??[],t=>t.ruleKey)
 };
 const priorPolicies=prior?.fixedForcedAmountsPolicy?.policies??[];
 const desiredPolicies=desired.fixedForcedAmountsPolicy?.policies??[];
 if(priorPolicies.length||desiredPolicies.length){
  for(const p of desiredPolicies){
   const old=priorPolicies.find(v=>v.ruleKey===p.ruleKey);
   if(old)assert.deepEqual(old,p,'JOINT_HISTORY_POLICY_MUTATION_STOP');
  }
  const policies=merge(priorPolicies,desiredPolicies,p=>p.ruleKey)
   .sort((a,b)=>a.ruleKey<b.ruleKey?-1:a.ruleKey>b.ruleKey?1:0);
  candidate.fixedForcedAmountsVersion='own-fixed-forced-amount.v1';
  // New authored SYNTHETIC declaration for this complete revision.
  // Deterministic over the complete source data; never recursively over
  // previous lineage hashes and never a claim about municipal source history.
  candidate.fixedForcedAmountsPolicy={quantityLineage:{
   version:'own-quantity-lineage-review.v1',
   sourceSha256:sha({version:'joint-history-synthetic-quantity-source.v1',
    rules:candidate.rules,policies}),
   sourceControlSha256:sha({version:'joint-history-synthetic-control.v1',
    quantityPolicy:'reject',expressions:'unchanged',period:PERIOD,from:FROM}),
   expressionSetSha256:sha(fixedForcedExpressionSet(candidate.rules,policies)),
   complete:true
  },policies};
 }
 const canonical=ownProgramDefinition(candidate,catalogItems);
 ownProgramHistory(prior,canonical);
 const active=canonical.rules.filter(r=>r.validFrom<=PERIOD&&
  (r.validUntil===null||r.validUntil>=PERIOD));
 assert.deepEqual(active.map(key).sort(),desired.rules.map(key).sort(),
  'JOINT_HISTORY_ACTIVE_RULES_CHANGED');
 return canonical;
}

// The version is the actual opaque SQL programme version, never a hash of only
// the active rules. This descriptor is QA data and cannot admit a SQL session.
export function monthlyNativeHistoryPublished(bootstrap,definition=bootstrap.program.definition){
 assert.ok(bootstrap&&bootstrap.program&&bootstrap.salaryCatalog);assert.match(bootstrap.program.version,/^[a-f0-9]{64}$/);assert.ok(Number.isInteger(bootstrap.program.revision)&&bootstrap.program.revision>0);
 assert.deepEqual(bootstrap.program.definition,definition,'JOINT_APPROVED_PROGRAMME_CHANGED');ownProgramDefinition(definition,bootstrap.salaryCatalog.items);
 return{definition:clone(definition),programmeSha256:sha(definition),latestProgramVersion:bootstrap.program.version,revision:bootstrap.program.revision};
}
export function assertMonthlyNativeHistoryCapture(capture,published){
 assert.ok(published&&capture?.payload?.programState?.program);assert.equal(capture.body.programVersion,published.latestProgramVersion,'JOINT_CAPTURED_PROGRAMME_VERSION_CHANGED');assert.equal(capture.payload.programState.program.version,published.latestProgramVersion,'JOINT_CAPTURED_PROGRAMME_VERSION_CHANGED');
 assert.equal(sha(capture.payload.programState.program.definition),published.programmeSha256,'JOINT_CAPTURED_PROGRAMME_CHANGED');assert.deepEqual(capture.payload.programState.program.definition,published.definition,'JOINT_CAPTURED_PROGRAMME_CHANGED');return true;
}
