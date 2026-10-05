// Reviewed schema release only. No business commands, calculation or role grants.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {prepareOwnPayrollInstallation} from './prepare-own-payroll-installation.mjs';
import {ownReleaseClient} from './lib/own-payroll-release-target.mjs';
import {assertOwnPayrollDurability} from './lib/own-payroll-installation.mjs';
export async function executeOwnPayrollInstallation({batch,major,client,record}){
 const target=batch.targets.find(t=>t.major===major);assert.ok(target,'OWN_INSTALL_TARGET_REQUIRED');
 const {sql,target:actual}=await client(major);for(const key of ['major','projectId','branchId','endpointId','database','role','host'])assert.equal(actual[key],target[key],'OWN_INSTALL_TARGET_DRIFT');
 const tx=(statements,readOnly)=>sql.transaction(statements.map(s=>sql.query(s)),{isolationLevel:'RepeatableRead',readOnly});
 await tx(target.preflight,true);
 // Exactly one mutating transaction. An uncertain COMMIT is never retried here.
 const installedRows=await tx(target.installation,false),installed=installedRows.at(-1)?.[0]?.proof;assert.ok(installed,'OWN_INSTALL_PROOF_MISSING');
 const result={installed:true,durabilityVerified:false,target:actual,installedProof:installed,businessOperations:0,nominalRowsReturned:0};record(result);
 const durableRows=await tx(target.durableVerification,true),durable=durableRows.at(-1)?.[0]?.proof;assert.ok(durable,'OWN_INSTALL_DURABLE_PROOF_MISSING');
 const validation=assertOwnPayrollDurability({installed,durable,sourceCommit:batch.sourceCommit});Object.assign(result,{durabilityVerified:true,durableProof:durable,validation});record(result);return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let output,stage='arguments';
 try{
  const args={};for(const a of process.argv.slice(2)){const m=/^--(major|review|output)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}assert.ok([17,18].includes(Number(args.major)));
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),review=path.resolve(args.review);output=path.resolve(args.output);for(const file of [review,output])assert.ok(file.startsWith(path.join(root,'verification')+path.sep));assert.ok(!fs.existsSync(output),'Preserve prior result');
  const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trimEnd();stage='source';const sourceCommit=git('rev-parse','HEAD');assert.equal(git('diff','--name-only'),'');assert.equal(git('diff','--cached','--name-only'),'');
  const batch=JSON.parse(fs.readFileSync(review,'utf8'));assert.equal(batch.sourceCommit,sourceCommit);
  const read=f=>{const committed=git('show',sourceCommit+':'+f)+'\n';assert.equal(fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n?/g,'\n'),committed);return committed;};assert.deepEqual(batch,prepareOwnPayrollInstallation({read,sourceCommit}));
  stage='reviewed-installation';let wrote=false;const record=r=>{fs.writeFileSync(output,JSON.stringify(r,null,2)+'\n',{flag:wrote?'w':'wx'});wrote=true;};
  const result=await executeOwnPayrollInstallation({batch,major:Number(args.major),client:ownReleaseClient,record});console.log(JSON.stringify({installed:result.installed,durabilityVerified:result.durabilityVerified,targetMajor:result.target.major,sourceCommit,businessOperations:0,nominalRowsReturned:0}));
 }catch(e){console.error(JSON.stringify({ok:false,stage,code:typeof e.code==='string'?e.code:'OWN_INSTALL_FAILED',automaticRetry:false}));process.exitCode=1;}
}
