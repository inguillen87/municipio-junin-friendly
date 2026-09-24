// Complete offline comparison. No apply flag, no network client, no database mutation.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {parseArgs} from 'node:util';
import {compareCuratedArtifact,curatedDigest,curatedComparisonFault as fail} from './lib/grh-curated-comparison.mjs';
import {openCuratedSource,readCuratedArtifact,recheckCuratedManifest,boundedCuratedRead,parseCuratedJson} from './lib/grh-curated-source-reader.mjs';
import {curatedReviewData,coordinatedReviewData,CURATED_REVIEW_DOMAINS} from '../assets/grh-curated-review-model.js';
import {successorReviewData} from '../assets/grh-successor-review-model.js';
export async function compareCuratedSources({baselineDir,candidateDir,coreReportPath=null}){
 const baseline=await openCuratedSource(baselineDir,'grh-junin-2026-09-10');
 const candidate=await openCuratedSource(candidateDir,'grh-junin-2026-09-22');
 if(baseline.root===candidate.root)fail('GRH_CURATED_REVIEW_DISTINCT_SOURCES');
 const artifacts={};const embedded={baseline:0,candidate:0};
 for(const name of CURATED_REVIEW_DOMAINS){
  const before=await readCuratedArtifact(baseline,name),after=await readCuratedArtifact(candidate,name);
  artifacts[name]={...compareCuratedArtifact(name,before.records,after.records),baselineBytes:before.bytes,candidateBytes:after.bytes};
  if(name==='employees')for(const [side,records]of [['baseline',before.records],['candidate',after.records]]){
   for(const row of records){if(!Array.isArray(row.unionMemberships))fail('GRH_CURATED_REVIEW_MEMBERSHIP_SHAPE');embedded[side]+=row.unionMemberships.length;}
  }
 }
 if(embedded.baseline!==artifacts.unionMemberships.before||embedded.candidate!==artifacts.unionMemberships.after)fail('GRH_CURATED_REVIEW_EMBEDDED_MEMBERSHIPS');
 await recheckCuratedManifest(baseline);await recheckCuratedManifest(candidate);
 const report=curatedReviewData({version:'grh-curated-successor-comparison.v1',generatedAt:new Date().toISOString(),baseline:baseline.summary,candidate:candidate.summary,artifacts,comparisonComplete:true,
  scope:{databaseQueries:0,databaseWrites:0,sourcePromoted:false,containsPersonalRecords:false,containsSalaryAmounts:false,nativeOperationsCompared:false,canonicalCompared:false}});
 if(!coreReportPath)return report;
 const bytes=await boundedCuratedRead(coreReportPath,256*1024),core=successorReviewData(parseCuratedJson(bytes));
 return coordinatedReviewData({version:'grh-coordinated-successor-review.v1',generatedAt:new Date().toISOString(),coreReportSha256:curatedDigest(bytes),core,curated:report,
  scope:{databaseQueries:0,databaseWrites:0,sourcePromoted:false,nativeOperationsCompared:false,canonicalCompared:false,coreArtifactsReread:false,curatedArtifactsRead:true,containsPersonalRecords:false,containsSalaryAmounts:false}});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const {values}=parseArgs({options:{baseline:{type:'string'},candidate:{type:'string'},output:{type:'string'},'core-report':{type:'string'}},strict:true});
  if(!values.baseline||!values.candidate||!values.output||!values.output.toLowerCase().endsWith('.json'))fail('GRH_CURATED_REVIEW_USAGE');
  const report=await compareCuratedSources({baselineDir:values.baseline,candidateDir:values.candidate,coreReportPath:values['core-report']??null});
  await fs.writeFile(path.resolve(values.output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(report));
 }catch(e){console.error(/^GRH_CURATED_REVIEW_[A-Z0-9_]+$/.test(e?.code??'')?e.code:'GRH_CURATED_REVIEW_FAILED');process.exitCode=1;}
}
