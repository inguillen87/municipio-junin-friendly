import assert from 'node:assert/strict';
import test from 'node:test';
import {practiceAmount} from '../assets/developer-homologation-manual.js';
import {developerHomologationPractice as perform} from '../lib/developer-homologation-practice.js';
const token='c'.repeat(64);
const wrong='d'.repeat(64);
function transport(initial,change=false) {
  const calls=[];let state={...initial};
  return {calls,query:async(sql,args)=>{
    assert.match(sql,/^SELECT developer_homologation\.practice_v1\(/);
    assert.equal(JSON.parse(args[0]).tenantId,'fixture-scope');
    const [,tag,step,rev,amount]=args;calls.push({step,rev,amount});
    if(step!=='read'){
      if(change||tag!==token||rev!==state.revision)throw Object.assign(new Error('QA_PRACTICE_STALE'),{code:'QA_PRACTICE_STALE'});
      state={revision:rev+1,state:{draft:'pending',approve:'approved',reject:'rejected',reset:'empty'}[step],
        amount:step==='reset'?null:amount??state.amount,lastStep:step};
    }
    return {rows:[{result:{active:true,scopeToken:token,expiresAt:'2030-01-01T22:00:00Z',practice:{...state}}}]};
  }};
}
const ctx={tenantId:'fixture-scope'};
const blank={revision:0,state:'empty',amount:null,lastStep:null};
test('Spanish entry preserves zero and cents without interpreting thousands or exponents',()=>{
  assert.equal(practiceAmount('0'),'0.00');assert.equal(practiceAmount('35,5'),'35.50');
  assert.equal(practiceAmount('99999999.99'),'99999999.99');
  for(const a of ['','10,500','1.000,25','1e3','-1','4.999','1 000','01',null])assert.equal(practiceAmount(a),null);
});
test('preparation, review, another practice and rejection use the verified stored amount without domain commands',async()=>{
  const t=transport(blank);
  assert.equal((await perform(t,ctx,token,'draft',0,'0.00')).practice.amount,'0.00');
  assert.equal((await perform(t,ctx,token,'approve',1,null)).practice.state,'approved');
  assert.equal((await perform(t,ctx,token,'reset',2,null)).practice.state,'empty');
  await perform(t,ctx,token,'draft',3,'35.50');
  assert.deepEqual((await perform(t,ctx,token,'reject',4,null)).practice,{revision:5,state:'rejected',amount:'35.50',lastStep:'reject'});
  assert.deepEqual(t.calls.map(x=>x.step),['read','draft','read','approve','read','reset','read','draft','read','reject']);
});
test('old context, stale revision and fabricated amount cannot submit a new decision',async()=>{
  const t=transport({revision:3,state:'pending',amount:'25.10',lastStep:'draft'});
  for(const [tag,rev,value] of [[wrong,3,null],[token,2,null],[token,3,'1.00']]){
    await assert.rejects(perform(t,ctx,tag,'approve',rev,value),/QA_PRACTICE_/);
  }
  assert.equal(t.calls.filter(x=>x.step!=='read').length,0);
  await assert.rejects(perform(transport(blank,true),ctx,token,'draft',0,'10.00'),/QA_PRACTICE_STALE/);
});
