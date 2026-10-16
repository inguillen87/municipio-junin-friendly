import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {collectiveWorkingTimeCiOptions} from '../scripts/verify-collective-working-time-ci.mjs';

const workflow=fs.readFileSync(new URL('../.github/workflows/own-contract-working-time.yml',import.meta.url),'utf8');
function assertWired(source){
 assert.equal(source.split("'scripts/verify-collective-working-time*'").length-1,2,'Both PR and master push must observe the helper and CLI.');
 const install=source.indexOf('run: node scripts/install-project-chromium.mjs --purpose=release-verification'),collective=source.indexOf('      - name: Verify complete collective declarations and recoverable individual decisions'),sql=source.indexOf('      - name: Complete documented hours, immutable attempts, actual SQL and desktop/mobile browser');
 assert.ok(install>=0&&install<collective&&collective<sql,'Collective traversal must run after admitted Chromium and before the existing SQL/browser traversal.');
 const step=source.slice(collective,sql);
 assert.equal(step.split('node scripts/verify-collective-working-time-ci.mjs --output=verification/collective-working-time-pg${{ matrix.pg }}').length-1,1);
 assert.ok(step.includes('NODE_OPTIONS: --import ./scripts/lib/project-chromium.mjs'));
 assert.ok(!/continue-on-error:|\n\s+if:/.test(step),'The traversal must not be silently skipped or allowed to fail.');
 const artifact=source.slice(source.indexOf('      - uses: actions/upload-artifact@',sql));
 assert.ok(artifact.includes('if: always()'));
 assert.ok(artifact.includes('            verification/collective-working-time-pg${{ matrix.pg }}\n'),'Keep the whole result/failure/screenshot directory.');
 assert.ok(source.includes('pg: [17, 18]'));
}

test('the existing working-time CI runs the synthetic collective traversal with admitted Chromium and always preserves evidence',()=>assertWired(workflow));

test('the CI gate rejects a missing traversal, a later traversal, skipped failures or omitted diagnostics',()=>{
 const start=workflow.indexOf('      - name: Verify complete collective declarations and recoverable individual decisions'),end=workflow.indexOf('      - name: Complete documented hours, immutable attempts, actual SQL and desktop/mobile browser'),block=workflow.slice(start,end);
 for(const changed of[
  workflow.replace('run: node scripts/verify-collective-working-time-ci.mjs --output=verification/collective-working-time-pg${{ matrix.pg }}','run: echo omitted'),
  workflow.replace(block,'')+'\n'+block,
  workflow.replace('        # Source frontend and fictional HTTP envelopes only; no municipal session or SQL.','        continue-on-error: true'),
  workflow.replace('            verification/collective-working-time-pg${{ matrix.pg }}\n',''),
  workflow.replace("'scripts/verify-collective-working-time*'","'scripts/some-other-browser.mjs'")
 ])assert.throws(()=>assertWired(changed));
});

test('the CLI accepts a single contained evidence directory and rejects missing, duplicate and escaping arguments without running browser',()=>{
 const root=path.resolve('synthetic-source-root'),good=collectiveWorkingTimeCiOptions(['--output=verification/collective-working-time-pg17'],root);
 assert.equal(good.root,root);assert.equal(good.output,path.join(root,'verification','collective-working-time-pg17'));
 for(const args of[[],['--output='],['--output=verification'],['--output=verification/../outside'],['--output=../outside'],['--output=verification/good','--output=verification/another'],['--output=verification/good','--skip'],['--output=verification/good\n']])assert.throws(()=>collectiveWorkingTimeCiOptions(args,root));
});
