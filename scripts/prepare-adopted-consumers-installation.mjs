// Generate only; no connection, SQL execution or municipal operation.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {buildAdoptedConsumersInstallation} from './lib/adopted-consumers-installation.mjs';
import {OWN_RELEASE_TARGETS} from './lib/own-payroll-release-target.mjs';import {ownInstallationSettings,ownInstallationDestination} from './prepare-own-payroll-installation.mjs';
export function prepareAdoptedConsumersInstallation({read,sourceCommit}){
 const batch=buildAdoptedConsumersInstallation({read,sourceCommit});return {...batch,targets:OWN_RELEASE_TARGETS.map(t=>({...t,installation:[...ownInstallationSettings,ownInstallationDestination(t),...batch.statements],durableVerification:['SET TRANSACTION READ ONLY',...ownInstallationSettings,ownInstallationDestination(t),...batch.verification]}))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  assert.equal(process.argv.length,3);assert.match(process.argv[2],/^--output=/);const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.resolve(process.argv[2].slice(9));assert.ok(output.startsWith(path.join(root,'verification')+path.sep));assert.ok(!fs.existsSync(output),'Preserve previous review');
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trimEnd(),sourceCommit=git('rev-parse','HEAD');assert.equal(git('diff','--name-only'),'');assert.equal(git('diff','--cached','--name-only'),'');
  const read=file=>{const committed=git('show',sourceCommit+':'+file)+'\n';assert.equal(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n?/g,'\n'),committed);return committed;};
  const batch=prepareAdoptedConsumersInstallation({read,sourceCommit});fs.writeFileSync(output,JSON.stringify(batch,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({sourceCommit,sources:11,newTables:4,newFunctions:52,adaptedFunctions:20,roleAssignmentsAdded:0,privateAdoptionWriter:true,connects:false,executesSql:false}));
 }catch(error){console.error(JSON.stringify({ok:false,code:'ADOPTED_CONSUMERS_PREPARATION_FAILED',reason:error.message}));process.exitCode=1;}
}
