// Exact schema-only batch for the two existing municipal destinations.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {buildInactiveJurisdictionInstallation} from './lib/adoption-inactive-jurisdiction-installation.mjs';
import {OWN_RELEASE_TARGETS} from './lib/own-payroll-release-target.mjs';
import {ownInstallationSettings,ownInstallationDestination} from './prepare-own-payroll-installation.mjs';
export function prepareInactiveJurisdictionInstallation(options){
 const batch=buildInactiveJurisdictionInstallation(options),settings=ownInstallationSettings.map(s=>s.startsWith('SET LOCAL search_path=')?'SET LOCAL search_path=pg_catalog, public, pg_temp':s);
 return {...batch,connects:false,executesSql:false,targets:OWN_RELEASE_TARGETS.map(t=>({...t,installation:[...settings,ownInstallationDestination(t),...batch.installation],verification:['SET TRANSACTION READ ONLY',...settings,ownInstallationDestination(t),...batch.verification.slice(1)]}))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{
 assert.equal(process.argv.length,3);assert.match(process.argv[2],/^--output=/);const root=path.resolve(import.meta.dirname,'..'),output=path.resolve(process.argv[2].slice(9));assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trimEnd(),sourceCommit=git('rev-parse','HEAD');assert.equal(git('diff','--name-only'),'');assert.equal(git('diff','--cached','--name-only'),'');
 const read=file=>{const committed=git('show',sourceCommit+':'+file)+'\n';assert.equal(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n?/g,'\n'),committed);return committed;};
 const batch=prepareInactiveJurisdictionInstallation({sourceCommit,read});fs.writeFileSync(output,JSON.stringify(batch,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({sourceCommit,adaptedFunctions:6,newTables:0,newFunctions:0,permissionChanges:0,businessOperations:0,connects:false,executesSql:false}));
}catch(e){console.error(JSON.stringify({passed:false,message:e.message}));process.exitCode=1;}
