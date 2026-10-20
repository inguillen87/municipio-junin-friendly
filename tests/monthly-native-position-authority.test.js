// Pure boundary cases against the actual leaf exports. No entry, QA builder,
// native executor or HTTP transport is imported or invoked by this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertMonthlyNativePositionAuthority,prepareMonthlyNativePositionCircuit} from '../scripts/lib/monthly-native-position-circuit-qa.mjs';

const makerCaps=['workforce.employee.read','workforce.structure.read','workforce.structure.prepare','workforce.structure.assignment.prepare'];
const checkerCaps=['workforce.employee.read','payroll.parameter.read','payroll.calculation.read','payroll.calculation.nominal.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export','payroll.calculation.approve','workforce.structure.read','workforce.structure.approve','workforce.structure.assignment.approve'];
const actors=()=>({maker:{principal:{user:{email:'m10-maker@example.invalid'},tenant:{id:'synthetic-tenant',membershipId:'synthetic-maker',effectiveCapabilities:[...makerCaps]}}},checker:{principal:{user:{email:'m10-checker@example.invalid'},tenant:{id:'synthetic-tenant',membershipId:'synthetic-checker',effectiveCapabilities:[...checkerCaps]}}}});
function harness(){
 const a=actors(),calls=[],cause=new Error('PURE_API_TRIPWIRE'),schema='mc_qa_fixed_092_'+'a'.repeat(32),sourceCommit='b'.repeat(40);let current=a.maker;
 // This deliberately incomplete unit envelope is NOT a native installation
 // receipt. The real context binder must independently validate the full five
 // stage receipts/captures before this leaf can be reached in a native journey.
 const h={...a,qa:{schema},sourceCommit,positionVerification:{version:'m10-canonical-composition-verification.v1',schema,sourceCommit,beforeB0:true},getCurrent:()=>current,setCurrent:actor=>{current=actor;},api:async(...args)=>{calls.push(args);throw cause;}};
 return{h,calls,cause,current:()=>current};
}
test('M10 authority accepts exactly separated explicitly declared synthetic capabilities without mutation',()=>{
 const value=actors(),before=structuredClone(value),result=assertMonthlyNativePositionAuthority(value);
 assert.deepEqual(result.required.maker,makerCaps);assert.deepEqual([...new Set(result.required.checker)].sort(),[...checkerCaps].sort());assert.equal(result.grantPerformed,false);assert.deepEqual(value,before);
});
test('each required capability is causal for its own actor',()=>{
 for(const[kind,required]of[['maker',makerCaps],['checker',checkerCaps]])for(const capability of required){const value=actors();value[kind].principal.tenant.effectiveCapabilities=value[kind].principal.tenant.effectiveCapabilities.filter(key=>key!==capability);const before=structuredClone(value);assert.throws(()=>assertMonthlyNativePositionAuthority(value),error=>error.message==='M10_FIXTURE_CAPABILITY_MISSING:'+kind+':'+capability);assert.deepEqual(value,before);}
});
test('annual and assignment review authority never leaks to the maker or preparation to the checker',()=>{
 for(const[kind,forbidden]of[['maker',['workforce.structure.approve','workforce.structure.assignment.approve']],['checker',['workforce.structure.prepare','workforce.structure.assignment.prepare']]])for(const capability of forbidden){const value=actors();value[kind].principal.tenant.effectiveCapabilities.push(capability);assert.throws(()=>assertMonthlyNativePositionAuthority(value),error=>error.code==='ERR_ASSERTION'&&error.operator==='strictEqual'&&error.actual===true&&error.expected===false&&error.message.split('\n')[0]==='M10_FIXTURE_SEPARATION_CHANGED:'+kind+':'+capability);}
});
test('same membership cannot become an independent reviewer through another account label',()=>{
 const value=actors();value.checker.principal.tenant.membershipId=value.maker.principal.tenant.membershipId;assert.throws(()=>assertMonthlyNativePositionAuthority(value),/M10_INDEPENDENT_MEMBERSHIPS_REQUIRED/);
});
test('same account cannot become an independent reviewer through another membership label',()=>{
 const value=actors();value.checker.principal.user.email=value.maker.principal.user.email;assert.throws(()=>assertMonthlyNativePositionAuthority(value),/M10_INDEPENDENT_ACCOUNTS_REQUIRED/);
});
test('missing, foreign and not-before-B0 verification stops before any API call',async()=>{
 for(const mutate of[h=>{h.positionVerification=null;},h=>{h.positionVerification.version='source-plan-only';},h=>{h.positionVerification.schema='mc_qa_fixed_092_'+'c'.repeat(32);},h=>{h.positionVerification.sourceCommit='d'.repeat(40);},h=>{h.positionVerification.beforeB0=false;}]){const value=harness(),before=value.current();mutate(value.h);await assert.rejects(()=>prepareMonthlyNativePositionCircuit(value.h));assert.deepEqual(value.calls,[]);assert.equal(value.current(),before);}
});
test('all three required collaborators are checked before the first API request',async()=>{
 for(const key of['api','setCurrent','getCurrent']){const value=harness();value.h[key]=undefined;await assert.rejects(()=>prepareMonthlyNativePositionCircuit(value.h));assert.deepEqual(value.calls,[]);}
});
test('the six missing source-fixture M10 bindings are detected without granting anything or reaching HTTP',async()=>{
 for(const[kind,required]of[['maker',['workforce.structure.read','workforce.structure.prepare','workforce.structure.assignment.prepare']],['checker',['workforce.structure.read','workforce.structure.approve','workforce.structure.assignment.approve']]])for(const capability of required){const value=harness(),before=value.current();value.h[kind].principal.tenant.effectiveCapabilities=value.h[kind].principal.tenant.effectiveCapabilities.filter(key=>key!==capability);const actorsBefore=structuredClone({maker:value.h.maker,checker:value.h.checker});await assert.rejects(()=>prepareMonthlyNativePositionCircuit(value.h),error=>error.message==='M10_FIXTURE_CAPABILITY_MISSING:'+kind+':'+capability);assert.deepEqual(value.calls,[]);assert.equal(value.current(),before);assert.deepEqual({maker:value.h.maker,checker:value.h.checker},actorsBefore);}
});
test('valid leaf prechecks reach only the first real bootstrap seam and retain the original cause/current actor',async()=>{
 const value=harness(),before=value.current(),actorsBefore=structuredClone({maker:value.h.maker,checker:value.h.checker});await assert.rejects(()=>prepareMonthlyNativePositionCircuit(value.h),error=>error===value.cause);assert.deepEqual(value.calls,[['annualBudget',{resource:'bootstrap',year:'2026'}]]);assert.equal(value.current(),before);assert.deepEqual({maker:value.h.maker,checker:value.h.checker},actorsBefore);
});
