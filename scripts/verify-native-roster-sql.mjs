// Real read-only roster query after all current dependencies, rollback-only.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {buildNativeEmploymentLifecycleQa} from './verify-native-employment-lifecycle-sql.mjs';
import {NATIVE_ROSTER_SQL} from '../lib/internal-native-roster.js';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
export function buildNativeRosterQa(options){
 const base=buildNativeEmploymentLifecycleQa(options),query=NATIVE_ROSTER_SQL.replaceAll('public.',base.schema+'.'),anchor='-- LIFECYCLE_ROSTER_QA_ANCHOR';
 assert.equal(base.sql.split(anchor).length,2);const statements=[];
 const check=(expression,label)=>statements.push('PERFORM qa_assert(('+expression+'),'+q(label)+'); checks:=checks+1;');
 const read=(status='all',jurisdiction='',search="''")=>'EXECUTE '+q(query)+' INTO roster_result USING maker,'+q(status)+','+q(jurisdiction)+",'','','',"+search+',10001;';
 statements.push(read());
 const population="FROM employment_contract c JOIN native_employee_registration r ON r.contract_id=c.id WHERE c.tenant_id=(own_context->>'tenantId')::uuid AND r.source_binding_id="+q(base.ids.binding)+"::uuid AND c.source_system='MUNICONTROL' AND c.legacy_company_id=(own_context->>'sourceCompanyId')::bigint";
 check("(roster_result->>'total')::int=(SELECT count(*) "+population+") AND jsonb_array_length(roster_result->'rows')=(roster_result->>'total')::int AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(roster_result->'rows') r JOIN employment_contract c ON c.id=(r->>'contractId')::uuid WHERE c.source_system<>'MUNICONTROL')",'native-only full roster contains all own hires without GRH rows');
 check("roster_result#>>'{scope,tenantId}'=maker->>'tenantId' AND roster_result#>>'{scope,membershipId}'=maker->>'membershipId'",'roster authority comes from unchanged native session validator');
 check("EXISTS(SELECT 1 FROM jsonb_array_elements(roster_result->'rows') r WHERE r->>'contractId'=native_contract::text AND r->>'jurisdictionCode' IS NULL)",'roster preserves exact contract and historical absent jurisdiction');
 check("(roster_result->>'people')::int=(SELECT count(DISTINCT c.person_id) "+population+") AND (roster_result#>>'{counts,active}')::int+(roster_result#>>'{counts,pending_start}')::int=(roster_result->>'total')::int",'roster contract/person totals and future-start count agree');
 statements.push(read('all','not_reported',"'%'||(SELECT legacy_legajo FROM employment_contract WHERE id=target_id)||'%'"));check("roster_result->>'total'='0' AND roster_result->'rows'='[]'::jsonb AND EXISTS(SELECT 1 FROM employment_contract WHERE id=target_id AND jurisdiction_code IS NOT NULL)",'jurisdiction filter returns a complete empty result without inventing a declaration');
 statements.push(read('all','','\'%\'||(SELECT legacy_legajo FROM employment_contract WHERE id=native_contract)||\'%\''));check("roster_result->>'total'='1'",'literal parameterized search preserves native contract and works in PostgreSQL');
 const block='\nDECLARE roster_result jsonb; BEGIN\n'+statements.join('\n')+'\nEND;\n',report={...base.report,nativeRosterChecksPassed:6,checksPassed:base.report.checksPassed+6};
 const sql=base.sql.replace(anchor,()=>block+'\n'+anchor).replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report)).replaceAll('native_employment_lifecycle_qa','fixed_novelties_qa');
 const lockSql=base.lockSql.replaceAll('native_employment_lifecycle_qa','fixed_novelties_qa');
 return {...base,sql,lockSql,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args={};for(const a of process.argv.slice(2)){if(a==='--ci')args.ci=true;else if(a==='--require-concurrency')args.requireConcurrency=true;else{const m=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(a);assert.ok(m);args[m[1]]=m[2];}}
 assert.equal(args.ci,true);assert.ok(args['write-sql']);const result=buildNativeRosterQa({serverMajor:args['expected-major'],requireConcurrency:!!args.requireConcurrency});
 for(const [key,data] of [['write-sql',result.sql],['write-lock-sql',result.lockSql]])if(args[key]){const target=path.resolve(args[key]);assert.ok(!fs.existsSync(target));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data,{flag:'wx'});}
 console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:result.report.checksPassed,nativeRosterChecksPlanned:6}));
}
