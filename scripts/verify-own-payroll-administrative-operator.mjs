// Source-pinned verifier; only existing loopback synthetic QA, never Prod.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {ownAdministrativeOperatorQaOptions,assertOwnAdministrativeOperatorCiSource,runOwnPayrollAdministrativeOperatorQa} from './lib/own-payroll-administrative-operator-qa.mjs';
const root=fs.realpathSync(new URL('..',import.meta.url));
export async function verifyOwnPayrollAdministrativeOperator(options){
 const safe=assertOwnAdministrativeOperatorCiSource(ownAdministrativeOperatorQaOptions(options));
 const {verifySalaryConditionsProgram}=await import('./verify-own-salary-conditions-program.mjs');
 const result=await verifySalaryConditionsProgram({...safe,continuation:async h=>{
  const report=await runOwnPayrollAdministrativeOperatorQa(h);
  fs.writeFileSync(path.join(h.destination,report.ok?'administrative-operator-proof.json':'administrative-operator-draft-proof.json'),JSON.stringify(report,null,2)+'\n');
  assert.equal(report.ok,true,'OWN_ADMIN_OPERATOR_QA_INCOMPLETE: '+report.pending.join(', '));return report;
 }});
 assert.equal(result.continuation?.state,'verified','OWN_ADMIN_OPERATOR_QA_PROOF_REQUIRED');return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const values={};for(const arg of process.argv.slice(2)){const m=/^--(major|transport|source-commit|output)=(.+)$/.exec(arg);assert.ok(m&&!Object.hasOwn(values,m[1]));values[m[1]]=m[2];}
 try{const r=await verifyOwnPayrollAdministrativeOperator({major:Number(values.major),transport:values.transport??'local',sourceCommit:values['source-commit'],output:values.output});console.log(JSON.stringify({ok:r.ok,major:r.major,checksPassed:r.checksPassed,syntheticOnly:true}));}catch(e){console.error(e.stack);process.exitCode=1;}
}
