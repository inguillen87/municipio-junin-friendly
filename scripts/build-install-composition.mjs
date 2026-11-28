// Offline and deterministic. --write regenerates only derived files; --check compares every byte.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {COMPOSITION_ORDER,compositionPaths,deriveSource} from './lib/install-composition-source.mjs';

assert.deepEqual(process.argv.slice(2).length,1,'Use exactly --write or --check.');
const mode=process.argv[2];assert.ok(['--write','--check'].includes(mode),'Only --write or --check is supported.');
const url=path=>new URL('../'+path,import.meta.url);
const raw=path=>readFileSync(url(path),'utf8');
const evidencePath='scripts/candidates/install-composition-attestation-v1.json';
const evidenceText=raw(evidencePath),evidence=JSON.parse(evidenceText);
assert.equal(evidence.version,'municontrol-install-composition-attestation.v1');
assert.deepEqual(Object.keys(evidence.sources).sort(),[...COMPOSITION_ORDER].sort());
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const evidenceSha=hash(evidenceText);
const records=[];
for(const name of COMPOSITION_ORDER){
 const paths=compositionPaths(name),source=raw(paths.source),manifestText=raw(paths.manifest);
 const earlierSources=Object.fromEntries(COMPOSITION_ORDER.slice(0,COMPOSITION_ORDER.indexOf(name)).map(earlier=>[earlier,raw(compositionPaths(earlier).source)]));
 const result=deriveSource({name,source,manifestText,manifest:JSON.parse(manifestText),attestation:evidence.sources[name],attestationFileSha:evidenceSha,earlierSources});
 const generatedManifest=JSON.stringify(result.manifest,null,2)+'\n';
 if(mode==='--write'){
  writeFileSync(url(paths.output),result.sql,'utf8');
  writeFileSync(url(paths.outputManifest),generatedManifest,'utf8');
 }else{
  assert.equal(raw(paths.output),result.sql,'COMPOSITION_DERIVED_SQL_CHANGED: '+name);
  assert.equal(raw(paths.outputManifest),generatedManifest,'COMPOSITION_DERIVED_MANIFEST_CHANGED: '+name);
 }
 records.push({name,sha256:result.manifest.output.sha256,attested:result.manifest.attestation.complete});
}
process.stdout.write(JSON.stringify({ok:true,mode,executesSql:false,connects:false,order:records})+'\n');
