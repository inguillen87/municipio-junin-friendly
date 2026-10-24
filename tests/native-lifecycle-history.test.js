import test from 'node:test';import assert from 'node:assert/strict';
import * as model from '../assets/native-employment-lifecycle-model.js';
import {lifecycleHistoryFixture} from './fixtures/native-lifecycle-history-synthetic.js';

test('complete history has its own validator without widening the legacy twenty-summary bootstrap',()=>{
 const f=lifecycleHistoryFixture();assert.equal(model.validateLifecycleBootstrap(f.bootstrap,f.bootstrap.subject.contractId),f.bootstrap);
 assert.equal(typeof model.validateLifecycleHistory,'function');assert.equal(model.validateLifecycleHistory(f.history,f.bootstrap.subject.contractId),f.history);
 assert.equal(f.history.proposals.length,100);assert.equal(f.bootstrap.proposals.length,20);
 assert.throws(()=>model.validateLifecycleBootstrap({...f.bootstrap,proposals:f.history.proposals},f.bootstrap.subject.contractId));
});
for(const adopted of [false,true])for(const count of [0,20,21,100])test(`complete ${adopted?'adopted':'fresh'} history preserves ${count} distinct proposals`,()=>{
 const f=lifecycleHistoryFixture(count,{adopted});const result=model.validateLifecycleHistory(f.history,f.bootstrap.subject.contractId);
 assert.equal(result.total,count);assert.equal(result.proposals.length,count);assert.equal(result.bootstrap.version,f.bootstrap.version);assert.equal(result.complete,true);
});
for(const [label,mutate] of [
 ['partial flag',v=>v.complete=false],['missing row',v=>v.proposals.pop()],['duplicate proposal',v=>v.proposals[99]=structuredClone(v.proposals[0])],['hidden authority',v=>v.tenantId='untrusted'],['wrong total',v=>v.total=99],['oversized history',v=>{v.proposals.push({...v.proposals[0],id:'10000000-0000-4000-8000-000000009999'});v.total=101;}],['different recent status',v=>v.proposals[0]={...v.proposals[0],status:'pending'}],['reordered recent prefix',v=>[v.proposals[0],v.proposals[1]]=[v.proposals[1],v.proposals[0]]],['incorrect truncation claim',v=>v.bootstrap.historyTruncated=false],['wrong contract',v=>v.bootstrap.subject.contractId='10000000-0000-4000-8000-000000009999']
])test('history rejects '+label+' before it is displayed',()=>{const f=lifecycleHistoryFixture(),v=structuredClone(f.history);mutate(v);assert.throws(()=>model.validateLifecycleHistory(v,f.bootstrap.subject.contractId),e=>e.code==='CONTRACT_INVALID');});
