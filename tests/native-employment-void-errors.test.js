import assert from 'node:assert/strict';
import {test} from 'node:test';
const entries=[{"file": "lib/internal-employment-changes.js", "mapper": "employmentChangeError"}, {"file": "lib/internal-employment-lifecycle.js", "mapper": "employmentLifecycleError"}, {"file": "lib/internal-own-art-days.js", "mapper": "artDaysError"}, {"file": "lib/internal-own-contract-salary-conditions.js", "mapper": "salaryConditionsError"}, {"file": "lib/internal-own-contract-working-time.js", "mapper": "workingTimeError"}, {"file": "lib/internal-own-fiscal-facts.js", "mapper": "fiscalFactsError"}, {"file": "lib/internal-own-period-classification.js", "mapper": "periodClassificationError"}, {"file": "lib/internal-own-period-participation.js", "mapper": "participationError"}, {"file": "lib/internal-own-salary-seniority.js", "mapper": "seniorityError"}, {"file": "lib/internal-payroll-fixed-novelties.js", "mapper": "fixedSafeError"}, {"file": "lib/internal-own-payroll-novelties.js", "mapper": "ownNoveltyError"}, {"file": "lib/internal-payroll-novelty.js", "mapper": "mappedSqlError"}];
const publicEntries=entries.filter(x=>x.mapper!=='mappedSqlError');
const sentinel='MARCADOR_PRIVADO_NO_DEBE_PUBLICARSE';
for(const row of publicEntries){
 test(row.file+' explica el retiro y conserva errores anteriores',async()=>{
  const cand=await import(new URL('../'+row.file,import.meta.url));
  const map=cand[row.mapper];assert.equal(typeof map,'function');
  for(const raw of [new Error('NATIVE_EMPLOYMENT_VOID_WITHDRAWN '+sentinel),{code:'NATIVE_EMPLOYMENT_VOID_WITHDRAWN',message:sentinel}]){
   const err=map(raw);assert.equal(err.status,409);assert.match(err.code,/WITHDRAWN$/);
   assert.equal(err.message,'Alta retirada por corrección administrativa; consultá el historial.');
   assert(!err.message.includes(sentinel));
  }
  for(const raw of [new Error('NATIVE_EMPLOYMENT_VOID_CONTRACT_INVALID '+sentinel),new Error('NATIVE_EMPLOYMENT_VOID_WITHDRAWNX'),new Error('NATIVE_EMPLOYEE_SESSION_INVALID'),new Error('TENANT_IAM_SOD_CONFLICT'),new Error('PERIOD_CLASSIFICATION_SOURCE_CHANGED')]){
   const b=map(raw);assert(!b.code?.endsWith('WITHDRAWN'));
  }
 });
}
test('consulta nominal mensual traduce el rechazo SQL real sin exponer detalle',async()=>{
 const {getPayrollNoveltyEmployeeV2}=await import('../lib/internal-payroll-novelty.js');
 const principal={user:{email:'fixture@example.invalid'},tenant:{source:'membership',id:'10000000-0000-4000-8000-000000000001',membershipId:'20000000-0000-4000-8000-000000000001'}};
 const session={email:principal.user.email,id:'30000000-0000-4000-8000-000000000001',version:1,releaseSha:'a'.repeat(40)};
 let calls=0;const sql={query:async(q,args)=>{calls++;assert(q.includes('payroll_novelty_employee_v2'));assert.equal(args[1],'40000000-0000-4000-8000-000000000001');throw new Error('NATIVE_EMPLOYMENT_VOID_WITHDRAWN '+sentinel)}};
 await assert.rejects(getPayrollNoveltyEmployeeV2(sql,principal,session,'40000000-0000-4000-8000-000000000001'),e=>e.status===409&&e.code==='PAYROLL_NOVELTY_WITHDRAWN'&&e.message==='Alta retirada por corrección administrativa; consultá el historial.');
 assert.equal(calls,1);
});
