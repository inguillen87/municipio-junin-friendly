import test from 'node:test';
import assert from 'node:assert/strict';
import {createInternalActionsHandler} from '../api/internal-actions.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const SHA='a'.repeat(40), email='qa@example.invalid';
const t=id(1),m=id(2),b=id(3),person=id(4),contract=id(5);
const all=['actions.read','leave.request.all.read','time.overtime.read','time.overtime.enter','time.overtime.approve'];
function setup({personId=person,contractId=contract,grants=all,forbid=false}={}) {
  const calls=[];
  const handler=createInternalActionsHandler({
    env:{NODE_ENV:'test',INTERNAL_CERTIFIED_DATA_CONTRACT_SHA:SHA},
    requireCompatibleInternalAccess:async()=>({mode:'managed',session:{id:id(6),email,version:1},principal:{
      user:{email},tenant:{id:t,membershipId:m,source:'membership',certifiedReleaseSha:SHA}}}),
    getInternalSql:async()=>({query:async(statement,values)=>{
      assert.deepEqual(values.slice(0,6),[email,id(6),1,SHA,t,m]);
      const ot=statement.includes('action_center_overtime_bootstrap_v1');assert.ok(ot||statement.includes('action_center_tenant_bootstrap_v2'));calls.push(ot?'overtime':'leave');
      if(ot&&forbid)throw Object.assign(new Error('OVERTIME_READ_REQUIRED'),{code:'P0001'});
      return {rows:[{result:{principal:{email,tenantId:t,membershipId:m,sourceBindingId:b,sourceCompanyId:101,
        roleKey:'TEST',sourceDatabase:'synthetic',capabilities:[...grants],areaScopes:[],
        employmentContractId:contractId,actorPersonId:personId},source:{},subjects:[],reasonRows:[],decisionReasonRows:[],feature:{canEnter:false,canDecide:false}}}]};
    }})
  });
  return {calls,get:async(caseType)=>{
    const res={setHeader(){},status(n){this.n=n;return this},json(body){this.body=body;return this}};
    await handler({method:'GET',headers:{},query:{resource:'bootstrap',caseType}},res);
    return res;
  }};
}
test('public bootstrap does not advertise overtime without both verified actor coordinates; other reads survive',async()=>{
  for(const [contractId,personId] of [[null,null],[contract,null],[null,person]]) {
    const s=setup({personId,contractId,forbid:true});
    const res=await s.get('leave_request');assert.equal(res.n,200);
    assert.deepEqual(res.body.principal.capabilities,['actions.read','leave.request.all.read']);
    assert.equal(res.body.principal.overtimeReadBlock,'active_employment_required');
    assert.equal(res.body.principal.hasEmployeeLink,Boolean(contractId));
    assert.ok(!Object.hasOwn(res.body.principal,'actorPersonId'));
    assert.deepEqual(s.calls,['leave']);
    const forced=await s.get('overtime_entry');assert.equal(forced.n,403);assert.equal(forced.body.code,'OVERTIME_READ_REQUIRED');
  }
});
test('with an active link the actual overtime facade still decides entry and review',async()=>{
  const s=setup();const start=await s.get('leave_request');const governed=await s.get('overtime_entry');
  assert.equal(start.n,200);assert.equal(governed.n,200);
  assert.deepEqual(start.body.principal.capabilities,[...all].sort());
  assert.ok(!Object.hasOwn(start.body.principal,'overtimeReadBlock'));
  assert.equal(governed.body.feature.canEnter,false);assert.equal(governed.body.feature.canDecide,false);
  assert.ok(!JSON.stringify(start.body.principal).includes(person));assert.deepEqual(s.calls,['leave','overtime']);
});
test('no overtime read grant: neither eligibility nor the link-incomplete explanation is fabricated',async()=>{
  for(const contractId of [contract,null]) {
    const s=setup({contractId,grants:all.filter(x=>x!=='time.overtime.read'),forbid:true});const a=await s.get('leave_request');
    assert.equal(a.n,200);assert.deepEqual(a.body.principal.capabilities,['actions.read','leave.request.all.read']);
    assert.ok(!Object.hasOwn(a.body.principal,'overtimeReadBlock'));
    const direct=await s.get('overtime_entry');assert.equal(direct.n,403);assert.equal(direct.body.code,'OVERTIME_READ_REQUIRED');
  }
});
