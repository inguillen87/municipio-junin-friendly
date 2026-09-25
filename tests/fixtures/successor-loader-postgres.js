// Fuentes inventadas sobre las implementaciones reales 061/096/098/106; sólo para una base desechable.
import {createHash} from 'node:crypto';import {buildGrhCuratedSourceQa,curatedSyntheticRows} from '../../scripts/verify-grh-curated-source-postgres.mjs';
import {buildSuccessorStagingQa} from '../../scripts/verify-grh-successor-staging-postgres.mjs';
import {buildSuccessorDelta,sealSuccessorPackage,SUCCESSOR_ENTITIES,successorHash} from '../../scripts/lib/grh-successor-package.mjs';
import {normalizeGrhCuratedVersionRecord,createGrhCuratedVersionDelta} from '../../scripts/lib/grh-curated-source-version.mjs';
import {NATIVE_READ_DOMAINS} from '../../scripts/lib/grh-successor-operational-read.mjs';
import {getGrhSourceProfile} from '../../scripts/lib/grh-source-profile.mjs';import {stableJson} from '../../scripts/lib/canonical-import.mjs';
import assert from 'node:assert/strict';
export const loaderQaTarget=Object.freeze({projectId:'project-loader-qa',branchId:'br-loader-qa',databaseName:'successor_stage_qa',tenantId:'44444444-4444-4444-8444-444444444444',bindingId:'55555555-5555-4555-8555-555555555555',coreVersionId:'33333333-3333-4333-8333-333333333333',curatedVersionId:'88888888-8888-4888-8888-888888888888',publicationSha256:'f'.repeat(64)});
const fp=rows=>{const h=createHash('sha256');for(const [key,record] of rows.sort(([a],[b])=>a.localeCompare(b)))h.update(key+':'+successorHash(stableJson(record))+'\n');return {rows:rows.length,sha256:h.digest('hex')};};
const recon={company_source_id:'101',employee_number:'001',administrative_active:true,liquidated_current:true,evidence_status:'active_and_liquidated',last_payroll_date:'2026-09-30'};
const reconKey=successorHash(stableJson({companyCode:'101',employeeNumber:'001'}));
const coreFingerprint=entity=>fp(entity==='core/employmentReconciliation'?[[reconKey,recon]]:[]);
const source=id=>{const p=getGrhSourceProfile(id,{allowCandidateRead:true});return {profileId:id,sourceSha256:p.source.sha256.toLowerCase(),cutoff:p.source.cutoff,coreManifestSha256:'d'.repeat(64),curatedManifestSha256:'e'.repeat(64)};};
export async function loaderQaPackage(){
 const data=curatedSyntheticRows(),results=[];
 for(const entity of SUCCESSOR_ENTITIES){if(entity.startsWith('core/')){results.push({entity,baseline:coreFingerprint(entity),candidate:coreFingerprint(entity),changes:{add:0,replace:0,remove:0},rows:[]});continue;}
  const name=entity.slice(8),baseline=data[name].candidate.map(r=>normalizeGrhCuratedVersionRecord(name,r)),candidate=structuredClone(baseline);
  if(name==='grh_employees')candidate[0].nombre='QA loader: changed employee';
  if(name==='grh_absences')candidate.pop();
  if(name==='grh_catalog_rows')for(let n=0;n<401;n++)candidate.push(normalizeGrhCuratedVersionRecord(name,{catalog:'qa',source_key:'added-'+n,label:'Synthetic '+n,source_payload:{synthetic:true}}));
  results.push(await buildSuccessorDelta(entity,{baseline:()=>baseline,candidate:()=>candidate}));
 }
 return sealSuccessorPackage({baseline:source('grh-junin-2026-09-10'),candidate:source('grh-junin-2026-09-22'),results});
}
export function loaderQaSetup(major=17){
 let sql=buildSuccessorStagingQa({expectedMajor:major});
 // El ejecutor fija 127.0.0.1 y la base vacía; en Docker la dirección del servidor es la del contenedor.
 sql=sql.replace(" OR inet_server_addr() IS NULL OR inet_server_addr() NOT IN('127.0.0.1'::inet,'::1'::inet)",'');const end=sql.indexOf('-- 106: private successor staging.');assert.ok(end>0);sql=sql.slice(0,end);
 const replace=(a,b)=>{assert.equal(sql.split(a).length,2,a.slice(0,80));sql=sql.replace(a,b);};
 sql=sql.replaceAll("'synthetic_grh'","'grh_junin'").replaceAll("repeat('b',64)","'"+source('grh-junin-2026-09-10').sourceSha256+"'").replaceAll("repeat('B',64)","'"+source('grh-junin-2026-09-10').sourceSha256.toUpperCase()+"'");
 replace('INSERT INTO grh_core_source_version(id,',`INSERT INTO employment_status_snapshot(employment_contract_id,snapshot_date,administrative_status,payroll_status,source_batch_id,evidence)
 SELECT employee,DATE '2026-09-30','active','liquidated',b,'{"administrativeActive":true,"liquidatedCurrent":true,"evidenceStatus":"active_and_liquidated","lastPayrollDate":"2026-09-30"}'::jsonb FROM qa_ids;
 INSERT INTO grh_core_source_version(id,`);
 const core={};for(const entity of SUCCESSOR_ENTITIES.filter(e=>e.startsWith('core/'))){const f=coreFingerprint(entity);core[entity.slice(5)]={counts:{candidate:f.rows},candidateProjectionSha256:f.sha256};}
 replace("(SELECT jsonb_object_agg(e,jsonb_build_object('counts',jsonb_build_object('candidate',0))) FROM unnest(ARRAY['payrollRuns','payrollMonthly','movements','payrollSnapshot','employmentReconciliation']) e)","'"+JSON.stringify(core)+"'::jsonb");
 const old={},updated={};for(const [name,rows]of Object.entries(curatedSyntheticRows())){const d=createGrhCuratedVersionDelta(name,rows.baseline,rows.candidate);old[name]={counts:d.counts};updated[name]={counts:d.counts,candidateProjectionSha256:d.candidateProjectionSha256};}
 replace("'"+JSON.stringify(old)+"'::jsonb","'"+JSON.stringify(updated)+"'::jsonb");
 for(const [table,binding,contract,time]of NATIVE_READ_DOMAINS){sql+=`\nCREATE TABLE public.${table}(id uuid PRIMARY KEY,tenant_id uuid,${binding} uuid,${contract?contract+' uuid,':''}${time} timestamptz DEFAULT now());`;}
 sql+=`\nINSERT INTO public.action_case(id,tenant_id,source_binding_id,beneficiary_contract_id) SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,tenant,binding,employee FROM qa_ids;
 INSERT INTO public.payroll_novelty_batch(id,tenant_id,certified_binding_id) SELECT 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,tenant,binding FROM qa_ids;
 SET CONSTRAINTS ALL IMMEDIATE; COMMIT;
 SELECT set_config('neon.project_id','${loaderQaTarget.projectId}',false),set_config('neon.branch_id','${loaderQaTarget.branchId}',false);`;
 return sql;
}
