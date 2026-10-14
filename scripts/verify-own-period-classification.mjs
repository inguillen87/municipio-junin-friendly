// Only the existing synthetic loopback PG17/18 verification foundation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {ownPeriodClassificationQaOptions,assertOwnPeriodClassificationCiSource,runOwnPeriodClassificationQa} from './lib/own-period-classification-qa.mjs';
import {runOwnPayrollAdministrativeOperatorQa} from './lib/own-payroll-administrative-operator-qa.mjs';

export async function verifyOwnPeriodClassification(options){
 const safe=assertOwnPeriodClassificationCiSource(ownPeriodClassificationQaOptions(options));
 const {verifySalaryConditionsProgram}=await import('./verify-own-salary-conditions-program.mjs');
 const result=await verifySalaryConditionsProgram({...safe,browser:'none',continuation:async h=>{
  const administrative=await runOwnPayrollAdministrativeOperatorQa(h);
  fs.writeFileSync(path.join(h.destination,administrative.ok?'administrative-operator-proof.json':'administrative-operator-draft-proof.json'),JSON.stringify(administrative,null,2)+'\n');
  assert.equal(administrative.ok,true,'OWN_ADMIN_OPERATOR_QA_INCOMPLETE: '+administrative.pending.join(', '));
  const report=await runOwnPeriodClassificationQa(h,{browser:safe.browser});
  fs.writeFileSync(path.join(h.destination,report.ok?'period-classification-proof.json':'period-classification-draft-proof.json'),JSON.stringify(report,null,2)+'\n');
  assert.equal(report.ok,true,'PERIOD_CLASSIFICATION_QA_INCOMPLETE: '+report.pending.join(', '));return report;
 }});
 assert.equal(result.continuation?.state,'verified','PERIOD_CLASSIFICATION_QA_PROOF_REQUIRED');return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const values={};for(const arg of process.argv.slice(2)){const match=/^--(major|transport|source-commit|output|browser)=(.+)$/.exec(arg);assert.ok(match&&!Object.hasOwn(values,match[1]),'PERIOD_CLASSIFICATION_QA_ARGUMENT_INVALID');values[match[1]]=match[2];}
  const result=await verifyOwnPeriodClassification({major:Number(values.major),transport:values.transport??'local',sourceCommit:values['source-commit'],output:values.output,browser:values.browser??'none'});
  console.log(JSON.stringify({ok:result.ok,major:result.major,checksPassed:result.checksPassed,syntheticOnly:true}));
 }catch(error){console.error(error.stack);process.exitCode=1;}
}
