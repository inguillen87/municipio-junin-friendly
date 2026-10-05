// Update only the reviewed lock prefix; preserve the installed capture/parser tail.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {replaceFile} from '../local-agents/pm10/file-replacement.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=b=>createHash('sha256').update(b).digest('hex'),marker=Buffer.from('async function boundedFile(');
export const OWNER_SOURCE_SHA='9237d472bb6dfda3b1a130f3a7d3eaac09188009f857dfd02c72f057d1b44e0f';
const baselinePrefix='58a1c956c4da8964a0b2947c25bf741a3e5763c543f986f850c6adaf8bd71e26';
const baselineFiles=new Set(['4406b56782cb64e7b17a0eaf962f749b8c1679c22f19251a19b64e5e86e56014','5fb30d986a5a0688062dc6414104b9cc5d82442505db67906cfcbfee65abd46e']);
const tails=new Set(['a0c373da7fe6674a09cc88dea89b783a3741ab45041fc1246b9b55e27bd27984','3bb5f430fea75f21b4f9e8e3cd4b3c027459f86c66a31aab9618327016c75a28']);
const fail=code=>{throw Error(code);};
export function ownerGenerationCandidate(installed,source){
 if(!Buffer.isBuffer(installed)||!Buffer.isBuffer(source)||sha(source)!==OWNER_SOURCE_SHA)fail('PM10_UPDATE_SOURCE_MISMATCH');
 const at=installed.indexOf(marker),sourceAt=source.indexOf(marker);if(at<0||sourceAt<0)fail('PM10_UPDATE_SOURCE_MISMATCH');
 const beforeSha256=sha(installed),tail=installed.subarray(at),tailSha256=sha(tail),prefix=source.subarray(0,sourceAt);
 if(!tails.has(tailSha256)||!(baselineFiles.has(beforeSha256)&&sha(installed.subarray(0,at))===baselinePrefix||installed.subarray(0,at).equals(prefix)))fail('PM10_UPDATE_INSTALLED_DRIFT');
 const bytes=Buffer.concat([prefix,tail]);return {bytes,beforeSha256,afterSha256:sha(bytes),tailSha256,changed:!bytes.equals(installed)};
}
async function directory(p){const s=await fs.lstat(p);if(!s.isDirectory()||s.isSymbolicLink())fail('PM10_UPDATE_PATH_INVALID');}
async function read(p){const s=await fs.lstat(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>131072)fail('PM10_UPDATE_FILE_INVALID');return fs.readFile(p);}
async function absent(p){try{await fs.lstat(p);fail('PM10_UPDATE_WORKER_NOT_STOPPED');}catch(e){if(e.code!=='ENOENT')throw e;}}
async function stopped(base){
 const desired=JSON.parse(await read(path.join(base,'control','desired.json'))),state=JSON.parse(await read(path.join(base,'control','status.json')));
 if(desired.schema!=='pm10-user-control.v1'||desired.desired!=='stopped'||state.schema!=='pm10-user-supervisor.v1'||state.state!=='stopped'||state.scope!=='current_user_session')fail('PM10_UPDATE_WORKER_NOT_STOPPED');
 for(const dir of ['control','state'])for(const name of ['process.lock','process.lock.transition'])await absent(path.join(base,dir,name));
}
export async function installPm10OwnerGeneration(argv=process.argv.slice(2)){
 if(process.platform!=='win32'||argv.length!==4||argv[0]!=='--base'||argv[2]!=='--apply'||!['no','yes'].includes(argv[3])||!path.isAbsolute(argv[1])||!process.env.LOCALAPPDATA)fail('PM10_UPDATE_ARGUMENTS');
 const base=path.resolve(argv[1]),allowed=path.resolve(process.env.LOCALAPPDATA,'MuniControl','Gateways','PM10');if(base.toLowerCase()!==allowed.toLowerCase())fail('PM10_UPDATE_PATH_INVALID');
 for(const dir of [base,path.join(base,'app'),path.join(base,'control'),path.join(base,'state')])await directory(dir);
 const target=path.join(base,'app','store.mjs'),sourcePath=path.join(root,'local-agents','pm10','store.mjs'),original=await read(target),source=await read(sourcePath),candidate=ownerGenerationCandidate(original,source);
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();if(!/^[a-f0-9]{40}$/.test(sourceCommit))fail('PM10_UPDATE_REVISION_INVALID');
 const report={version:'pm10-owner-generation-update.v1',sourceCommit,beforeSha256:candidate.beforeSha256,afterSha256:candidate.afterSha256,captureTailSha256:candidate.tailSha256,changed:candidate.changed,applied:false,captureTailModified:false,queueModified:false,credentialsModified:false,tasksModified:false,networkCommands:0,requiresStoppedSupervisor:true};
 if(argv[3]==='no'||!candidate.changed){console.log(JSON.stringify(report));return report;}
 if(execFileSync('git',['status','--porcelain','--','local-agents/pm10/store.mjs','scripts/install-pm10-owner-generation.mjs'],{cwd:root,encoding:'utf8'}).trim())fail('PM10_UPDATE_SOURCE_NOT_COMMITTED');
 await stopped(base);
 const maintenance=path.join(base,'maintenance');await fs.mkdir(maintenance,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});await directory(maintenance);
 const guard=path.join(maintenance,'owner-generation.installing');await fs.mkdir(guard,{mode:0o700});const token=randomUUID(),guardOwner=path.join(guard,'owner.json');
 await fs.writeFile(guardOwner,JSON.stringify({pid:process.pid,token,afterSha256:candidate.afterSha256}),{flag:'wx',mode:0o600});
 try{
  await stopped(base);if(sha(await read(target))!==candidate.beforeSha256||sha(await read(sourcePath))!==OWNER_SOURCE_SHA)fail('PM10_UPDATE_CONCURRENT_CHANGE');
  const archive=path.join(maintenance,'owner-generation-'+candidate.afterSha256.slice(0,16));await fs.mkdir(archive,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});await directory(archive);
  const backup=path.join(archive,'store.mjs.before');try{await fs.writeFile(backup,original,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST'||sha(await read(backup))!==candidate.beforeSha256)fail('PM10_UPDATE_BACKUP_CONFLICT');}
  const temporary=path.join(base,'app','.owner-generation-'+randomUUID()+'.tmp'),handle=await fs.open(temporary,'wx',0o600);try{await handle.writeFile(candidate.bytes);await handle.sync();}finally{await handle.close();}
  await stopped(base);if(sha(await read(target))!==candidate.beforeSha256)fail('PM10_UPDATE_CONCURRENT_CHANGE');await replaceFile(temporary,target);
  if(sha(await read(target))!==candidate.afterSha256)fail('PM10_UPDATE_UNCONFIRMED');report.applied=true;report.checkedAt=new Date().toISOString();
  await fs.writeFile(path.join(archive,'receipt.json'),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(report));return report;
 }finally{
  const owner=JSON.parse(await read(guardOwner));if(owner.token!==token)fail('PM10_UPDATE_GUARD_CHANGED');await fs.unlink(guardOwner);await fs.rmdir(guard);
 }
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)installPm10OwnerGeneration().catch(e=>{console.error(JSON.stringify({confirmed:false,error:/^PM10_UPDATE_[A-Z_]+$/.test(e.message)?e.message:'PM10_UPDATE_STOPPED'}));process.exitCode=1;});
