// Proposed synthetic-only contract tests. Not executed by the source proposal.
// Fixture identity is not a build receipt; the workflow gates actual producer success.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {RELEASE_VERSION} from '../assets/release-status-model.js';
import {assertOwnArtBuildEnvironment,createOwnArtBuildEnvelope,verifyOwnArtBuildEnvelope} from '../scripts/own-art-tested-build.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const identity=()=>({checkoutSha:'a'.repeat(40),treeSha:'b'.repeat(40),prHeadSha:'c'.repeat(40),eventName:'pull_request',ref:'refs/pull/1/merge',repository:'inguillen87/municipio-junin-friendly',runId:'101',runAttempt:'1',lockSha256:'d'.repeat(64),packageSha256:'e'.repeat(64),helperSha256:'f'.repeat(64),workflowSha256:'1'.repeat(64),nodeVersion:'v24.21.0',nodeBinarySha256:'2'.repeat(64),npmVersion:'11.19.0',platform:'linux',arch:'x64'});
function fixture(t){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'mc-own-art-build-'));
 t.after(()=>{assert.ok(path.resolve(base).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(base).startsWith('mc-own-art-build-'));fs.rmSync(base,{recursive:true,force:true});});
 const root=path.join(base,'source'),consumer=path.join(base,'consumer'),envelope=path.join(base,'transfer'),id=identity();
 fs.mkdirSync(path.join(root,'public','assets'),{recursive:true});fs.mkdirSync(path.join(root,'public','.well-known'));fs.mkdirSync(consumer);
 fs.writeFileSync(path.join(root,'public','assets','app.js'),'export const synthetic = true;\n');fs.writeFileSync(path.join(root,'public','.well-known','qa.txt'),'synthetic\n');
 fs.writeFileSync(path.join(root,'public','release-info.json'),JSON.stringify({version:RELEASE_VERSION,commitSha:id.checkoutSha,sourceState:'committed',adminUiSha256:'3'.repeat(64)})+'\n');
 const created=createOwnArtBuildEnvelope({root,envelope,identity:id});
 const verify=(options={})=>verifyOwnArtBuildEnvelope({root:consumer,envelope,identity:id,expectedManifestSha256:created.manifestSha256,...options});
 return {base,root,consumer,envelope,id,created,verify};
}
function changedManifest(f,change){const file=path.join(f.envelope,'build-custody.json'),value=JSON.parse(fs.readFileSync(file));change(value);const bytes=Buffer.from(JSON.stringify(value)+'\n');fs.writeFileSync(file,bytes);return sha(bytes);}
test('complete public bytes including hidden resource install only after current identity and external digest match',t=>{
 const f=fixture(t),before=fs.readFileSync(path.join(f.root,'public','assets','app.js'));assert.equal(f.created.files,3);f.verify({install:true});
 assert.deepEqual(fs.readFileSync(path.join(f.consumer,'public','assets','app.js')),before);assert.equal(fs.readFileSync(path.join(f.consumer,'public','.well-known','qa.txt'),'utf8'),'synthetic\n');
 assert.notEqual(f.id.checkoutSha,f.id.prHeadSha,'PR merge SHA and PR head stay distinct');assert.throws(()=>f.verify({install:true}),/ART_BUILD_TARGET_EXISTS/);
});
test('changed, missing or added downloaded public file rejects before creating the consumer public directory',t=>{
 for(const kind of ['changed','missing','added']){const f=fixture(t),file=path.join(f.envelope,'public','assets','app.js');
  if(kind==='changed')fs.appendFileSync(file,'x');else if(kind==='missing')fs.unlinkSync(file);else fs.writeFileSync(path.join(f.envelope,'public','extra.js'),'x');
  assert.throws(()=>f.verify({install:true}),/ART_BUILD_PUBLIC_SET_OR_BYTES/);assert.equal(fs.existsSync(path.join(f.consumer,'public')),false);
 }
});
test('an internally coherent substituted manifest cannot renew the producer digest',t=>{
 const f=fixture(t);changedManifest(f,m=>m.identity.runId='999');assert.throws(()=>f.verify(),/ART_BUILD_MANIFEST_SHA/);
});
test('run, attempt, checkout/tree, PR head, lock and runtime mismatches reject under the unchanged manifest',t=>{
 for(const key of ['runId','runAttempt','checkoutSha','treeSha','prHeadSha','lockSha256','nodeVersion','nodeBinarySha256','npmVersion','platform','arch','repository','eventName','ref','helperSha256','workflowSha256']){
  const f=fixture(t),other={...f.id,[key]:f.id[key]+'x'};assert.throws(()=>f.verify({identity:other}),/ART_BUILD_IDENTITY/);
 }
});
test('even a producer-digest-bound malformed manifest retains exact path, shape, multiplicity and pin checks',t=>{
 for(const kind of ['extra-key','unsafe','duplicate','fractional','nonhash']){const f=fixture(t),digest=changedManifest(f,m=>{
  if(kind==='extra-key')m.passed=true;else if(kind==='unsafe')m.files[0].file='../outside';else if(kind==='duplicate')m.files[1]={...m.files[0]};else if(kind==='fractional')m.files[0].byteLength=0.5;else m.files[0].sha256='unknown';
 });assert.throws(()=>f.verify({expectedManifestSha256:digest}),/ART_BUILD_(MANIFEST_SHAPE|PATH|DUPLICATE|FILE_PIN)/);}
});
test('links and extra envelope members do not enter the verified public set',t=>{
 for(const kind of ['hardlink','symlink','extra-envelope']){const f=fixture(t);
  if(kind==='hardlink')fs.linkSync(path.join(f.envelope,'public','assets','app.js'),path.join(f.envelope,'public','alias.js'));
  else if(kind==='symlink')fs.symlinkSync(path.join(f.envelope,'public','assets'),path.join(f.envelope,'public','alias-dir'),process.platform==='win32'?'junction':'dir');
  else fs.writeFileSync(path.join(f.envelope,'extra.txt'),'x');
  assert.throws(()=>f.verify(),/ART_BUILD_(REGULAR_SINGLE_LINK|SYMLINK|ENVELOPE_SET)/);
 }
});
test('fully pinned wrong release SHA or uncommitted release cannot become a current build',t=>{
 for(const sourceState of ['committed','modified']){const f=fixture(t),file=path.join(f.envelope,'public','release-info.json');
  const release={version:RELEASE_VERSION,commitSha:sourceState==='committed'?'4'.repeat(40):null,sourceState,adminUiSha256:'3'.repeat(64)};const bytes=Buffer.from(JSON.stringify(release)+'\n');fs.writeFileSync(file,bytes);
  const digest=changedManifest(f,m=>Object.assign(m.files.find(v=>v.file==='release-info.json'),{byteLength:bytes.length,sha256:sha(bytes)}));
  assert.throws(()=>f.verify({expectedManifestSha256:digest}),/ART_BUILD_RELEASE_(SHA|NOT_COMMITTED)/);
 }
});
test('general-suite preflight refuses ambient database or optional private-source input without disclosing its value',()=>{
 assert.doesNotThrow(()=>assertOwnArtBuildEnvironment({CI:'true',PATH:'/synthetic'}));
 for(const key of ['NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE','DATABASE_URL','DATABASE_URL_UNPOOLED','PGPASSWORD','PGHOST','PGPORT','NEON_BRANCH_ID','ACTIONS_DATABASE_URL','MC_EMAIL_FACTOR_PROVISION_EVENT','FRIENDLY_AGGREGATE_AUGUST_DIR','FRIENDLY_AGGREGATE_S11_DIR']){
  assert.throws(()=>assertOwnArtBuildEnvironment({[key]:'synthetic-private-not-to-print'}),e=>e.message.includes('ART_BUILD_AMBIENT_DB_OR_PRIVATE_INPUT')&&!e.message.includes('synthetic-private-not-to-print'));
 }
});
test('workflow retains five native consumers and scopes every one to successful producer and same-run artifact',()=>{
 const source=fs.readFileSync(new URL('../.github/workflows/own-art.yml',import.meta.url),'utf8');
 assert.equal((source.match(/npm run build/g)||[]).length,1);assert.equal((source.match(/needs: tested_build/g)||[]).length,4);
 assert.equal((source.match(/needs\.tested_build\.result == 'success'/g)||[]).length,4);
 assert.equal((source.match(/actions\/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093/g)||[]).length,4);
 assert.equal((source.match(/^\s+merge-multiple: true$/gm)||[]).length,4);
 for(const block of source.split('      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093').slice(1).map(s=>s.split('\n      - ')[0]))assert.match(block,/^\s+merge-multiple: true$/m);
 for(const command of ['verify-own-art.mjs --major=${{ matrix.pg }} --transport=ci --source-commit=${{ github.sha }} --browser=chromium','verify-payroll-transport-observation.mjs','verify-source-preview-transport-matrix.mjs','verify-source-preview-fragmented-transport.mjs'])assert.ok(source.includes(command),command);
 for(const consumer of source.split(/^  (?:verify|transport-observation|transport-reduction|patched-transport-comparison):$/m).slice(1)){
  const verify=consumer.indexOf('run: node scripts/own-art-tested-build.mjs verify'),directory=consumer.indexOf('run: mkdir -p verification');
  const browser=consumer.indexOf('run: npx playwright install --with-deps chromium');
  assert.ok(verify>=0&&directory>verify&&browser>directory,'each clean artifact consumer creates its output parent before installing the browser');
 }
 assert.ok(source.includes('pg: [17, 18]'));assert.equal((source.match(/NODE_OPTIONS: --import \.\/scripts\/lib\/project-chromium\.mjs/g)||[]).length,5);
 assert.ok(source.includes('NODE_OPTIONS: --import ./scripts/lib/diagnostic-patched-chromium.mjs'));assert.doesNotMatch(source,/continue-on-error|workflow_run|pull_request_target|GITHUB_ENV|secrets\./);
});
