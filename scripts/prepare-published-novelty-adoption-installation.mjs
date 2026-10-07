// Generate a review-only batch for the two existing destinations. No connection.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {buildPublishedNoveltyAdoptionInstallation} from './lib/published-novelty-adoption-installation.mjs';
import {OWN_RELEASE_TARGETS} from './lib/own-payroll-release-target.mjs';
import {ownInstallationSettings,ownInstallationDestination} from './prepare-own-payroll-installation.mjs';
export function preparePublishedNoveltyAdoptionInstallation(options){const b=buildPublishedNoveltyAdoptionInstallation(options);return {...b,targets:OWN_RELEASE_TARGETS.map(t=>({...t,preflight:['SET TRANSACTION READ ONLY',...ownInstallationSettings,ownInstallationDestination(t),...b.preflight],installation:[...ownInstallationSettings,ownInstallationDestination(t),...b.installation],durableVerification:['SET TRANSACTION READ ONLY',...ownInstallationSettings,ownInstallationDestination(t),...b.durableVerification.slice(1)]}))};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{
 assert.equal(process.argv.length,3);assert.match(process.argv[2],/^--output=/);
 const root=path.resolve(import.meta.dirname,'..'),output=path.resolve(process.argv[2].slice(9));assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trimEnd(),sourceCommit=git('rev-parse','HEAD');assert.equal(git('diff','--name-only'),'');assert.equal(git('diff','--cached','--name-only'),'');
 const read=f=>{const value=git('show',sourceCommit+':'+f)+'\n';assert.equal(fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n?/g,'\n'),value);return value;};
 const b=preparePublishedNoveltyAdoptionInstallation({read,sourceCommit});fs.writeFileSync(output,JSON.stringify(b,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({sourceCommit,connects:false,executesSql:false,newTables:4,newFunctions:57,adaptedFunctions:21,businessOperations:0,roleAssignmentsAdded:0}));
}catch(e){console.error(JSON.stringify({passed:false,message:e.message}));process.exitCode=1;}
