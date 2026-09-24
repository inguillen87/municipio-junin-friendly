import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {boundedCuratedRead,openCuratedSource,readCuratedArtifact,recheckCuratedManifest} from '../scripts/lib/grh-curated-source-reader.mjs';
import {curatedDigest} from '../scripts/lib/grh-curated-comparison.mjs';import {getGrhSourceProfile} from '../scripts/lib/grh-source-profile.mjs';
import {CURATED_REVIEW_DOMAINS,CURATED_REVIEW_SCHEMA} from '../assets/grh-curated-review-model.js';
async function directory(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'municontrol-curated-reader-qa-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
function manifest(profileId){
 const p=getGrhSourceProfile(profileId,{allowCandidateRead:true});return {schemaVersion:'1.0.0',profile:p.curated.profileId,sourceProfileId:p.id,profileVersion:p.profileVersion,
 source:{sha256:p.source.sha256,database:p.source.database,sizeBytes:p.source.logicalBytes,dumpCompletedAt:p.source.cutoff.replace('T',' ')},
 validation:{strictSnapshot:true,sourceCounts:Object.fromEntries(Object.entries(p.curated.expectedCounts).map(([name,count])=>[name,{expected:count,actual:count,distinctPrimaryKeys:count,duplicatePrimaryKeyRows:0}]))},
 outputs:Object.fromEntries(CURATED_REVIEW_DOMAINS.map(name=>[name,{file:CURATED_REVIEW_SCHEMA[name][0],records:p.curated.expectedOutputCounts[name],bytes:2,sha256:curatedDigest('[]')}]))};
}
for(const profile of ['grh-junin-2026-09-10','grh-junin-2026-09-22'])test('known manifest '+profile+' is readable without enabling its importer',async t=>{
 const dir=await directory(t);await fs.writeFile(path.join(dir,'curated-manifest.json'),JSON.stringify(manifest(profile)));
 const r=await openCuratedSource(dir,profile);assert.equal(r.summary.profileId,profile);await recheckCuratedManifest(r);
 if(profile.endsWith('22'))assert.throws(()=>getGrhSourceProfile(profile),{code:'GRH_CANDIDATE_PROFILE_REQUIRES_EXPLICIT_READ'});
});
const cases={sourceHash:m=>m.source.sha256='0'.repeat(64),sourceSize:m=>m.source.sizeBytes++,cutoff:m=>m.source.dumpCompletedAt='2026-01-01 00:00:00',duplicates:m=>m.validation.sourceCounts.legajo.duplicatePrimaryKeyRows=1,driftMode:m=>m.validation.strictSnapshot=false,missingArtifact:m=>delete m.outputs.leaves,extraArtifact:m=>m.outputs.extra={file:'other'},pathTraversal:m=>m.outputs.leaves.file='../other.json',wrongOutputCount:m=>m.outputs.employees.records++,wrongVersion:m=>m.profileVersion='other',oversized:m=>m.outputs.absences.bytes=50*1024*1024};
for(const [name,change]of Object.entries(cases))test('manifest rejects '+name,async t=>{
 const dir=await directory(t),m=manifest('grh-junin-2026-09-22');change(m);await fs.writeFile(path.join(dir,'curated-manifest.json'),JSON.stringify(m));
 await assert.rejects(openCuratedSource(dir,'grh-junin-2026-09-22'),e=>e.code.startsWith('GRH_CURATED_REVIEW_'));
});
test('artifact compares the hash of the exact bounded bytes read',async t=>{
 const dir=await directory(t),text='[{"sourceKey":{"id":"1"},"baseSalary":0.10000000000000001}]';const file=path.join(dir,'curated-categories.json');await fs.writeFile(file,text);
 const source={root:await fs.realpath(dir),manifest:{outputs:{categories:{file:'curated-categories.json',records:1,bytes:Buffer.byteLength(text),sha256:curatedDigest(text)}}}};
 const read=await readCuratedArtifact(source,'categories');assert.equal(read.records.length,1);assert.equal(read.records[0].baseSalary.canonical,'10000000000000001e-17');
 await fs.writeFile(file,text.replace('0.10000000000000001','0.10000000000000002'));
 await assert.rejects(readCuratedArtifact(source,'categories'),{code:'GRH_CURATED_REVIEW_ARTIFACT_CHANGED'});
});
test('truncated, oversized and non-file inputs fail before parsing',async t=>{
 const dir=await directory(t),file=path.join(dir,'file.json');await fs.writeFile(file,'x');await assert.rejects(boundedCuratedRead(file,20),{code:'GRH_CURATED_REVIEW_FILE_SIZE'});
 await fs.writeFile(file,'x'.repeat(21));await assert.rejects(boundedCuratedRead(file,20),{code:'GRH_CURATED_REVIEW_FILE_SIZE'});
 await assert.rejects(boundedCuratedRead(dir,20),{code:'GRH_CURATED_REVIEW_FILE_TYPE'});
});
test('a manifest replaced during the run cannot certify earlier data',async t=>{
 const dir=await directory(t),file=path.join(dir,'curated-manifest.json');await fs.writeFile(file,JSON.stringify(manifest('grh-junin-2026-09-10')));
 const source=await openCuratedSource(dir,'grh-junin-2026-09-10');await fs.appendFile(file,' ');
 await assert.rejects(recheckCuratedManifest(source),{code:'GRH_CURATED_REVIEW_MANIFEST_CHANGED'});
});
test('writer is absent and the output is created only after full validation',async()=>{
 const text=await fs.readFile(new URL('../scripts/compare-grh-curated-successor.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(text,/\.query\(|\.transaction\(|neon\(|apply:\s*\{/);assert.match(text,/flag:'wx'/);
 assert.ok(text.indexOf('await compareCuratedSources(')<text.indexOf('await fs.writeFile('));
 assert.match(text,/coreArtifactsReread:false/);assert.match(text,/nativeOperationsCompared:false/);
});
test('whole pipeline reads all fifteen synthetic artifacts and rejects mismatched core sources',async t=>{
 const {compareCuratedSources}=await import('../scripts/compare-grh-curated-successor.mjs');
 const {successorFixture}=await import('./fixtures/grh-successor-panel-synthetic.js');
 const dir=await directory(t),dirs={};
 for(const day of ['10','22']){
  const target=path.join(dir,day);await fs.mkdir(target);dirs[day]=target;const m=manifest('grh-junin-2026-09-'+day);
  for(const name of CURATED_REVIEW_DOMAINS){
   const rows=Array.from({length:m.outputs[name].records},(_,i)=>({sourceKey:{id:String(i+1)}}));
   if(name==='employees'){for(const row of rows)row.unionMemberships=[];rows[0].unionMemberships=Array.from({length:m.outputs.unionMemberships.records},(_,i)=>({syntheticId:i}));}
   const bytes=JSON.stringify(rows);m.outputs[name].bytes=Buffer.byteLength(bytes);m.outputs[name].sha256=curatedDigest(bytes);
   await fs.writeFile(path.join(target,m.outputs[name].file),bytes);
  }
  await fs.writeFile(path.join(target,'curated-manifest.json'),JSON.stringify(m));
 }
 const options={baselineDir:dirs['10'],candidateDir:dirs['22']};const report=await compareCuratedSources(options);
 assert.equal(Object.keys(report.artifacts).length,15);assert.equal(report.artifacts.absences.added,48);assert.equal(report.artifacts.employees.changed,1);assert.equal(report.scope.sourcePromoted,false);
 const core=successorFixture();for(const side of ['baseline','candidate'])Object.assign(core[side],{profileId:report[side].profileId,sourceSha256:report[side].sourceSha256,sourceCutoff:report[side].sourceCutoff});
 const corePath=path.join(dir,'core.json');await fs.writeFile(corePath,JSON.stringify(core));
 const combined=await compareCuratedSources({...options,coreReportPath:corePath});assert.equal(combined.version,'grh-coordinated-successor-review.v1');assert.equal(combined.scope.coreArtifactsReread,false);
 core.candidate.sourceSha256='f'.repeat(64);await fs.writeFile(corePath,JSON.stringify(core));
 await assert.rejects(compareCuratedSources({...options,coreReportPath:corePath}),/contrato de revisión local/);
});
