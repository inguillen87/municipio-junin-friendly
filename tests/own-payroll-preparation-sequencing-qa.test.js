import test from 'node:test';
import assert from 'node:assert/strict';
import {preparationFixture,preparationProbe,preparationProgramUrl,deferred} from '../scripts/verify-own-payroll-preparation-sequencing.mjs';
import {OWN_RUN_READ,OWN_RUN_PREPARE} from '../assets/own-payroll-run-workspace-model.js';
import {OWN_PAYROLL_READINESS_ROSTER_URL,ownPayrollReadinessAllowsNew} from '../assets/own-payroll-readiness-model.js';
import {hash,uid} from './fixtures/own-payroll-program-synthetic.js';
import {nativeRosterScope} from '../assets/native-roster-model.js';

const reply=data=>({data});
function setup({request,session=async()=>{},source}={}){const fixture=preparationFixture();return {fixture,probe:preparationProbe({request,session,tenantId:fixture.tenantId,source})};}

test('actual preparation waits for programme completion before entering the shared roster read',async()=>{
 const gate=deferred(),reads=[],sessions=[];let programPending=true;const fixture=preparationFixture();
 const {probe}=setup({request:async url=>{reads.push(url);if(url===preparationProgramUrl){await gate.promise;programPending=false;return reply(fixture.program);}assert.equal(url,OWN_PAYROLL_READINESS_ROSTER_URL);if(programPending)throw Error('NATIVE_EMPLOYMENT_LIFECYCLE_BUSY');return reply(fixture.roster);},session:async caps=>sessions.push(caps)});
 const pending=probe.verify(fixture.run,()=>true);pending.catch(()=>{});
 try{assert.deepEqual(reads,[preparationProgramUrl],'The programme promise must resolve before the roster request starts');}
 finally{gate.resolve();await Promise.allSettled([pending]);}
 await pending;assert.deepEqual(reads,[preparationProgramUrl,OWN_PAYROLL_READINESS_ROSTER_URL]);assert.deepEqual(sessions,[OWN_RUN_READ]);assert.equal(ownPayrollReadinessAllowsNew(probe.state().readiness),true);assert.equal(probe.state().readinessAccessKey,'synthetic-access');assert.equal(probe.rosterScope(),nativeRosterScope(fixture.roster.scope));assert.equal(Object.hasOwn(globalThis,'readinessRosterScope'),false);
});

test('invalidation during programme reading prevents the subsequent roster GET and publication',async()=>{
 const gate=deferred(),reads=[];let valid=true;const fixture=preparationFixture(),{probe}=setup({request:async url=>{reads.push(url);if(url===preparationProgramUrl){await gate.promise;return reply(fixture.program);}return reply(fixture.roster);}});
 const pending=probe.verify(fixture.run,()=>valid);valid=false;gate.resolve();await pending;assert.deepEqual(reads,[preparationProgramUrl]);assert.deepEqual(probe.state(),{readiness:null,readinessAccessKey:null});
});

for(const status of [401,403,503])test('programme HTTP'+status+' preserves the exact error without another roster GET or retry',async()=>{
 const error=Object.assign(Error('Synthetic denied or unavailable programme'),{status,code:'SYNTHETIC_READ_ERROR'}),reads=[];let sessions=0;const fixture=preparationFixture(),{probe}=setup({request:async url=>{reads.push(url);if(url===preparationProgramUrl)throw error;return reply(fixture.roster);},session:async()=>sessions++});
 await assert.rejects(probe.verify(fixture.run,()=>true),received=>received===error);assert.deepEqual(reads,[preparationProgramUrl]);assert.equal(sessions,0);assert.deepEqual(probe.state(),{readiness:null,readinessAccessKey:null});
});

for(const status of [401,403,503])test('roster HTTP'+status+' fails closed with one canonical read and no session or retry',async()=>{
 const error=Object.assign(Error('Synthetic roster read failure'),{status}),reads=[];let sessions=0;const fixture=preparationFixture(),{probe}=setup({request:async url=>{reads.push(url);if(url===preparationProgramUrl)return reply(fixture.program);assert.equal(url,OWN_PAYROLL_READINESS_ROSTER_URL);throw error;},session:async()=>sessions++});
 await assert.rejects(probe.verify(fixture.run,()=>true),received=>received===error);assert.deepEqual(reads,[preparationProgramUrl,OWN_PAYROLL_READINESS_ROSTER_URL]);assert.equal(sessions,0);assert.deepEqual(probe.state(),{readiness:null,readinessAccessKey:null});
});

test('programme version and tenant mismatches retain the canonical model guards before session publication',async()=>{
 for(const alter of [fixture=>fixture.program.scopeVersion=hash('e'),fixture=>fixture.roster.scope.tenantId=uid(700),fixture=>fixture.run.programVersion=hash('f')]){
  const fixture=preparationFixture();alter(fixture);let sessions=0;const {probe}=setup({request:async url=>reply(url===preparationProgramUrl?fixture.program:fixture.roster),session:async()=>sessions++});await assert.rejects(probe.verify(fixture.run,()=>true),/ámbito o el programa/);assert.equal(sessions,0);assert.deepEqual(probe.state(),{readiness:null,readinessAccessKey:null});
 }
});

test('a final authorization failure cannot publish preparation even after two successful source reads',async()=>{
 const fixture=preparationFixture(),error=Object.assign(Error('Synthetic session revoked'),{status:403}),required=[];const {probe}=setup({request:async url=>reply(url===preparationProgramUrl?fixture.program:fixture.roster),session:async caps=>{required.push(caps);throw error;}});await assert.rejects(probe.verify(fixture.run,()=>true,OWN_RUN_PREPARE),received=>received===error);assert.deepEqual(required,[OWN_RUN_PREPARE]);assert.deepEqual(probe.state(),{readiness:null,readinessAccessKey:null});
});

test('invalidation during final authorization keeps the verified data unpublished',async()=>{
 const fixture=preparationFixture();let valid=true;const {probe}=setup({request:async url=>reply(url===preparationProgramUrl?fixture.program:fixture.roster),session:async()=>{valid=false;}});await probe.verify(fixture.run,()=>valid);assert.deepEqual(probe.state(),{readiness:null,readinessAccessKey:null});assert.equal(probe.rosterScope(),null);
});
