// Offline generator; real067/092/093/117/118 functions, synthetic rolled-back schema.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildFixedGroupsQa} from './verify-payroll-fixed-groups-sql.mjs';
import {buildFixedCorrectionGroupsInstallation,readCorrectionGroupPrerequisites} from './lib/fixed-correction-groups-installation.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
import {functionPin,pinsCheck} from './lib/native-leave-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const j=v=>q(JSON.stringify(v))+'::jsonb';
export function buildFixedCorrectionGroupsQa({serverMajor,requireConcurrency=false}){
 const base=buildFixedGroupsQa({serverMajor,requireConcurrency}),{schema}=base;
 const migration=fs.readFileSync(new URL('./migrations/118-fixed-novelty-correction-groups.sql',import.meta.url),'utf8');
 const relocated=migration.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
 .replace(/SET search_path=pg_catalog,public,pg_temp/g,`SET search_path=pg_catalog,${schema},public,pg_temp`);
 const checks=[];let n=0;
 const protocol=buildFixedCorrectionGroupsInstallation({source:migration,sourceCommit:'a'.repeat(40),prerequisitePins:readCorrectionGroupPrerequisites(f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'))});
 const qaPins=splitPostgresStatements(relocated).filter(s=>s.startsWith('CREATE OR REPLACE FUNCTION '+schema+'.payroll_fixed_correction_group_')).map(s=>{const p=functionPin(s.replace('CREATE OR REPLACE FUNCTION '+schema+'.','CREATE OR REPLACE FUNCTION public.'));return {...p,signature:p.signature.replace('public.',schema+'.'),runtime:p.name!=='payroll_fixed_correction_group_receipt_v1'};});
 const ok=(expression,label)=>{checks.push(`PERFORM qa_assert((${expression}),${q(label)}); checks:=checks+1;`);n++;};
 const reject=(sql,code,label)=>ok(`qa_rejects(${sql},${q('PAYROLL_FIXED_'+code)})`,label);
 const call=(fn,actor='maker',payload='gp')=>`format('SELECT payroll_fixed_correction_group_${fn}_v1(%1$L::jsonb,${fn==='propose'?'%2$L::jsonb,%3$L::uuid':'%2$L::uuid'})',${actor},${fn==='propose'?payload+',':''}gk)`;
 checks.push(`SELECT count(*) INTO events_before FROM payroll_fixed_novelty_event;
 SELECT md5(string_agg(pg_get_functiondef(p.oid),'' ORDER BY p.oid)) INTO funcs_before FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname NOT LIKE 'payroll_fixed_correction_group_%';
 EXECUTE ${q(relocated)};
 gp:=jsonb_build_object('reason','Corrección conjunta sintética','items',jsonb_build_array(
 jsonb_build_object('recordId',nr->>'recordId','expectedVersion',2,'contractId',native_contract,'legajo','19001','identityToken',native_subject->>'identityToken','values',(np->'values')||jsonb_build_object('conceptSourceId','614','quantityDecimal','2')),
 jsonb_build_object('recordId',grh_receipt->>'recordId','expectedVersion',2,'contractId',grh_subject->>'contractId','legajo','903','identityToken',grh_subject->>'identityToken','values',(SELECT payroll_fixed_registry_record_json_v1(maker,n)#>'{approved,values}' FROM payroll_fixed_novelty n WHERE n.id=(grh_receipt->>'recordId')::uuid)||jsonb_build_object('conceptSourceId','614','quantityDecimal','2'))));`);
 ok("NOT EXISTS(SELECT 1 FROM payroll_fixed_correction_group)",'118 installs an empty private receipt ledger');
 checks.push('EXECUTE '+q(protocol.newObjectAudit.replaceAll('public.',schema+'.').replaceAll("'public'::regnamespace",q(schema)+'::regnamespace'))+';','EXECUTE '+q(pinsCheck(qaPins,'SQL118_QA_FUNCTION_METADATA'))+';');
 ok('TRUE','installation audits verify all nine columns, constraints, RLS, immutable guard and function metadata');
 ok("(SELECT md5(string_agg(pg_get_functiondef(p.oid),'' ORDER BY p.oid)) FROM pg_proc p WHERE p.pronamespace="+q(schema)+"::regnamespace AND p.proname NOT LIKE 'payroll_fixed_correction_group_%')=funcs_before",'118 preserves every existing function definition');
 reject(call('propose','reader'),'CAPABILITY_REQUIRED','reader cannot propose a group');
 reject(call('propose','unlinked'),'EMPLOYMENT_REQUIRED','unlinked operator cannot propose a group');
 reject(call('propose','outsider'),'NOT_FOUND','foreign scope cannot mutate selected contracts');
 reject(call('propose','maker',"jsonb_set(gp,'{items,1,expectedVersion}','1')"),'VERSION_CONFLICT','a stale second version aborts the entire transaction');
 ok('(SELECT count(*) FROM payroll_fixed_novelty_event)=events_before AND NOT EXISTS(SELECT 1 FROM payroll_fixed_correction_group)','failed second item leaves no first proposal or receipt');
 reject(call('propose','maker',"jsonb_set(gp,'{items,1,identityToken}',to_jsonb(repeat('a',64)))"),'IDENTITY_CHANGED','second identity drift rolls back the first proposal');
 ok('(SELECT count(*) FROM payroll_fixed_novelty_event)=events_before','identity failure preserves all existing events');
 reject(call('propose','maker',"jsonb_set(gp,'{items}',jsonb_build_array(gp#>'{items,0}',gp#>'{items,0}'))"),'INVALID_PAYLOAD','duplicate selection is not silently collapsed');
 reject(call('propose','maker',"gp||jsonb_build_object('items','[]'::jsonb)"),'ROW_LIMIT','empty selection is not successful');
 reject(call('propose','maker',"gp||jsonb_build_object('reason',12345)"),'INVALID_PAYLOAD','SQL rejects nontext reasons independently of API');
 reject(call('propose','maker',"jsonb_set(gp,'{items,1,values,validTo}',to_jsonb('2025-01-01'::text))"),'DATES_INVALID','invalid second date rolls back the entire corrected group');
 ok('(SELECT count(*) FROM payroll_fixed_novelty_event)=events_before AND NOT EXISTS(SELECT 1 FROM payroll_fixed_correction_group)','date failure leaves neither corrections nor receipt');
 reject(call('propose','maker',"jsonb_set(gp,'{items,1,values}',(SELECT payroll_fixed_registry_record_json_v1(maker,n)#>'{approved,values}' FROM payroll_fixed_novelty n WHERE n.id=(grh_receipt->>'recordId')::uuid))"),'INVALID_PAYLOAD','a no-change second row is not silently omitted');
 ok('(SELECT count(*) FROM payroll_fixed_novelty_event)=events_before','no-change rejection rolls back the changed first item');
 checks.push('g:=payroll_fixed_correction_group_propose_v1(maker,gp,gk);');
 ok("g->>'total'='2' AND g->>'duplicate'='false' AND g->>'key'=gk::text",'native and historical proposals commit together with the exact key');
 ok('(SELECT count(*) FROM payroll_fixed_novelty_event)=events_before+2 AND (SELECT count(*) FROM payroll_fixed_correction_group)=1','exactly two proposals and one group receipt persist');
 ok("payroll_fixed_registry_detail_v1(maker,(nr->>'recordId')::uuid)#>>'{record,approved,values,quantityDecimal}'='1.5' AND payroll_fixed_registry_detail_v1(maker,(nr->>'recordId')::uuid)#>>'{record,pending,operation}'='set' AND payroll_fixed_registry_detail_v1(maker,(nr->>'recordId')::uuid)#>>'{record,pending,values,quantityDecimal}'='2'",'a proposed correction preserves approved quantities and awaits independent review');
 ok("payroll_fixed_correction_group_propose_v1(maker,gp,gk)=g||jsonb_build_object('duplicate',true)",'same request replays the complete original receipt');
 ok("payroll_fixed_correction_group_attempt_v1(maker,gk)=g||jsonb_build_object('duplicate',true)",'lost acknowledgement is recovered without mutation');
 reject(call('propose','maker',"gp||jsonb_build_object('reason','Otro motivo sintético')"),'IDEMPOTENCY_REUSE','same key cannot change the reason');
 reject(call('propose','maker',"jsonb_set(gp,'{items}',jsonb_build_array(gp#>'{items,1}',gp#>'{items,0}'))"),'IDEMPOTENCY_REUSE','same key cannot reorder the selected group');
 reject(call('propose','maker',"jsonb_set(gp,'{items}',jsonb_build_array(gp#>'{items,0}'))"),'IDEMPOTENCY_REUSE','same key cannot shrink the selected group');
 reject(call('propose','maker',"jsonb_set(gp,'{items,0,values,quantityDecimal}',to_jsonb('3'::text))"),'IDEMPOTENCY_REUSE','same key cannot change the proposed exact values');
 reject(call('attempt','outsider'),'NOT_FOUND','another tenant cannot recover a receipt');
 reject(call('attempt','reader'),'CAPABILITY_REQUIRED','withdrawn preparation authority cannot recover a receipt');
 reject(q("UPDATE payroll_fixed_correction_group SET request_sha256=repeat('b',64)"),'IMMUTABLE','group evidence cannot be edited');
 reject(q('DELETE FROM payroll_fixed_correction_group'),'IMMUTABLE','group evidence cannot be deleted');
 reject(q('TRUNCATE payroll_fixed_correction_group'),'IMMUTABLE','group evidence cannot be truncated');
 ok("NOT has_table_privilege('municontrol_actions_runtime_app', '"+schema+".payroll_fixed_correction_group','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')",'runtime has no direct receipt ledger access');
 ok("NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace="+q(schema)+"::regnamespace AND p.proname LIKE 'payroll_fixed_correction_group_%' AND a.grantee=0 AND a.privilege_type='EXECUTE')",'new functions revoke PUBLIC execution');
 checks.push(`GRANT USAGE ON SCHEMA ${schema} TO municontrol_actions_runtime_app;
 SET LOCAL ROLE municontrol_actions_runtime_app; g2:=payroll_fixed_correction_group_attempt_v1(maker,gk); RESET ROLE;`);
 ok("g2->>'duplicate'='true' AND g2->'rows'=g->'rows'",'runtime may recover only through the authenticated facade');
 ok("g#>>'{effects,payrollCalculated}'='false' AND g#>>'{effects,payrollPosted}'='false' AND g#>>'{effects,grhMutation}'='false'",'group proposals do not calculate, approve, post or mutate GRH');
 ok("NOT EXISTS(SELECT 1 FROM payroll_fixed_novelty_event e WHERE e.id IN(SELECT (r->>'proposalId')::uuid FROM jsonb_array_elements(g->'rows') r) AND e.payload->'values' IS DISTINCT FROM (SELECT i->'values' FROM jsonb_array_elements(gp->'items') i WHERE i->>'recordId'=e.record_id::text))",'every stored correction exactly matches its reviewed values');
 const block=`DECLARE gp jsonb; g jsonb; g2 jsonb; gk uuid:=gen_random_uuid(); events_before bigint; funcs_before text;
 BEGIN ${checks.join('\n')}
 RAISE EXCEPTION USING ERRCODE='P1180',MESSAGE='RESTORE_FIXED_GROUP_QA'; EXCEPTION WHEN SQLSTATE 'P1180' THEN NULL; END;`;
 const anchor="next_payload:=np||jsonb_build_object('recordId',nr->>'recordId','expectedVersion',2,'reason','Corrección nativa de ensayo'";
 assert.equal(base.sql.split(anchor).length,2,'Native approved fixture anchor must remain unique');
 const report={...base.report,checksPassed:base.report.checksPassed+n,correctionGroupChecksPassed:n,migration118Sha256:createHash('sha256').update(migration).digest('hex')};
 const sql=base.sql.replace(anchor,()=>block+'\n'+anchor).replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report));
 assert.ok(sql.includes('checks<>'+report.checksPassed));assert.ok(!/INSERT\s+INTO\s+public\./i.test(sql));return {...base,sql,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args={};for(const a of process.argv.slice(2)){const m=/^--(expected-major|write-sql)=(.+)$/.exec(a);assert.ok(m,'Unknown argument');assert.ok(!Object.hasOwn(args,m[1]),'Duplicate argument');args[m[1]]=m[2];}
  assert.ok(args['write-sql']);const test=buildFixedCorrectionGroupsQa({serverMajor:args['expected-major']});
  fs.mkdirSync(path.dirname(path.resolve(args['write-sql'])),{recursive:true});fs.writeFileSync(args['write-sql'],test.sql,{flag:'wx'});
  console.log(JSON.stringify({generated:true,databaseExecuted:false,report:test.report}));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
