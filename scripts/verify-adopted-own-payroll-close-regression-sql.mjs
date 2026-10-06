// Keep every cumulative regression, including unknown municipal history.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {buildAdoptedOwnRunQa} from './verify-adopted-own-payroll-sql.mjs';
import {adoptionQaOutputPath} from './verify-employment-adoption-preparation-sql.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
export async function buildAdoptedOwnCloseRegressionQa({serverMajor}){
 const base=await buildAdoptedOwnRunQa({serverMajor}),{schema}=base;
 const source=fs.readFileSync(new URL('./migrations/141-adopted-own-payroll-close.sql',import.meta.url),'utf8');
 const relocated=source.replaceAll('public.',schema+'.').replaceAll("'search_path=pg_catalog, public, pg_temp'",q('search_path=pg_catalog, '+schema+', public, pg_temp'))
 .replace("replace(original.prosrc,E'\\r\\n',E'\\n')","replace(replace(original.prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')");
 const actual="RAISE NOTICE 'ADOPTED_RUN_LEGACY_CONTRACT:%'";assert.equal(base.sql.split(actual).length,2);
 const checks=4,report={...base.report,checksPassed:base.report.checksPassed+checks,adoptedOwnCloseRegressionChecksPassed:checks};
 const block=`DECLARE ac_metadata jsonb;ac_count bigint;ac_refused boolean:=false;BEGIN
 SELECT to_jsonb(p)-'prosrc' INTO ac_metadata FROM pg_proc p WHERE oid='${schema}.own_close_roster_v1(jsonb,text)'::regprocedure;
 ac_count:=(SELECT count(*) FROM own_payroll_close_event);
 EXECUTE ${q(relocated)};
 PERFORM qa_assert(ac_metadata=(SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid='${schema}.own_close_roster_v1(jsonb,text)'::regprocedure),'close roster metadata preserved in full original regression');checks:=checks+1;
 PERFORM qa_assert(qa_rejects(${q(relocated)},'OWN_CLOSE_ADOPTION_DEFINITION_CHANGED'),'raw repetition remains refused');checks:=checks+1;
 INSERT INTO capabilities SELECT (checker->>'membershipId')::uuid,'payroll.calculation.approve' WHERE NOT EXISTS(SELECT 1 FROM capabilities WHERE membership_id=(checker->>'membershipId')::uuid AND capability_key='payroll.calculation.approve');
 BEGIN PERFORM own_close_detail_v1(checker,'2026-11','monthly');EXCEPTION WHEN OTHERS THEN
 IF SQLERRM NOT IN('PAYROLL_FIXED_DATES_INVALID','OWN_CLOSE_CONTRACT_INVALID') THEN RAISE;END IF;ac_refused:=true;END;
 PERFORM qa_assert(ac_refused,'unknown dates or missing classification globally refuse the entire close roster without skipped rows');checks:=checks+1;
 PERFORM qa_assert(ac_count=(SELECT count(*) FROM own_payroll_close_event),'failed complete review stores no close event');checks:=checks+1;END;
 `;
 let sql=base.sql.replace(actual,()=>block+actual);assert.equal(sql.split('checks<>'+base.report.checksPassed).length,2);
 sql=sql.replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed);assert.equal(sql.split(j(base.report)).length,2);sql=sql.replace(j(base.report),()=>j(report));
 return {...base,sql,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args={};for(const a of process.argv.slice(2)){const m=/^--(expected-major|write-sql)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
 const file=adoptionQaOutputPath(args['write-sql']),qa=await buildAdoptedOwnCloseRegressionQa({serverMajor:Number(args['expected-major'])});fs.writeFileSync(file,qa.sql,{flag:'wx'});console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:qa.report.checksPassed,newChecks:qa.report.adoptedOwnCloseRegressionChecksPassed}));
}
