// Synthetic fixtures exercise the Participation profile, never a CI build receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {RELEASE_VERSION} from '../assets/release-status-model.js';
import {PERIOD_BUILD_PROFILE,assertOwnPeriodBuildProfile,createOwnPeriodBuildEnvelope,verifyOwnPeriodBuildEnvelope} from '../scripts/lib/own-period-participation-tested-build.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const identity=()=>({checkoutSha:'a'.repeat(40),treeSha:'b'.repeat(40),prHeadSha:'c'.repeat(40),eventName:'pull_request',
 ref:'refs/pull/1/merge',repository:'inguillen87/municipio-junin-friendly',runId:'101',runAttempt:'1',
 lockSha256:'d'.repeat(64),packageSha256:'e'.repeat(64),helperSha256:'f'.repeat(64),workflowSha256:'1'.repeat(64),
 nodeVersion:'v24.21.0',nodeBinarySha256:'2'.repeat(64),npmVersion:'11.19.0',platform:'linux',arch:'x64',
 consumerProfile:PERIOD_BUILD_PROFILE,profileHelperSha256:'4'.repeat(64),consumerWorkflowSha256:'5'.repeat(64)});
function fixture(t){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'mc-period-build-'));
 t.after(()=>{
  assert.ok(path.resolve(base).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(base).startsWith('mc-period-build-'));
  fs.rmSync(base,{recursive:true,force:true});
 });
 const root=path.join(base,'source'),consumer=path.join(base,'consumer'),envelope=path.join(base,'transfer'),id=identity();
 fs.mkdirSync(path.join(root,'public','.well-known'),{recursive:true});fs.mkdirSync(consumer);
 fs.writeFileSync(path.join(root,'public','.well-known','synthetic.txt'),'synthetic\n');
 fs.writeFileSync(path.join(root,'public','release-info.json'),JSON.stringify({version:RELEASE_VERSION,
  commitSha:id.checkoutSha,sourceState:'committed',adminUiSha256:'3'.repeat(64)})+'\n');
 const created=createOwnPeriodBuildEnvelope({root,envelope,identity:id});
 const verify=(options={})=>verifyOwnPeriodBuildEnvelope({root:consumer,envelope,identity:id,expectedManifestSha256:created.manifestSha256,...options});
 return {root,consumer,envelope,id,created,verify};
}
test('Participation profile retains complete hidden public bytes and exact installation',t=>{
 const f=fixture(t);assert.equal(f.created.files,2);f.verify({install:true});
 assert.equal(fs.readFileSync(path.join(f.consumer,'public','.well-known','synthetic.txt'),'utf8'),'synthetic\n');
 assert.notEqual(f.id.checkoutSha,f.id.prHeadSha);assert.throws(()=>f.verify({install:true}),/ART_BUILD_TARGET_EXISTS/);
});
test('unprofiled or differently profiled packets are rejected before transfer',t=>{
 for(const value of [undefined,'own-art-tested-public.v1','other']){
  const f=fixture(t),other={...f.id,consumerProfile:value};
  assert.throws(()=>f.verify({identity:other,install:true}),/PERIOD_BUILD_PROFILE/);
  assert.equal(fs.existsSync(path.join(f.consumer,'public')),false);
 }
 assert.throws(()=>assertOwnPeriodBuildProfile({consumerProfile:PERIOD_BUILD_PROFILE}),/PERIOD_BUILD_HELPER_PIN/);
 assert.throws(()=>assertOwnPeriodBuildProfile({consumerProfile:PERIOD_BUILD_PROFILE,profileHelperSha256:'a'.repeat(64)}),/PERIOD_BUILD_WORKFLOW_PIN/);
});
test('both Participation source pins and the inherited same-run source identity must match',t=>{
 for(const key of ['profileHelperSha256','consumerWorkflowSha256','runId','runAttempt','checkoutSha','treeSha','prHeadSha']){
  const f=fixture(t),other={...f.id,[key]:key.endsWith('Sha256')?'6'.repeat(64):f.id[key]+'0'};
  assert.throws(()=>f.verify({identity:other,install:true}),/ART_BUILD_IDENTITY/);
  assert.equal(fs.existsSync(path.join(f.consumer,'public')),false);
 }
});
test('Participation cannot replace the producer digest or mutate the transferred public set',t=>{
 const f=fixture(t),file=path.join(f.envelope,'build-custody.json'),value=JSON.parse(fs.readFileSync(file));
 value.identity.consumerWorkflowSha256='6'.repeat(64);const bytes=Buffer.from(JSON.stringify(value)+'\n');fs.writeFileSync(file,bytes);
 assert.throws(()=>f.verify(),/ART_BUILD_MANIFEST_SHA/);assert.notEqual(sha(bytes),f.created.manifestSha256);
 const other=fixture(t);fs.appendFileSync(path.join(other.envelope,'public','.well-known','synthetic.txt'),'changed');
 assert.throws(()=>other.verify({install:true}),/ART_BUILD_PUBLIC_SET_OR_BYTES/);
 assert.equal(fs.existsSync(path.join(other.consumer,'public')),false);
});
const workflow=()=>fs.readFileSync(new URL('../.github/workflows/own-period-participation.yml',import.meta.url),'utf8');
test('single producer completes the original full build and publishes an immutable same-run envelope',()=>{
 const source=workflow(),producer=source.split('\n  tested_build:\n')[1].split('\n  verify:\n')[0];
 assert.equal((source.match(/npm run build/g)||[]).length,1);
 for(const fragment of ['set -euo pipefail','preflight','npm run build 2>&1 | tee','mjs create',
  'include-hidden-files: true','if-no-files-found: error','steps.custody.outputs','steps.shared_upload.outputs',
  'own-period-tested-public-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.sha }}',
  '[[ "$PERIOD_UPLOADED_ARTIFACT_ID" =~ ^[1-9][0-9]*$ ]]'])assert.ok(source.includes(fragment),fragment);
 assert.ok(producer.indexOf('mjs preflight')<producer.indexOf('npm run build'));
 assert.ok(producer.indexOf('npm run build')<producer.indexOf('mjs create'));
 assert.ok(producer.indexOf('mjs create')<producer.indexOf('id: shared_upload'));
 assert.doesNotMatch(producer,/PGPASSWORD|NODE_OPTIONS|DATABASE_URL|secrets\./);
});
test('failed, skipped or cancelled producer has an explicit first consumer failure gate',()=>{
 const consumer=workflow().split('\n  verify:\n')[1];
 assert.ok(consumer.startsWith("    needs: tested_build\n    if: ${{ always() }}\n"));
 const gate=consumer.indexOf("if: ${{ always() && (needs.tested_build.result != 'success' || cancelled()) }}");
 assert.ok(gate>0&&gate<consumer.indexOf('uses: actions/checkout@'));
 assert.ok(consumer.slice(gate,consumer.indexOf('uses: actions/checkout@')).includes('run: exit 1'));
 assert.doesNotMatch(consumer,/continue-on-error|if: \$\{\{ needs\.tested_build\.result == 'success'/);
});
test('both original PG consumers verify the external digest and all bytes before installing Chromium',()=>{
 const consumer=workflow().split('\n  verify:\n')[1];
 assert.ok(consumer.includes('pg: [17, 18]'));assert.ok(consumer.includes('fail-fast: false'));
 for(const fragment of ['artifact-ids: ${{ needs.tested_build.outputs.artifact_id }}','merge-multiple: true',
  'PERIOD_MANIFEST_SHA256: ${{ needs.tested_build.outputs.manifest_sha }}',
  'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093'])assert.ok(consumer.includes(fragment),fragment);
 const verified=consumer.indexOf('mjs verify'),directory=consumer.indexOf('run: mkdir -p verification'),browser=consumer.indexOf('run: npx playwright install --with-deps chromium');
 assert.ok(verified>0&&directory>verified&&browser>directory);
 assert.equal((consumer.match(/NODE_OPTIONS: --import \.\/scripts\/lib\/project-chromium\.mjs/g)||[]).length,2);
});
test('original native CLI commands, database restrictions and evidence uploads remain present',()=>{
 const source=workflow();
 for(const fragment of [
  "CREATE EXTENSION pgcrypto; CREATE ROLE municontrol_actions_runtime_app NOLOGIN NOSUPERUSER NOBYPASSRLS;",
  'node scripts/verify-own-period-participation.mjs --major=${{ matrix.pg }} --transport=ci --source-commit=${{ github.sha }} --browser=chromium --output=verification/own-period-participation-pg${{ matrix.pg }}',
  'node scripts/verify-source-preview-fragmented-transport.mjs',
  'node --import ./scripts/lib/project-chromium.mjs scripts/verify-own-period-read-delay.mjs --major=${{ matrix.pg }} --transport=ci --source-commit=${{ github.sha }} --browser=chromium --output=verification/own-period-read-delay-pg${{ matrix.pg }}',
  'node --import ./scripts/lib/project-chromium.mjs scripts/verify-own-participation-command-guard.mjs --major=${{ matrix.pg }} --transport=ci --source-commit=${{ github.sha }} --output=verification/participation-command-guard-pg${{ matrix.pg }} --browser=chromium',
  'MC_QA_LOCK_OBSERVATION: 1','verification/release-chromium-157.0.8098.0/installation.json',
  'verification/payroll-formula-transport/fragmented-regression'])assert.ok(source.includes(fragment),fragment);
 assert.match(source,/      - uses: actions\/upload-artifact@v4\n        if: always\(\)/);
});
test('existing events, master scope, consumer names and read-only permissions stay bounded',()=>{
 const source=workflow();
 assert.ok(source.startsWith('name: Own period participation\non:\n  pull_request:\n'));
 assert.ok(source.includes("  push:\n    branches: ['master']\n"));
 assert.ok(source.includes('permissions:\n  contents: read\n'));
 assert.ok(source.includes('group: own-period-participation-${{ github.ref }}\n  cancel-in-progress: true'));
 assert.equal((source.match(/^  verify:$/gm)||[]).length,1);
 for(const file of ['scripts/own-art-tested-build.mjs','tests/own-art-tested-build.test.js','.github/workflows/own-art.yml','assets/release-status-model.js'])
  assert.equal(source.split("'"+file+"'").length-1,2,file+' is covered in PR and push');
 assert.doesNotMatch(source,/workflow_call|workflow_run|pull_request_target|workflow_dispatch|GITHUB_ENV|secrets\.|continue-on-error/);
});
