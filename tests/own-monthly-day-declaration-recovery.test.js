import test from 'node:test';import assert from 'node:assert/strict';
import {recoverOwnPeriodRead} from '../lib/own-period-read-recovery.js';
import {createOwnMonthlyDayDeclarationHandler} from '../api/internal-own-monthly-day-declaration.js';
import {syntheticMonthlyDayDeclarationBootstrap as bootstrap,monthlyDayDeclarationIds as ids} from './fixtures/own-monthly-day-declaration-synthetic.js';
const busy=()=>Object.assign(Error('MONTHLY_DAY_DECLARATION_BUSY synthetic occupied read'),{status:409,code:'MONTHLY_DAY_DECLARATION_BUSY'});
test('new exact BUSY classifier preserves the closed read-only two-attempt reauthorization protocol',async()=>{
 for(const persistent of [false,true]){let reads=0;const events=[],run=()=>recoverOwnPeriodRead({method:'GET',operation:'bootstrap',busyCode:'MONTHLY_DAY_DECLARATION_BUSY',read:async()=>{events.push('read');if(++reads===1||persistent)throw busy();return 'exact-source';},waitForRecovery:async ms=>{assert.equal(ms,1000);events.push('wait');},reauthorize:async()=>{events.push('authorize');return true;}});
 if(persistent)await assert.rejects(run,e=>e.code==='MONTHLY_DAY_DECLARATION_BUSY');else assert.equal(await run(),'exact-source');assert.deepEqual(events,['read','wait','authorize','read']);assert.equal(reads,2);}
 for(const patch of [{method:'POST'},{operation:'command'},{busyCode:'UNREVIEWED_BUSY'}]){let reads=0;await assert.rejects(()=>recoverOwnPeriodRead({method:'GET',operation:'bootstrap',busyCode:'MONTHLY_DAY_DECLARATION_BUSY',read:async()=>{reads++;},reauthorize:async()=>true,...patch}),/RECOVERY_INVALID/);assert.equal(reads,0);}
});
test('the real new GET adapter reauthorizes and cannot continue with changed identity after occupation',async()=>{
 const principal={user:{email:'typed-days-qa@example.invalid'},tenant:{source:'membership',id:ids.contract,membershipId:ids.registration,effectiveCapabilities:['workforce.employee.read','payroll.parameter.read']}},session={email:principal.user.email,id:ids.key,version:1,releaseSha:'d'.repeat(40)};
 for(const changed of [false,true]){let auth=0,reads=0;const handler=createOwnMonthlyDayDeclarationHandler({env:{},requireAccess:async()=>{auth++;const p=structuredClone(principal);if(changed&&auth>1)p.tenant.membershipId=ids.proposal;return {mode:'managed',principal:p};},sessionFor:()=>session,getSql:async()=>({query:async q=>{assert.match(q,/own_monthly_days_bootstrap_v1/);if(++reads===1)throw busy();return [{result:bootstrap()}];}})}),query={resource:'bootstrap',contractId:ids.contract,period:'2026-10'},req={method:'GET',url:'/api/internal-own-monthly-day-declaration?'+new URLSearchParams(query),query,headers:{}},res={setHeader(){},status(n){this.code=n;return this;},json(v){this.value=v;return this;}};
 await handler(req,res);assert.equal(auth,2);assert.equal(reads,changed?1:2);assert.equal(res.code,changed?409:200);if(changed)assert.equal(res.value.code,'MONTHLY_DAY_DECLARATION_SCOPE_CHANGED');}
});
