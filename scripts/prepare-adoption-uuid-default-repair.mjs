// Bind the reviewed schema-only repair to the two existing municipal databases.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {buildAdoptionUuidDefaultRepair} from './lib/adoption-uuid-default-repair.mjs';
import {OWN_RELEASE_TARGETS} from './lib/own-payroll-release-target.mjs';
import {ownInstallationSettings,ownInstallationDestination} from './prepare-own-payroll-installation.mjs';
export function prepareAdoptionUuidDefaultRepair(options){const b=buildAdoptionUuidDefaultRepair(options);return {...b,targets:OWN_RELEASE_TARGETS.map(t=>({...t,installation:[...ownInstallationSettings,ownInstallationDestination(t),...b.installation],durableVerification:['SET TRANSACTION READ ONLY',...ownInstallationSettings,ownInstallationDestination(t),...b.durableVerification.slice(1)]}))};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{
 assert.equal(process.argv.length,3);assert.match(process.argv[2],/^--output=/);const root=path.resolve(import.meta.dirname,'..'),output=path.resolve(process.argv[2].slice(9));assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
 const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trimEnd(),sourceCommit=git('rev-parse','HEAD');assert.equal(git('diff','--name-only'),'');assert.equal(git('diff','--cached','--name-only'),'');
 const read=f=>{const s=git('show',sourceCommit+':'+f)+'\n';assert.equal(fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n?/g,'\n'),s);return s;};
 const b=prepareAdoptionUuidDefaultRepair({read,sourceCommit});fs.writeFileSync(output,JSON.stringify(b,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({sourceCommit,reviewedDefaults:3,emptyTablesRequired:true,businessOperations:0,permissionChanges:0,connects:false,executesSql:false}));
}catch(e){console.error(JSON.stringify({passed:false,message:e.message}));process.exitCode=1;}
