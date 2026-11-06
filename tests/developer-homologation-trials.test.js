import test from 'node:test';
import assert from 'node:assert/strict';
import { HOMOLOGATION_CASES, runHomologationTrial, validatePracticeNovelty } from '../lib/developer-homologation-trials.js';

test('every published role exercise runs offline, returns only labeled checks, and leaves no shared mutable state',()=>{
  const ids=HOMOLOGATION_CASES.map(c=>c.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.deepEqual(new Set(HOMOLOGATION_CASES.map(c=>c.role)),new Set(['preparation','review','control']));
  for(const {id} of HOMOLOGATION_CASES){
    const first=runHomologationTrial(id);
    assert.equal(first.status,'passed',JSON.stringify(first));
    assert.ok(first.checks.length>1);
    assert.ok(first.checks.every(r=>r.passed===true && typeof r.label==='string'));
    assert.doesNotMatch(JSON.stringify(first),/contractId|membershipId|registrationId|employeeNumber|QA-SIN-PERSONA|eeeeeeee|\b\d{11}\b/);
    first.checks[0].passed=false;
    assert.ok(runHomologationTrial(id).checks.every(r=>r.passed));
  }
});
test('case IDs never interpret arbitrary action names or objects',()=>{
  for(const bogus of [null,{},'approve','__proto__','constructor','not-a-case']) {
    assert.throws(()=>runHomologationTrial(bogus),{code:'HOMOLOGATION_CASE_UNKNOWN'});
  }
});
test('mounted practice adapter handles zero separately from empty input and rejects coercion for all three steps',()=>{
  for(const step of ['draft','approve','reject']){
    for(const amount of ['0.00','0.01','35.50','999.99'])assert.equal(validatePracticeNovelty(step,amount),true);
    for(const amount of [null,'',0,35.50,'00.00','1','1.0','1.000','1,50','-1.00','1e2',' 35.50','1.'.padEnd(35,'0'),{}]){
      assert.throws(()=>validatePracticeNovelty(step,amount),{code:'QA_PRACTICE_INPUT'});
    }
  }
  for(const cmd of ['submit','reset','close',null,'constructor'])assert.throws(()=>validatePracticeNovelty(cmd,'0.00'),{code:'QA_PRACTICE_INPUT'});
});
