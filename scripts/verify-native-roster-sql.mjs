// Read-only roster QA inside the existing rollback-only native writer fixtures.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {buildNativeJurisdictionQa} from './verify-native-jurisdiction-sql.mjs';
import {NATIVE_ROSTER_SQL} from '../lib/internal-native-roster.js';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
export function buildNativeRosterQa(options){
 const base=buildNativeJurisdictionQa(options),query=NATIVE_ROSTER_SQL.replaceAll('public.',base.schema+'.'),anchor="PERFORM qa_assert((native_receipt->>'origin'='MUNICONTROL'";
 assert.equal(base.sql.split(anchor).length,2);const statements=[];
 const check=(expression,label)=>statements.push('PERFORM qa_assert(('+expression+'),'+q(label)+'); checks:=checks+1;');
 const read=(status='all',jurisdiction='',search="''")=>'EXECUTE '+q(query)+' INTO roster_result USING maker,'+q(status)+','+q(jurisdiction)+",'','','',"+search+',10001;';
 statements.push(read());
 check("roster_result->>'total'='1' AND jsonb_array_length(roster_result->'rows')=1",'native-only full roster contains the existing own hire without GRH rows');
 check("roster_result#>>'{scope,tenantId}'=maker->>'tenantId' AND roster_result#>>'{scope,membershipId}'=maker->>'membershipId'",'roster authority comes from unchanged native session validator');
 check("roster_result#>>'{rows,0,contractId}'=native_contract::text AND roster_result#>>'{rows,0,jurisdictionCode}' IS NULL",'roster preserves exact contract and historical absent jurisdiction');
 check("roster_result->>'people'='1' AND (roster_result#>>'{counts,active}')::int+(roster_result#>>'{counts,pending_start}')::int=1",'roster contract/person totals and future-start count agree');
 statements.push(read('all','55'));check("roster_result->>'total'='0' AND roster_result->'rows'='[]'::jsonb",'jurisdiction filter returns a complete empty result without inventing a declaration');
 statements.push(read('all','','\'%\'||(SELECT legacy_legajo FROM employment_contract WHERE id=native_contract)||\'%\''));check("roster_result->>'total'='1'",'literal parameterized search preserves native contract and works in PostgreSQL');
 const block='\nDECLARE roster_result jsonb; BEGIN\n'+statements.join('\n')+'\nEND;\n',report={...base.report,nativeRosterChecksPassed:6,checksPassed:base.report.checksPassed+6};
 const sql=base.sql.replace(anchor,()=>block+'\n'+anchor).replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report));
 return {...base,sql,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args={};for(const a of process.argv.slice(2)){if(a==='--ci')args.ci=true;else if(a==='--require-concurrency')args.requireConcurrency=true;else{const m=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(a);assert.ok(m);args[m[1]]=m[2];}}
 assert.equal(args.ci,true);assert.ok(args['write-sql']);const result=buildNativeRosterQa({serverMajor:args['expected-major'],requireConcurrency:!!args.requireConcurrency});
 for(const [key,data] of [['write-sql',result.sql],['write-lock-sql',result.lockSql]])if(args[key]){const target=path.resolve(args[key]);assert.ok(!fs.existsSync(target));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data,{flag:'wx'});}
 console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:result.report.checksPassed,nativeRosterChecksPlanned:6}));
}
