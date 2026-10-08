// Real PostgreSQL arithmetic on temporary synthetic fixtures; final ROLLBACK.
import fs from 'node:fs';import assert from 'node:assert/strict';import {execFile} from 'node:child_process';
import {buildExactParameterCentsInstallation} from './lib/exact-parameter-cents-installation.mjs';
import {parameterPreview} from '../lib/payroll-parameter-contract.js';
const args={};for(const a of process.argv.slice(2)){const m=/^--(major|psql|port|output)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
const major=Number(args.major),port=Number(args.port);assert.ok([17,18].includes(major));assert.ok([5432,55400+major].includes(port));assert.ok(args.psql&&args.output);
const batch=buildExactParameterCentsInstallation({read:p=>fs.readFileSync(p,'utf8'),sourceCommit:'a'.repeat(40)}),q=v=>"'"+v.replaceAll("'","''")+"'";
const draft=(amount,rounding='exact_cent',rule='aux88-class13i-150')=>({ruleId:rule,baseAmountCents:amount,rounding,agreementIds:rule==='aux88-class13i-150'?[2,7,11]:[1,4,6],validFrom:'2026-10',sourceReference:'SYNTHETIC QA ONLY'});
const cases=[
 ...['1','10001','65440453'].map(amount=>({draft:draft(amount),error:'PAYROLL_PARAMETER_PRECISION_LOSS'})),
 ...['2','10002','66666666666'].map(amount=>({draft:draft(amount)})),
 ...['aux88-class6d','aux90-class3a'].map(rule=>({draft:draft('10001','exact_cent',rule)})),
 ...['nearest_cent','truncate_cent'].map(rounding=>({draft:draft('10001',rounding),historical:true})),
 {draft:draft('10002','unknown'),error:'PAYROLL_PARAMETER_DRAFT_INVALID'},
 {draft:{...draft('10002'),baseAmountCents:null},error:'PAYROLL_PARAMETER_DRAFT_INVALID'},
 {draft:{...draft('10002'),agreementIds:[2,2]},error:'PAYROLL_PARAMETER_AGREEMENT_INVALID'},
 {draft:{...draft('10002'),sourceReference:'<script>'},error:'PAYROLL_PARAMETER_DRAFT_INVALID'},
 {draft:draft('99999999999'),error:'PAYROLL_PARAMETER_PRECISION_LOSS'}
];
const sql=`BEGIN;SET LOCAL statement_timeout='20s';SET LOCAL lock_timeout='2s';
DO $destination$ BEGIN IF current_setting('server_version_num')::integer/10000<>${major} OR current_database()<>'own_payroll_run_qa' OR current_user<>'postgres' OR current_setting('neon.project_id',true) IS NOT NULL THEN RAISE EXCEPTION 'EXACT_CENTS_QA_DESTINATION_MISMATCH';END IF;END $destination$;
CREATE TEMP TABLE exact_cent_qa_result(ordinal integer,payload jsonb) ON COMMIT DROP;
${batch.original.replace('public.payroll_parameter_build_draft_v1','pg_temp.parameter_before')} ;
${batch.changed.replace('public.payroll_parameter_build_draft_v1','pg_temp.parameter_after')} ;
DO $cases$ DECLARE c jsonb;i integer:=0;r jsonb;old jsonb;BEGIN FOR c IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(cases))}::jsonb) LOOP i:=i+1;
 BEGIN r:=pg_temp.parameter_after(c->'draft');IF c->>'error' IS NOT NULL THEN RAISE EXCEPTION 'QA_EXPECTED_REJECTION';END IF;
 IF coalesce((c->>'historical')::boolean,false) THEN old:=pg_temp.parameter_before(c->'draft');IF old IS DISTINCT FROM r THEN RAISE EXCEPTION 'QA_HISTORY_CHANGED';END IF;END IF;
 INSERT INTO exact_cent_qa_result VALUES(i,jsonb_build_object('draft',c->'draft','result',r));
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM IS DISTINCT FROM c->>'error' THEN RAISE;END IF;INSERT INTO exact_cent_qa_result VALUES(i,jsonb_build_object('draft',c->'draft','error',SQLERRM));END;
 END LOOP;END $cases$;
SELECT jsonb_agg(payload ORDER BY ordinal) FROM exact_cent_qa_result;ROLLBACK;`;
const result=await new Promise((resolve,reject)=>{const child=execFile(args.psql,['-X','-q','-t','-A','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','own_payroll_run_qa','-v','ON_ERROR_STOP=1','-f','-'],{windowsHide:true,timeout:30000,maxBuffer:2*1024*1024,env:{...process.env,PGCLIENTENCODING:'UTF8'}},(error,stdout,stderr)=>error?reject(Object.assign(error,{stdout,stderr})):resolve({stdout,stderr}));child.stdin.on('error',()=>{});child.stdin.end(sql,'utf8');});
const results=JSON.parse(result.stdout.trim());assert.equal(results.length,cases.length);
for(let i=0;i<cases.length;i++){assert.deepEqual(results[i].draft,cases[i].draft);if(cases[i].error){assert.equal(results[i].error,cases[i].error);assert.throws(()=>parameterPreview(cases[i].draft));}else{assert.deepEqual(results[i].result.rows,parameterPreview(cases[i].draft));assert.equal(results[i].result.applied,false);assert.equal(results[i].result.currentCatalogVerified,false);}}
const proof={version:'exact-parameter-cents-sql-qa.v1',ok:true,major,checks:cases.length,sqlReal:true,fixtures:'synthetic-only',temporaryObjectsRolledBack:true,businessWrites:0,nominalRowsReturned:0,historicalCriteriaPreserved:true};
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync(args.output,JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
