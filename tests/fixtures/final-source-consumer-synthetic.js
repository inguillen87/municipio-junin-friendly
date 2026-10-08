import {createHash} from 'node:crypto';
import {finalRevisionTarget} from './final-source-revision-synthetic.js';
import {SUCCESSOR_ENTITIES} from '../../scripts/lib/grh-successor-package.mjs';
import {FINAL_CONSUMER_CONTEXT_SQL,FINAL_CONSUMER_ROWS_SQL,FINAL_CONSUMER_FINGERPRINT_SQL} from '../../scripts/lib/grh-final-source-consumers.mjs';
export const finalConsumerRevision='88888888-8888-4888-8888-888888888888';
export const finalConsumerPackage='c'.repeat(64);
const md5=v=>createHash('md5').update(v).digest('hex');
export function finalConsumerFixture({editContext,editPage}={}){
 const data=Object.fromEntries(SUCCESSOR_ENTITIES.map((e,i)=>[e,Array.from({length:e==='core/payrollMonthly'?1105:e==='curated/grh_leaves'?0:3},(_,n)=>({
  row_key:(i*10000+n+1).toString(16).padStart(64,'0'),
  record_json:'{"large": 9007199254740993.0000001, "missing": null, "ordinal": '+n+', "zero": 0}'
 }))]));
 const r={database_name:finalRevisionTarget.databaseName,project_id:finalRevisionTarget.projectId,branch_id:finalRevisionTarget.branchId,
  reader_role:'synthetic_owner',transaction_id:'1234',isolation:'serializable',read_only:'off',owner:true,
  revision_id:finalConsumerRevision,tenant_id:finalRevisionTarget.tenantId,source_binding_id:finalRevisionTarget.bindingId,
  parent_source_batch_id:'11111111-1111-4111-8111-111111111111',parent_import_run_id:'2',
  parent_core_version_id:finalRevisionTarget.coreVersionId,parent_curated_version_id:finalRevisionTarget.curatedVersionId,
  parent_publication_sha256:finalRevisionTarget.publicationSha256,source_profile:'grh-junin-2026-10-01',
  source_sha256:'50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f',source_cutoff:'2026-10-01T15:17:29',
  core_manifest_sha256:'a'.repeat(64),curated_manifest_sha256:'b'.repeat(64),package_sha256:finalConsumerPackage,
  source_database:'grh_junin',source_company_id:'101',verified:true,tenant_data_plane_ready:true,
  parent_source_sha256:'5a604acfe5ea32832b630d8aab29e494038d4c8940b231e283a53d14112665c7',parent_cutoff:'2026-09-10T15:17:30',
  fingerprints:Object.fromEntries(Object.entries(data).map(([e,rows])=>[e,{rows:rows.length,md5:md5(rows.map(row=>md5(row.row_key+row.record_json)).join(''))}]))};
 const calls=[],cursors=new Map();let reads=0;
 const client={async query(text,values){calls.push({text,values});
  if(text===FINAL_CONSUMER_CONTEXT_SQL){const copy=structuredClone(r);editContext?.(copy,++reads);return {rows:[copy]};}
  if(text===FINAL_CONSUMER_FINGERPRINT_SQL){if(values[0]!==finalConsumerRevision||!Object.hasOwn(data,values[1]))throw Error('Unknown synthetic revision/entity');
   const rows=data[values[1]];return {rows:[{fingerprint:{rows:rows.length,md5:md5(rows.map(row=>md5(row.row_key+row.record_json)).join(''))}}]};}
  if(text.startsWith('DECLARE ')&&text.endsWith(FINAL_CONSUMER_ROWS_SQL)){const match=/^DECLARE (mc_final_consumer_[a-f0-9]{32}) NO SCROLL CURSOR FOR/.exec(text);
   if(!match||values[0]!==finalConsumerRevision)throw Error('Unknown synthetic revision');cursors.set(match[1],{entity:values[1],offset:0});return {rows:[]};}
  const fetch=/^FETCH FORWARD ([0-9]+) FROM (mc_final_consumer_[a-f0-9]{32})$/.exec(text);
  if(fetch){const c=cursors.get(fetch[2]);if(!c)throw Error('Unknown synthetic cursor');const size=Number(fetch[1]);
   const rows=structuredClone(data[c.entity].slice(c.offset,c.offset+size));c.offset+=size;editPage?.(rows,[finalConsumerRevision,c.entity,null,size],calls);return {rows};}
  const close=/^CLOSE (mc_final_consumer_[a-f0-9]{32})$/.exec(text);if(close){if(!cursors.delete(close[1]))throw Error('Unknown synthetic cursor');return {rows:[]};}
  throw Error('Unexpected SQL');
 }};
 return {client,calls,data,cursors,context:r,input:{client,target:finalRevisionTarget,revisionId:finalConsumerRevision,expectedPackageSha256:finalConsumerPackage}};
}
