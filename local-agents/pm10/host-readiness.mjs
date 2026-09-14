// SPDX-License-Identifier: GPL-2.0-only
// Local metadata only: no credentials, remote hosts, clock sockets or changes.
import path from 'node:path';
import os from 'node:os';
import {lstat,realpath} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute=promisify(execFile);
const TASKS=['MuniControl-PM10-CapturaLocal','MuniControl-PM10-EnvioHTTPS'];
const UNITS=['municontrol-pm10.service','municontrol-pm10-sender.service'];
export const WINDOWS_HOST_METADATA_COMMAND=[
 "$ErrorActionPreference='Stop'",
 '[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)',
 '$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())',
 '$elevated=$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
 '$domainJoined=$null; try {$domainJoined=[bool](Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction Stop).PartOfDomain} catch {}',
 '$tasks=$null; try {$tasks=@(Get-ScheduledTask -ErrorAction Stop | Where-Object {$_.TaskName -in @("MuniControl-PM10-CapturaLocal","MuniControl-PM10-EnvioHTTPS")} | ForEach-Object {@{name=[string]$_.TaskName;state=[string]$_.State;expectedAccount=([string]$_.Principal.UserId -in @("S-1-5-19","LOCAL SERVICE","NT AUTHORITY\\LOCAL SERVICE"))}})} catch {}',
 '@{elevated=$elevated;domainJoined=$domainJoined;tasks=$tasks} | ConvertTo-Json -Depth 4 -Compress',
].join(';');

const validPath=v=>typeof v==='string'&&v.length>0&&v.length<=4096&&!/[\x00-\x1f]/.test(v);
const localWindowsPath=v=>validPath(v)&&/^[a-z]:[\\/]/i.test(v);
const inside=(p,root,flavor)=>{const relative=flavor.relative(root,p);return relative===''||(!relative.startsWith('..'+flavor.sep)&&relative!=='..'&&!flavor.isAbsolute(relative));};
export function nodeLocation(realExecutable,{platform,homeDirectory}={}){
 const flavor=platform==='win32'?path.win32:path.posix;
 if(platform==='win32'&&validPath(realExecutable)&&/^[\\/]{2}/.test(realExecutable))return 'network_or_device_path';
 if(!validPath(realExecutable)||!flavor.isAbsolute(realExecutable))return 'unknown';
 const candidate=platform==='win32'?flavor.normalize(realExecutable).toLowerCase():flavor.normalize(realExecutable);
 const roots=[];
 if(validPath(homeDirectory)&&flavor.isAbsolute(homeDirectory))roots.push(platform==='win32'?homeDirectory.toLowerCase():homeDirectory);
 if(platform==='win32'){
  roots.push(flavor.join(flavor.parse(candidate).root,'Users'));
  roots.push(flavor.join(flavor.parse(candidate).root,'Documents and Settings'));
 }else if(platform==='linux')roots.push('/home','/root');
 else return 'unknown';
 return roots.some(root=>inside(candidate,root,flavor))?'user_profile':'outside_user_profile';
}
function installationPaths(platform,programData){
 if(platform==='win32'){
  if(!localWindowsPath(programData))return null;
  const base=path.win32.join(programData,'MuniControl','PM10');
  return {base,captureConfig:path.win32.join(base,'config.json'),senderConfig:path.win32.join(base,'sender.json'),
   captureProgram:path.win32.join(base,'app','service.mjs'),senderProgram:path.win32.join(base,'app','sender.mjs'),
   captureState:path.win32.join(base,'state'),deliveryState:path.win32.join(base,'state','delivery')};
 }
 if(platform==='linux')return {base:'/opt/municontrol-pm10',captureConfig:'/etc/municontrol-pm10/config.json',senderConfig:'/etc/municontrol-pm10/sender.json',
  captureProgram:'/opt/municontrol-pm10/service.mjs',senderProgram:'/opt/municontrol-pm10/sender.mjs',captureState:'/var/lib/municontrol-pm10',deliveryState:'/var/lib/municontrol-pm10/delivery',
  captureService:'/etc/systemd/system/municontrol-pm10.service',senderService:'/etc/systemd/system/municontrol-pm10-sender.service'};
 return null;
}
async function windowsPathStat(file,stat){
 if(!localWindowsPath(file))throw Object.assign(Error('Non-local path'),{code:'NON_LOCAL_PATH'});
 const normalized=path.win32.normalize(file),root=path.win32.parse(normalized).root;
 let current=root,info=await stat(root);
 if(info.isSymbolicLink())throw Object.assign(Error('Reparse path'),{code:'ANCESTOR_REPARSE_POINT'});
 const segments=normalized.slice(root.length).split(path.win32.sep).filter(Boolean);
 for(let i=0;i<segments.length;i++){
  current=path.win32.join(current,segments[i]);info=await stat(current);
  // Inspect one ancestor at a time so a junction cannot redirect later metadata
  // lookups to a share. Configurations and reparse targets are never opened.
  if(info.isSymbolicLink()&&i<segments.length-1)throw Object.assign(Error('Reparse path'),{code:'ANCESTOR_REPARSE_POINT'});
 }
 return info;
}
async function inspectPath(file,stat,platform){
 try{const s=platform==='win32'?await windowsPathStat(file,stat):await stat(file);return {path:file,present:true,kind:s.isSymbolicLink()?'symbolic_link':s.isFile()?'file':s.isDirectory()?'directory':'other'};}
 catch(e){return {path:file,present:e?.code==='ENOENT'?false:null,kind:e?.code==='ENOENT'?'absent':e?.code==='ANCESTOR_REPARSE_POINT'?'ancestor_symbolic_link':'unavailable'};}
}
function blankService(name){return {name,registered:null,state:'unknown',expectedAccount:null};}
function windowsServices(tasks){
 if(!Array.isArray(tasks))return TASKS.map(blankService);
 const states=new Set(['Disabled','Queued','Ready','Running','Unknown']);
 if(tasks.some(t=>!t||!TASKS.includes(t.name)||!states.has(t.state)||typeof t.expectedAccount!=='boolean')||new Set(tasks.map(t=>t.name)).size!==tasks.length)return TASKS.map(blankService);
 return TASKS.map(name=>{const t=tasks.find(t=>t.name===name);return t?{name,registered:true,state:t.state.toLowerCase(),expectedAccount:t.expectedAccount}:{name,registered:false,state:'absent',expectedAccount:null};});
}
function linuxServices(text){
 if(typeof text!=='string'||text.length>16384)return UNITS.map(blankService);
 const records=text.trim().split(/\r?\n\s*\r?\n/).map(block=>Object.fromEntries(block.split(/\r?\n/).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];})));
 return UNITS.map(name=>{
  const matching=records.filter(r=>r.Id===name);if(matching.length!==1)return blankService(name);
  const r=matching[0];
  if(r.LoadState==='not-found')return {name,registered:false,state:'absent',expectedAccount:null};
  if(!['loaded','error','masked','bad-setting'].includes(r.LoadState)||!['active','reloading','inactive','failed','activating','deactivating','maintenance','refreshing'].includes(r.ActiveState))return blankService(name);
  return {name,registered:true,state:r.ActiveState,expectedAccount:r.User==='municontrol-pm10'};
 });
}
export async function inspectHostReadiness({platform=process.platform,hostname=os.hostname(),homeDirectory=os.homedir(),
 executablePath=process.execPath,nodeVersion=process.versions.node,programData=process.env.ProgramData,systemRoot=process.env.SystemRoot,
 effectiveUid=process.geteuid?.(),resolvePath=realpath,stat=lstat,run=execute}={}){
 const result={schema:'pm10-host-readiness.v1',platform,hostname,
  node:{version:nodeVersion,executablePath,realPath:null,location:'unknown',serviceAccountAccessVerified:false},
  privileges:{administrative:null,scope:'current_process_on_this_host'},domainJoined:null,
  installationMetadata:{scope:'standard_local_paths_and_service_registration',paths:{},contentsRead:false},
  services:platform==='win32'?TASKS.map(blankService):platform==='linux'?UNITS.map(blankService):[],
  hostAssignment:'not_evidenced',institutionalOwnershipVerified:false,continuousAvailabilityVerified:false,
  singleCollectorAcrossHostsVerified:false,installationReady:false,installationReadiness:'not_established',autonomyVerified:false,
  credentialsRead:false,remoteHostsContacted:false,changesPerformed:false,observations:[]};
 try{
  if(platform==='win32'){
   const s=await windowsPathStat(executablePath,stat);
   if(s.isSymbolicLink())throw Error('Node reparse target is not inspected');
  }
  result.node.realPath=await resolvePath(executablePath);result.node.location=nodeLocation(result.node.realPath,{platform,homeDirectory});
 }catch{result.node.location=nodeLocation(executablePath,{platform,homeDirectory})==='network_or_device_path'?'network_or_device_path':'unknown';result.observations.push('NODE_REALPATH_UNAVAILABLE');}
 if(result.node.location==='user_profile')result.observations.push('NODE_DEPENDS_ON_USER_PROFILE');
 const locations=installationPaths(platform,programData);
 if(locations){for(const [name,file] of Object.entries(locations))result.installationMetadata.paths[name]=await inspectPath(file,stat,platform);}
 else result.observations.push('INSTALLATION_PATHS_UNAVAILABLE');
 const options={encoding:'utf8',timeout:5000,maxBuffer:16384,windowsHide:true,shell:false};
 if(platform==='win32'){
  try{
   if(!localWindowsPath(systemRoot))throw Error('System root unavailable');
   const binary=path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
   if((await windowsPathStat(binary,stat)).isSymbolicLink())throw Error('System executable reparse target is not inspected');
   const {stdout}=await run(binary,['-NoLogo','-NoProfile','-NonInteractive','-Command',WINDOWS_HOST_METADATA_COMMAND],options);
   if(typeof stdout!=='string'||stdout.length>16384)throw Error('Invalid metadata');
   const data=JSON.parse(stdout.replace(/^\uFEFF/,''));
   if(!data||typeof data.elevated!=='boolean')throw Error('Invalid metadata');
   result.privileges.administrative=data.elevated;result.domainJoined=typeof data.domainJoined==='boolean'?data.domainJoined:null;
   result.services=windowsServices(data.tasks);
  }catch{result.observations.push('WINDOWS_HOST_METADATA_UNAVAILABLE');}
 }else if(platform==='linux'){
  result.privileges.administrative=Number.isSafeInteger(effectiveUid)?effectiveUid===0:null;
  try{
   const {stdout}=await run('/usr/bin/systemctl',['show',...UNITS,'--property=Id,LoadState,ActiveState,User','--no-pager'],options);
   result.services=linuxServices(stdout);
  }catch{result.observations.push('SERVICE_REGISTRATION_UNAVAILABLE');}
 }else result.observations.push('HOST_PLATFORM_UNSUPPORTED');
 // Neither local administration, a route nor a service registration establishes
 // municipal ownership or proves operation without the personal workstation.
 return result;
}
