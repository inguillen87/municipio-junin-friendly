import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOwnAnnulReview,ownAnnulReviewRows} from '../assets/own-payroll-annulment-review-model.js';
import {annulReviewScenario} from './fixtures/own-payroll-annulment-review-synthetic.js';
test('hiding an entire active run cannot leave a partial review eligible for all',async()=>{
 const s=annulReviewScenario(),read=async id=>structuredClone(s.details.find(r=>r.id===id));
 const complete=await loadOwnAnnulReview(s.index,read);assert.equal(ownAnnulReviewRows(complete).length,9);
 const legacyState=s.index.stateVersion,hidden=s.index.index.find(r=>r.states.confirmed>0);
 hidden.states.calculated+=hidden.states.confirmed;hidden.states.confirmed=0;hidden.confirmedContractIds=[];
 assert.equal(s.index.stateVersion,legacyState);
 await assert.rejects(loadOwnAnnulReview(s.index,read));
});
