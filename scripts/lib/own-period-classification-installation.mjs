// Source-pinned code generation only. This module never opens a connection,
// executes SQL, reads an environment, or prepares municipal payroll records.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {buildOwnPayrollAdministrativeOperatorInstallation} from './own-payroll-administrative-operator-installation.mjs';
import {buildOwnJurisdictionInstallation} from './own-payroll-jurisdiction-installation.mjs';
import {buildAdoptionSourceStreamingInstallation} from './adoption-source-streaming-installation.mjs';
import {READINESS_PRIOR,READINESS_FINAL,CAPTURE_PRIOR,CAPTURE_FINAL} from './working-time-adoption-readiness.mjs';
import {CATALOG_STORAGE_AFTER_SHA256,CATALOG_STORAGE_SQL_SHA256} from './catalog-storage-capacity-installation.mjs';

export const OWN_PERIOD_CLASSIFICATION_MIGRATION='scripts/migrations/177-own-period-classification.sql';
export const OWN_PERIOD_CLASSIFICATION_SQL_SHA256='22a333a1d1423d717fefc70a157b95969bcb953cacc00957f4d8bc315444e28c';
const table='own_period_classification_event',prefix='municontrol_period_classification.';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",lf=v=>v.replace(/\r\n?/g,'\n'),hash=v=>createHash('sha256').update(v).digest('hex');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'PERIOD_CLASSIFICATION_SOURCE_ANCHOR: '+a.slice(0,90));return s.replace(a,()=>b);};
const get=(s,name)=>{const rows=splitPostgresStatements(s).map(x=>x.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim()).filter(x=>new RegExp('^CREATE (?:OR REPLACE )?FUNCTION public\\.'+name+'\\(').test(x));assert.equal(rows.length,1,'PERIOD_CLASSIFICATION_SOURCE_FUNCTION: '+name);return rows[0];};
const normalized=s=>{const at=s.search(/\bAS\s+\$/);assert.ok(at>=0);return s.slice(0,at).replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp').replace(/SET (?:\"TimeZone\"|timezone) TO 'UTC'/i,"SET timezone='UTC'").replace(/\s+/g,' ')+s.slice(at);};
const facadeNames=new Set(['own_period_classification_bootstrap_v1','own_period_classification_detail_v1','own_period_classification_attempt_v1','own_period_classification_command_v1']);
const pin=(s,runtime=false)=>({...ownInstallationFunctionPin(normalized(s)),runtime});
const SOURCE_PINS=Object.freeze({
 'scripts/migrations/125-own-payroll-close.sql':'443127dd55b9be5f37da47af303fcdd599b4d5dc0aad0a319a18253f8f139af5',
 'scripts/migrations/141-adopted-own-payroll-close.sql':'96cd6fd2a2f81b023a8481b89b0a8fb7bd0971011fcef49498e93f4a9bab82a3',
 'scripts/migrations/143-own-payroll-jurisdiction-snapshot.sql':'1486014334a5e70d8c1bb7dbb4025cdddfb3a741dc299d51cfc2803a938aa5fe',
 'scripts/lib/own-payroll-jurisdiction-installation.mjs':'d8eb592da960a5b9b988bc533faf0b1cf42f59974bb05ece67962e3bf94f4e03',
 'scripts/lib/salary-auxiliary-namespace-installation.mjs':'6d492a4c56adba6a78242604f27b86ba18067359c1b28dc39879e50d43eed9b9',
 'scripts/lib/working-time-adoption-readiness.mjs':'e529bd577b9b668cd2c23ed7e9eb0da8701e43aef2042cf48029ca94e0e2ae5d',
 'scripts/lib/catalog-storage-capacity-installation.mjs':'32876e07f7ca4810a054b28356a942faa22d5897c50d95e1fbf5d49b53073ecc',
 'scripts/migrations/168-catalog-storage-capacity.sql':CATALOG_STORAGE_SQL_SHA256,
 'scripts/lib/adoption-source-streaming-installation.mjs':'ce28753a16bb471cdd75cfa2d620a10d85ae669f59e82ab943a8d57dd579345a',
 'scripts/lib/adoption-administrative-identity-installation.mjs':'117ec0b92d3974da2a82a2154709413b79d56398bf042e86153a71eab878c022',
 'scripts/lib/operational-contract-adoption-installation.mjs':'34d02464f43eb2cd3964ab073e080f9ff843d2b21c225b76e1e20ea0a09f6234',
 'scripts/migrations/165-working-time-adoption-readiness.sql':'d1e6a4c16eb875f5e8d9b47d029a5664f923a676e537c0cb54ddb80da578fe48',
});
const capacityPin=Object.freeze({name:'native_employment_catalog_capacity_v1',signature:'public.native_employment_catalog_capacity_v1(integer)',sha256:CATALOG_STORAGE_AFTER_SHA256,argNames:['extra_bytes'],defaults:'',resultType:'void',language:'plpgsql',returnsSet:false,strict:false,definer:true,volatility:'v',config:['search_path=pg_catalog, public, pg_temp'],runtime:false});

function priorRoster(source){
 let s=get(source,'own_close_roster_v1');assert.equal(pin(s).sha256,'63dcc6cb15f921d5c36ef9510ad9bceb4b4160d8cb69fcf51c1d0ee5ec750996');
 const old='public.native_employment_lifecycle_range_v1(ctx,reg.contract_id,',replacement="public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),reg.contract_id,";
 assert.equal(s.split(old).length,3);s=s.replaceAll(old,replacement);
 s=once(s,'public.payroll_fixed_registry_subject_by_contract_v1','public.payroll_fixed_registry_subject_v2');
 s=once(s,'public.native_employment_lifecycle_review IN SHARE MODE NOWAIT;','public.native_employment_lifecycle_review,public.employment_adoption_application,public.employment_adoption_decision,public.employment_adoption_proposal IN SHARE MODE NOWAIT;');
 s=once(s,"coalesce(reg.legacy_legajo,'')!~'^[0-9]{1,9}$'","reg.legacy_legajo IS NULL OR length(reg.legacy_legajo) NOT BETWEEN 1 AND 64 OR reg.legacy_legajo~'[[:cntrl:]]' OR reg.legacy_legajo~E'[\\u0080-\\u009f]'");
 assert.equal(pin(s).sha256,'11e702141473991bbbc47a1bc12086fab3bc870c70361f001f6d32662dff8a18','PERIOD_CLASSIFICATION_ADOPTED_ROSTER_CHANGED');
 // Published participation keeps genuine partial employment available only
 // with its independently approved programme facts; retain that exact guard.
 s=once(s,"last_date,true) THEN RAISE EXCEPTION 'OWN_RUN_PRORATION_REQUIRED';END IF;","last_date,true) AND public.own_program_current_v1(ctx)#>>'{definition,periodParticipation,version}' IS DISTINCT FROM 'own-period-participation.v1' THEN RAISE EXCEPTION 'OWN_RUN_PRORATION_REQUIRED';END IF;");
 assert.equal(pin(s).sha256,'aa89d27c43d147d9150f141522350445d3ef6e48203f88b63531992b3945d84d','PERIOD_CLASSIFICATION_PUBLISHED_ROSTER_CHANGED');
 return s;
}

export function deriveOwnPeriodClassificationConsumers({capture,roster,detail,jurisdictions,ready}){
 assert.equal(pin(capture,true).sha256,'ab89246306b8b5b337b40b8508f0d36e4890a5f6c5aef3ea997cff6e396e3af3','PERIOD_CLASSIFICATION_CAPTURE_BASE_CHANGED');
 assert.equal(pin(ready).sha256,READINESS_FINAL,'PERIOD_CLASSIFICATION_READINESS_BASE_CHANGED');
 let nextCapture=once(capture,'DECLARE condition_facts jsonb;','DECLARE classification_value jsonb;classifications jsonb:=\'[]\';condition_facts jsonb;');
 nextCapture=once(nextCapture,"AND(kind='all' OR kind='contracts' AND body#>'{selection,values}' ? ec.id::text OR kind='agreements' AND body#>'{selection,values}' ? ec.agreement_code OR kind='departments' AND body#>'{selection,values}' ? ec.sector_source_id)","AND(kind<>'contracts' OR body#>'{selection,values}' ? ec.id::text)");
 // The complete eligible population must be classified before group filtering.
 // Do not silently exclude historical members by their current group code.
 const eligible="  IF NOT public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),reg.employment_contract_id,first_date,last_date,false) THEN IF kind='contracts' THEN RAISE EXCEPTION 'OWN_RUN_SELECTION_INVALID';END IF;CONTINUE;END IF;";
 nextCapture=once(nextCapture,eligible,eligible+"\n  classification_value:=public.own_period_classification_resolve_v1(ctx,reg.employment_contract_id,body->>'period');\n  IF kind IN('agreements','departments') AND NOT body#>'{selection,values}' ? (classification_value#>>ARRAY['definition',CASE kind WHEN 'agreements' THEN 'agreementCode' ELSE 'sectorCode' END]) THEN CONTINUE;END IF;");
 const captureHistory="  IF (reg.created_at AT TIME ZONE 'America/Argentina/Mendoza')::date>last_date OR EXISTS(SELECT 1 FROM public.native_employment_change_review r WHERE r.contract_id=reg.employment_contract_id AND r.decision='approve' AND (r.reviewed_at AT TIME ZONE 'America/Argentina/Mendoza')::date>=first_date) THEN RAISE EXCEPTION 'OWN_RUN_HISTORY_REQUIRED';END IF;";
 nextCapture=once(nextCapture,captureHistory,'  -- The shared resolver above retains this guard unless explicit facts were approved.');
 for(const [old,field]of[['reg.agreement_code','agreementCode'],['reg.category_code','categoryCode'],['reg.sector_source_id','sectorCode']]){assert.ok(nextCapture.includes(old));nextCapture=nextCapture.replaceAll(old,"(classification_value#>>'{definition,"+field+"}')");}
 nextCapture=once(nextCapture,'  IF cardinality(ids)>10000 THEN', "  classifications:=classifications||jsonb_build_array(classification_value||jsonb_build_object('identityToken',s->>'identityToken'));\n  IF cardinality(ids)>10000 THEN");
 nextCapture=once(nextCapture,'public.payroll_fixed_novelty_event IN SHARE MODE NOWAIT;','public.payroll_fixed_novelty_event,public.own_period_classification_event,public.employment_adoption_seal IN SHARE MODE NOWAIT;');
 const inventory=/[ \t]*inventory:=inventory\|\|jsonb_build_object\('jurisdictions',[^\n]*\n/.exec(nextCapture);assert.ok(inventory);assert.equal(nextCapture.split(inventory[0]).length,2);
 const frozenInventory="  inventory:=inventory||jsonb_build_object('periodClassifications',jsonb_build_object('version','own-period-classification-capture.v1','complete',true,'total',cardinality(ids),'rows',classifications),'jurisdictions',jsonb_build_object('version','own-run-jurisdictions.v1','complete',true,'total',cardinality(ids),'rows',(SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',r->>'contractId','employeeNumber',e->>'employeeNumber','registrationId',r->>'registrationId','identityToken',r->>'identityToken','jurisdictionCode',r#>'{definition,jurisdictionCode}') ORDER BY r->>'contractId' COLLATE \"C\"),'[]') FROM jsonb_array_elements(classifications) r JOIN jsonb_array_elements(employees) e ON e->>'contractId'=r->>'contractId')));\n";
 nextCapture=once(nextCapture,inventory[0],frozenInventory);
 nextCapture=once(nextCapture,"'departmentSource','employment_contract.sector_source_id'","'departmentSource','sourceInventory.periodClassifications.rows[].definition.sectorCode'");

 let nextRoster=once(roster,'DECLARE reg record;subject jsonb;','DECLARE classification_value jsonb;frozen_group jsonb;frozen_employee jsonb;frozen_groups jsonb;reg record;subject jsonb;');
 nextRoster=once(nextRoster,'public.employment_adoption_proposal IN SHARE MODE NOWAIT;','public.employment_adoption_proposal,public.employment_adoption_seal,public.own_period_classification_event IN SHARE MODE NOWAIT;');
 nextRoster=once(nextRoster,' FOR reg IN SELECT', " frozen_groups:=CASE WHEN ctx->>'ownCloseLiquidationType' IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') THEN public.own_close_active_v1(ctx,period_value,ctx->>'ownCloseLiquidationType') ELSE '[]'::jsonb END;\n IF EXISTS(SELECT 1 FROM public.own_payroll_close_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.period=period_value AND e.liquidation_type=ctx->>'ownCloseLiquidationType' AND e.command='close' AND NOT EXISTS(SELECT 1 FROM public.own_payroll_close_event r WHERE r.tenant_id=e.tenant_id AND r.source_binding_id=e.source_binding_id AND r.group_id=e.id AND r.command='reopen') AND e.snapshot_sha256 IS DISTINCT FROM public.own_run_hash_v1(e.snapshot)) THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;\n FOR frozen_group IN SELECT value FROM jsonb_array_elements(frozen_groups) LOOP\n  FOR frozen_employee IN SELECT value FROM jsonb_array_elements(frozen_group#>'{snapshot,employees}') LOOP\n   IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows_value) r WHERE r->'contractId'=frozen_employee->'contractId') THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;\n   rows_value:=rows_value||jsonb_build_array(jsonb_build_object('contractId',frozen_employee->'contractId','employeeNumber',frozen_employee->'employeeNumber','agreementCode',frozen_employee->'agreementCode','departmentCode',frozen_employee->'departmentCode'));\n   IF jsonb_array_length(rows_value)>10000 THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;\n  END LOOP;\n END LOOP;\n FOR reg IN SELECT");
 nextRoster=once(nextRoster,"  IF NOT public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),reg.contract_id,first_date,last_date,false)", "  IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows_value) r WHERE r->>'contractId'=reg.contract_id::text) THEN CONTINUE;END IF;\n  IF NOT public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),reg.contract_id,first_date,last_date,false)");
 const rosterHistory="  IF(reg.created_at AT TIME ZONE 'America/Argentina/Mendoza')::date>last_date OR EXISTS(SELECT 1 FROM public.native_employment_change_review r WHERE r.contract_id=reg.contract_id AND r.decision='approve' AND(r.reviewed_at AT TIME ZONE 'America/Argentina/Mendoza')::date>=first_date) THEN RAISE EXCEPTION 'OWN_RUN_HISTORY_REQUIRED';END IF;";
 nextRoster=once(nextRoster,rosterHistory,'  classification_value:=public.own_period_classification_resolve_v1(ctx,reg.contract_id,period_value);');
 for(const [old,field]of[['reg.agreement_code','agreementCode'],['reg.sector_source_id','sectorCode']]){assert.ok(nextRoster.includes(old));nextRoster=nextRoster.replaceAll(old,"(classification_value#>>'{definition,"+field+"}')");}
 nextRoster=once(nextRoster,' END LOOP;RETURN rows_value;', " END LOOP;RETURN(SELECT coalesce(jsonb_agg(r ORDER BY r->>'contractId' COLLATE \"C\"),'[]') FROM jsonb_array_elements(rows_value) r);");
 let nextDetail=once(detail,'roster:=public.own_close_roster_v1(ctx,period_value);',"roster:=public.own_close_roster_v1(ctx||jsonb_build_object('ownCloseLiquidationType',type_value),period_value);");
 const groupLookup="  SELECT g.value INTO group_value FROM jsonb_array_elements(closed) g WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(g.value#>'{snapshot,employees}') x WHERE x.value->>'contractId'=person->>'contractId');";
 nextDetail=once(nextDetail,groupLookup,'');
 const decisionLookup="  IF(SELECT count(*) FROM jsonb_array_elements(current_rows) x WHERE x.value->>'contractId'=person->>'contractId' AND x.value->>'state'='confirmed')>1 THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;\n  SELECT x.value INTO decision FROM jsonb_array_elements(current_rows) x WHERE x.value->>'contractId'=person->>'contractId' AND x.value->>'state'='confirmed';";
 nextDetail=once(nextDetail,decisionLookup,groupLookup+"\n  IF group_value IS NULL THEN\n"+decisionLookup+"\n  ELSE SELECT x.value INTO decision FROM jsonb_array_elements(group_value#>'{snapshot,employees}') x WHERE x.value->>'contractId'=person->>'contractId';END IF;");
 nextDetail=once(nextDetail,"  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.input->'employees')", "  IF group_value IS NULL THEN PERFORM public.own_period_classification_close_match_v1(ctx,c,(person->>'contractId')::uuid,period_value);END IF;\n  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.input->'employees')");

 let nextJurisdictions=once(jurisdictions,"row_value jsonb;employee jsonb;","row_value jsonb;employee jsonb;classification_block jsonb;classification_row jsonb;");
 nextJurisdictions=once(nextJurisdictions," IF NOT coalesce(inventory ? 'jurisdictions',false) THEN RETURN 'null'::jsonb;END IF;"," IF NOT coalesce(inventory ? 'jurisdictions',false) THEN IF coalesce(inventory ? 'periodClassifications',false) THEN RAISE EXCEPTION 'OWN_CLOSE_JURISDICTION_INVALID';END IF;RETURN 'null'::jsonb;END IF;");
 nextJurisdictions=once(nextJurisdictions," value:=inventory->'jurisdictions';"," value:=inventory->'jurisdictions';classification_block:=inventory->'periodClassifications';\n IF classification_block IS NOT NULL AND(public.own_program_exact_v1(classification_block,ARRAY['version','complete','total','rows']) IS NOT TRUE OR classification_block->>'version' IS DISTINCT FROM 'own-period-classification-capture.v1' OR classification_block->'complete' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(classification_block->'rows') IS DISTINCT FROM 'array') THEN RAISE EXCEPTION 'OWN_CLOSE_JURISDICTION_INVALID';END IF;");
 nextJurisdictions=once(nextJurisdictions,' FOR row_value IN SELECT', " IF classification_block IS NOT NULL AND(classification_block->'total' IS DISTINCT FROM to_jsonb(n) OR jsonb_array_length(classification_block->'rows')<>n OR(SELECT count(DISTINCT r->>'contractId') FROM jsonb_array_elements(classification_block->'rows') r)<>n) THEN RAISE EXCEPTION 'OWN_CLOSE_JURISDICTION_INVALID';END IF;\n FOR row_value IN SELECT");
 nextJurisdictions=once(nextJurisdictions,'  registrations:=array_append(registrations,', "  classification_row:=NULL;\n  IF classification_block IS NOT NULL THEN\n   SELECT r INTO classification_row FROM jsonb_array_elements(classification_block->'rows') r WHERE r->'contractId'=row_value->'contractId';\n   PERFORM public.own_period_classification_capture_row_v1(classification_row,employee,capture#>>'{body,period}');\n   IF classification_row->'registrationId' IS DISTINCT FROM row_value->'registrationId' OR classification_row#>'{definition,jurisdictionCode}' IS DISTINCT FROM row_value->'jurisdictionCode' THEN RAISE EXCEPTION 'OWN_CLOSE_JURISDICTION_INVALID';END IF;\n  END IF;\n  registrations:=array_append(registrations,");
 nextJurisdictions=once(nextJurisdictions,"'basis','captured_own_registration'","'basis',CASE WHEN classification_row->>'basis'='approved_own_period_classification' THEN 'captured_own_period_classification' ELSE 'captured_own_registration' END");
 let nextReady=ready;
 for(const [before,after]of[[CAPTURE_FINAL,pin(nextCapture,true).sha256],[pin(roster).sha256,pin(nextRoster).sha256],[pin(jurisdictions).sha256,pin(nextJurisdictions).sha256]]){
  assert.ok(nextReady.includes(before),'PERIOD_CLASSIFICATION_READY_PIN_MISSING');nextReady=nextReady.replaceAll(before,after);
 }
 const originals=[capture,roster,detail,jurisdictions,ready],changed=[nextCapture,nextRoster,nextDetail,nextJurisdictions,nextReady].map(s=>s.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION '));
 originals.forEach((s,i)=>assert.deepEqual({...pin(s,i===0||i===2),sha256:null},{...pin(changed[i],i===0||i===2),sha256:null},'PERIOD_CLASSIFICATION_PRIOR_METADATA_CHANGED'));
 return{originals,changed};
}

const columns=[
 ['id','uuid',true,'gen_random_uuid()'],['tenant_id','uuid'],['source_binding_id','uuid'],['contract_id','uuid'],['period_month','date'],['proposal_id','uuid',false],['command','text'],['body','jsonb'],['base_definition','jsonb'],['source_snapshot','jsonb'],['revision','integer'],['actor_membership_id','uuid'],['actor_person_id','uuid'],['actor_email','text'],['actor_session_id','uuid'],['actor_session_version','integer'],['release_sha','text'],['actor_label','text'],['request_key','uuid'],['request_sha256','text'],['receipt','jsonb'],['recorded_at','timestamp with time zone',true,'clock_timestamp()'],
].map(([name,type,required=true,defaultValue=null])=>[name,type,required,defaultValue]);
const foreigns=[
 [['tenant_id'],'public.platform_tenant',['id']],[['contract_id'],'public.employment_contract',['id']],[['proposal_id'],'public.'+table,['id']],[['actor_person_id'],'public.person_identity',['id']],[['actor_session_id'],'public.tenant_identity_session',['id']],[['tenant_id','source_binding_id'],'public.platform_tenant_source_binding',['tenant_id','id']],[['actor_membership_id','tenant_id'],'public.tenant_membership',['id','tenant_id']],
];
const checks=[
 "CHECK ((EXTRACT(day FROM period_month) = (1)::numeric) AND ((period_month >= '1900-01-01'::date) AND (period_month <= '2099-12-01'::date)))",
 "CHECK (command = ANY (ARRAY['propose'::text, 'approve'::text, 'reject'::text]))",
 "CHECK ((jsonb_typeof(body) = 'object'::text) AND (octet_length(body::text) <= 32768))",
 "CHECK (jsonb_typeof(base_definition) = ANY (ARRAY['null'::text, 'object'::text]))",
 "CHECK ((jsonb_typeof(source_snapshot) = 'object'::text) AND (octet_length(source_snapshot::text) <= 1048576))",
 'CHECK ((revision >= 0) AND (revision <= 1000))','CHECK (actor_email = lower(btrim(actor_email)))','CHECK (actor_session_version > 0)',
 "CHECK (release_sha ~ '^[a-f0-9]{40}$'::text)","CHECK (request_key::text ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'::text)","CHECK (request_sha256 ~ '^[a-f0-9]{64}$'::text)",
 "CHECK (jsonb_typeof(receipt) = 'object'::text)","CHECK ((command = 'propose'::text) = (proposal_id IS NULL))",
].map(s=>s.replace(/[\s()]/g,'')).sort();
const uniques=[['p',['id']],['u',['tenant_id','source_binding_id','actor_membership_id','request_key']],['u',['proposal_id']]];
const indexes=[
 [true,true,['id'],null],[true,false,['proposal_id'],null],[true,false,['tenant_id','source_binding_id','actor_membership_id','request_key'],null],
 [true,false,['tenant_id','source_binding_id','contract_id','period_month','revision'],"command='approve'::text"],[false,false,['tenant_id','source_binding_id','contract_id','period_month'],null],
];
export function ownPeriodClassificationTableCheck(){
 const object="to_regclass('public."+table+"')";
 return "DO $table$ BEGIN\n"+
 " IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid="+object+" AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relpersistence='p' AND c.reloptions IS NULL AND c.relreplident='d' AND c.relrowsecurity AND NOT c.relforcerowsecurity) OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid="+object+" AND a.grantee<>c.relowner) OR has_table_privilege('municontrol_actions_runtime_app',"+object+",'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid="+object+") THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_TABLE_SECURITY';END IF;\n"+
 " IF(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid="+object+" AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM "+q(JSON.stringify(columns))+"::jsonb OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid="+object+" AND(attisdropped OR attidentity<>'' OR attgenerated<>'' OR attacl IS NOT NULL)) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_TABLE_SHAPE';END IF;\n"+
 " IF(SELECT count(*) FROM pg_constraint WHERE conrelid="+object+" AND contype='f')<>7 OR(SELECT count(*) FROM pg_constraint WHERE conrelid="+object+" AND contype='c')<>13 OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid="+object+" AND(contype NOT IN('p','u','f','c','n') OR NOT convalidated OR condeferrable OR condeferred OR contype='f' AND(confupdtype<>'a' OR confdeltype<>'a' OR confmatchtype<>'s'))) OR(SELECT count(*) FROM pg_index WHERE indrelid="+object+")<>5 OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid="+object+" AND(NOT indisvalid OR NOT indisready OR NOT indimmediate OR indexprs IS NOT NULL OR indnatts<>indnkeyatts)) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_TABLE_CONSTRAINTS';END IF;\n"+
 " IF(SELECT coalesce(jsonb_agg(regexp_replace(pg_get_constraintdef(k.oid),'[[:space:]()]','','g') ORDER BY regexp_replace(pg_get_constraintdef(k.oid),'[[:space:]()]','','g') COLLATE \"C\"),'[]') FROM pg_constraint k WHERE k.conrelid="+object+" AND k.contype='c') IS DISTINCT FROM "+q(JSON.stringify(checks))+"::jsonb THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_CHECK_SHAPE';END IF;\n"+
 " IF(SELECT jsonb_agg(v ORDER BY v::text COLLATE \"C\") FROM(SELECT jsonb_build_array((SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num),s.nspname||'.'||r.relname,(SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.confkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num)) v FROM pg_constraint c JOIN pg_class r ON r.oid=c.confrelid JOIN pg_namespace s ON s.oid=r.relnamespace WHERE c.conrelid="+object+" AND c.contype='f') actual) IS DISTINCT FROM(SELECT jsonb_agg(v ORDER BY v::text COLLATE \"C\") FROM jsonb_array_elements("+q(JSON.stringify(foreigns))+"::jsonb) v) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_FOREIGN_SHAPE';END IF;\n"+
 " IF(SELECT coalesce(jsonb_agg(jsonb_build_array(k.contype,(SELECT jsonb_agg(a.attname ORDER BY v.n) FROM unnest(k.conkey) WITH ORDINALITY v(num,n) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=v.num)) ORDER BY k.contype,k.conkey),'[]') FROM pg_constraint k WHERE k.conrelid="+object+" AND k.contype IN('p','u')) IS DISTINCT FROM "+q(JSON.stringify(uniques))+"::jsonb THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_UNIQUE_SHAPE';END IF;\n"+
 " IF(SELECT count(*) FROM pg_constraint WHERE conrelid="+object+" AND contype='n')<>(CASE WHEN current_setting('server_version_num')::integer/10000>=18 THEN 21 ELSE 0 END) OR EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid="+object+" AND k.contype='n' AND(cardinality(k.conkey)<>1 OR NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=k.conrelid AND a.attnum=k.conkey[1] AND a.attnotnull))) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_NOT_NULL_SHAPE';END IF;\n"+
 " IF(SELECT jsonb_agg(v ORDER BY v::text COLLATE \"C\") FROM(SELECT jsonb_build_array(i.indisunique,i.indisprimary,(SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(i.indkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num),regexp_replace(pg_get_expr(i.indpred,i.indrelid),'[[:space:]()]','','g')) v FROM pg_index i WHERE i.indrelid="+object+") actual) IS DISTINCT FROM(SELECT jsonb_agg(v ORDER BY v::text COLLATE \"C\") FROM jsonb_array_elements("+q(JSON.stringify(indexes))+"::jsonb) v) OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am a ON a.oid=c.relam WHERE i.indrelid="+object+" AND(NOT i.indislive OR a.amname<>'btree' OR c.relowner<>current_user::regrole OR c.reloptions IS NOT NULL OR EXISTS(SELECT 1 FROM unnest(i.indoption) v WHERE v<>0))) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_INDEX_SHAPE';END IF;\n"+
 " IF(SELECT count(*) FROM pg_trigger WHERE tgrelid="+object+" AND NOT tgisinternal)<>2 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid="+object+" AND tgname='own_period_classification_immutable' AND tgtype=27 AND tgenabled='O' AND NOT tgisinternal AND tgfoid='public.own_period_classification_immutable_v1()'::regprocedure AND tgqual IS NULL AND tgnargs=0 AND tgattr=''::int2vector) OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid="+object+" AND tgname='own_period_classification_no_truncate' AND tgtype=34 AND tgenabled='O' AND NOT tgisinternal AND tgfoid='public.own_period_classification_immutable_v1()'::regprocedure AND tgqual IS NULL AND tgnargs=0 AND tgattr=''::int2vector) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_TABLE_IMMUTABILITY';END IF;\n"+
 " IF EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid="+object+" AND k.contype='f' AND(SELECT count(*)<>4 OR bool_or(g.tgenabled<>'O' OR NOT g.tgisinternal OR g.tgconstrrelid NOT IN(k.conrelid,k.confrelid)) FROM pg_trigger g WHERE g.tgconstraint=k.oid)) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_FOREIGN_GUARD';END IF;\nEND $table$";
}

export function buildOwnPeriodClassificationInstallation({read,sourceCommit}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const options={read,sourceCommit},previous=buildOwnPayrollAdministrativeOperatorInstallation(options),sourceHashes={...previous.sourceHashes},texts={};
 for(const [file,expected]of Object.entries(SOURCE_PINS)){texts[file]=lf(read(file));assert.equal(hash(texts[file]),expected,'PERIOD_CLASSIFICATION_SOURCE_CHANGED: '+file);sourceHashes[file]=expected;}
 const source=lf(read(OWN_PERIOD_CLASSIFICATION_MIGRATION)),migration=splitPostgresStatements(source).map(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim());sourceHashes[OWN_PERIOD_CLASSIFICATION_MIGRATION]=hash(source);
 assert.equal(sourceHashes[OWN_PERIOD_CLASSIFICATION_MIGRATION],OWN_PERIOD_CLASSIFICATION_SQL_SHA256,'PERIOD_CLASSIFICATION_REVIEWED_SQL_CHANGED');
 assert.ok(migration.every(s=>!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));
 const streaming=buildAdoptionSourceStreamingInstallation(options),jurisdiction=buildOwnJurisdictionInstallation(options);
 Object.assign(sourceHashes,streaming.sourceHashes);
 // The published final source also includes administrative adoption and
 // streaming checks. Reconstruct all of them, then the exact SQL165 repair.
 let ready=streaming.changed.at(-1);assert.equal(pin(ready).name,'municipal_adoption_ready_v1');assert.equal(pin(ready).sha256,READINESS_PRIOR,'PERIOD_CLASSIFICATION_READY_PRIOR_CHANGED');
 ready=once(ready,CAPTURE_PRIOR,CAPTURE_FINAL);
 assert.equal(pin(ready).sha256,READINESS_FINAL,'PERIOD_CLASSIFICATION_READY_SOURCE_CHANGED');
 const consumers=deriveOwnPeriodClassificationConsumers({
  capture:get(lf(read('scripts/migrations/172-own-salary-conditions-program-source.sql')),'own_run_capture_v1'),
  roster:priorRoster(texts['scripts/migrations/125-own-payroll-close.sql']),
  detail:jurisdiction.migration.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.own_close_detail_v1(')),
  jurisdictions:get(texts['scripts/migrations/143-own-payroll-jurisdiction-snapshot.sql'],'own_run_jurisdictions_v1'),ready,
 });
 const newPins=migration.filter(s=>/^CREATE FUNCTION public\./.test(s)).map(s=>pin(s,facadeNames.has(pin(s).name)));assert.equal(newPins.length,21);assert.equal(newPins.filter(p=>p.runtime).length,4);
 const beforePins=consumers.originals.map((s,i)=>pin(s,i===0||i===2)),afterConsumerPins=consumers.changed.map((s,i)=>pin(s,i===0||i===2)),targetNames=new Set(beforePins.map(p=>p.name));
 const prerequisitePins=[...previous.prerequisitePins,...previous.afterPins].filter(p=>!targetNames.has(p.name)&&p.name!==capacityPin.name).concat(capacityPin);
 assert.equal(new Set(prerequisitePins.map(p=>p.signature)).size,prerequisitePins.length,'PERIOD_CLASSIFICATION_DUPLICATE_PREREQUISITE');
 // These publication pins are canonical, not a before/after-only promise.
 for(const [name,expected]of Object.entries({own_run_complete_v1:'f303a27603c035919449d05a1b4af9228a512a79b7667a4ede34011c2f334dc7',own_run_complete_full_v1:'1b2198ac93bd66ed5f7191ffabb69000de340e20d115cbddd1e32e85db6a8d37'}))assert.equal(prerequisitePins.find(p=>p.name===name)?.sha256,expected,'PERIOD_CLASSIFICATION_FINALIZER_CHANGED');
 const afterPins=[...afterConsumerPins,...newPins],beforeCheck=pinsCheck([...prerequisitePins,...beforePins],'PERIOD_CLASSIFICATION_PREREQUISITE_CHANGED'),afterCheck=pinsCheck([...prerequisitePins,...afterPins],'PERIOD_CLASSIFICATION_FUNCTION_CHANGED')+';'+ownPeriodClassificationTableCheck()+";DO $count$ BEGIN IF(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_period_classification_%')<>21 THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_FUNCTION_COUNT';END IF;END $count$";
 const ids=beforePins.map(p=>q(p.signature)+'::regprocedure').join(','),newNames=newPins.map(p=>q(p.name)).join(',');
 const snapshot=slot=>{
  let s=preservationSnapshot(slot).replaceAll('native_leave_event',table).replaceAll('municontrol_sql111.',prefix);
  s=once(s,"s.nspname='public' AND p.proname LIKE 'native_leave_%'","s.nspname='public' AND p.proname IN("+newNames+')');
  s=once(s,"public.digest(to_jsonb(p)::text,'sha256')","public.digest((CASE WHEN p.oid IN("+ids+") THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')");
  s=once(s,"p.oid IS DISTINCT FROM to_regclass('public."+table+"')),","p.oid IS DISTINCT FROM to_regclass('public."+table+"') AND NOT(t.tgisinternal AND t.tgconstraint IN(SELECT oid FROM pg_constraint WHERE conrelid=to_regclass('public."+table+"') AND contype='f'))),");
  return s;
 };
 const before=snapshot('before'),after=snapshot('after'),mutations=[...migration,...consumers.changed];
 const mode="DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_ISOLATION_REQUIRED';END IF;IF current_setting('server_version_num')::integer/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SERVER_UNREVIEWED';END IF;PERFORM set_config('lock_timeout','5s',true);PERFORM set_config('statement_timeout','180s',true);"+[132142,132143,143,132149,132150,145,132164,156,132166,132170,171,176,177].map(k=>'PERFORM pg_advisory_xact_lock('+k+');').join('')+"PERFORM set_config('"+prefix+"mode',CASE WHEN to_regclass('public."+table+"') IS NULL THEN 'install' ELSE 'verify' END,true);IF current_setting('"+prefix+"mode')='install' AND EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_period_classification_%') THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_OBJECT_CONFLICT';END IF;END $mode$";
 const choose="DO $choose$ BEGIN IF current_setting('"+prefix+"mode')='install' THEN EXECUTE "+q(beforeCheck)+";ELSE EXECUTE "+q(afterCheck)+";END IF;END $choose$";
 const apply="DO $apply$ BEGIN IF current_setting('"+prefix+"mode')='install' THEN "+mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')+"IF(SELECT count(*) FROM public."+table+")<>0 THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_NEW_TABLE_NOT_EMPTY';END IF;END IF;END $apply$";
 const conservation="DO $conservation$ BEGIN IF current_setting('"+prefix+"before')::jsonb IS DISTINCT FROM current_setting('"+prefix+"after')::jsonb THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_PRIOR_STATE_CHANGED';END IF;END $conservation$";
 const priorMetadata="encode(public.digest(jsonb_build_object('objects',current_setting('"+prefix+"after')::jsonb-'tables'-'sequences','tables',(SELECT jsonb_agg(v-'rows'-'rowsSha256' ORDER BY v->>'schema',v->>'name') FROM jsonb_array_elements(current_setting('"+prefix+"after')::jsonb->'tables') v),'sequences',(SELECT jsonb_agg(jsonb_build_object('definition',to_jsonb(s),'owner',c.relowner,'acl',c.relacl,'options',c.reloptions) ORDER BY s.seqrelid) FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'))::text,'sha256'),'hex')";
 const objectFingerprint="encode(public.digest(jsonb_build_object('table',(SELECT jsonb_build_object('oid',c.oid,'owner',c.relowner,'acl',c.relacl,'kind',c.relkind,'persistence',c.relpersistence,'options',c.reloptions,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'replicaIdentity',c.relreplident) FROM pg_class c WHERE c.oid='public."+table+"'::regclass),'attributes',(SELECT jsonb_agg(jsonb_build_object('attribute',to_jsonb(a),'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public."+table+"'::regclass),'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_constraint c WHERE c.conrelid='public."+table+"'::regclass),'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid='public."+table+"'::regclass),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid='public."+table+"'::regclass),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE p.polrelid='public."+table+"'::regclass),'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN("+ids+") OR p.pronamespace='public'::regnamespace AND p.proname IN("+newNames+")))::text,'sha256'),'hex')";
 const proof=(modeValue,tx)=>"SELECT jsonb_build_object('version','own-period-classification-installation.v1','sourceCommit',"+q(sourceCommit)+",'sourceHashes',"+q(JSON.stringify(sourceHashes))+"::jsonb,'mode',"+modeValue+",'newTables',1,'newFunctions',21,'runtimeFacades',4,'adaptedFunctions',5,'roleAssignmentsAdded',0,'existingAclChanges',0,'associationWrites',0,'businessWrites',0,'nominalRowsReturned',0,'eventRows',(SELECT count(*) FROM public."+table+"),'transactionDataPreserved',"+tx+",'preservationSha256',encode(public.digest(current_setting('"+prefix+"after')::jsonb::text,'sha256'),'hex'),'priorMetadataSha256',"+priorMetadata+",'objectFingerprint',"+objectFingerprint+") AS proof";
 return{sourceCommit,sourceHashes,previous,migration,mutations,originals:consumers.originals,changed:consumers.changed,beforePins,afterPins,afterConsumerPins,newPins,prerequisitePins,beforeCheck,afterCheck,before,after,mode,choose,apply,conservation,statements:[mode,choose,before,apply,afterCheck,after,conservation,proof("current_setting('"+prefix+"mode')",true)],verification:[afterCheck,after,proof("'verify'",false)],connects:false,executesSql:false};
}

export function assertOwnPeriodClassificationDurability({installed,durable,batch}){
 for(const p of[installed,durable]){
  assert.equal(p.version,'own-period-classification-installation.v1');assert.equal(p.sourceCommit,batch.sourceCommit);assert.deepEqual(p.sourceHashes,batch.sourceHashes);
  for(const [k,v]of Object.entries({newTables:1,newFunctions:21,runtimeFacades:4,adaptedFunctions:5,roleAssignmentsAdded:0,existingAclChanges:0,associationWrites:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(p[k],v);
  for(const k of['preservationSha256','priorMetadataSha256','objectFingerprint'])assert.match(p[k],/^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(p.eventRows)&&p.eventRows>=0,'PERIOD_CLASSIFICATION_EVENT_COUNT_INVALID');
 }
 assert.equal(installed.transactionDataPreserved,true);assert.equal(durable.transactionDataPreserved,false);
 const {mode,transactionDataPreserved:tx,preservationSha256:data,...a}=installed,{mode:other,transactionDataPreserved:readTx,preservationSha256:later,...b}=durable;
 assert.ok(['install','verify'].includes(mode));assert.equal(other,'verify');assert.deepEqual(a,b,'PERIOD_CLASSIFICATION_INSTALL_NOT_DURABLE');
}
