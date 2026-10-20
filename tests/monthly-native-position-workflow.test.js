// Source contract only. This suite does not execute a job, entry or SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const workflow=fs.readFileSync(new URL('../.github/workflows/own-monthly-day-engine-source.yml',import.meta.url),'utf8').replaceAll('\r\n','\n');
const baselineSha256='139a9defd6037bf0afa1c77d953af461df8dffdc3889095c5cfcd77475c987cb';
const optIn=' --position-comparison=198';
const regressions=' tests/monthly-native-position*.test.js tests/position-canonical-composition.test.js';
const nativePrefix='node scripts/verify-own-monthly-day-engine-source.mjs ';
function positionWorkflowContract(source){
 const lines=source.split('\n'),commands=lines.filter(line=>line.trimStart().startsWith(nativePrefix));
 assert.equal(commands.length,1,'M10_WORKFLOW_ONE_NATIVE_COMMAND');
 const native=commands[0];assert.equal(native.split(optIn).length,2,'M10_WORKFLOW_OPT_IN_REQUIRED');
 assert.ok(native.endsWith(optIn),'M10_WORKFLOW_OPT_IN_FINAL');
 for(const flag of ['--fixed-composition=196','--novelty-succession=197','--major=${{ matrix.pg }}','--transport=ci','--source-commit=${{ github.sha }}','--operational-pair-baseline=${{ matrix.operational_pair_baseline }}','--output=verification/monthly-day-engine-source-pg${{ matrix.pg }}-${{ matrix.operational_pair_baseline }}'])assert.equal(native.split(flag).length,2,'M10_WORKFLOW_EXISTING_FLAG_REQUIRED:'+flag);
 const pure=lines.filter(line=>line.trimStart().startsWith('run: node --test --test-reporter=tap '));assert.equal(pure.length,1,'M10_WORKFLOW_ONE_PURE_REGRESSION_STEP');
 for(const glob of ['tests/monthly-native-position*.test.js','tests/position-canonical-composition.test.js'])assert.equal(pure[0].split(glob).length,2,'M10_WORKFLOW_REGRESSION_REQUIRED:'+glob);
 assert.ok(pure[0].endsWith(regressions),'M10_WORKFLOW_REGRESSIONS_APPEND_ONLY');
 assert.ok(source.includes('pg: [17, 18]')&&source.includes('operational_pair_baseline: [pre107, published107]'),'M10_WORKFLOW_NATIVE_MATRIX');
 assert.ok(source.includes('cancel-in-progress: false')&&source.includes('fail-fast: false'),'M10_WORKFLOW_NO_CANCELLATION');
 assert.equal(source.includes('continue-on-error'),false,'M10_WORKFLOW_NO_FAILURE_BYPASS');
 const jobs=source.slice(source.indexOf('\njobs:\n'));assert.deepEqual([...jobs.matchAll(/^  ([a-z-]+):$/gm)].map(m=>m[1]),['verify','programme-ui'],'M10_WORKFLOW_ORIGINAL_JOBS');
 // Reversing only the two reviewed suffix additions must recover the entire
 // original file. This preserves database/service, flags, runtime, controls,
 // artifact paths/always/error handling and unrelated programme-ui byte-exact.
 const restored=source.replace(native,native.slice(0,-optIn.length)).replace(pure[0],pure[0].slice(0,-regressions.length));
 assert.equal(createHash('sha256').update(restored).digest('hex'),baselineSha256,'M10_WORKFLOW_UNREVIEWED_CHANGE');
 return {sourceContract:true,nativeCommands:1,originalMatrixCells:4,jobCount:2,sqlExecuted:false};
}

test('M10 opt-in is final on the sole existing four-cell native command and both pure suites are appended',()=>{
 assert.deepEqual(positionWorkflowContract(workflow),{sourceContract:true,nativeCommands:1,originalMatrixCells:4,jobCount:2,sqlExecuted:false});
});
test('the exact predecessor without the198 opt-in fails causally',()=>{
 const previous=workflow.replace(optIn,'').replace(regressions,'');assert.throws(()=>positionWorkflowContract(previous),/M10_WORKFLOW_OPT_IN_REQUIRED/);
});
test('a misplaced, repeated or unselected198 option is not accepted',()=>{
 const misplaced=workflow.replace(optIn,'').replace('--fixed-composition=196','--position-comparison=198 --fixed-composition=196');
 assert.throws(()=>positionWorkflowContract(misplaced),/M10_WORKFLOW_OPT_IN_FINAL/);
 assert.throws(()=>positionWorkflowContract(workflow.replace(optIn,optIn+optIn)),/M10_WORKFLOW_OPT_IN_REQUIRED/);
 assert.throws(()=>positionWorkflowContract(workflow.replace(optIn,' --position-comparison=199')),/M10_WORKFLOW_OPT_IN_REQUIRED/);
});
test('existing fixed196, succession197 and exact-SHA flags remain mandatory',()=>{
 for(const flag of ['--fixed-composition=196','--novelty-succession=197','--transport=ci','--source-commit=${{ github.sha }}','--operational-pair-baseline=${{ matrix.operational_pair_baseline }}'])assert.throws(()=>positionWorkflowContract(workflow.replace(flag,'')),/M10_WORKFLOW_EXISTING_FLAG_REQUIRED/);
});
test('dropping either new pure regression glob rejects the workflow contract',()=>{
 for(const glob of ['tests/monthly-native-position*.test.js','tests/position-canonical-composition.test.js'])assert.throws(()=>positionWorkflowContract(workflow.replace(glob,'')),/M10_WORKFLOW_REGRESSION_REQUIRED/);
});
test('another job, database, matrix reduction, cancellation or weakened artifacts are rejected',()=>{
 for(const changed of [workflow+'\n  another-native-job:\n    runs-on: ubuntu-latest\n',workflow.replace('POSTGRES_DB: own_payroll_run_qa','POSTGRES_DB: another_qa'),workflow.replace('pg: [17, 18]','pg: [17]'),workflow.replace('cancel-in-progress: false','cancel-in-progress: true'),workflow.replace('if-no-files-found: error','if-no-files-found: warn')])assert.throws(()=>positionWorkflowContract(changed));
});
