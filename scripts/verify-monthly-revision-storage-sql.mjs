// Generate the full rollback-only synthetic SQL suite. Never connects.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {buildMonthlyRevisionStorageQa} from './lib/monthly-revision-storage-qa.mjs';
export {buildMonthlyRevisionStorageQa};
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const options={};for(const arg of process.argv.slice(2)){const m=/^--(expected-major|write-sql)=(.+)$/.exec(arg);assert.ok(m&&!Object.hasOwn(options,m[1]));options[m[1]]=m[2];}
  const root=fs.realpathSync(new URL('..',import.meta.url)),output=path.resolve(root,options['write-sql']??'');
  assert.ok(output.startsWith(path.join(root,'verification')+path.sep));
  const qa=buildMonthlyRevisionStorageQa({serverMajor:Number(options['expected-major'])});
  fs.writeFileSync(output,qa.sql,{flag:'wx'});console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:qa.report.checksPassed,priorChecks:qa.report.checksPassed-qa.report.monthlyStorageChecksPassed,storageChecks:qa.report.monthlyStorageChecksPassed}));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
