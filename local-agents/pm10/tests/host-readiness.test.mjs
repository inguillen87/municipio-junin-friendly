// SPDX-License-Identifier: GPL-2.0-only
// Synthetic local metadata only. No network, credentials or service changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,cp,rm} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {inspectHostReadiness,nodeLocation,WINDOWS_HOST_METADATA_COMMAND} from '../host-readiness.mjs';
import {checkHost} from '../check-host.mjs';

const missing=async()=>{throw Object.assign(Error('Synthetic missing path'),{code:'ENOENT'});};
const regular={isSymbolicLink:()=>false,isFile:()=>true,isDirectory:()=>false};
const windowsStat=async file=>file.startsWith('C:\\ProgramData')?missing():regular;
const route={prefix:'172.100.96.0/19',interface:'synthetic',localLookup:true};
const windows={platform:'win32',hostname:'QA-WORKSTATION',homeDirectory:'C:\\Users\\qa',executablePath:'C:\\Tools\\node.exe',nodeVersion:'24.15.0',programData:'C:\\ProgramData',systemRoot:'C:\\Windows',
 resolvePath:async()=> 'C:\\Users\\qa\\runtime\\node.exe',stat:windowsStat,
 run:async()=>({stdout:JSON.stringify({elevated:false,domainJoined:false,tasks:[]})})};
const linux={platform:'linux',hostname:'qa-municipal-candidate',homeDirectory:'/home/qa',executablePath:'/usr/bin/node',nodeVersion:'22.16.0',effectiveUid:1000,
 resolvePath:async()=>'/usr/bin/node',stat:missing,
 run:async()=>({stdout:'Id=municontrol-pm10.service\nLoadState=not-found\nActiveState=inactive\nUser=\n\nId=municontrol-pm10-sender.service\nLoadState=not-found\nActiveState=inactive\nUser=\n'})};

for(const [platform,homeDirectory,node,expected] of [
 ['win32','C:\\Users\\qa','C:\\Users\\qa\\runtime\\node.exe','user_profile'],
 ['win32','D:\\Profiles\\qa','d:\\profiles\\QA\\node.exe','user_profile'],
 ['win32','C:\\Users\\qa','C:\\Users\\other\\node.exe','user_profile'],
 ['win32','C:\\Users\\qa','C:\\Program Files\\nodejs\\node.exe','outside_user_profile'],
 ['win32','C:\\Users\\qa','C:\\UsersElsewhere\\node.exe','outside_user_profile'],
 ['win32','C:\\Users\\qa','\\\\server\\share\\node.exe','network_or_device_path'],
 ['linux','/home/qa','/home/other/.nvm/bin/node','user_profile'],
 ['linux','/home/qa','/root/.nvm/bin/node','user_profile'],
 ['linux','/home/qa','/usr/bin/node','outside_user_profile'],
 ['linux','/home/qa','relative/node','unknown'],
 ['darwin','/Users/qa','/opt/node','unknown'],
])test('classifies the real executable location '+node,()=>assert.equal(nodeLocation(node,{platform,homeDirectory}),expected));

test('Windows distinguishes a personal-profile executable and absent installation from route availability',async()=>{
 const inspected=[],commands=[];
 const result=await inspectHostReadiness({...windows,stat:async file=>{inspected.push(file);return windowsStat(file);},run:async(...args)=>{commands.push(args);return windows.run();}});
 assert.equal(result.platform,'win32');assert.equal(result.hostname,'QA-WORKSTATION');
 assert.equal(result.node.location,'user_profile');assert.equal(result.node.realPath,'C:\\Users\\qa\\runtime\\node.exe');
 assert.equal(result.privileges.administrative,false);assert.equal(result.domainJoined,false);
 assert.equal(result.services.every(s=>s.registered===false),true);
 assert.equal(Object.values(result.installationMetadata.paths).every(p=>p.present===false),true);
 assert.equal(result.installationReady,false);assert.equal(result.autonomyVerified,false);
 assert.equal(result.node.serviceAccountAccessVerified,false);assert.equal(result.hostAssignment,'not_evidenced');
 assert.equal(result.credentialsRead,false);assert.equal(result.remoteHostsContacted,false);assert.equal(result.changesPerformed,false);
 assert.ok(inspected.length>0);assert.ok(inspected.every(p=>p.startsWith('C:\\')));
 assert.ok(inspected.every(p=>!/(?:commkey|api-token|private)/i.test(p)));
 assert.equal(commands.length,1);assert.equal(commands[0][2].windowsHide,true);assert.equal(commands[0][2].shell,false);
 assert.ok(commands[0][2].timeout<=5000);
});

test('machine-wide Node, elevated token, domain and running tasks still do not certify a municipal host',async()=>{
 const result=await inspectHostReadiness({...windows,resolvePath:async()=> 'C:\\Program Files\\nodejs\\node.exe',run:async()=>({stdout:JSON.stringify({elevated:true,domainJoined:true,
  tasks:[{name:'MuniControl-PM10-CapturaLocal',state:'Running',expectedAccount:true},{name:'MuniControl-PM10-EnvioHTTPS',state:'Ready',expectedAccount:true}]})})});
 assert.equal(result.node.location,'outside_user_profile');assert.equal(result.privileges.administrative,true);
 assert.equal(result.services[0].state,'running');assert.equal(result.services[0].expectedAccount,true);
 assert.equal(result.installationReady,false);assert.equal(result.institutionalOwnershipVerified,false);
 assert.equal(result.continuousAvailabilityVerified,false);assert.equal(result.singleCollectorAcrossHostsVerified,false);
});

test('Linux reports process privilege and service registration without using sudo',async()=>{
 const commands=[];const result=await inspectHostReadiness({...linux,effectiveUid:0,run:async(...args)=>{
  commands.push(args);return {stdout:'Id=municontrol-pm10.service\nLoadState=loaded\nActiveState=active\nUser=municontrol-pm10\n\nId=municontrol-pm10-sender.service\nLoadState=loaded\nActiveState=inactive\nUser=another-qa-account\n'};
 }});
 assert.equal(result.node.location,'outside_user_profile');assert.equal(result.privileges.administrative,true);
 assert.equal(result.services[0].registered,true);assert.equal(result.services[0].expectedAccount,true);
 assert.equal(result.services[1].expectedAccount,false);assert.equal(result.installationReady,false);
 assert.equal(commands.length,1);assert.equal(commands[0][0],'/usr/bin/systemctl');assert.equal(commands[0][1][0],'show');
 assert.ok(commands[0][1].includes('municontrol-pm10.service'));assert.ok(commands[0][1].includes('municontrol-pm10-sender.service'));
});

test('inaccessible metadata stays unknown and raw errors are not emitted',async()=>{
 const result=await inspectHostReadiness({...windows,resolvePath:async()=>{throw Error('PRIVATE_NODE_ERROR');},stat:async()=>{throw Object.assign(Error('PRIVATE_FILE_ERROR'),{code:'EACCES'});},run:async()=>{throw Error('PRIVATE_PROCESS_ERROR');}});
 assert.equal(result.node.realPath,null);assert.equal(result.node.location,'unknown');
 assert.equal(result.privileges.administrative,null);assert.equal(result.services[0].registered,null);
 assert.equal(Object.values(result.installationMetadata.paths).every(p=>p.present===null),true);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_/);
});

test('symbolic links are reported as metadata and never followed for configuration',async()=>{
 let calls=0;const result=await inspectHostReadiness({...linux,stat:async()=>{calls++;return {isSymbolicLink:()=>true,isFile:()=>false,isDirectory:()=>false};}});
 assert.ok(calls>0);assert.equal(Object.values(result.installationMetadata.paths).every(p=>p.kind==='symbolic_link'),true);
 assert.equal(result.installationMetadata.contentsRead,false);assert.equal(result.installationReady,false);
});

test('UNC or device paths are never passed to filesystem inspection or a process launcher',async()=>{
 let calls=0;const unexpected=async()=>{calls++;throw Error('Must not inspect remote paths');};
 for(const prefix of ['\\\\server\\share','\\\\?\\C:']){
  const result=await inspectHostReadiness({...windows,executablePath:prefix+'\\node.exe',programData:prefix+'\\ProgramData',systemRoot:prefix+'\\Windows',stat:unexpected,resolvePath:unexpected,run:unexpected});
  assert.equal(result.node.location,'network_or_device_path');assert.equal(result.node.realPath,null);
  assert.equal(result.privileges.administrative,null);assert.deepEqual(result.installationMetadata.paths,{});
  assert.equal(result.remoteHostsContacted,false);assert.equal(result.installationReady,false);
 }
 assert.equal(calls,0);
});

test('a Windows installation junction stops inspection before any descendant is read',async()=>{
 const inspected=[];
 const result=await inspectHostReadiness({...windows,stat:async file=>{
  inspected.push(file);return file==='C:\\ProgramData'?{isSymbolicLink:()=>true,isFile:()=>false,isDirectory:()=>true}:regular;
 }});
 assert.ok(inspected.includes('C:\\ProgramData'));
 assert.equal(inspected.some(file=>file.startsWith('C:\\ProgramData\\')),false);
 assert.equal(Object.values(result.installationMetadata.paths).every(p=>p.present===null&&p.kind==='ancestor_symbolic_link'),true);
});

test('a Node junction does not trigger resolution of its target',async()=>{
 let resolutions=0;const inspected=[];
 const result=await inspectHostReadiness({...windows,stat:async file=>{
  inspected.push(file);return file==='C:\\Tools'?{isSymbolicLink:()=>true,isFile:()=>false,isDirectory:()=>true}:regular;
 },resolvePath:async()=>{resolutions++;return '\\\\server\\share\\node.exe';}});
 assert.equal(resolutions,0);assert.equal(inspected.includes('C:\\Tools\\node.exe'),false);
 assert.equal(result.node.realPath,null);assert.equal(result.node.location,'unknown');
});

test('unavailable Linux service manager does not assert that a service is absent',async()=>{
 const result=await inspectHostReadiness({...linux,run:async()=>{throw Object.assign(Error('not found'),{code:'ENOENT'});}});
 assert.equal(result.services.every(s=>s.registered===null),true);assert.equal(result.privileges.administrative,false);
});

test('unrecognized and oversized Windows command output fails to unknown metadata',async()=>{
 for(const stdout of ['not json',' '.repeat(16385),JSON.stringify({elevated:'true',tasks:[]})]){
  const result=await inspectHostReadiness({...windows,run:async()=>({stdout})});
  assert.equal(result.privileges.administrative,null);assert.equal(result.services[0].registered,null);
 }
});

test('metadata commands are restricted to local inspection',()=>{
 assert.match(WINDOWS_HOST_METADATA_COMMAND,/Get-ScheduledTask/);assert.match(WINDOWS_HOST_METADATA_COMMAND,/Get-CimInstance/);
 assert.doesNotMatch(WINDOWS_HOST_METADATA_COMMAND,/(?:Get-Content|ReadAllText|Start-Process|Invoke-Command|ComputerName|Register-ScheduledTask|Start-ScheduledTask|Set-|New-Service|CommKey|api-token)/i);
});

test('CLI readiness scope remains Node and route while installation and autonomy remain unproven',async()=>{
 const r=await checkHost({nodeVersion:'22.16.0',routeCheck:async()=>route,hostInspector:async()=>inspectHostReadiness(windows)});
 assert.equal(r.schema,'pm10-host-preflight.v1');assert.equal(r.localPrerequisitesReady,true);
 assert.equal(r.nodeAndRouteAvailable,true);assert.equal(r.exitCodeScope,'route_node_only');
 assert.equal(r.installationReady,false);assert.equal(r.installationReadiness,'not_established');assert.equal(r.autonomyVerified,false);
 assert.equal(r.host.node.location,'user_profile');assert.equal(r.credentialsRead,false);
 for(const [nodeVersion,routeCheck] of [['18.1.0',async()=>route],['24.15.0',async()=>{throw Object.assign(Error('missing'),{code:'MUNICIPAL_ROUTE_REQUIRED'});}]]){
  const missingResult=await checkHost({nodeVersion,routeCheck,hostInspector:async()=>inspectHostReadiness(linux)});
  assert.equal(missingResult.localPrerequisitesReady,false);assert.equal(missingResult.nodeAndRouteAvailable,false);
 }
});

test('metadata failure does not change the existing route-check exit contract',async()=>{
 const r=await checkHost({nodeVersion:'24.15.0',routeCheck:async()=>route,hostInspector:async()=>{throw Error('PRIVATE_INSPECTION_ERROR');}});
 assert.equal(r.localPrerequisitesReady,true);assert.equal(r.host,null);assert.equal(r.hostInspectionError,'HOST_METADATA_UNAVAILABLE');
 assert.equal(r.installationReady,false);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_INSPECTION_ERROR/);
});

test('both installation copy lists form a complete importable capture package',async()=>{
 const source=fileURLToPath(new URL('..',import.meta.url));
 const ps=await readFile(path.join(source,'install','install-windows.ps1'),'utf8'),sh=await readFile(path.join(source,'install','install-linux.sh'),'utf8');
 const psList=ps.match(/foreach \(\$file in @\(([^\r\n]+)\)\)/)?.[1];
 const shList=sh.match(/for f in ([^;]+); do install/)?.[1];
 assert.ok(psList);assert.ok(shList);
 const windowsFiles=[...psList.matchAll(/'([^']+)'/g)].map(m=>m[1]),linuxFiles=shList.split(/\s+/);
 assert.deepEqual(new Set(windowsFiles),new Set(linuxFiles));assert.ok(windowsFiles.includes('host-readiness.mjs'));
 const target=await mkdtemp(path.join(os.tmpdir(),'pm10-install-package-'));
 try{
  for(const file of windowsFiles)await cp(path.join(source,file),path.join(target,file));
  await cp(path.join(source,'reader'),path.join(target,'reader'),{recursive:true});
  const packaged=await import(pathToFileURL(path.join(target,'check-host.mjs')).href);
  const status=await packaged.checkHost({nodeVersion:'22.16.0',routeCheck:async()=>route,hostInspector:async()=>({schema:'synthetic'})});
  assert.equal(status.localPrerequisitesReady,true);assert.equal(status.installationReady,false);
  await import(pathToFileURL(path.join(target,'service.mjs')).href);
 }finally{await rm(target,{recursive:true,force:true});}
});
