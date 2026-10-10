// Exact committed SQL151 review. No connection or SQL execution.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {buildOwnBankPaymentChannelInstallation} from './lib/own-bank-payment-channel-installation.mjs';
import {OWN_RELEASE_TARGETS} from './lib/own-payroll-release-target.mjs';
import {ownInstallationSettings,ownInstallationDestination} from './prepare-own-payroll-installation.mjs';
export function prepareOwnBankPaymentChannelInstallation({read,sourceCommit}){
 const batch=buildOwnBankPaymentChannelInstallation({read,sourceCommit});
 return {...batch,targets:OWN_RELEASE_TARGETS.map(t=>({...t,
  preflight:['SET TRANSACTION READ ONLY',...ownInstallationSettings,ownInstallationDestination(t),...batch.preflight],
  installation:[...ownInstallationSettings,ownInstallationDestination(t),...batch.installation],
  durableVerification:['SET TRANSACTION READ ONLY',...ownInstallationSettings,ownInstallationDestination(t),...batch.durableVerification],
 }))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{
 assert.equal(process.argv.length,3);assert.match(process.argv[2],/^--output=/);
 const root=path.resolve(import.meta.dirname,'..'),output=path.resolve(process.argv[2].slice(9));assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
 const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trimEnd(),sourceCommit=git('rev-parse','HEAD');assert.equal(git('diff','--name-only'),'');assert.equal(git('diff','--cached','--name-only'),'');
 const read=f=>{const s=git('show',sourceCommit+':'+f)+'\n';assert.equal(fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n?/g,'\n'),s);return s;};
 const batch=prepareOwnBankPaymentChannelInstallation({read,sourceCommit});fs.writeFileSync(output,JSON.stringify(batch,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({sourceCommit,migrationSha256:batch.sourceHashes['scripts/migrations/151-own-bank-payment-channel.sql'],newTables:0,newFunctions:0,replacedFunctions:1,businessWrites:0,connects:false,executesSql:false}));
}catch(e){console.error(JSON.stringify({ok:false,code:'BANK_CHANNEL_PREPARATION_FAILED',message:e.message}));process.exitCode=1;}
