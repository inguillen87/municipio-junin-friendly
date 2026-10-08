import test from 'node:test';import assert from 'node:assert/strict';
import {verifyCoreManifestProvenance,coreManifestProvenanceMatches} from '../scripts/lib/grh-core-manifest-provenance.mjs';
import {successorHash} from '../scripts/lib/grh-successor-package.mjs';
import {finalRevisionPackage} from './fixtures/final-source-revision-synthetic.js';
import {syntheticManifestEvidence} from './fixtures/core-manifest-provenance-synthetic.js';
const fixture=syntheticManifestEvidence(await finalRevisionPackage());
test('explicit metadata proof retains every other byte, including CRLF, Unicode, null and zero',()=>{
 const original=Buffer.from(fixture.bytes),proof=verifyCoreManifestProvenance(fixture.bytes,fixture.pack.baseline);
 assert.equal(proof.historicalManifestSha256,successorHash(fixture.historical));
 assert.equal(coreManifestProvenanceMatches(proof,fixture.storedManifestSha256),true);
 assert.deepEqual(fixture.bytes,original);assert.equal(proof.otherBytesUnchanged,true);
 assert.equal(proof.sourceManifestsWritten,0);assert.equal(proof.originalArtifactRecovered,false);
});
test('omitting evidence preserves the exact-manifest requirement and caller objects cannot forge a proof',()=>{
 assert.equal(verifyCoreManifestProvenance(undefined,fixture.pack.baseline),null);
 assert.equal(coreManifestProvenanceMatches(null,fixture.storedManifestSha256),false);
 assert.equal(coreManifestProvenanceMatches({historicalManifestSha256:fixture.storedManifestSha256},fixture.storedManifestSha256),false);
});
test('a verified version pair cannot authorize an unrelated or changed stored manifest',()=>{
 const proof=verifyCoreManifestProvenance(fixture.bytes,fixture.pack.baseline);
 assert.equal(coreManifestProvenanceMatches(proof,'0'.repeat(64)),false);
 assert.equal(coreManifestProvenanceMatches(proof,fixture.pack.baseline.coreManifestSha256),false);
});
for(const [label,change] of [
 ['artifact hash',text=>text.replace('a'.repeat(64),'b'.repeat(64))],
 ['artifact quantity',text=>text.replace('"records": 3','"records": 4')],
 ['source metadata',text=>text.replace('Fictional QA records only.','Changed source description.')],
 ['line endings',text=>text.replaceAll('\r\n','\n')],
])test('a change beyond the two known fields cannot match the historical bytes: '+label,()=>{
 const bytes=Buffer.from(change(fixture.bytes.toString())),baseline={...fixture.pack.baseline,coreManifestSha256:successorHash(bytes)};
 const proof=verifyCoreManifestProvenance(bytes,baseline);
 assert.equal(coreManifestProvenanceMatches(proof,fixture.storedManifestSha256),false);
 assert.throws(()=>verifyCoreManifestProvenance(bytes,fixture.pack.baseline),{code:'GRH_FINAL_REVISION_MANIFEST_PROVENANCE'});
});
for(const [label,change] of [
 ['unsupported version',text=>text.replace('"1.3.0"','"1.4.0"')],
 ['unsupported profile',text=>text.replace('grh-junin-2026-09-10','grh-junin-2026-10-01')],
 ['unsupported methodology',text=>text.replace('native MuniControl operations are not overwritten.','different methodology.')],
 ['wrong source type',text=>text.replace('"sha256": "'+fixture.pack.baseline.sourceSha256+'"','"sha256": 123')],
 ['duplicate version token',text=>text.replace('"quality": {','"nested": {"scriptVersion": "1.3.0"},"quality": {')],
 ['duplicate methodology token',text=>text.replace('Fictional QA records only.','GRH is the migration source for this extraction; native MuniControl operations are not overwritten.')],
])test('unsupported or ambiguous evidence fails closed: '+label,()=>{
 const bytes=Buffer.from(change(fixture.bytes.toString())),baseline={...fixture.pack.baseline,coreManifestSha256:successorHash(bytes)};
 assert.throws(()=>verifyCoreManifestProvenance(bytes,baseline),{code:'GRH_FINAL_REVISION_MANIFEST_PROVENANCE'});
});
test('malformed, wrong-type and oversized evidence is refused',()=>{
 for(const bytes of ['text',null,Buffer.alloc(0),Buffer.alloc(1024*1024+1),Buffer.from('{broken')])
  assert.throws(()=>verifyCoreManifestProvenance(bytes,fixture.pack.baseline),{code:'GRH_FINAL_REVISION_MANIFEST_PROVENANCE'});
});
