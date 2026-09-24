// Strict offline comparison of the effective 10/09 source with the 22/09 multi-run candidate.
// This command deliberately has no apply mode and never opens a database connection.
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';import {createHash} from 'node:crypto';
import {preflightGrhCore} from './import-grh-core-canonical.mjs';
import {verifyMultirunCandidate} from './verify-grh-multirun-candidate.mjs';
import {streamDeterministicJsonArray} from './lib/canonical-import.mjs';
import {compareGrhSuccessorEntity} from './lib/grh-successor-comparison.mjs';
const files=Object.freeze({payrollRuns:'grh-core-payroll-runs.json',payrollSnapshot:'grh-core-payroll-snapshot.json',movements:'grh-core-movements.json',payrollMonthly:'grh-core-payroll-monthly.json',employmentReconciliation:'grh-core-employment-reconciliation.json'});
const hash=v=>createHash('sha256').update(v).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code})};
async function closures(artifact,currentDate){
 const currentRuns=[],latestClosedByType={};
 for await(const row of streamDeterministicJsonArray(artifact.path,artifact.descriptor)){
  const key=row.sourceKey;
  if(key.payrollDate===currentDate)currentRuns.push({...key,closureStatus:row.closureStatus});
  if(row.closureStatus==='closed'&&key.payrollDate>(latestClosedByType[key.payrollType]??''))latestClosedByType[key.payrollType]=key.payrollDate;
 }
 return{currentRuns:currentRuns.sort((a,b)=>a.payrollType.localeCompare(b.payrollType)),latestClosedByType};
}
export async function analyzeGrhSuccessor({baselineDir,candidateDir}){
 const baseline=await fs.realpath(baselineDir),candidate=await fs.realpath(candidateDir);
 if(baseline===candidate)fail('GRH_SUCCESSOR_DISTINCT_SOURCES_REQUIRED');
 const before=await preflightGrhCore({dataDir:pathToFileURL(baseline+path.sep),profileId:'grh-junin-2026-09-10'});
 const accepted=await verifyMultirunCandidate({dataDir:candidate,profileId:'grh-junin-2026-09-22'});
 const manifestPath=await fs.realpath(path.join(candidate,'grh-core-manifest.json'));
 const bytes=await fs.readFile(manifestPath);if(hash(bytes)!==accepted.manifestSha256)fail('GRH_SUCCESSOR_MANIFEST_CHANGED');
 const manifest=JSON.parse(bytes),artifacts={};
 for(const [entity,name]of Object.entries(files)){
  const file=await fs.realpath(path.join(candidate,name));if(path.dirname(file)!==candidate||manifest.outputs[entity].file!==name)fail('GRH_SUCCESSOR_CONFINED_FILE_REQUIRED');
  artifacts[entity]={path:file,descriptor:manifest.outputs[entity]};
 }
 const entities={};
 for(const entity of Object.keys(files))entities[entity]=await compareGrhSuccessorEntity(entity,
  streamDeterministicJsonArray(before.artifacts[entity].path,before.artifacts[entity].descriptor),
  streamDeterministicJsonArray(artifacts[entity].path,artifacts[entity].descriptor));
 const runEvidence={baseline:await closures(before.artifacts.payrollRuns,before.manifest.source.currentPayrollDate),candidate:await closures(artifacts.payrollRuns,manifest.source.currentPayrollDate)};
 if(hash(await fs.readFile(manifestPath))!==accepted.manifestSha256||hash(await fs.readFile(path.join(baseline,'grh-core-manifest.json')))!==before.manifestSha256)fail('GRH_SUCCESSOR_MANIFEST_CHANGED');
 const source=(m,sha)=>({profileId:m.sourceProfileId??m.profile,sourceSha256:m.source.sha256,sourceCutoff:m.source.cutoff,manifestSha256:sha});
 return{version:'grh-successor-comparison.v1',generatedAt:new Date().toISOString(),baseline:source(before.manifest,before.manifestSha256),candidate:source(manifest,accepted.manifestSha256),
  entities,runEvidence,comparisonComplete:true,
  scope:{databaseQueries:0,databaseWrites:0,sourcePromoted:false,containsPersonalRecords:false,containsSalaryAmounts:false,nativeOperationsCompared:false,curatedEntitiesCompared:false,arithmeticCertification:false},
  publication:{ready:false,legacyImporterCompatible:false,required:['versioned_successor_publication','coordinated_curated_core_reconciliation','native_operations_preservation','restore_and_capacity_acceptance']},
  methodology:{snapshotIdentity:'company/employee/payrollDate/period/month/payrollType',sourceIdRotationIsNotDismissal:true,monetaryComparison:'exact normalized decimal fields; null is distinct from zero',rawEvidenceHashesCompared:true,noMixedMonthClosureInference:true}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const {values}=parseArgs({options:{baseline:{type:'string'},candidate:{type:'string'},output:{type:'string'}},strict:true});
  if(!values.baseline||!values.candidate||!values.output)fail('GRH_SUCCESSOR_USAGE');
  const report=await analyzeGrhSuccessor({baselineDir:values.baseline,candidateDir:values.candidate});
  await fs.writeFile(path.resolve(values.output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
 }catch(e){console.error(/^GRH_[A-Z0-9_]+$/.test(e?.code??'')?e.code:'GRH_SUCCESSOR_COMPARISON_FAILED');process.exitCode=1;}
}
