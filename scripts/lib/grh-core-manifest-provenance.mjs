// Verifies the two documented extractor metadata changes without replacing a
// source artifact, rewriting a manifest, or accepting a different predecessor.
import {successorHash} from './grh-successor-package.mjs';
import {parseSuccessorJson} from './grh-successor-package-source.mjs';
import {stableJson} from './canonical-import.mjs';

const fail=()=>{throw Object.assign(new Error('GRH_FINAL_REVISION_MANIFEST_PROVENANCE'),
 {code:'GRH_FINAL_REVISION_MANIFEST_PROVENANCE'});};
const currentMethod='GRH is the migration source for this extraction; native MuniControl operations are not overwritten.';
// scripts/extract_grh_core.py, commit 5b1c9bc79ade0237977f5e9de01ea6f4fc42747e.
const historicalMethod='GRH is the employment and payroll source of truth.';
const proofs=new WeakSet();

export function verifyCoreManifestProvenance(bytes,baseline){
 if(bytes===undefined)return null;
 if(!(bytes instanceof Uint8Array)||bytes.byteLength===0||bytes.byteLength>1024*1024
  ||successorHash(bytes)!==baseline?.coreManifestSha256)fail();
 let text,manifest;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);manifest=parseSuccessorJson(bytes);}catch{fail();}
 if(baseline.profileId!=='grh-junin-2026-09-10'||manifest.sourceProfileId!==baseline.profileId
  ||typeof manifest.source?.sha256!=='string'||manifest.source.sha256.toLowerCase()!==baseline.sourceSha256
  ||manifest.scriptVersion!=='1.3.0'||!Array.isArray(manifest.methodology)||manifest.methodology[0]!==currentMethod)fail();
 const versionToken='"scriptVersion": "1.3.0"',methodToken=JSON.stringify(currentMethod);
 if(text.split(versionToken).length!==2||text.split(methodToken).length!==2)fail();
 // All remaining bytes, including source metadata, outputs, sizes and hashes,
 // stay identical. Preserve the original serialization and line endings.
 const historical=text.replace(versionToken,'"scriptVersion": "1.2.0"')
  .replace(methodToken,JSON.stringify(historicalMethod));
 const previous=parseSuccessorJson(Buffer.from(historical,'utf8'));
 const withoutChangedMetadata=value=>{
  const copy=structuredClone(value);delete copy.scriptVersion;copy.methodology=copy.methodology.slice(1);return copy;
 };
 if(stableJson(withoutChangedMetadata(previous))!==stableJson(withoutChangedMetadata(manifest)))fail();
 const proof=Object.freeze({version:'grh-core-manifest-provenance.v1',
  comparedManifestSha256:baseline.coreManifestSha256,historicalManifestSha256:successorHash(historical),
  historicalExtractorCommit:'5b1c9bc79ade0237977f5e9de01ea6f4fc42747e',
  changes:Object.freeze(['scriptVersion:1.2.0->1.3.0','methodology[0]']),
  otherBytesUnchanged:true,sourceManifestsWritten:0,originalArtifactRecovered:false});
 proofs.add(proof);return proof;
}

export function coreManifestProvenanceMatches(proof,storedManifestSha256){
 return proofs.has(proof)&&proof.historicalManifestSha256===storedManifestSha256;
}
