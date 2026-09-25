// Evidencia sintética: ningún registro de una persona real.
import {buildSuccessorDelta,sealSuccessorPackage,SUCCESSOR_ENTITIES} from '../../scripts/lib/grh-successor-package.mjs';
import {getGrhSourceProfile} from '../../scripts/lib/grh-source-profile.mjs';
import {NATIVE_READ_DOMAINS} from '../../scripts/lib/grh-successor-operational-read.mjs';
export const target=Object.freeze({projectId:'project-synthetic',branchId:'br-synthetic',databaseName:'neondb',
 tenantId:'11111111-1111-4111-8111-111111111111',bindingId:'22222222-2222-4222-8222-222222222222',
 coreVersionId:'33333333-3333-4333-8333-333333333333',curatedVersionId:'44444444-4444-4444-8444-444444444444',publicationSha256:'a'.repeat(64)});
const source=id=>{const p=getGrhSourceProfile(id,{allowCandidateRead:true});return {profileId:id,sourceSha256:p.source.sha256.toLowerCase(),cutoff:p.source.cutoff,coreManifestSha256:'b'.repeat(64),curatedManifestSha256:'c'.repeat(64)};};
export async function syntheticOperationalPackage(){
 const results=[];for(const entity of SUCCESSOR_ENTITIES){
  const employee={company_id:101,legajo:'9876',nombre:'PRIVATE_SYNTHETIC_NAME',person_id:'9876',source_payload:{synthetic:true}};
  const baseline=entity==='curated/grh_employees'?[employee]:[];
  const candidate=entity==='curated/grh_employees'?[{...employee,nombre:'PRIVATE_REVISED_NAME'}]:[];
  results.push(await buildSuccessorDelta(entity,{baseline:()=>baseline,candidate:()=>candidate}));
 }
 return sealSuccessorPackage({baseline:source('grh-junin-2026-09-10'),candidate:source('grh-junin-2026-09-22'),results});
}
export function syntheticOperationalResults(pack){
 const meta={tenant_id:target.tenantId,source_binding_id:target.bindingId,source_version_id:target.coreVersionId,
  curated_version_id:target.curatedVersionId,publication_sha256:target.publicationSha256,
  source_batch_id:'55555555-5555-4555-8555-555555555555',curated_batch:'55555555-5555-4555-8555-555555555555',import_run_id:6,curated_import:6,
  source_sha256:pack.baseline.sourceSha256,curated_source_sha256:pack.baseline.sourceSha256,source_cutoff:pack.baseline.cutoff,curated_cutoff:pack.baseline.cutoff,
  source_company_id:101,source_database:'grh_junin',core_manifest:pack.baseline.coreManifestSha256,curated_manifest:pack.baseline.curatedManifestSha256,
  project:target.projectId,branch:target.branchId,database:target.databaseName,readOnly:'on',isolation:'repeatable read',snapshot:'1:2:',databaseBytes:'1000000',stagingInstalled:false,
  core_evidence:{},core_seals:{},curated_evidence:{},curated_seals:{}};
 const wrap=v=>[{observation:v}],entities=[];
 for(const entity of SUCCESSOR_ENTITIES){const [kind,name]=entity.split('/'),e=pack.entities[entity],fp={rows:e.baseline.rows,md5:'d'.repeat(32)};
  meta[kind+'_evidence'][name]={counts:{candidate:e.baseline.rows},candidateProjectionSha256:e.baseline.sha256};meta[kind+'_seals'][name]=fp;
  entities.push(wrap({entity,baselineFingerprint:fp,candidateFingerprint:{rows:e.candidate.rows,md5:Object.values(e.changes).some(n=>n>0)?'e'.repeat(32):fp.md5},duplicateBaseKeys:0,duplicateCandidateKeys:0,
   unexpectedExistingAdds:0,previousMismatches:0,semanticDuplicates:0,checkedChanges:Object.values(e.changes).reduce((a,b)=>a+b,0)}));
 }
 const cohort=wrap({rows:pack.entities['core/employmentReconciliation'].baseline.rows,fingerprint:'f'.repeat(32),otherBatches:0,afterPublication:0,affectedContracts:0});
 const native=NATIVE_READ_DOMAINS.map(([domain,,contract])=>wrap({domain,rows:0,fingerprint:'f'.repeat(32),affectedContractRows:contract?0:null,afterPublication:0}));
 return [wrap(meta),...entities,cohort,...native,wrap(structuredClone(meta))];
}
