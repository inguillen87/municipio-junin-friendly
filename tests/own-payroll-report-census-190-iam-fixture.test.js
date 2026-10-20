// Pure proof validation only. No fixture builder or SQL constructor is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertOwnReportCensus190IamFixture} from '../scripts/lib/own-payroll-report-census-190-iam-fixture.mjs';
const time='2026-10-20T12:00:00.000Z';
function proof(){
 const plan={version:'own-report-census-190-iam-fixture.v1',reason:'Asignación exclusivamente ficticia y acotada de censo QA200',assignments:[{membershipId:'10000000-0000-4000-8000-000000000001',capability:'payroll.calculation.read',grantedBy:'maker@example.invalid'}],declarations:[{capability_key:'payroll.calculation.read',label:'Fuente canónica sintética',description:'Sólo prueba de comparación',scope_kind:'tenant',sensitivity:'standard'}]};
 const before={roles:[{role_key:'QA_AUTHORITY_OPERATOR'}],roleCapabilities:[],memberships:[{id:plan.assignments[0].membershipId}],overrides:[],capabilities:[],conflicts:[],effective:[{membershipId:plan.assignments[0].membershipId,capabilities:['actions.read']}]};
 const after=structuredClone(before);after.capabilities=[{...plan.declarations[0],created_at:time}];after.overrides=[{membership_id:plan.assignments[0].membershipId,capability_key:plan.assignments[0].capability,allow_override:true,deny_override:false,reason:plan.reason,granted_by_user_email:plan.assignments[0].grantedBy,created_at:time}];after.effective[0].capabilities.push('payroll.calculation.read');
 return{plan,value:{version:plan.version,assignments:plan.assignments,before,after}};
}
test('proof validation conserves all old IAM rows and accepts only the explicit delta',()=>{const{plan,value}=proof();assert.equal(assertOwnReportCensus190IamFixture(plan,value).passed,true);});
test('a role, membership, conflict, existing override or foreign effective change fails',()=>{
 for(const mutate of [v=>v.after.roles[0].role_key='OTHER',v=>v.after.memberships[0].id='other',v=>v.after.conflicts.push({capability_key:'a',conflicts_with_key:'b'}),v=>v.after.overrides[0].deny_override=true,v=>v.after.effective[0].capabilities.push('unrequested.capability')]){const{plan,value}=proof();mutate(value);assert.throws(()=>assertOwnReportCensus190IamFixture(plan,value));}
});
test('an undeclared capability, changed grantor or removed prior capability fails',()=>{
 for(const mutate of [v=>v.after.capabilities[0].description='Changed declaration',v=>v.after.overrides[0].granted_by_user_email='foreign@example.invalid',v=>v.after.effective[0].capabilities.shift()]){const{plan,value}=proof();mutate(value);assert.throws(()=>assertOwnReportCensus190IamFixture(plan,value));}
});
