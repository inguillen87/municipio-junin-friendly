import test from 'node:test';
import assert from 'node:assert/strict';
import {MONTHLY_DAY_NATIVE_ONLY_PROOF_QUERY,monthlyDayNativeOnlyProofSql} from '../scripts/lib/monthly-day-declaration-native-only-qa.mjs';

const input={contractId:'00000000-0000-4000-8000-000000000073',sourceCompanyId:42,employeeNumber:'718902'};
test('native-only proof binds both contract references and retains all three absence/registration checks',()=>{
 const sql=monthlyDayNativeOnlyProofSql(input);
 assert.equal((MONTHLY_DAY_NATIVE_ONLY_PROOF_QUERY.match(/\$1\b/g)||[]).length,2);
 assert.equal((sql.match(new RegExp("'"+input.contractId+"'::uuid",'g'))||[]).length,2);
 assert.doesNotMatch(sql,/\$[0-9]+\b/);
 assert.match(sql,/company_id='42'::bigint AND legajo='718902'::text/);
 for(const name of ['nativeRegistrations','legacyCounterparts','adoptionApplications'])assert.ok(sql.includes("'"+name+"'"));
 assert.equal(sql,MONTHLY_DAY_NATIVE_ONLY_PROOF_QUERY.replaceAll('$1',"'"+input.contractId+"'").replaceAll('$2',"'42'").replaceAll('$3',"'718902'"));
});
test('native-only proof refuses foreign SQL text, malformed identities or unresolved targets before a client call',()=>{
 for(const delta of [{contractId:'bad'},{sourceCompanyId:'42;SELECT 1'},{sourceCompanyId:null},{employeeNumber:'718902\' OR true'},{employeeNumber:''},{employeeNumber:718902}])assert.throws(()=>monthlyDayNativeOnlyProofSql({...input,...delta}));
});
