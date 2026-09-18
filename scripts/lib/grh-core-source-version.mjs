import {createHash} from 'node:crypto';
import {preflightGrhCore} from '../import-grh-core-canonical.mjs';
import {stableJson,streamDeterministicJsonArray} from './canonical-import.mjs';
import {getGrhSourceProfile} from './grh-source-profile.mjs';
import {acquireGrhPublicationLocks} from './grh-publication-lock.mjs';
import {readSourceCapacity} from './grh-source-capacity.mjs';

export const GRH_VERSION_ENTITIES=Object.freeze(['payrollRuns','payrollSnapshot','movements','payrollMonthly','employmentReconciliation']);
export const GRH_VERSION_STORAGE_BUDGET=Object.freeze({maximumDatabaseBytes:512*1024*1024,reserveBytes:16*1024*1024,maximumGrowthBytes:24*1024*1024});
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const hash=v=>createHash('sha256').update(v).digest('hex');
const reject=code=>{throw Object.assign(new Error(code),{code})};
const required=v=>{if(typeof v!=='string'||!v.length||/[\x00-\x1f\x7f]/.test(v))reject('GRH_VERSION_VALUE_INVALID');return v};
const text=v=>v===null||v===undefined||String(v).trim()===''||String(v).trim()==='<null>'?null:required(String(v).trim());
const integer=v=>{if(!Number.isSafeInteger(v))reject('GRH_VERSION_VALUE_INVALID');return v};
const date=v=>{required(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)reject('GRH_VERSION_VALUE_INVALID');return v};
function numeric(v){
 if(v===null||v===undefined)return null;
 if(typeof v!=='string'||!/^[-+]?\d{1,32}(?:\.\d{1,20})?$/.test(v))reject('GRH_VERSION_VALUE_INVALID');
 const negative=v[0]==='-',parts=v.replace(/^[-+]/,'').split('.'),whole=parts[0].replace(/^0+(?=\d)/,''),fraction=(parts[1]??'').replace(/0+$/,'');
 return (negative&&(whole!=='0'||fraction)?'-':'')+whole+(fraction?'.'+fraction:'');
}
const totalColumns=Object.freeze({employerContributions:'employer_contributions',socialSecurityTaxableBase:'social_security_taxable_base',
 healthTaxableBase:'health_taxable_base',subjectEarnings:'total_subject_earnings',nonSubjectEarnings:'total_non_subject_earnings',
 familyAllowances:'family_allowance',employeeWithholdings:'employee_withholdings',employerTaxableBase:'employer_taxable_base',net:'net',netPayable:'net_payable'});

/** The complete canonical projection, identical for base and candidate rows.
 * Literal original records are also retained for every changed or absent key.
 * No financial formula, identity assignment or status cause is inferred here. */
export function projectGrhVersionRecord(entity,row,{currentPayrollDate}={}){
 if(!GRH_VERSION_ENTITIES.includes(entity)||!row?.sourceKey||Array.isArray(row.sourceKey))reject('GRH_VERSION_ENTITY_INVALID');
 const k=row.sourceKey,company=required(String(k.companyCode));if(!/^\d+$/.test(company))reject('GRH_VERSION_VALUE_INVALID');
 const common={company_source_id:company};
 if(entity!=='payrollRuns')common.employee_number=required(k.employeeNumber);
 if(entity==='payrollRuns')return {...common,payroll_date:date(k.payrollDate),source_period:integer(k.period),source_month:integer(k.month),
  payroll_type:required(k.payrollType),closure_status:required(row.closureStatus),source_closed_flag:row.sourceClosureFlag,source_date_ig:row.sourceDateIg===null?null:date(row.sourceDateIg)};
 if(entity==='payrollMonthly')return {...common,payroll_date:date(k.payrollDate),source_period:integer(k.period),source_month:integer(k.month),
  payroll_type:required(k.payrollType),item_count:integer(row.itemCount),quantity_sum:numeric(row.quantitySum),technical_source_amount_sum:numeric(row.technicalSourceAmountSum),
  ...Object.fromEntries(Object.entries(totalColumns).map(([source,column])=>[column,numeric(row.sourceTotals?.[source])])),
  dominant_agreement_source_id:text(row.dominantAgreementCode),dominant_sector_source_id:text(row.dominantSectorCode),distinct_concepts:integer(row.distinctConcepts),quality_flags:row.qualityFlags??[]};
 if(entity==='movements')return {...common,movement_period:date(`${integer(k.year)}-${String(integer(k.month)).padStart(2,'0')}-01`),payroll_type:text(k.payrollType),
  movement_type:text(row.movementType),concept_source_id:text(k.conceptCode),cost_center_source_id:text(k.costCenterCode),quantity:numeric(text(row.quantity)),installment:text(row.installment),
  automatic_source_value:text(row.automatic),adjustment_source_value:text(row.adjustment),forced_source_value:text(row.forced),legal_instrument:text(row.legalInstrument),movement_status:text(row.status)};
 if(entity==='payrollSnapshot')return {...common,snapshot_date:date(row.payrollDate),source_period:integer(row.period),source_month:integer(row.month),payroll_type:required(row.payrollType),
  agreement_source_id:text(row.agreement?.id),agreement_name:text(row.agreement?.name),category_name:text(row.category),role_name:text(row.role),budget_structure:text(row.budget?.structure),
  budget_detail:text(row.budget?.detail),budget_account:text(row.budget?.account),department_source_id:text(row.organization?.departmentId),department_name:text(row.organization?.department),area_name:text(row.organization?.area)};
 return {...common,administrative_active:row.administrativeActive,liquidated_current:row.liquidatedCurrent,
  evidence_status:required(row.evidenceStatus),last_payroll_date:row.lastPayrollDate===null?null:date(row.lastPayrollDate)};
}
function sourceId(row){return hash(stableJson(row.sourceKey))}
function digestRows(rows){const digest=createHash('sha256');for(const [id,sha]of [...rows].sort(([a],[b])=>a.localeCompare(b)))digest.update(id+':'+sha+'\n');return digest.digest('hex')}

export async function createGrhEntityDelta(entity,baseline,candidate,contexts){
 const before=new Map(),after=new Map(),changes=[];
 for await(const row of baseline){const id=sourceId(row);if(before.has(id))reject('GRH_VERSION_DUPLICATE_BASELINE');
  before.set(id,{source:hash(stableJson(row)),projection:hash(stableJson(projectGrhVersionRecord(entity,row,contexts.baseline)))});}
 for await(const row of candidate){const id=sourceId(row);if(after.has(id))reject('GRH_VERSION_DUPLICATE_CANDIDATE');
  const record=projectGrhVersionRecord(entity,row,contexts.candidate),rawSha=hash(stableJson(row));after.set(id,hash(stableJson(record)));
  const old=before.get(id);if(!old||old.source!==rawSha)changes.push({entity,sourceId:id,operation:old?'replace':'add',previousSourceSha256:old?.source??null,
   candidateSourceSha256:rawSha,record,sourcePayload:row,previousRecord:null,previousSourcePayload:null});}
 for(const [id,old]of before)if(!after.has(id))changes.push({entity,sourceId:id,operation:'remove',previousSourceSha256:old.source,candidateSourceSha256:null,
  record:null,sourcePayload:null,previousRecord:null,previousSourcePayload:null});
 return {changes,baselineProjectionSha256:digestRows([...before].map(([id,v])=>[id,v.projection])),candidateProjectionSha256:digestRows(after),
  counts:{baseline:before.size,candidate:after.size,added:changes.filter(r=>r.operation==='add').length,changed:changes.filter(r=>r.operation==='replace').length,
   removed:changes.filter(r=>r.operation==='remove').length,unchanged:after.size-changes.filter(r=>r.operation!=='remove').length}};
}
export async function prepareGrhSourceVersion({baseline,candidate}){
 const a=await preflightGrhCore(baseline),b=await preflightGrhCore(candidate),ap=getGrhSourceProfile(a.profileId),bp=getGrhSourceProfile(b.profileId);
 if(ap.id!=='grh-junin-2026-08-06'||bp.id!=='grh-junin-2026-09-10')reject('GRH_VERSION_PROFILES_UNSUPPORTED');
 const entities={},changes=[];
 for(const entity of GRH_VERSION_ENTITIES){
  const result=await createGrhEntityDelta(entity,streamDeterministicJsonArray(a.artifacts[entity].path,a.artifacts[entity].descriptor),
   streamDeterministicJsonArray(b.artifacts[entity].path,b.artifacts[entity].descriptor),{baseline:ap.source,candidate:bp.source});
  const historical=new Map(result.changes.filter(r=>r.operation!=='add').map(r=>[r.sourceId,r]));
  for await(const row of streamDeterministicJsonArray(a.artifacts[entity].path,a.artifacts[entity].descriptor)){
   const old=historical.get(sourceId(row));if(old){old.previousSourcePayload=row;old.previousRecord=projectGrhVersionRecord(entity,row,ap.source);}}
  if([...historical.values()].some(r=>r.previousSourcePayload===null))reject('GRH_VERSION_PREVIOUS_EVIDENCE_MISSING');
  const {changes:rows,...evidence}=result;entities[entity]=evidence;changes.push(...rows);
 }
 for(const [input,expected]of [[baseline,a],[candidate,b]])if((await preflightGrhCore(input)).manifestSha256!==expected.manifestSha256)reject('GRH_VERSION_SOURCE_CHANGED');
 const proof=(source,profile)=>({profileId:profile.id,sourceSha256:source.manifest.source.sha256.toLowerCase(),manifestSha256:source.manifestSha256,
  cutoff:profile.source.cutoff,currentPayrollDate:profile.source.currentPayrollDate,sourceDatabase:profile.source.database,artifacts:source.manifest.outputs});
 const result={version:'grh-core-source-version.v1',baseline:proof(a,ap),candidate:proof(b,bp),entities,changes:changes.sort((x,y)=>x.entity.localeCompare(y.entity)||x.sourceId.localeCompare(y.sourceId))};
 return {...result,payloadSha256:hash(stableJson(result))};
}

async function projectionDigestFromDatabase(client,sql,params,expectedCompany){
 const cursor='grh_version_projection';await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR ${sql}`,params);const digest=createHash('sha256');let count=0;
 try{for(;;){const result=await client.query(`FETCH FORWARD 3000 FROM ${cursor}`);if(!result.rows.length)break;
  for(const row of result.rows){if(row.record?.company_source_id!==expectedCompany)reject('GRH_VERSION_COMPANY_MISMATCH');digest.update(row.source_id+':'+hash(stableJson(row.record))+'\n');count++;}}}
 finally{await client.query(`CLOSE ${cursor}`)}
 return {rows:count,sha256:digest.digest('hex')};
}
/** Caller owns BEGIN/COMMIT/ROLLBACK. This only inserts three new private tables.
 * Current canonical tables/views and the old S11 write guard are untouched. */
export async function importGrhSourceVersionWithinTransaction({client,prepared,expectedPayloadSha256,baselineBatchId,baselineImportRunId,tenantId,sourceBindingId}){
 if(!uuid(baselineBatchId)||!uuid(tenantId)||!uuid(sourceBindingId)||!/^\d+$/.test(String(baselineImportRunId)))reject('GRH_VERSION_CONTEXT_INVALID');
 const snapshot=JSON.parse(JSON.stringify(prepared)),{payloadSha256,...payload}=snapshot;
 if(payload.version!=='grh-core-source-version.v1'||!/^[a-f0-9]{64}$/.test(expectedPayloadSha256??'')||expectedPayloadSha256!==payloadSha256||hash(stableJson(payload))!==payloadSha256)reject('GRH_VERSION_PAYLOAD_DRIFT');
 for(const [name,expected]of [['baseline','grh-junin-2026-08-06'],['candidate','grh-junin-2026-09-10']]){
  const p=getGrhSourceProfile(expected),v=payload[name];if(v.profileId!==p.id||v.sourceSha256!==p.source.sha256.toLowerCase()||v.cutoff!==p.source.cutoff||v.sourceDatabase!==p.source.database)reject('GRH_VERSION_PROFILE_DRIFT');}
 if(Object.keys(payload.entities).length!==GRH_VERSION_ENTITIES.length||GRH_VERSION_ENTITIES.some(e=>!payload.entities[e]))reject('GRH_VERSION_PAYLOAD_DRIFT');
 const unique=new Set();for(const row of payload.changes){const key=row.entity+':'+row.sourceId;
  if(!GRH_VERSION_ENTITIES.includes(row.entity)||unique.has(key)||!['add','replace','remove'].includes(row.operation))reject('GRH_VERSION_PAYLOAD_DRIFT');unique.add(key);
  for(const [raw,record,sha,context]of [[row.sourcePayload,row.record,row.candidateSourceSha256,payload.candidate],[row.previousSourcePayload,row.previousRecord,row.previousSourceSha256,payload.baseline]]){
   if(raw===null){if(record!==null||sha!==null)reject('GRH_VERSION_PAYLOAD_DRIFT')}
   else if(sourceId(raw)!==row.sourceId||hash(stableJson(raw))!==sha||stableJson(projectGrhVersionRecord(row.entity,raw,context))!==stableJson(record))reject('GRH_VERSION_PAYLOAD_DRIFT');
  }
 }
 await client.query('SAVEPOINT grh_version_transaction_required');await client.query('RELEASE SAVEPOINT grh_version_transaction_required');await acquireGrhPublicationLocks(client);
 const binding=(await client.query(`SELECT b.source_company_id::text AS company,
  (SELECT count(DISTINCT c.source_batch_id)::integer FROM employment_contract c WHERE c.source_system='GRH' AND c.legacy_company_id=b.source_company_id) AS canonical_batches,
  (SELECT min(c.source_batch_id::text) FROM employment_contract c WHERE c.source_system='GRH' AND c.legacy_company_id=b.source_company_id) AS canonical_batch_id
  FROM platform_tenant_source_binding b JOIN tenant_identity_policy p
  ON p.tenant_id=b.tenant_id AND p.certified_source_binding_id=b.id WHERE b.tenant_id=$1 AND b.id=$2 AND b.verified AND b.source_system='GRH'
  AND b.source_database=$3 AND p.tenant_data_plane_ready FOR SHARE OF b,p`,[tenantId,sourceBindingId,payload.baseline.sourceDatabase])).rows;
 if(binding.length!==1||binding[0].canonical_batches!==1||binding[0].canonical_batch_id!==baselineBatchId)reject('GRH_VERSION_BINDING_MISMATCH');
 if(payload.changes.some(r=>[r.record,r.previousRecord].some(v=>v&&v.company_source_id!==binding[0].company)))reject('GRH_VERSION_COMPANY_MISMATCH');
 const base=(await client.query(`SELECT s.id FROM source_import_batch s JOIN data_import_runs r ON r.id=s.legacy_import_run_id
  WHERE s.id=$1 AND r.id=$2 AND s.source_system='GRH' AND s.source_database=$3 AND lower(s.source_sha256)=$4
  AND s.validation_state='published' AND r.status='completed' AND lower(r.source_sha256)=$4 FOR SHARE OF s,r`,
 [baselineBatchId,baselineImportRunId,payload.baseline.sourceDatabase,payload.baseline.sourceSha256])).rows;
 if(base.length!==1)reject('GRH_VERSION_BASELINE_MISMATCH');
 const existing=(await client.query(`SELECT id,payload_sha256,baseline_batch_id,baseline_import_run_id::text AS baseline_import_run_id FROM grh_core_source_version WHERE tenant_id=$1 AND source_binding_id=$2 AND source_sha256=$3`,
 [tenantId,sourceBindingId,payload.candidate.sourceSha256])).rows;
 if(existing.length){if(existing.length!==1||existing[0].payload_sha256!==payloadSha256||existing[0].baseline_batch_id!==baselineBatchId||existing[0].baseline_import_run_id!==String(baselineImportRunId))reject('GRH_VERSION_IMMUTABLE_CONFLICT');
  for(const entity of GRH_VERSION_ENTITIES)await client.query('SELECT grh_core_source_version_assert_v1($1,$2)',[existing[0].id,entity]);
  return {versionId:existing[0].id,inserted:false,payloadSha256,operational:false};}
 const beforeBytes=Number((await client.query(`SELECT coalesce(sum(pg_total_relation_size(x)),0)::text AS bytes FROM unnest(ARRAY[
  'grh_core_source_version'::regclass,'grh_core_source_delta'::regclass,'grh_core_source_version_seal'::regclass]) x`)).rows[0].bytes);
 const baselineFingerprints={};
 for(const entity of GRH_VERSION_ENTITIES){
  const checked=await projectionDigestFromDatabase(client,'SELECT source_id,record FROM grh_core_source_base_rows_v1($1,$2) ORDER BY source_id',[baselineBatchId,entity],binding[0].company);
  const evidence=payload.entities[entity];if(checked.rows!==evidence.counts.baseline||checked.sha256!==evidence.baselineProjectionSha256)reject('GRH_VERSION_BASELINE_PROJECTION_MISMATCH');
  baselineFingerprints[entity]=(await client.query('SELECT grh_core_source_base_fingerprint_v1($1,$2) AS fingerprint',[baselineBatchId,entity])).rows[0].fingerprint;
 }
 const capacityBefore=await readSourceCapacity(client,GRH_VERSION_STORAGE_BUDGET),databaseBeforeBytes=capacityBefore.databaseBytes;
 if(!capacityBefore.fits)reject('GRH_VERSION_STORAGE_CAPACITY_REQUIRED');
 const inserted=(await client.query(`INSERT INTO grh_core_source_version(tenant_id,source_binding_id,baseline_batch_id,baseline_import_run_id,
  source_sha256,baseline_source_sha256,payload_sha256,source_cutoff,baseline_cutoff,source_profile,manifest_sha256,baseline_manifest_sha256,
  source_database,source_company_id,entity_evidence,baseline_fingerprints,source_payroll_date,baseline_payroll_date)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8::timestamp,$9::timestamp,$10,$11,$12,$13,$14::bigint,$15::jsonb,$16::jsonb,$17::date,$18::date) RETURNING id`,
 [tenantId,sourceBindingId,baselineBatchId,baselineImportRunId,payload.candidate.sourceSha256,payload.baseline.sourceSha256,payloadSha256,payload.candidate.cutoff,
  payload.baseline.cutoff,payload.candidate.profileId,payload.candidate.manifestSha256,payload.baseline.manifestSha256,payload.candidate.sourceDatabase,binding[0].company,
  JSON.stringify(payload.entities),JSON.stringify(baselineFingerprints),payload.candidate.currentPayrollDate,payload.baseline.currentPayrollDate])).rows[0];
 for(let offset=0;offset<payload.changes.length;offset+=300){const rows=payload.changes.slice(offset,offset+300);
  await client.query(`INSERT INTO grh_core_source_delta(version_id,entity,source_id,operation,previous_source_sha256,candidate_source_sha256,
   previous_record,record,previous_source_payload,source_payload)
   SELECT $1,entity,"sourceId",operation,"previousSourceSha256","candidateSourceSha256","previousRecord",record,"previousSourcePayload","sourcePayload"
   FROM jsonb_to_recordset($2::jsonb) AS r(entity text,"sourceId" text,operation text,"previousSourceSha256" text,"candidateSourceSha256" text,
    "previousRecord" jsonb,record jsonb,"previousSourcePayload" jsonb,"sourcePayload" jsonb)`,[inserted.id,JSON.stringify(rows)]);}
 const fingerprints={};
 for(const entity of GRH_VERSION_ENTITIES){
  const checked=await projectionDigestFromDatabase(client,'SELECT source_id,record FROM grh_core_source_unsealed_rows_v1($1,$2) ORDER BY source_id',[inserted.id,entity],binding[0].company);
  if(checked.rows!==payload.entities[entity].counts.candidate||checked.sha256!==payload.entities[entity].candidateProjectionSha256)reject('GRH_VERSION_CANDIDATE_PROJECTION_MISMATCH');
  fingerprints[entity]=(await client.query('SELECT grh_core_source_version_fingerprint_v1($1,$2) AS fingerprint',[inserted.id,entity])).rows[0].fingerprint;
 }
 await client.query('INSERT INTO grh_core_source_version_seal(version_id,entity_fingerprints) VALUES($1,$2::jsonb)',[inserted.id,JSON.stringify(fingerprints)]);
 for(const entity of GRH_VERSION_ENTITIES)await client.query('SELECT grh_core_source_version_assert_v1($1,$2)',[inserted.id,entity]);
 const afterBytes=Number((await client.query(`SELECT coalesce(sum(pg_total_relation_size(x)),0)::text AS bytes FROM unnest(ARRAY[
  'grh_core_source_version'::regclass,'grh_core_source_delta'::regclass,'grh_core_source_version_seal'::regclass]) x`)).rows[0].bytes);
 const capacityAfter=await readSourceCapacity(client,GRH_VERSION_STORAGE_BUDGET,0),databaseAfterBytes=capacityAfter.databaseBytes;
 if(afterBytes-beforeBytes>GRH_VERSION_STORAGE_BUDGET.maximumGrowthBytes||!capacityAfter.fits)reject('GRH_VERSION_STORAGE_CAPACITY_EXCEEDED');
 return {versionId:inserted.id,inserted:true,payloadSha256,operational:false,deltaRows:payload.changes.length,storageBeforeBytes:beforeBytes,storageAfterBytes:afterBytes,
  storageGrowthBytes:afterBytes-beforeBytes,databaseBeforeBytes,databaseAfterBytes,capacityBefore,capacityAfter,storageBudget:GRH_VERSION_STORAGE_BUDGET};
}

export async function readGrhSourceVersionEntity({client,versionId,entity,revision='candidate'}){
 if(!uuid(versionId)||!GRH_VERSION_ENTITIES.includes(entity)||!['baseline','candidate'].includes(revision))reject('GRH_VERSION_QUERY_INVALID');
 return (await client.query('SELECT * FROM grh_core_source_version_rows_v1($1,$2,$3)',[versionId,entity,revision])).rows;
}
