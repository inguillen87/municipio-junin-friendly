// Existing loopback PG QA only. Actual synthetic adoption plus current reads;
// original 636 checks still run; the entire temporary schema rolls back.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {buildAdoptionHistoryQa} from './verify-employment-adoption-history-sql.mjs';
import {adoptionQaOutputPath} from './verify-employment-adoption-preparation-sql.mjs';
import {NATIVE_ROSTER_V2_SQL} from '../lib/internal-native-roster.js';
import {employees} from '../api/internal-data.js';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
export async function buildCurrentDirectoryQa(options){
 const statementTimeoutSeconds=options.statementTimeoutSeconds??180;assert.ok([180,600].includes(statementTimeoutSeconds),'Statement timeout must be exactly 180 or 600 seconds');
 const base=buildAdoptionHistoryQa(options),{schema,ids}=base,statements=[];let checks=0;
 const migration=fs.readFileSync(new URL('./migrations/135-native-employee-read-projection.sql',import.meta.url),'utf8');
 const relocated=migration.replaceAll('public.',schema+'.').replace(/SET search_path\s*=\s*pg_catalog,public,pg_temp/g,'SET search_path=pg_catalog,'+schema+',public,pg_temp');
 const rosterSql=NATIVE_ROSTER_V2_SQL.replaceAll('public.',schema+'.');
 let directorySql;await employees({query:async statement=>{directorySql=statement;return[{__total:0,__scope:{},__sourceCutoffFrom:null,__sourceCutoffTo:null,__sectors:[],__organizations:[],__agreements:[],contractId:null}];}},{query:{status:'all',page:'2'}},{database:'synthetic_grh',companyId:101,tenantId:ids.tenant,lifecycleContext:base.qaFoundation.actors.maker},{nativeOnly:true});
 assert.ok(directorySql);directorySql=directorySql.replaceAll('public.',schema+'.');
 const ok=(expression,label)=>{statements.push('PERFORM qa_assert(('+expression+'),'+q(label)+');checks:=checks+1;');checks++;};
 const read=(actor='maker',target=q(ids.targetContract)+'::uuid')=>'native_employee_read_projection_v1('+actor+','+target+')';
 const snapshot=(actor='maker')=>'native_employee_directory_snapshot_v1('+actor+')';
 const reject=(statement,error,label)=>ok('qa_rejects('+q(statement)+','+q(error)+')',label);
 const mutate=(sql,fn)=>{statements.push('BEGIN '+sql);fn();statements.push("RAISE EXCEPTION USING ERRCODE='P1351';EXCEPTION WHEN SQLSTATE 'P1351' THEN NULL;END;");};
 statements.push(`DECLARE own_proof jsonb;own_second jsonb;own_snapshot jsonb;own_rows jsonb;own_all_rows jsonb;own_exact jsonb;own_general jsonb;own_general_pattern text;own_expected_ids jsonb;own_actual_ids jsonb;own_exact_legajo text;own_probe_legajo text;own_directory jsonb;own_context jsonb;own_fresh uuid;BEGIN
 -- Match the canonical quality column declared by 002; the earlier writer
 -- fixture omits it. Existing identity_state stays intact, rollback schema only.
 ALTER TABLE person_identity ADD COLUMN data_quality_score numeric(5,2);
 EXECUTE ${q(relocated)};
 own_context:=native_employee_context_v1(maker);own_proof:=${read()};own_snapshot:=${snapshot()};
 SELECT c.id INTO STRICT own_fresh FROM employment_contract c JOIN native_employee_registration r ON r.contract_id=c.id
 WHERE c.source_system='MUNICONTROL' AND c.tenant_id=(own_context->>'tenantId')::uuid AND c.legacy_company_id=(own_context->>'sourceCompanyId')::bigint
 AND r.source_binding_id=(own_context->>'sourceBindingId')::uuid AND NOT EXISTS(SELECT 1 FROM employment_adoption_application a WHERE a.contract_id=c.id) ORDER BY c.id LIMIT 1;`);
 ok(`own_proof->>'version'='native-employee-read.v1' AND (SELECT count(*) FROM jsonb_object_keys(own_proof))=3 AND (SELECT count(*) FROM jsonb_object_keys(own_proof->'contract'))=13`,'current proof is closed and has no sealed nominal evidence');
 ok(`own_proof#>>'{contract,recordKind}'='adopted' AND own_proof#>>'{contract,status}'='unknown' AND own_proof#>'{contract,startDate}'='null'::jsonb`,'adopted missing dates and unknown state remain visible without inferred activation');
 ok(`own_proof#>>'{contract,id}'=${q(ids.targetContract)} AND own_proof#>>'{contract,personId}'=${q(ids.targetPerson)} AND own_proof#>>'{scope,bindingId}'=${q(ids.binding)}`,'existing contract, person and certified binding are preserved');
 ok(`own_proof#>>'{contract,readVersion}'=(SELECT encode(sha256(convert_to((to_jsonb(c)-ARRAY['created_at','updated_at'])::text,'UTF8')),'hex') FROM employment_contract c WHERE c.id=${q(ids.targetContract)}::uuid)`,'current proof agrees with the canonical detail fingerprint');
 statements.push(`own_second:=${read('maker',q(ids.makerContract)+'::uuid')};`);
 ok(`own_second#>>'{contract,startDate}'='1888-01-01' AND own_second#>>'{contract,status}'='active'`,'old civil dates are preserved in current reads without changing new hire criteria');
 statements.push(`own_second:=${read('maker','own_fresh')};`);
 ok(`own_second#>>'{contract,recordKind}'='hire' AND own_second#>>'{contract,id}'=own_fresh::text AND own_second#>>'{contract,startDate}' IS NOT NULL`,'fresh hires still pass the original authenticated lifecycle projection');
 ok(`own_snapshot->>'version'='native-directory-snapshot.v1' AND own_snapshot->>'imported'='0' AND (own_snapshot->>'total')::int>=60 AND length(own_snapshot->>'token')=64`,'whole own census works after actual adoption of every imported contract');
 ok(`own_snapshot=${snapshot()}`,'an unchanged current census yields an unchanged verification token');
 statements.push(`EXECUTE ${q(rosterSql)} INTO own_rows USING maker,'all','','','','','',10001;`);
 ok(`own_rows->>'version'='native-roster.v2' AND own_rows->>'total'=own_snapshot->>'total' AND jsonb_array_length(own_rows->'rows')=(own_rows->>'total')::int AND jsonb_array_length(own_rows->'rows')>50`,'actual v2 roster returns the complete multi-page cohort');
 ok(`(SELECT count(*) FROM jsonb_array_elements(own_rows->'rows') r WHERE r->>'recordKind'='adopted')=(SELECT count(*) FROM employment_adoption_application)`,'every adopted contract is included and distinguished from fresh hires');
 ok(`EXISTS(SELECT 1 FROM jsonb_array_elements(own_rows->'rows') r WHERE r->>'recordKind'='hire') AND EXISTS(SELECT 1 FROM jsonb_array_elements(own_rows->'rows') r WHERE r->>'status'='unknown' AND r->'startDate'='null'::jsonb)`,'fresh and incomplete adopted facts coexist in the same verified roster');
 // Compare exact reads with the already audited complete cohort, never with a shortened UI page.
 statements.push(`own_all_rows:=own_rows;
 SELECT r->>'legajo' INTO STRICT own_exact_legajo FROM jsonb_array_elements(own_all_rows->'rows') r WHERE r->>'contractId'=${q(ids.targetContract)};`);
 ok(`own_exact_legajo IS NOT NULL AND own_exact_legajo<>''`,'exact legajo is selected from the audited existing contract in the whole roster');
 // Nonempty general search remains an escaped ILIKE over all four documented fields.
 statements.push(`own_general_pattern:='%'||replace(replace(replace(own_exact_legajo,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%';
 SELECT COALESCE(jsonb_agg(r->>'contractId' ORDER BY r->>'contractId'),'[]'::jsonb) INTO own_expected_ids
 FROM jsonb_array_elements(own_all_rows->'rows') r
 WHERE r->>'name' ILIKE own_general_pattern ESCAPE chr(92) OR r->>'legajo' ILIKE own_general_pattern ESCAPE chr(92) OR r->>'dni' ILIKE own_general_pattern ESCAPE chr(92) OR r->>'cuil' ILIKE own_general_pattern ESCAPE chr(92);
 EXECUTE ${q(rosterSql)} INTO own_general USING maker,'all','','','','',own_general_pattern,10001;
 SELECT COALESCE(jsonb_agg(r->>'contractId' ORDER BY r->>'contractId'),'[]'::jsonb) INTO own_actual_ids FROM jsonb_array_elements(own_general->'rows') r;`);
 ok(`own_general->>'version'='native-roster.v2' AND own_general->'scope'=own_all_rows->'scope' AND own_general->'facets'=own_all_rows->'facets' AND (own_general->>'total')::int=jsonb_array_length(own_expected_ids) AND jsonb_array_length(own_general->'rows')=jsonb_array_length(own_expected_ids)`,'nonempty general V2 search preserves whole-scope facets and the complete expected counts');
 ok(`own_actual_ids=own_expected_ids AND own_expected_ids @> jsonb_build_array(${q(ids.targetContract)})`,'nonempty general V2 search retains the original four-field ILIKE contract-ID multiset and the selected existing contract');
 for(const prefix of['','0','A/']){
  statements.push(`own_probe_legajo:=${q(prefix)}||own_exact_legajo;
 SELECT COALESCE(jsonb_agg(r->>'contractId' ORDER BY r->>'contractId'),'[]'::jsonb) INTO own_expected_ids
 FROM jsonb_array_elements(own_all_rows->'rows') r WHERE (r->>'legajo') COLLATE "C"=own_probe_legajo COLLATE "C";
 EXECUTE ${q(rosterSql)} INTO own_exact USING maker,'all','','','','','legajo:'||own_probe_legajo,10001;
 SELECT COALESCE(jsonb_agg(r->>'contractId' ORDER BY r->>'contractId'),'[]'::jsonb) INTO own_actual_ids FROM jsonb_array_elements(own_exact->'rows') r;`);
  ok(`own_exact->>'version'='native-roster.v2' AND own_exact->'scope'=own_all_rows->'scope' AND own_exact->'facets'=own_all_rows->'facets' AND (own_exact->>'total')::int=jsonb_array_length(own_expected_ids) AND jsonb_array_length(own_exact->'rows')=jsonb_array_length(own_expected_ids)`,'exact '+(prefix||'existing')+' legajo keeps scope, whole facets and every matching contract count');
  ok(`own_actual_ids=own_expected_ids AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(own_exact->'rows') r WHERE ((r->>'legajo') COLLATE "C") IS DISTINCT FROM (own_probe_legajo COLLATE "C"))`,'exact '+(prefix||'existing')+' legajo returns the full original contract-ID multiset without normalization');
  ok(prefix?`own_expected_ids='[]'::jsonb`:`jsonb_array_length(own_expected_ids)>0`,'fixture '+(prefix||'existing')+' legajo is '+(prefix?'an explicit absent probe, not positive opaque/leading-zero coverage':'present in the audited cohort'));
 }
 statements.push(`EXECUTE ${q(rosterSql)} INTO own_rows USING maker,'all','','','','','',10001;`);
 ok(`own_rows->'rows'=own_all_rows->'rows' AND own_rows->'scope'=own_all_rows->'scope' AND own_rows->'counts'=own_all_rows->'counts' AND own_rows->'facets'=own_all_rows->'facets' AND own_rows->'total'=own_all_rows->'total' AND own_rows->'people'=own_all_rows->'people'`,'exact probes preserve the complete general roster, original counts, people and facets');
 statements.push(`EXECUTE ${q(rosterSql)} INTO own_rows USING maker,'unknown','','','','','',10001;`);
 ok(`(own_rows->>'total')::int=(own_rows#>>'{counts,unknown}')::int AND (own_rows->>'total')::int>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(own_rows->'rows') r WHERE r->>'status'<>'unknown')`,'unknown filter is complete, distinct and never classified as active');
 statements.push(`EXECUTE ${q(rosterSql)} INTO own_rows USING maker,'all','','','','','%NO_SYNTHETIC_MATCH%',10001;`);
 ok(`own_rows->>'total'='0' AND own_rows->'rows'='[]'::jsonb AND jsonb_array_length(own_rows#>'{facets,agreement}')>0`,'zero filtered rows do not truncate source-wide facets');
 statements.push(`EXECUTE ${q('SELECT jsonb_agg(to_jsonb(native_directory_record)) FROM ('+directorySql+') native_directory_record')} INTO own_directory USING own_context->>'sourceDatabase',(own_context->>'sourceCompanyId')::bigint,own_context->>'tenantId',maker,25,25;`);
 ok(`own_directory#>>'{0,__total}'=own_snapshot->>'total' AND jsonb_array_length(own_directory)=25 AND own_directory#>>'{0,__scope,totalContracts}'=own_snapshot->>'total'`,'actual main directory retains whole cohort totals and the second page');
 ok(`NOT EXISTS(SELECT 1 FROM jsonb_array_elements(own_directory) r WHERE r->>'recordOrigin'<>'MUNICONTROL') AND own_directory#>'{0,__sourceCutoffFrom}'='null'::jsonb`,'own directory has municipal provenance and does not invent an imported cutoff');
 mutate(`UPDATE grh_curated_source_version SET manifest_sha256=repeat('f',64);own_second:=${read()};`,()=>ok(`own_second=own_proof AND ${snapshot()}=own_snapshot`,'current ownership reads do not depend on a changed historical cut; 134 remains separately guarded'));
 statements.push(`SET LOCAL ROLE municontrol_actions_runtime_app;own_second:=${read(j(base.qaFoundation.actors.reader))};RESET ROLE;`);
 ok(`own_second->'contract'=own_proof->'contract' AND NOT has_function_privilege('municontrol_actions_runtime_app','employment_adoption_decide_v1(jsonb,jsonb,uuid)','EXECUTE')`,'runtime reads with session authority and cannot execute the private adoption writer');
 ok(`NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid IN('native_employee_read_projection_v1(jsonb,uuid)'::regprocedure,'native_employee_directory_snapshot_v1(jsonb)'::regprocedure) AND a.grantee=0)`,'neither read RPC is executable by public');
 reject(`SELECT native_employee_directory_snapshot_v1(${j({...base.qaFoundation.actors.maker,actorSessionVersion:999999})})`,'ACTION_SESSION_INVALID','authoritative stale sessions cannot read the cohort');
 reject(`SELECT native_employee_read_projection_v1(${j(base.qaFoundation.actors.outsider)},${q(ids.targetContract)}::uuid)`,'NATIVE_EMPLOYEE_READ_NOT_FOUND','foreign tenant cannot read a municipal contract');
 mutate(`DELETE FROM capabilities WHERE membership_id=(maker->>'membershipId')::uuid AND capability_key='workforce.employee.read';`,()=>reject(`SELECT native_employee_directory_snapshot_v1(${j(base.qaFoundation.actors.maker)})`,'NATIVE_EMPLOYEE_FORBIDDEN','current permission revocation blocks the cohort'));
 ok(`own_snapshot=${snapshot()}`,'all reads and reverted rejection fixtures preserve the exact municipal cohort');
 statements.push('END;');
 const anchor="RAISE NOTICE 'QA_ADOPTION_COMPLETE contracts=% identities_created=0',jsonb_array_length(declared_rows);";assert.equal(base.sql.split(anchor).length,2);
 const report={...base.report,checksPassed:base.report.checksPassed+checks,nativeCurrentDirectoryChecksPassed:checks,limitations:[...base.report.limitations,'135 current census read-only draft; no municipal installation, payroll entitlement, lifecycle writer adaptation or physical clock acceptance.','Exact-legajo probes use the existing audited SQL cohort without changing rows: positive existing-legajo matching includes all same-legajo contracts if present; A/ and leading-zero probes are absent here, not positive preservation coverage. Roster queries retain the existing owner SQL protocol with actual maker context; the existing runtime RPC check remains separate.']};
 const sql=base.sql.replace(anchor,()=>statements.join('\n')+'\n'+anchor).replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report));
 const timeoutAnchor=" SET LOCAL statement_timeout='180s';";assert.equal(sql.split(timeoutAnchor).length,2,'One canonical statement-timeout header is required');
 return{...base,sql:statementTimeoutSeconds===180?sql:sql.replace(timeoutAnchor," SET LOCAL statement_timeout='600s';"),report,statementTimeoutSeconds};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args={};for(const a of process.argv.slice(2)){const m=/^--(expected-major|write-sql|statement-timeout-seconds)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
 if(args['statement-timeout-seconds']!==undefined)assert.match(args['statement-timeout-seconds'],/^(180|600)$/,'Statement timeout must be exactly 180 or 600 seconds');
 const file=adoptionQaOutputPath(args['write-sql']),qa=await buildCurrentDirectoryQa({serverMajor:Number(args['expected-major']),statementTimeoutSeconds:args['statement-timeout-seconds']===undefined?undefined:Number(args['statement-timeout-seconds'])});fs.writeFileSync(file,qa.sql,{flag:'wx'});console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:qa.report.checksPassed,currentDirectoryChecksPlanned:qa.report.nativeCurrentDirectoryChecksPassed,statementTimeoutSeconds:qa.statementTimeoutSeconds}));
}
