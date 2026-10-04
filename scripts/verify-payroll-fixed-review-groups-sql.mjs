// Real067/092/093/117/118/119, synthetic fixtures, rollback of the entire schema.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {buildFixedCorrectionGroupsQa} from './verify-payroll-fixed-correction-groups-sql.mjs';
import {buildFixedReviewGroupsInstallation,readReviewGroupPrerequisites} from './lib/fixed-review-groups-installation.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';import {functionPin,pinsCheck} from './lib/native-leave-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
export function buildFixedReviewGroupsQa({serverMajor,requireConcurrency=false}){
 const base=buildFixedCorrectionGroupsQa({serverMajor,requireConcurrency}),{schema}=base,migration=fs.readFileSync(new URL('./migrations/119-fixed-novelty-review-groups.sql',import.meta.url),'utf8');
 const relocated=migration.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(').replaceAll('SET search_path=pg_catalog,public,pg_temp','SET search_path=pg_catalog,'+schema+',public,pg_temp');
 const protocol=buildFixedReviewGroupsInstallation({source:migration,sourceCommit:'a'.repeat(40),prerequisitePins:readReviewGroupPrerequisites(f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'))});
 const pins=splitPostgresStatements(relocated).filter(s=>s.startsWith('CREATE OR REPLACE FUNCTION '+schema+'.payroll_fixed_review_group_')).map(s=>{const p=functionPin(s.replace('CREATE OR REPLACE FUNCTION '+schema+'.','CREATE OR REPLACE FUNCTION public.'));return {...p,signature:p.signature.replace('public.',schema+'.'),runtime:p.name!=='payroll_fixed_review_group_receipt_v1'};});
 const checks=[];let n=0;const ok=(e,l)=>{checks.push('PERFORM qa_assert(('+e+'),'+q(l)+');checks:=checks+1;');n++;},reject=(sql,code,l)=>ok('qa_rejects('+sql+','+q('PAYROLL_FIXED_'+code)+')',l);
 const call=(fn,actor='checker',payload='gp')=>`format('SELECT payroll_fixed_review_group_${fn}_v1(%1$L::jsonb,${fn==='decide'?'%2$L::jsonb,%3$L::uuid':'%2$L::uuid'})',${actor},${fn==='decide'?payload+',':''}gk)`;
 checks.push(`SELECT md5(string_agg(pg_get_functiondef(p.oid),'' ORDER BY p.oid)) INTO funcs_before FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace;
 EXECUTE ${q(relocated)};`);
 ok('NOT EXISTS(SELECT 1 FROM payroll_fixed_review_group)','119 installs an empty private receipt table');
 checks.push('EXECUTE '+q(protocol.newObjectAudit.replaceAll('public.',schema+'.').replaceAll("'public'::regnamespace",q(schema)+'::regnamespace'))+';','EXECUTE '+q(pinsCheck(pins,'SQL119_QA_FUNCTION_METADATA'))+';');
 ok('TRUE','exact columns, constraints, RLS, immutability, ACL and function pins pass');
 ok('(SELECT md5(string_agg(pg_get_functiondef(p.oid),\'\' ORDER BY p.oid)) FROM pg_proc p WHERE p.pronamespace='+q(schema)+"::regnamespace AND p.proname NOT LIKE 'payroll_fixed_review_group_%')=funcs_before",'119 preserves every prior function');
 checks.push(`p1:=payroll_fixed_registry_propose_v1(maker,np||jsonb_build_object('recordId',nr->>'recordId','expectedVersion',2,'values',(np->'values')||jsonb_build_object('conceptSourceId','614'),'reason','Corrección propia sintética'),gen_random_uuid());
 p2:=payroll_fixed_registry_propose_v1(maker,grh_payload||jsonb_build_object('recordId',grh_receipt->>'recordId','expectedVersion',2,'operation','annul','values',NULL,'reason','Anulación histórica sintética'),gen_random_uuid());
 gp:=jsonb_build_object('decision','approve','reason','Cotejo independiente conjunto de ensayo','items',jsonb_build_array(
 jsonb_build_object('recordId',p1->>'recordId','proposalId',p1->>'proposalId','expectedVersion',3),
 jsonb_build_object('recordId',p2->>'recordId','proposalId',p2->>'proposalId','expectedVersion',3)));
 SELECT count(*) INTO events_before FROM payroll_fixed_novelty_event;`);
 reject(call('decide','reader'),'CAPABILITY_REQUIRED','read permission cannot decide');reject(call('decide','unlinked'),'EMPLOYMENT_REQUIRED','employment linkage is required');reject(call('decide','outsider'),'NOT_FOUND','foreign scope cannot decide');reject(call('decide','maker'),'MAKER_CHECKER_REQUIRED','proposal author cannot decide own group');
 reject(call('decide','checker',"jsonb_set(gp,'{items,1,expectedVersion}','2')"),'VERSION_CONFLICT','last stale version rolls back the first decision');
 ok('(SELECT count(*) FROM payroll_fixed_novelty_event)=events_before AND NOT EXISTS(SELECT 1 FROM payroll_fixed_review_group)','refusals leave no decision and no receipt');
 reject(call('decide','checker',"jsonb_set(gp,'{items,1,proposalId}',to_jsonb(gen_random_uuid()::text))"),'VERSION_CONFLICT','last mismatched proposal rolls back every decision');
 reject(call('decide','checker',"jsonb_set(gp,'{items}',jsonb_build_array(gp#>'{items,0}',gp#>'{items,0}'))"),'INVALID_PAYLOAD','duplicate rows reject without collapsing');
 reject(call('decide','checker',"gp||jsonb_build_object('decision','annul')"),'INVALID_PAYLOAD','decision is only approve or reject');reject(call('decide','checker',"gp||jsonb_build_object('reason',12345)"),'INVALID_PAYLOAD','nontext reason rejects at SQL');
 reject(call('decide','checker',"gp||jsonb_build_object('items','[]'::jsonb)"),'ROW_LIMIT','empty group rejects');reject(call('decide','checker',"jsonb_set(gp,'{items,1,actorEmail}',to_jsonb('forged@example.invalid'::text))"),'INVALID_PAYLOAD','actor cannot be forged in a child');
 checks.push(`BEGIN
 INSERT INTO capabilities VALUES((checker->>'membershipId')::uuid,'payroll.fixed.prepare');
 extra:=payroll_fixed_registry_propose_v1(checker,grh_payload||jsonb_build_object('recordId',NULL,'expectedVersion',0,'values',(grh_payload->'values')||jsonb_build_object('conceptSourceId','700'),'reason','Propuesta propia del revisor sintético'),gen_random_uuid());
 bad:=jsonb_set(gp,'{items,1}',jsonb_build_object('recordId',extra->>'recordId','proposalId',extra->>'proposalId','expectedVersion',1));SELECT count(*) INTO fault_count FROM payroll_fixed_novelty_event;`);
 reject(call('decide','checker','bad'),'MAKER_CHECKER_REQUIRED','self-authored last row rolls back first independent decision');
 ok('(SELECT count(*) FROM payroll_fixed_novelty_event)=fault_count AND NOT EXISTS(SELECT 1 FROM payroll_fixed_review_group)','late self-review refusal leaves no group decisions');
 checks.push("RAISE EXCEPTION USING ERRCODE='P1192',MESSAGE='RESTORE_SELF_REVIEW';EXCEPTION WHEN SQLSTATE 'P1192' THEN NULL;END;");
 checks.push(`BEGIN
 extra:=payroll_fixed_registry_propose_v1(maker,grh_payload||jsonb_build_object('recordId',NULL,'expectedVersion',0,'values',(grh_payload->'values')||jsonb_build_object('conceptSourceId','701'),'reason','Otra vigencia sintética'),gen_random_uuid());
 PERFORM payroll_fixed_registry_review_v1(checker,jsonb_build_object('recordId',extra->>'recordId','proposalId',extra->>'proposalId','expectedVersion',1,'decision','approve','reason','Cotejo independiente sintético'),gen_random_uuid());
 extra:=payroll_fixed_registry_propose_v1(maker,grh_payload||jsonb_build_object('recordId',NULL,'expectedVersion',0,'values',(grh_payload->'values')||jsonb_build_object('conceptSourceId','701'),'reason','Vigencia que se superpone de ensayo'),gen_random_uuid());
 bad:=jsonb_set(gp,'{items,1}',jsonb_build_object('recordId',extra->>'recordId','proposalId',extra->>'proposalId','expectedVersion',1));SELECT count(*) INTO fault_count FROM payroll_fixed_novelty_event;`);
 reject(call('decide','checker','bad'),'OVERLAP','last overlap preserves old approval rule and rolls back first decision');
 ok('(SELECT count(*) FROM payroll_fixed_novelty_event)=fault_count AND NOT EXISTS(SELECT 1 FROM payroll_fixed_review_group)','overlap refusal keeps the other approved record and pending proposal intact');
 checks.push("RAISE EXCEPTION USING ERRCODE='P1193',MESSAGE='RESTORE_OVERLAP';EXCEPTION WHEN SQLSTATE 'P1193' THEN NULL;END;");
 // Reject whole group, verify histories/approved values, then restore fixtures.
 checks.push(`BEGIN g:=payroll_fixed_review_group_decide_v1(checker,gp||jsonb_build_object('decision','reject'),gk);`);
 ok("g->>'decision'='reject' AND g->>'total'='2'",'rejection records both decisions');
 ok("payroll_fixed_registry_detail_v1(checker,(p1->>'recordId')::uuid)#>>'{record,approved,values,conceptSourceId}'='80' AND payroll_fixed_registry_detail_v1(checker,(p2->>'recordId')::uuid)#>>'{record,approved,operation}'='set'",'rejection preserves both previous approved versions');
 ok("payroll_fixed_registry_detail_v1(checker,(p1->>'recordId')::uuid)#>'{record,pending}'='null'::jsonb AND payroll_fixed_registry_detail_v1(checker,(p2->>'recordId')::uuid)#>'{record,pending}'='null'::jsonb",'rejection resolves all selected pending proposals');
 checks.push("RAISE EXCEPTION USING ERRCODE='P1191',MESSAGE='RESTORE_REJECTION';EXCEPTION WHEN SQLSTATE 'P1191' THEN NULL;END;");
 checks.push('g:=payroll_fixed_review_group_decide_v1(checker,gp,gk);');
 ok("g->>'decision'='approve' AND g->>'total'='2' AND g->>'duplicate'='false'",'native correction and historical annulment approve atomically');
 ok('(SELECT count(*) FROM payroll_fixed_novelty_event)=events_before+2 AND (SELECT count(*) FROM payroll_fixed_review_group)=1','one decision per proposal and one receipt');
 ok("payroll_fixed_registry_detail_v1(checker,(p1->>'recordId')::uuid)#>>'{record,approved,values,conceptSourceId}'='614' AND payroll_fixed_registry_detail_v1(checker,(p2->>'recordId')::uuid)#>>'{record,approved,operation}'='annul'",'approval activates correction and administrative annulment only');
 ok("NOT EXISTS(SELECT 1 FROM jsonb_array_elements(g->'rows') r WHERE r->>'command'<>'review' OR r->>'recordVersion'<>'4' OR r->>'duplicate'<>'false')",'all original proposal ids have individual decision receipts');
 ok("payroll_fixed_review_group_decide_v1(checker,gp,gk)=g||jsonb_build_object('duplicate',true)",'exact replay returns same full receipt');ok("payroll_fixed_review_group_attempt_v1(checker,gk)=g||jsonb_build_object('duplicate',true)",'lost acknowledgement recovery writes nothing');
 reject(call('decide','checker',"gp||jsonb_build_object('decision','reject')"),'IDEMPOTENCY_REUSE','decision cannot change on retry');reject(call('decide','checker',"gp||jsonb_build_object('reason','Otro fundamento documentado')"),'IDEMPOTENCY_REUSE','reason cannot change on retry');reject(call('decide','checker',"jsonb_set(gp,'{items}',jsonb_build_array(gp#>'{items,1}',gp#>'{items,0}'))"),'IDEMPOTENCY_REUSE','order cannot change on retry');reject(call('decide','checker',"jsonb_set(gp,'{items}',jsonb_build_array(gp#>'{items,0}'))"),'IDEMPOTENCY_REUSE','group cannot shrink on retry');
 reject(call('attempt','maker'),'NOT_FOUND','another membership cannot recover receipt');reject(call('attempt','reader'),'CAPABILITY_REQUIRED','revoked approval cannot recover receipt');reject(call('attempt','outsider'),'NOT_FOUND','another scope cannot recover receipt');
 reject(q("UPDATE payroll_fixed_review_group SET request_sha256=repeat('b',64)"),'IMMUTABLE','receipt cannot be edited');reject(q('DELETE FROM payroll_fixed_review_group'),'IMMUTABLE','receipt cannot be deleted');reject(q('TRUNCATE payroll_fixed_review_group'),'IMMUTABLE','receipt cannot be truncated');
 ok("NOT has_table_privilege('municontrol_actions_runtime_app', '"+schema+".payroll_fixed_review_group','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')",'runtime has no direct table access');
 checks.push(`GRANT USAGE ON SCHEMA ${schema} TO municontrol_actions_runtime_app;SET LOCAL ROLE municontrol_actions_runtime_app;g2:=payroll_fixed_review_group_attempt_v1(checker,gk);RESET ROLE;`);
 ok("g2->'rows'=g->'rows' AND g2->>'decision'='approve' AND g2->>'duplicate'='true'",'runtime uses only scoped authenticated facade');
 ok("g#>>'{effects,payrollCalculated}'='false' AND g#>>'{effects,payrollPosted}'='false' AND g#>>'{effects,grhMutation}'='false'",'no salary or GRH effects');
 ok('(SELECT count(*) FROM payroll_fixed_novelty_event)=events_before+2','replays/recovery add no decision');
 const block=`DECLARE gp jsonb;g jsonb;g2 jsonb;p1 jsonb;p2 jsonb;extra jsonb;bad jsonb;gk uuid:=gen_random_uuid();events_before bigint;fault_count bigint;funcs_before text;BEGIN ${checks.join('\n')} RAISE EXCEPTION USING ERRCODE='P1190',MESSAGE='RESTORE_REVIEW_GROUP_QA';EXCEPTION WHEN SQLSTATE 'P1190' THEN NULL;END;`;
 const anchor="next_payload:=np||jsonb_build_object('recordId',nr->>'recordId','expectedVersion',2,'reason','Corrección nativa de ensayo'";assert.equal(base.sql.split(anchor).length,2);
 const report={...base.report,checksPassed:base.report.checksPassed+n,reviewGroupChecksPassed:n,migration119Sha256:createHash('sha256').update(migration).digest('hex')};
 const sql=base.sql.replace(anchor,()=>block+'\n'+anchor).replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report));assert.ok(!/INSERT\s+INTO\s+public\./i.test(sql));return {...base,sql,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const args={};for(const a of process.argv.slice(2)){const m=/^--(expected-major|write-sql)=(.+)$/.exec(a);assert.ok(m&&!Object.hasOwn(args,m[1]));args[m[1]]=m[2];}assert.ok(args['write-sql']);const t=buildFixedReviewGroupsQa({serverMajor:args['expected-major']});fs.mkdirSync(path.dirname(path.resolve(args['write-sql'])),{recursive:true});fs.writeFileSync(args['write-sql'],t.sql,{flag:'wx'});console.log(JSON.stringify({generated:true,databaseExecuted:false,report:t.report}));}catch(e){console.error(e.message);process.exitCode=1;}}
