/** Strict, read-only v2 artifact acceptance. No database client or production publication. */
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { getGrhSourceProfile } from './lib/grh-source-profile.mjs';
import { streamDeterministicJsonArray, verifyStreamArtifact, stableJson, enforceLogicalSizeGate } from './lib/canonical-import.mjs';
const FILES=Object.freeze({payrollRuns:'grh-core-payroll-runs.json',payrollSnapshot:'grh-core-payroll-snapshot.json',
 movements:'grh-core-movements.json',payrollMonthly:'grh-core-payroll-monthly.json',employmentReconciliation:'grh-core-employment-reconciliation.json'});
const fail=code=>{throw Object.assign(new Error(code),{code})};
const equal=(a,b,code)=>{if(stableJson(a)!==stableJson(b))fail(code)};
const number=(v,min=0)=>{if(!Number.isSafeInteger(v)||v<min||v>1e9)fail('V2_INTEGER_INVALID');return v};
const date=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)fail('V2_DATE_INVALID');return v};
const code=v=>{if(typeof v!=='string'||!/^\d{1,32}$/.test(v))fail('V2_IDENTITY_INVALID');return v};
const contract=k=>stableJson([code(k?.companyCode),code(k?.employeeNumber)]);
export function runIdentity(k){
 if(!k||typeof k.payrollType!=='string'||!/^[A-Z]$/.test(k.payrollType))fail('V2_RUN_INVALID');
 return {companyCode:code(k.companyCode),payrollDate:date(k.payrollDate),period:number(k.period),month:number(k.month),payrollType:k.payrollType};
}
const key=k=>stableJson(runIdentity(k));
const ref=(r)=>({...runIdentity(r),closureStatus:r.closureStatus});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export function validateMultirunManifest(m,p){
 if(p?.publicationMode!=='candidate_only'||p?.core?.schemaVersion!==2||m?.schemaVersion!==2
  ||m.profile!==p.core.profileId||m.sourceProfileId!==p.id||m.profileVersion!==p.profileVersion)fail('V2_PROFILE_INVALID');
 if(m.quality?.strictSnapshot!==true||m.quality?.crossSourceJoinByIdPersona!==0)fail('V2_STRICT_SOURCE_REQUIRED');
 equal(m.quality?.publication,{candidateOnly:true,databaseWrites:0,v1ImporterCompatible:false,reason:'MULTIRUN_REQUIRES_VERSIONED_DATABASE_PUBLICATION'},'V2_PUBLICATION_GUARD_REQUIRED');
 for(const field of ['sha256','logicalBytes','database','cutoff','currentPayrollDate','currentPayrollClosureStatus','latestClosedPayrollDate','latestClosedMonthlyPayrollDate'])
  equal(m.source?.[field],p.source[field],'V2_SOURCE_PROFILE_MISMATCH');
 if(m.source.container==='gzip'){
  equal(m.source.physicalSha256,p.source.gzipSha256,'V2_CONTAINER_MISMATCH');equal(m.source.physicalBytes,p.source.gzipBytes,'V2_CONTAINER_MISMATCH');
 }else if(m.source.container!=='sql'||m.source.physicalSha256!==p.source.sha256||m.source.physicalBytes!==p.source.logicalBytes)fail('V2_CONTAINER_MISMATCH');
 equal(m.sourceCounts,p.core.expectedCounts,'V2_SOURCE_COUNTS_MISMATCH');
 equal(m.source.currentPayrollRuns,p.core.currentRuns,'V2_RUN_CLOSURES_MISMATCH');
 for(const [k,v]of Object.entries(p.core.expectedReconciliation))equal(m.reconciliation?.[k],v,'V2_RECONCILIATION_MISMATCH');
 equal(m.quality.payrollRunClosure?.statuses,p.core.expectedClosureStatusCounts,'V2_CLOSURE_COUNTS_MISMATCH');
 equal(m.quality.payrollRunClosure?.currentRun,p.source.currentPayrollClosureStatus,'V2_RUN_CLOSURES_MISMATCH');
 equal(m.quality.payrollRunClosure?.latestClosedDate,p.source.latestClosedPayrollDate,'V2_RUN_CLOSURES_MISMATCH');
 if(!m.quality.moneySemantics?.includes('never a financial KPI'))fail('V2_FINANCIAL_SCOPE_REQUIRED');
}

export async function verifyMultirunCandidate({dataDir,profileId='grh-junin-2026-09-22'}={}){
 try{
  if(typeof dataDir!=='string'||!dataDir)fail('V2_DIRECTORY_REQUIRED');
  const directory=await realpath(dataDir),profile=getGrhSourceProfile(profileId, { allowCandidateRead: true });
  const confined=async name=>{const file=await realpath(path.join(directory,name));if(path.dirname(file)!==directory||!(await stat(file)).isFile())fail('V2_FILE_OUTSIDE_DIRECTORY');return file};
  const manifestFile=await confined('grh-core-manifest.json');if((await stat(manifestFile)).size>1024*1024)fail('V2_MANIFEST_SIZE');
  const original=await readFile(manifestFile),manifest=JSON.parse(original.toString('utf8'));
  validateMultirunManifest(manifest,profile);
  equal(Object.keys(manifest.outputs??{}).sort(),Object.keys(FILES).sort(),'V2_ARTIFACTS_MISSING');
  const artifacts={};
  for(const [entity,file]of Object.entries(FILES)){
   const d=manifest.outputs[entity];if(d.file!==file||!Number.isSafeInteger(d.records)||d.records<0||!Number.isSafeInteger(d.bytes)||d.bytes<0||!/^([a-fA-F0-9]{64})$/.test(d.sha256))fail('V2_DESCRIPTOR_INVALID');
   artifacts[entity]={path:await confined(file),descriptor:d};
  }
  enforceLogicalSizeGate(Object.values(artifacts).map(a=>a.descriptor));
  const rows=entity=>streamDeterministicJsonArray(artifacts[entity].path,artifacts[entity].descriptor);
  const runs=new Map(),states={},current=[],closedByType={};
  for await(const r of rows('payrollRuns')){
   const id=key(r.sourceKey);if(runs.has(id))fail('V2_RUN_DUPLICATE');
   if(![null,1].includes(r.sourceClosureFlag))fail('V2_CLOSURE_INVALID');
   const state=r.sourceClosureFlag===1?'closed':r.sourceKey.payrollDate===profile.source.currentPayrollDate?'open':'unknown';
   if(r.closureStatus!==state||r.executivePublishable!==(state==='closed'))fail('V2_CLOSURE_INVALID');
   runs.set(id,state);states[state]=(states[state]??0)+1;
   if(state==='closed')closedByType[r.sourceKey.payrollType]=[closedByType[r.sourceKey.payrollType]??'',r.sourceKey.payrollDate].sort().at(-1);
   if(r.sourceKey.payrollDate===profile.source.currentPayrollDate)current.push({...runIdentity(r.sourceKey),closureStatus:state});
  }
  equal(states,profile.core.expectedClosureStatusCounts,'V2_CLOSURE_COUNTS_MISMATCH');
  const sorted=a=>a.sort((a,b)=>stableJson(a).localeCompare(stableJson(b)));
  equal(sorted(current),sorted(structuredClone(profile.core.currentRuns)),'V2_RUN_CLOSURES_MISMATCH');
  equal(closedByType,manifest.source.latestClosedByType,'V2_CLOSED_BY_TYPE_MISMATCH');
  equal(closedByType.M,manifest.source.latestClosedMonthlyPayrollDate,'V2_MONTHLY_CLOSURE_MISMATCH');
  const snapshot=new Map(),sourceIds=new Set(),assignments=new Set(),cohorts={};let snapshotRows=0;
  for await(const r of rows('payrollSnapshot')){
   const employee=contract(r.sourceKey),run=runIdentity({companyCode:r.sourceKey.companyCode,payrollDate:r.payrollDate,period:r.period,month:r.month,payrollType:r.payrollType}),id=key(run);
   const assignment=stableJson([employee,id]);if(!runs.has(id)||run.payrollDate!==profile.source.currentPayrollDate)fail('V2_SNAPSHOT_RUN_MISSING');
   const sourceId=code(r.sourceKey.id);if(sourceIds.has(sourceId)||assignments.has(assignment))fail('V2_SNAPSHOT_DUPLICATE');
   sourceIds.add(sourceId);assignments.add(assignment);snapshotRows++;
   if(!snapshot.has(employee))snapshot.set(employee,[]);snapshot.get(employee).push({...run,closureStatus:runs.get(id)});
   const cohort=stableJson({period:r.period,month:r.month,payrollType:r.payrollType,payrollDate:r.payrollDate});cohorts[cohort]=(cohorts[cohort]??0)+1;
  }
  const expectedCohorts=Object.fromEntries(profile.core.snapshotCohorts.map(({rows,...c})=>[stableJson(c),rows]));
  equal(cohorts,expectedCohorts,'V2_SNAPSHOT_COHORT_MISMATCH');equal(snapshotRows,profile.core.expectedCounts.histolegajo,'V2_SNAPSHOT_COUNT_MISMATCH');
  equal(manifest.quality.snapshotMembership?.records,snapshotRows,'V2_SNAPSHOT_COUNT_MISMATCH');
  equal(manifest.quality.snapshotMembership?.distinctContracts,snapshot.size,'V2_CONTRACT_COUNT_MISMATCH');
  equal(manifest.quality.snapshotMembership?.repeatedContractRows,snapshotRows-snapshot.size,'V2_CONTRACT_COUNT_MISMATCH');
  const employees=new Set(),counts={administrativeActive:0,liquidatedCurrent:0,activeAndLiquidated:0,activeNotLiquidated:0,liquidatedNotActive:0};
  for await(const r of rows('employmentReconciliation')){
   const id=contract(r.sourceKey);if(employees.has(id))fail('V2_RECONCILIATION_DUPLICATE');employees.add(id);
   if(typeof r.administrativeActive!=='boolean'||typeof r.liquidatedCurrent!=='boolean'||r.liquidatedCurrent!==snapshot.has(id)||!Array.isArray(r.payrollRunReferences))fail('V2_RECONCILIATION_MISMATCH');
   equal(sorted(r.payrollRunReferences.map(ref)),sorted(snapshot.get(id)??[]),'V2_RECONCILIATION_RUN_MISMATCH');
   if(r.administrativeActive)counts.administrativeActive++;if(r.liquidatedCurrent)counts.liquidatedCurrent++;
   if(r.administrativeActive&&r.liquidatedCurrent)counts.activeAndLiquidated++;
   if(r.administrativeActive&&!r.liquidatedCurrent)counts.activeNotLiquidated++;
   if(!r.administrativeActive&&r.liquidatedCurrent)counts.liquidatedNotActive++;
  }
  if([...snapshot.keys()].some(k=>!employees.has(k)))fail('V2_SNAPSHOT_EMPLOYEE_MISSING');
  equal(counts,profile.core.expectedReconciliation,'V2_RECONCILIATION_MISMATCH');equal(employees.size,profile.core.expectedCounts.legajo,'V2_RECONCILIATION_MISMATCH');
  const monthlyKeys=new Set(),lastClosedContracts=new Set(),monthlyClosedContracts=new Set();
  for await(const r of rows('payrollMonthly')){
   const run=key(r.sourceKey),employee=contract(r.sourceKey),id=stableJson([run,employee]);
   if(!runs.has(run)||monthlyKeys.has(id))fail('V2_MONTHLY_RUN_OR_DUPLICATE');monthlyKeys.add(id);
   if(runs.get(run)==='closed'&&r.sourceKey.payrollDate===manifest.source.latestClosedPayrollDate)lastClosedContracts.add(employee);
   if(runs.get(run)==='closed'&&r.sourceKey.payrollType==='M'&&r.sourceKey.payrollDate===manifest.source.latestClosedMonthlyPayrollDate)monthlyClosedContracts.add(employee);
  }
  equal(lastClosedContracts.size,manifest.quality.payrollRunClosure.latestClosedHeadcount,'V2_CLOSED_HEADCOUNT_MISMATCH');
  const verified={};for(const [entity,a]of Object.entries(artifacts))verified[entity]=await verifyStreamArtifact(a.path,a.descriptor,entity);
  if(hash(await readFile(manifestFile))!==hash(original))fail('V2_MANIFEST_CHANGED');
  return {version:'grh-multirun-candidate-acceptance.v1',profileId,accepted:true,manifestSha256:hash(original),sourceSha256:manifest.source.sha256,
   sourceCutoff:manifest.source.cutoff,artifacts:Object.fromEntries(Object.entries(verified).map(([k,v])=>[k,{records:v.records,bytes:v.bytes}])),
   snapshotRecords:snapshotRows,distinctSnapshotContracts:snapshot.size,reconciliation:counts,currentRuns:current,
   latestClosedByType:closedByType,latestClosedMonthlyPayrollDate:closedByType.M,latestClosedMonthlyContracts:monthlyClosedContracts.size,
   databaseWrites:0,sourcePromoted:false,v1ImporterCompatible:false,candidateOnly:true};
 }catch(e){if(/^V2_[A-Z_]+$/.test(e?.code??''))throw e;fail('V2_CANDIDATE_VERIFICATION_FAILED')}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{if(process.argv.length!==3)fail('V2_USAGE');console.log(JSON.stringify(await verifyMultirunCandidate({dataDir:process.argv[2]}),null,2))}
 catch(e){console.error(e.code??'V2_CANDIDATE_VERIFICATION_FAILED');process.exitCode=1}
}
