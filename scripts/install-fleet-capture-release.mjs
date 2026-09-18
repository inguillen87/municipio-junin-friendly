// Update four capture/UI modules only. No config, keys, queues, tasks or PM10 changes.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {createHash,randomUUID} from 'node:crypto';
import {replaceFile} from '../local-agents/pm10/file-replacement.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const original={'runner.mjs':'582ed111632cd52cc35b7dc34b6c616100a890338a4dbd883570a8271af04b31','overview.mjs':'8856451983b78a9d0a2c3dbaaf3146cd4c1cfcfe6adf9f0ffd0dc573759a98fa'};
const priorInstalledRunner='d42a21ffc53c428c19ec46b2f152c08d927552a09184acabdb5c0d5003d1df63';
const names=['capture-policy.mjs','operator-help.mjs','runner.mjs','overview.mjs'];
async function normalDirectory(p){const s=await fs.lstat(p);if(!s.isDirectory()||s.isSymbolicLink())throw Error('FLEET_UPDATE_PATH_INVALID');}
async function readFile(p){const s=await fs.lstat(p);if(!s.isFile()||s.isSymbolicLink()||s.size>65536)throw Error('FLEET_UPDATE_FILE_INVALID');return fs.readFile(p);}
export async function installCaptureRelease(argv=process.argv.slice(2)){
 if(process.platform!=='win32'||argv.length!==4||argv[0]!=='--base'||argv[2]!=='--apply'||!['yes','no'].includes(argv[3])||!path.isAbsolute(argv[1])||!process.env.LOCALAPPDATA)throw Error('FLEET_UPDATE_ARGUMENTS');
 const base=path.resolve(argv[1]),allowed=path.resolve(process.env.LOCALAPPDATA,'MuniControl','Gateways','MultiClock');if(base.toLowerCase()!==allowed.toLowerCase())throw Error('FLEET_UPDATE_PATH_INVALID');
 const app=path.join(base,'app','clock-fleet'),control=path.join(base,'control');for(const p of [base,path.join(base,'app'),app,control])await normalDirectory(p);
 const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../local-agents/clock-fleet');
 const manifest=JSON.parse((await readFile(path.join(source,'SHA256SUMS.json'))).toString('utf8'));
 const files=[];for(const name of names){const bytes=await readFile(path.join(source,name)),after=sha(bytes);if(manifest[name]!==after)throw Error('FLEET_UPDATE_SOURCE_MISMATCH');let before=null;
  try{before=await readFile(path.join(app,name));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(before&&sha(before)!==after&&sha(before)!==original[name]&&!(name==='runner.mjs'&&sha(before)===priorInstalledRunner)||!before&&original[name])throw Error('FLEET_UPDATE_INSTALLED_DRIFT');
  files.push({name,bytes,before,after,changed:!before||sha(before)!==after});
 }
 const release=sha(JSON.stringify(files.map(f=>[f.name,f.after])));
 const report={version:'fleet-capture-update.v1',release,changes:files.filter(f=>f.changed).map(f=>f.name),applied:false,queueModified:false,credentialsModified:false,pm10Modified:false,taskModified:false,hardwareCommands:0};
 if(argv[3]==='no'||!report.changes.length){console.log(JSON.stringify(report));return report;}
 const archive=path.join(control,'capture-upgrade-'+release.slice(0,16));
 await fs.mkdir(archive,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});await normalDirectory(archive);
 for(const f of files.filter(f=>f.changed)){
  const target=path.join(app,f.name);let present=null;try{present=await readFile(target);}catch(e){if(e.code!=='ENOENT')throw e;}
  if((present?sha(present):null)!==(f.before?sha(f.before):null))throw Error('FLEET_UPDATE_CONCURRENT_CHANGE');
  if(f.before){const backup=path.join(archive,f.name+'.before');try{await fs.writeFile(backup,f.before,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST'||sha(await readFile(backup))!==sha(f.before))throw Error('FLEET_UPDATE_BACKUP_CONFLICT');}}
  const tmp=path.join(app,'.update-'+randomUUID()+'.tmp'),h=await fs.open(tmp,'wx',0o600);try{await h.writeFile(f.bytes);await h.sync();}finally{await h.close();}
  // Dependencies were written first. Already running Node processes retain their loaded modules.
  await replaceFile(tmp,target);if(sha(await readFile(target))!==f.after)throw Error('FLEET_UPDATE_UNCONFIRMED');
 }
 report.applied=true;report.checkedAt=new Date().toISOString();
 await fs.writeFile(path.join(archive,'receipt.json'),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(report));return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)installCaptureRelease().catch(()=>{console.error('Fleet update stopped. Existing queues, credentials and tasks were not edited.');process.exitCode=1;});
