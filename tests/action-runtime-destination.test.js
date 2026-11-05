import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTION_RUNTIME_ROLE,ACTION_RUNTIME_IDENTITY_SQL,actionRuntimeDestinationFromTarget,recordActionRuntimeIdentity,assertActionRuntimeDestination} from '../lib/action-runtime-identity.js';
const TARGET={major:17,projectId:'noisy-poetry-54471701',branchId:'br-plain-dust-acpjgebb',endpointId:'ep-shiny-cherry-actlyudg',database:'neondb',role:'neondb_owner'};
const destination=()=>actionRuntimeDestinationFromTarget({...TARGET});
const identity=()=>({...destination(),currentUser:ACTION_RUNTIME_ROLE,sessionUser:ACTION_RUNTIME_ROLE});
const client=()=>function genuineClientFixture(){};
const denied=fn=>assert.throws(fn,e=>e?.code==='ACTION_DATABASE_DESTINATION_REQUIRED');
test('RI1 legacy role-only identity remains accepted without an expected destination; a later historical read fails closed',()=>{
 const sql=client();assert.equal(recordActionRuntimeIdentity(sql,{currentUser:ACTION_RUNTIME_ROLE,sessionUser:ACTION_RUNTIME_ROLE}),sql);
 assert.equal(assertActionRuntimeDestination(sql),sql);denied(()=>assertActionRuntimeDestination(sql,destination()));
});
test('RI2 exact destination keeps the same SDK client and requires runtime roles even though the admission names owner',()=>{
 const sql=client(),expected=destination();assert.equal(Object.hasOwn(expected,'role'),false);assert.equal(Object.isFrozen(expected),true);
 recordActionRuntimeIdentity(sql,identity());assert.equal(assertActionRuntimeDestination(sql,expected),sql);assert.equal(TARGET.role,'neondb_owner');
});
test('RI3 every destination field is compared on every cached-client return',()=>{
 const sql=client();recordActionRuntimeIdentity(sql,identity());
 for(const key of Object.keys(destination())){const wrong={...destination(),[key]:key==='major'?18:destination()[key]+'-other'};denied(()=>assertActionRuntimeDestination(sql,wrong));assert.equal(assertActionRuntimeDestination(sql,destination()),sql);}
});
test('RI4 owner or mixed current/session user cannot be recorded as runtime, irrespective of the target role',()=>{
 for(const row of[{currentUser:TARGET.role,sessionUser:TARGET.role},{currentUser:ACTION_RUNTIME_ROLE,sessionUser:TARGET.role},{currentUser:TARGET.role,sessionUser:ACTION_RUNTIME_ROLE}])assert.throws(()=>recordActionRuntimeIdentity(client(),{...destination(),...row}),e=>e?.code==='ACTION_DATABASE_ROLE_REQUIRED');
});
test('RI5 client-owned metadata properties do not replace identity recorded by the existing SQL query',()=>{
 const sql=Object.assign(client(),{identity:identity(),target:TARGET});denied(()=>assertActionRuntimeDestination(sql,destination()));
 recordActionRuntimeIdentity(sql,identity());assert.equal(assertActionRuntimeDestination(sql,destination()),sql);
});
test('RI6 identities are bound to each SDK client, not the last global database URL or another client',()=>{
 const a=client(),b=client();recordActionRuntimeIdentity(a,identity());recordActionRuntimeIdentity(b,{...identity(),branchId:'other-branch'});
 assert.equal(assertActionRuntimeDestination(a,destination()),a);denied(()=>assertActionRuntimeDestination(b,destination()));
});
test('RI7 mutation of caller metadata cannot change the recorded identity; mutation of an expected destination is rechecked',()=>{
 const sql=client(),actual=identity(),expected={...destination()};recordActionRuntimeIdentity(sql,actual);actual.branchId='changed-after-record';
 assert.equal(assertActionRuntimeDestination(sql,expected),sql);expected.branchId='changed-after-first-check';denied(()=>assertActionRuntimeDestination(sql,expected));
});
test('RI8 malformed expected fields, coercions, extra owner role or missing metadata fail without a fallback',()=>{
 const sql=client();recordActionRuntimeIdentity(sql,identity());
 for(const wrong of[{...destination(),major:'17'},{...destination(),major:[17]},{...destination(),branchId:['br-plain-dust-acpjgebb']},{...destination(),role:TARGET.role},{major:17},{...destination(),endpointId:''},false])denied(()=>assertActionRuntimeDestination(sql,wrong));
 for(const wrong of[{...TARGET,secret:'no'},{...TARGET,major:'17'},{...TARGET,role:''}])denied(()=>actionRuntimeDestinationFromTarget(wrong));
});
test('RI9 one existing read-only identity SELECT carries exactly the destination fields and roles, with no credentials',()=>{
 assert.equal((ACTION_RUNTIME_IDENTITY_SQL.match(/\bSELECT\b/gi)||[]).length,1);
 for(const field of["current_user AS \"currentUser\"","session_user AS \"sessionUser\"","current_setting('server_version_num')","current_setting('neon.project_id',true)","current_setting('neon.branch_id',true)","current_setting('neon.endpoint_id',true)",'current_database() AS database'])assert.ok(ACTION_RUNTIME_IDENTITY_SQL.includes(field));
 assert.equal(/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE|GRANT|REVOKE|COPY|CALL)\b/i.test(ACTION_RUNTIME_IDENTITY_SQL),false);assert.equal(/password|DATABASE_URL|token/i.test(ACTION_RUNTIME_IDENTITY_SQL),false);
});
