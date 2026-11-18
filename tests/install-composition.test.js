import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,copyFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {execFileSync} from 'node:child_process';
import {COMPOSITION_ORDER,compositionPaths,deriveSource} from '../scripts/lib/install-composition-source.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const evidence=JSON.parse(read('scripts/candidates/install-composition-attestation-v1.json'));
const example=name=>{
 const paths=compositionPaths(name),source=read(paths.source),manifestText=read(paths.manifest);
 return {source,...deriveSource({name,source,manifest:JSON.parse(manifestText),manifestText,attestation:evidence.sources[name]})};
};

test('exact source bytes remain untouched aside from barrier, preimage prefix and final rollback',()=>{
 for(const name of COMPOSITION_ORDER){
  const {source,sql,manifest}=example(name);
  const barrier=source.match(/^DO \$(source_only|not_an_installer)\$ BEGIN[\s\S]*?END \$\1\$;\n/m);
  assert.ok(barrier,name);assert.ok(!sql.includes(barrier[0]),name);
  assert.ok(!sql.includes('$source_only$')&&!sql.includes('$not_an_installer$'),name);
  const rest=source.slice(barrier.index+barrier[0].length,-'ROLLBACK;\n'.length);
  assert.ok(sql.includes(rest),name+' exact body');
  assert.match(sql,/^DO \$composition_preimage\$/m);
  assert.ok(sql.endsWith('ROLLBACK;\n'));assert.doesNotMatch(sql,/^COMMIT;$/m);
  assert.equal(manifest.preserved.originalStatementsBytePreserved,true);
  assert.equal(manifest.installable,false,'missing installed metadata must block COMMIT');
 }
});
test('all three existing PR295 replacements have pinned prosrc and mandatory owner/ACL checks',()=>{
 const {sql,manifest}=example('employment-job-title-writers');
 const replace=(sql.match(/CREATE OR REPLACE FUNCTION public\./g)??[]).length;
 const pins=manifest.preimages.functions.filter(x=>x.kind==='redefined');
 assert.equal(replace,3);assert.equal(pins.length,3);
 assert.ok(pins.every(x=>/^[a-f0-9]{64}$/.test(x.prosrcSha256)&&x.owner===null&&x.acl===null));
 for(const p of pins)assert.ok(sql.includes(p.signature));
 assert.match(sql,/actual\.owner_name IS DISTINCT FROM/);
 assert.match(sql,/actual\.acl_text IS DISTINCT FROM/);
});
test('history guards pin original function bodies and enabled triggers, and fail closed where ACL or tgenabled absent',()=>{
 const {manifest,sql}=example('attendance-area-history');
 assert.equal(manifest.preimages.functions.filter(x=>x.kind==='guard').length,6);
 assert.equal(manifest.preimages.triggers.length,7);
 assert.ok(manifest.preimages.triggers.every(x=>x.enabled===null));
 assert.match(sql,/COMPOSITION_TRIGGER_PREIMAGE_NOT_ATTESTED/);
 assert.match(sql,/COMPOSITION_PREIMAGE_NOT_ATTESTED/);
});
test('expected devices must precede history; all installed source files preserve their REVOKE statements, never add GRANT',()=>{
 assert.deepEqual(COMPOSITION_ORDER.slice(0,4),['attendance-area-authority','attendance-expected-devices','attendance-area-history','attendance-area-workdays']);
 for(const name of COMPOSITION_ORDER){
  const {source,sql}=example(name);
  const count=s=>(s.match(/\bGRANT\s+(?:(?:ALL|EXECUTE|SELECT|INSERT|UPDATE|DELETE)\s+)?ON\b/gi)??[]).length;
  assert.equal(count(sql),count(source),name);
  const revoked=source.match(/REVOKE ALL ON[\s\S]*?FROM PUBLIC,municontrol_actions_runtime_app;/g)??[];
  for(const statement of revoked)assert.ok(sql.includes(statement),name);
 }
});
test('--check rejects changed bytes and generation itself has no SQL, network or subprocess client',()=>{
 const source=read('scripts/build-install-composition.mjs');
 assert.doesNotMatch(source,/execFile|spawn|fetch\(|http\.|https\.|pg\.|postgres|neon/);
 assert.match(source,/assert\.equal\(raw\(paths\.output\),result\.sql/);
 assert.match(source,/assert\.equal\(raw\(paths\.outputManifest\),generatedManifest/);
 assert.throws(()=>deriveSource({...exampleInputs('attendance-area-history'),source:'tampered'}),/SOURCE_SHA_CHANGED/);
 function exampleInputs(name){const paths=compositionPaths(name),manifestText=read(paths.manifest);return{name,source:read(paths.source),manifest:JSON.parse(manifestText),manifestText,attestation:evidence.sources[name]};}
});

test('CLI --check passes unchanged sources and rejects byte edits to generated SQL and its manifest',()=>{
 const root=mkdtempSync(join(tmpdir(),'municontrol-composition-test-'));
 const files=[
  'scripts/build-install-composition.mjs','scripts/lib/install-composition-source.mjs',
  'scripts/candidates/install-composition-attestation-v1.json',
  ...COMPOSITION_ORDER.flatMap(n=>Object.values(compositionPaths(n)))
 ];
 try{
  for(const file of files){const dest=join(root,file);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,read(file),'utf8');}
  const run=()=>spawnSync(process.execPath,[join(root,'scripts/build-install-composition.mjs'),'--check'],{cwd:root,encoding:'utf8',timeout:10000});
  const first=run();assert.equal(first.status,0,first.stderr);
  const target=join(root,compositionPaths(COMPOSITION_ORDER[0]).output);
  writeFileSync(target,readFileSync(target,'utf8')+'-- tamper\n','utf8');
  const bad=run();assert.notEqual(bad.status,0);assert.match(bad.stderr,/COMPOSITION_DERIVED_SQL_CHANGED/);
  writeFileSync(target,read(compositionPaths(COMPOSITION_ORDER[0]).output),'utf8');
  const manifest=join(root,compositionPaths(COMPOSITION_ORDER[1]).outputManifest);
  writeFileSync(manifest,readFileSync(manifest,'utf8')+' ','utf8');
  const wrong=run();assert.notEqual(wrong.status,0);assert.match(wrong.stderr,/COMPOSITION_DERIVED_MANIFEST_CHANGED/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
