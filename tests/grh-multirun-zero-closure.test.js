import test from 'node:test';import assert from 'node:assert/strict';
import {assertMultirunClosureCounts} from '../scripts/verify-grh-multirun-candidate.mjs';
test('a complete scan with no open runs proves the declared zero open count',()=>{const seen={closed:2,unknown:1},expected={closed:2,open:0,unknown:1};assert.doesNotThrow(()=>assertMultirunClosureCounts(seen,expected));assert.deepEqual(seen,{closed:2,unknown:1});});
test('an actual open run cannot satisfy the declared zero',()=>assert.throws(()=>assertMultirunClosureCounts({closed:2,open:1,unknown:1},{closed:2,open:0,unknown:1}),{code:'V2_CLOSURE_COUNTS_MISMATCH'}));
test('closed, open and unknown observations retain exact positive counts',()=>{assert.doesNotThrow(()=>assertMultirunClosureCounts({closed:2,open:1,unknown:3},{closed:2,open:1,unknown:3}));for(const key of ['closed','open','unknown']){const changed={closed:2,open:1,unknown:3};changed[key]++;assert.throws(()=>assertMultirunClosureCounts(changed,{closed:2,open:1,unknown:3}));}});
test('unknown states, missing expectations and noninteger counts cannot be normalized away',()=>{for(const observed of [{closed:2,other:0},{closed:2,open:null},{closed:2,open:undefined},{closed:-1},{closed:0.5},{closed:Number.MAX_SAFE_INTEGER+1},[],null])assert.throws(()=>assertMultirunClosureCounts(observed,{closed:2,open:0,unknown:0}));for(const expected of [{closed:2,unknown:0},{closed:2,open:0,unknown:null},{closed:2,open:0,unknown:0,other:0}])assert.throws(()=>assertMultirunClosureCounts({closed:2},expected));});

import {getGrhSourceProfile} from '../scripts/lib/grh-source-profile.mjs';
import {validateMultirunManifest} from '../scripts/verify-grh-multirun-candidate.mjs';
test('the October28 manifest also accepts zero observed open runs and rejects one actual open run',()=>{
 const p=getGrhSourceProfile('grh-junin-2026-10-28',{allowCandidateRead:true});
 const m={schemaVersion:2,profile:p.core.profileId,sourceProfileId:p.id,profileVersion:p.profileVersion,
 source:{...structuredClone(p.source),container:'gzip',physicalSha256:p.source.gzipSha256,physicalBytes:p.source.gzipBytes,currentPayrollRuns:structuredClone(p.core.currentRuns)},sourceCounts:structuredClone(p.core.expectedCounts),reconciliation:structuredClone(p.core.expectedReconciliation),
 quality:{strictSnapshot:true,crossSourceJoinByIdPersona:0,moneySemantics:'technicalSourceAmountSum is never a financial KPI',publication:{candidateOnly:true,databaseWrites:0,v1ImporterCompatible:false,reason:'MULTIRUN_REQUIRES_VERSIONED_DATABASE_PUBLICATION'},payrollRunClosure:{statuses:{closed:528,unknown:101},currentRun:p.source.currentPayrollClosureStatus,latestClosedDate:p.source.latestClosedPayrollDate}}};
 assert.doesNotThrow(()=>validateMultirunManifest(m,p));m.quality.payrollRunClosure.statuses.open=1;assert.throws(()=>validateMultirunManifest(m,p),{code:'V2_CLOSURE_COUNTS_MISMATCH'});
});
