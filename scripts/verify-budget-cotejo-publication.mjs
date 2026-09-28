// Public release + exact artifacts + anonymous rejection. Never uses a municipal session.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {verifyRelease, compareRelease} from '../assets/release-status-model.js';
export const BUDGET_PUBLICATION_ORIGIN='https://municipio-junin-friendly.vercel.app';
export const BUDGET_PUBLICATION_FILES=Object.freeze([
 'assets/budget-payroll-model.js','assets/budget-payroll-workbench.js',
 'assets/budget-structure-model.js','assets/budget-structure-workbench.js',
 'assets/budget-structure-worker.js','assets/budget-structure-pdf.js',
 'assets/budget-structure.css','assets/report-centre.js','assets/report-document.js'
]);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
class CheckError extends Error {
 constructor(code,file=null,{retryable=false}={}){super(code);this.code=code;this.file=file;this.retryable=retryable;}
}
const reject=(code,file,options)=>{throw new CheckError(code,file,options);};
async function boundedBody(response,limit,file){
 const declared=response.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>limit)){
  await response.body?.cancel().catch(()=>{});reject('BODY_LIMIT',file);
 }
 if(!response.body)reject('BODY_MISSING',file);
 const reader=response.body.getReader(),chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
  if(length>limit){await reader.cancel();reject('BODY_LIMIT',file);}chunks.push(value);
 }}finally{reader.releaseLock();}
 return Buffer.concat(chunks,length);
}
export async function verifyBudgetPublication({root='public',expectedCommit=null,fetchImpl=globalThis.fetch,
 maxAttempts=12,pauseMs=15000,timeoutMs=12000,deadlineMs=240000,signal,
 wait=(ms,s)=>sleep(ms,undefined,{signal:s}),onAttempt=()=>{}}={}){
 for(const [value,min,max]of [[maxAttempts,1,24],[pauseMs,0,15000],[timeoutMs,1,30000],[deadlineMs,1,480000]])
  if(!Number.isSafeInteger(value)||value<min||value>max)throw Error('PUBLICATION_OPTIONS_INVALID');
 const directory=path.resolve(root),release=verifyRelease(JSON.parse(fs.readFileSync(path.join(directory,'release-info.json'),'utf8')));
 if(release.sourceState!=='committed'||expectedCommit!==null&&expectedCommit!==release.commitSha)throw Error('PUBLICATION_BUILD_NOT_COMMITTED');
 const expected=BUDGET_PUBLICATION_FILES.map(file=>{const bytes=fs.readFileSync(path.join(directory,file));
  if(!bytes.length||bytes.length>1500000)throw Error('PUBLICATION_BUILD_ASSET_INVALID');return{file,bytes,sha256:sha256(bytes)};
 });
 const scope=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(deadlineMs)]);
 const report={version:'budget-cotejo-publication.v2',ok:false,origin:BUDGET_PUBLICATION_ORIGIN,
  commit:release.commitSha,attempts:[],assets:[],anonymousAccess:[],municipalSessionTested:false,businessWrites:0};
 async function request(file,{anonymous=false}={}){
  scope.throwIfAborted();const url=BUDGET_PUBLICATION_ORIGIN+'/'+file;let response;
  try{response=await fetchImpl(url,{method:'GET',credentials:'omit',cache:'no-store',redirect:'manual',
   headers:{Accept:anonymous||file==='release-info.json'?'application/json':'*/*','Cache-Control':'no-cache'},
   signal:AbortSignal.any([scope,AbortSignal.timeout(timeoutMs)])});
  }catch{if(scope.aborted)throw scope.reason;reject('NETWORK_UNAVAILABLE',file,{retryable:true});}
  if(response.url!==url||response.redirected||response.status>=300&&response.status<400){
   await response.body?.cancel().catch(()=>{});reject('RESPONSE_REDIRECTED',file);
  }
  if(response.headers.has('set-cookie')){await response.body?.cancel().catch(()=>{});reject('UNEXPECTED_COOKIE',file);}
  if(!anonymous&&response.status!==200){await response.body?.cancel().catch(()=>{});
   reject('HTTP_'+response.status,file,{retryable:response.status===404||response.status===429||response.status>=500});}
  return response;
 }
 async function identity(){
  const response=await request('release-info.json');
  if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||''))reject('IDENTITY_CONTENT_TYPE','release-info.json');
  const bytes=await boundedBody(response,4096,'release-info.json');let value;
  try{value=verifyRelease(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}
  catch{reject('IDENTITY_INVALID','release-info.json');}
  if(compareRelease(release,value)!=='same')reject('RELEASE_NOT_EXPECTED','release-info.json',{retryable:true});
  return value;
 }
 async function artifacts(){
  const reads=await Promise.allSettled(expected.map(async({file,bytes,sha256:hash})=>{
   const response=await request(file),type=response.headers.get('content-type')||'';
   if(!(file.endsWith('.css')?/^text\/css(?:;|$)/i:/^(?:application|text)\/javascript(?:;|$)/i).test(type))reject('ASSET_CONTENT_TYPE',file);
   const actual=await boundedBody(response,1500000,file);
   if(!actual.equals(bytes)){const error=new CheckError('ASSET_MISMATCH',file,{retryable:true});error.actualSha256=sha256(actual);throw error;}
   return{file,bytes:actual.length,sha256:hash};
  }));
  const failures=reads.filter(r=>r.status==='rejected').map(r=>r.reason);
  if(failures.length)throw failures.find(e=>!e.retryable)||failures[0];
  return reads.map(r=>r.value);
 }
 async function anonymousReaders(){
  const rows=[];
  for(const resource of ['budgetpayrollcatalog','budgetpayrollroster']){
   const file='api/internal-data?resource='+resource,response=await request(file,{anonymous:true});
   if(response.status!==401){await response.body?.cancel().catch(()=>{});reject('ANONYMOUS_HTTP_'+response.status,file,{retryable:response.status===429||response.status>=500});}
   if(!/(?:^|,)\s*no-store(?:\s|,|$)/i.test(response.headers.get('cache-control')||'')||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||''))reject('ANONYMOUS_CACHE_OR_TYPE',file);
   const bytes=await boundedBody(response,32768,file);let payload;
   try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{reject('ANONYMOUS_BODY_INVALID',file);}
   if(payload?.ok!==false||payload.data!==undefined)reject('ANONYMOUS_DATA_EXPOSED',file);
   rows.push({resource,status:401});
  }
  return rows;
 }
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  try{
   await identity();const assets=await artifacts();await identity();
   const anonymousAccess=await anonymousReaders();await identity();
   scope.throwIfAborted();report.attempts.push({attempt,outcome:'verified'});
   Object.assign(report,{ok:true,checkedAt:new Date().toISOString(),assets,anonymousAccess,releaseStable:true});
   onAttempt(report);return report;
  }catch(error){
   Object.assign(report,{ok:false,assets:[],anonymousAccess:[],releaseStable:false});
   const entry={attempt,outcome:'rejected',code:scope.aborted?'CHECK_ABORTED':error instanceof CheckError?error.code:'CHECK_FAILED',file:error instanceof CheckError?error.file:null};
   if(error instanceof CheckError&&error.actualSha256)entry.actualSha256=error.actualSha256;
   report.attempts.push(entry);onAttempt(report);
   if(scope.aborted||!error.retryable||attempt===maxAttempts)break;
   try{await wait(pauseMs,scope);}catch{report.attempts.push({attempt,outcome:'rejected',code:'CHECK_ABORTED',file:null});break;}
  }
 }
 const error=new Error('BUDGET_PUBLICATION_NOT_VERIFIED');
 report.checkedAt=new Date().toISOString();report.releaseStable=false;error.report=report;
 throw error;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const output='verification/budget-cotejo/publication.json';fs.mkdirSync(path.dirname(output),{recursive:true});
 const record=value=>fs.writeFileSync(output,JSON.stringify(value,null,2));
 record({version:'budget-cotejo-publication.v2',ok:false,state:'pending',assets:[],anonymousAccess:[]});
 try{
  const result=await verifyBudgetPublication({expectedCommit:process.env.GITHUB_SHA||process.env.VERCEL_GIT_COMMIT_SHA||null,
   onAttempt:report=>{record(report);const attempt=report.attempts.at(-1);console.log(JSON.stringify({attempt:attempt.attempt,outcome:attempt.outcome,code:attempt.code??null,file:attempt.file??null}));}});
  record(result);console.log(JSON.stringify(result,null,2));
 }catch(error){
  const report=error.report??{version:'budget-cotejo-publication.v2',ok:false,state:'preflight-failed',assets:[],anonymousAccess:[]};
  record(report);console.error(JSON.stringify(report));process.exitCode=1;
 }
}
