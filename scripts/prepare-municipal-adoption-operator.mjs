// Generate reviewable installation and verification SQL; never connect or execute.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {buildMunicipalAdoptionOperatorInstallation} from './lib/municipal-adoption-operator-installation.mjs';
import {OWN_RELEASE_TARGETS} from './lib/own-payroll-release-target.mjs';import {ownInstallationSettings,ownInstallationDestination} from './prepare-own-payroll-installation.mjs';
export function prepareMunicipalAdoptionOperator(options){const batch=buildMunicipalAdoptionOperatorInstallation(options);return {...batch,targets:OWN_RELEASE_TARGETS.map(t=>({...t,installation:[...ownInstallationSettings,ownInstallationDestination(t),...batch.statements],durableVerification:['SET TRANSACTION READ ONLY',...ownInstallationSettings,ownInstallationDestination(t),...batch.verification]}))};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  assert.equal(process.argv.length,3);assert.match(process.argv[2],/^--output=/);const root=path.resolve(import.meta.dirname,'..'),output=path.resolve(process.argv[2].slice(9));assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
  const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trimEnd(),sourceCommit=git('rev-parse','HEAD');assert.equal(git('diff','--name-only'),'');assert.equal(git('diff','--cached','--name-only'),'');
  const read=f=>{const committed=git('show',sourceCommit+':'+f)+'\n';assert.equal(fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n?/g,'\n'),committed);return committed;};
  const batch=prepareMunicipalAdoptionOperator({read,sourceCommit});fs.writeFileSync(output,JSON.stringify(batch,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({sourceCommit,newFunctions:5,runtimeFacades:4,newTables:0,connects:false,executesSql:false,privateWriterGranted:false,roleAssignmentsAdded:0}));
 }catch(e){console.error(JSON.stringify({passed:false,message:e.message}));process.exitCode=1;}
}
