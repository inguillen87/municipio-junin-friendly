import assert from 'node:assert/strict';import {employeeContext} from '../../lib/internal-native-employees.js';
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
export async function fiscalNativeNegativesBefore({db,qa,plan,run,tx,ok,maker}){
 assert.equal(plan.schema,qa.schema);assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);const schema=qa.schema,ctx=q(JSON.stringify(employeeContext(maker.principal,maker.session))),census=`SELECT ${schema}.own_fiscal_facts_census_v1(${ctx}::jsonb,'2026-10')`;
 run(tx([`DROP FUNCTION ${schema}.own_fiscal_facts_attempt_v1(jsonb,uuid)`,...plan.installation]),'NOELIA_FISCAL160_PARTIAL_STATE');
 ok(true,'actual fiscal partial function family is rejected and the entire destructive synthetic probe rolls back');
 run(tx([`GRANT SELECT ON TABLE ${schema}.own_fiscal_facts_event TO municontrol_actions_runtime_app`,...plan.installation]),'FISCAL_FACTS_TABLE_SECURITY');
 ok(true,'actual fiscal unexpected runtime table read permission is rejected and rolled back');
 run(tx(['SET LOCAL ROLE municontrol_actions_runtime_app',census]),'NATIVE_EMPLOYMENT_CATALOG_BUSY');
 ok(true,'actual fiscal runtime RR is rejected by the existing catalog RC guard');
 await assert.rejects(()=>db.run('SET TRANSACTION READ ONLY;'+census,true),/read-only transaction/);
 await assert.rejects(()=>db.run(`SELECT to_jsonb(count(*)) FROM ${schema}.own_fiscal_facts_event`,true),/permission denied/);
 ok(true,'actual fiscal read-only runtime and direct runtime ledger access are rejected without a business write');
 const after=JSON.parse(run(tx(['SET TRANSACTION READ ONLY',...plan.bookend])));assert.match(after.objectFingerprint,/^[a-f0-9]{64}$/);return{passed:true,probes:5,runtimeTransactionMode:'read committed read write',allNegativeTransactionsRolledBack:true};
}
export async function fiscalNativeNegativesAfter({db,qa,ok}){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);const table=qa.schema+'.own_fiscal_facts_event';for(const sql of [`UPDATE ${table} SET body=body`,`DELETE FROM ${table}`,`TRUNCATE ${table}`])await assert.rejects(()=>db.run(sql),/FISCAL_FACTS_IMMUTABLE/);
 assert.equal(await db.run(`SELECT to_jsonb(count(*)) FROM ${table}`),6);ok(true,'actual fiscal UPDATE DELETE and TRUNCATE fail immutable guards and preserve all six HTTP-created events');return{passed:true,immutableProbes:3,eventsAfter:6};
}

