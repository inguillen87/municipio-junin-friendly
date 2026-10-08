import test from 'node:test';import assert from 'node:assert/strict';
import {fixedSafeError} from '../lib/internal-payroll-fixed-novelties.js';
import {runError} from '../lib/internal-own-payroll-run.js';
import {ownNoveltyError} from '../lib/internal-own-payroll-novelties.js';
for(const [name,map]of [['fixed',fixedSafeError],['calculation',runError],['own monthly',ownNoveltyError]])test(name+' reports the missing jurisdiction without a generic unavailable error or source details',()=>{
 const result=map(new Error('PAYROLL_FIXED_JURISDICTION_REQUIRED'));assert.equal(result.status,422);assert.match(result.code,/JURISDICTION_REQUIRED$/);assert.match(result.message,/jurisdicción pendiente/);assert.doesNotMatch(result.message,/uuid|SELECT|GRH|PAYROLL_FIXED/i);
 const denied=map(new Error('unrelated private SQL error'));assert.equal(denied.status,503);assert.doesNotMatch(denied.message,/private SQL/);
});
