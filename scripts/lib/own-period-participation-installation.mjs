import {buildSalaryAuxiliaryNamespaceSql} from './salary-auxiliary-namespace-installation.mjs';
import {CONSUMER_AFTER_PINS,CONSUMER_SOURCE_SHA} from './adopted-consumers-installation-pins.mjs';
// Source-pinned composition of the published declarative payroll engine.
// This builder does not connect, certify a rule, resolve an identity or write data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildOwnSalarySenioritySql } from './own-salary-seniority-installation.mjs';
import { ownInstallationFunctionPin } from './own-payroll-installation.mjs';
import { splitPostgresStatements } from './sql-statements.mjs';
import { pinsCheck, preservationSnapshot } from './native-leave-installation.mjs';
import { SALARY_ADMINISTRATIVE_CONTEXT } from './salary-administrative-identity-installation.mjs';
const q = v => "'" + String(v).replaceAll("'", "''") + "'";
export const SQL157_SHA256 = '06b5fdcce0c55e5b768d43af0491f1498728bf762febffe81cb6df9763d96548';
const hash = v => createHash('sha256').update(v).digest('hex');
const once = (s, a, b) => { assert.equal(s.split(a).length, 2, 'PARTICIPATION_SOURCE_ANCHOR_CHANGED: ' + a.slice(0, 75)); return s.replace(a, () => b); };
const get = (rows, name) => { const found = rows.filter(s => new RegExp('^CREATE (?:OR REPLACE )?FUNCTION public\\.' + name + '\\(').test(s)); assert.equal(found.length, 1, name); return found[0]; };
export function buildOwnPeriodParticipationSql(options) {
 assert.match(options.sourceCommit, /^[a-f0-9]{40}$/);
 const published = buildOwnSalarySenioritySql(options);
 const migrationFile = 'scripts/migrations/157-own-period-participation.sql', source = options.read(migrationFile).replace(/\r\n?/g, '\n'), migration = splitPostgresStatements(source);
 assert.equal(hash(source), SQL157_SHA256, 'PARTICIPATION_REVIEWED_SOURCE_CHANGED');
 const beforeDefinition = get(published.changed, 'own_program_definition_v1'), beforeCommand = get(published.changed, 'own_program_command_v1'), beforeCapture = get(published.changed, 'own_run_capture_v1'), beforeReady = get(published.changed, 'municipal_adoption_ready_v1');
 let definition = once(beforeDefinition, 'facts boolean:=', "part boolean:=coalesce(p#>>'{periodParticipation,version}'='own-period-participation.v1',false);facts boolean:=");
 definition = once(definition, "CASE WHEN facts THEN ARRAY['employmentFactsVersion'] ELSE ARRAY[]::text[] END", "CASE WHEN facts THEN ARRAY['employmentFactsVersion'] ELSE ARRAY[]::text[] END||CASE WHEN part THEN ARRAY['periodParticipation'] ELSE ARRAY[]::text[] END");
 definition = once(definition, ' IF facts AND NOT ns', " IF part THEN IF NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;PERFORM public.own_participation_policy_v1(p);END IF;\n IF facts AND NOT ns");
 definition = definition.replaceAll("b->>'sourceKind'='employment_fact' THEN", "b->>'sourceKind' IN('employment_fact','period_fact') THEN").replaceAll("b->>'sourceKind'<>'employment_fact' AND", "b->>'sourceKind' NOT IN('employment_fact','period_fact') AND").replaceAll("IF b->>'sourceKind'<>'employment_fact' THEN", "IF b->>'sourceKind' NOT IN('employment_fact','period_fact') THEN");
 definition = once(definition, "'fixed_amount','employment_fact') AND(b->>'sourceKind'<>'employment_fact' OR facts)", "'fixed_amount','employment_fact','period_fact') AND(b->>'sourceKind'<>'employment_fact' OR facts) AND(b->>'sourceKind'<>'period_fact' OR part)");
 definition = once(definition, "  IF b->>'sourceKind'='employment_fact' AND", "  IF b->>'sourceKind'='period_fact' AND(b->>'sourceField' NOT IN('recognizedUnits','baseUnits') OR b->>'unit'<>'units' OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;\n  IF b->>'sourceKind'='employment_fact' AND");
 definition = definition.replaceAll("r->'expression'", "public.own_participation_expression_v1(r,p)");
 definition = once(definition, 'RETURN normalized;', "IF part THEN normalized:=normalized||jsonb_build_object('periodParticipation',public.own_participation_policy_v1(p));END IF;RETURN normalized;");
 let command = once(beforeCommand, "  IF current_program#>>'{definition,employmentFactsVersion}'", "  IF current_program#>>'{definition,periodParticipation,version}'='own-period-participation.v1' AND definition#>>'{periodParticipation,version}' IS DISTINCT FROM 'own-period-participation.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;\n  IF current_program#>>'{definition,employmentFactsVersion}'");
 command = once(command, "candidate.value-'validUntil'=historical.value-'validUntil'", "jsonb_set(candidate.value-'validUntil','{expression}',public.own_participation_expression_v1(candidate.value,definition))=jsonb_set(historical.value-'validUntil','{expression}',public.own_participation_expression_v1(historical.value,current_program->'definition'))");
 let capture = once(beforeCapture, 'DECLARE ctx jsonb;', 'DECLARE period_facts jsonb;ctx jsonb;');
 capture = once(capture, "IF NOT public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),reg.employment_contract_id,first_date,last_date,true) THEN RAISE EXCEPTION 'OWN_RUN_PRORATION_REQUIRED';END IF;", "IF NOT public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),reg.employment_contract_id,first_date,last_date,true) AND program_state#>>'{program,definition,periodParticipation,version}' IS DISTINCT FROM 'own-period-participation.v1' THEN RAISE EXCEPTION 'OWN_RUN_PRORATION_REQUIRED';END IF;");
 capture = once(capture, 'payload_value:=jsonb_build_object(', "IF program_state#>>'{program,definition,periodParticipation,version}'='own-period-participation.v1' THEN\n  period_facts:=public.own_participation_capture_v1(ctx,employees,body->>'period');\n  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(jsonb_build_object('employees',employees,'periodParticipation',period_facts)||CASE WHEN program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN jsonb_build_object('employmentFacts',s) ELSE '{}'::jsonb END)));\n  inventory:=inventory||jsonb_build_object('periodParticipation',jsonb_build_object('version',period_facts->>'version','total',jsonb_array_length(period_facts->'records'),'complete',true));\n END IF;\n payload_value:=jsonb_build_object(");
 capture = once(capture, ' IF octet_length(payload_value::text)', " IF program_state#>>'{program,definition,periodParticipation,version}'='own-period-participation.v1' THEN payload_value:=payload_value||jsonb_build_object('periodParticipation',period_facts);END IF;\n IF octet_length(payload_value::text)");
 const beforeComplete=get(buildSalaryAuxiliaryNamespaceSql(options).changed,'own_run_complete_v1');
 const complete=once(beforeComplete,"input_value->'rules' IS DISTINCT FROM c.payload#>'{programState,program,definition,rules}'", "input_value->'rules' IS DISTINCT FROM public.own_participation_rules_v1(c.payload#>'{programState,program,definition}')");
 // Reconstruct only the already published, source-pinned SQL141 reader.
 // Eligibility is distinct from the confirmed captured result required to close.
 const closeAdapter=options.read('scripts/migrations/141-adopted-own-payroll-close.sql').replace(/\r\n?/g,'\n');
 assert.equal(hash(closeAdapter),CONSUMER_SOURCE_SHA['141-adopted-own-payroll-close.sql']);
 let beforeClose=get(splitPostgresStatements(options.read('scripts/migrations/125-own-payroll-close.sql').replace(/\r\n?/g,'\n')),'own_close_roster_v1').replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION ');
 assert.equal(beforeClose.split('public.native_employment_lifecycle_range_v1(ctx,reg.contract_id,').length,3);
 beforeClose=beforeClose.replaceAll('public.native_employment_lifecycle_range_v1(ctx,reg.contract_id,',"public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),reg.contract_id,");
 beforeClose=once(beforeClose,'public.payroll_fixed_registry_subject_by_contract_v1','public.payroll_fixed_registry_subject_v2');
 beforeClose=once(beforeClose,'public.native_employment_lifecycle_review IN SHARE MODE NOWAIT;','public.native_employment_lifecycle_review,public.employment_adoption_application,public.employment_adoption_decision,public.employment_adoption_proposal IN SHARE MODE NOWAIT;');
 beforeClose=once(beforeClose,"coalesce(reg.legacy_legajo,'')!~'^[0-9]{1,9}$'","reg.legacy_legajo IS NULL OR length(reg.legacy_legajo) NOT BETWEEN 1 AND 64 OR reg.legacy_legajo~'[[:cntrl:]]' OR reg.legacy_legajo~E'[\\u0080-\\u009f]'");
 assert.equal(ownInstallationFunctionPin(beforeClose).sha256,CONSUMER_AFTER_PINS.find(p=>p.name==='own_close_roster_v1').sha256,'PARTICIPATION_CURRENT_CLOSE_SOURCE_CHANGED');
 const close=once(beforeClose,"last_date,true) THEN RAISE EXCEPTION 'OWN_RUN_PRORATION_REQUIRED';END IF;","last_date,true) AND public.own_program_current_v1(ctx)#>>'{definition,periodParticipation,version}' IS DISTINCT FROM 'own-period-participation.v1' THEN RAISE EXCEPTION 'OWN_RUN_PRORATION_REQUIRED';END IF;");
 let ready = beforeReady;
 const before = [beforeDefinition, beforeCommand, beforeCapture, beforeComplete, beforeClose];
 const changed = [definition, command, capture, complete, close];
 for (let i = 0; i < before.length; i++) {
  const oldPin = ownInstallationFunctionPin(before[i]), newPin = ownInstallationFunctionPin(changed[i]);
  if (ready.includes(oldPin.sha256)) ready = ready.replaceAll(oldPin.sha256, newPin.sha256);
 }
 assert.ok(beforeReady.includes(ownInstallationFunctionPin(beforeCapture).sha256), 'PARTICIPATION_CURRENT_CAPTURE_PIN_MISSING');
 changed.push(ready); before.push(beforeReady);
 const facades = new Set(['own_participation_bootstrap_v1', 'own_participation_detail_v1', 'own_participation_attempt_v1', 'own_participation_command_v1']);
 const newPins = migration.filter(s => /^CREATE FUNCTION public\.own_participation_/.test(s)).map(s => ({ ...ownInstallationFunctionPin(s), runtime: facades.has(ownInstallationFunctionPin(s).name) }));
 assert.equal(newPins.length, 16); assert.equal(newPins.filter(p => p.runtime).length, 4);
 const pin = s => ({ ...ownInstallationFunctionPin(s), runtime: /FUNCTION public\.(own_program_command|own_run_capture|own_run_complete)_v1\(/.test(s) });
 const beforePins = before.map(pin), afterPins = changed.map(pin);
 beforePins.forEach((p, n) => assert.deepEqual({ ...p, sha256: null }, { ...afterPins[n], sha256: null }));
 return { sourceCommit: options.sourceCommit, sourceHashes: { [migrationFile]: hash(source) }, migration, before, changed, beforePins, afterPins, newPins, statements: [...migration, ...changed], newTables: 1, adaptedFunctions: changed.length, connects: false, executesSql: false };
}

const table = 'own_participation_event', prefix = 'municontrol_participation.';
const columns = [
 ['id','uuid',true,'gen_random_uuid()'],['tenant_id','uuid'],['source_binding_id','uuid'],['contract_id','uuid'],['period_month','date'],['proposal_id','uuid',false],['command','text'],['body','jsonb'],['base_definition','jsonb'],['source_snapshot','jsonb'],['revision','integer'],['actor_membership_id','uuid'],['actor_person_id','uuid'],['actor_email','text'],['actor_session_id','uuid'],['actor_session_version','integer'],['release_sha','text'],['actor_label','text'],['request_key','uuid'],['request_sha256','text'],['receipt','jsonb'],['recorded_at','timestamp with time zone',true,'clock_timestamp()'],
].map(([name,type,required=true,defaultValue=null])=>[name,type,required,defaultValue]);
const foreigns = [
 [['tenant_id'],'public.platform_tenant',['id']],[['contract_id'],'public.employment_contract',['id']],[['proposal_id'],'public.'+table,['id']],[['actor_person_id'],'public.person_identity',['id']],[['actor_session_id'],'public.tenant_identity_session',['id']],[['tenant_id','source_binding_id'],'public.platform_tenant_source_binding',['tenant_id','id']],[['actor_membership_id','tenant_id'],'public.tenant_membership',['id','tenant_id']],
];
const checks = [
 "CHECK ((EXTRACT(day FROM period_month) = (1)::numeric) AND ((period_month >= '1900-01-01'::date) AND (period_month <= '2099-12-01'::date)))",
 "CHECK (command = ANY (ARRAY['propose'::text, 'approve'::text, 'reject'::text]))",
 "CHECK ((jsonb_typeof(body) = 'object'::text) AND (octet_length(body::text) <= 32768))",
 "CHECK (jsonb_typeof(base_definition) = ANY (ARRAY['null'::text, 'object'::text]))",
 "CHECK ((jsonb_typeof(source_snapshot) = 'object'::text) AND (octet_length(source_snapshot::text) <= 32768))",
 'CHECK ((revision >= 0) AND (revision <= 1000))',
 'CHECK (actor_email = lower(actor_email))','CHECK (actor_session_version > 0)',
 "CHECK (release_sha ~ '^[a-f0-9]{40}$'::text)",
 "CHECK (request_key::text ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'::text)",
 "CHECK (request_sha256 ~ '^[a-f0-9]{64}$'::text)","CHECK ((command = 'propose'::text) = (proposal_id IS NULL))",
].map(v=>v.replace(/[\s()]/g,'')).sort();
export function participationTableCheck() {
 return `DO $shape$ DECLARE actual jsonb;expected jsonb;t pg_class; BEGIN
 SELECT * INTO t FROM pg_class WHERE oid=to_regclass('public.${table}');
 IF t.oid IS NULL OR t.relkind<>'r' OR t.relowner<>current_user::regrole OR NOT t.relrowsecurity OR t.relforcerowsecurity OR t.relpersistence<>'p' OR t.reloptions IS NOT NULL OR t.relreplident<>'d' OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=t.oid) OR EXISTS(SELECT 1 FROM aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a WHERE a.grantee<>t.relowner) OR has_table_privilege('municontrol_actions_runtime_app',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'PARTICIPATION_TABLE_SECURITY';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum),'[]') INTO actual FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped;
 IF actual<>${q(JSON.stringify(columns))}::jsonb OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=t.oid AND attnum>0 AND (attisdropped OR attidentity<>'' OR attgenerated<>'' OR attacl IS NOT NULL)) THEN RAISE EXCEPTION 'PARTICIPATION_TABLE_SHAPE';END IF;
 SELECT coalesce(jsonb_agg(regexp_replace(pg_get_constraintdef(k.oid),'[[:space:]()]','','g') ORDER BY regexp_replace(pg_get_constraintdef(k.oid),'[[:space:]()]','','g') COLLATE "C"),'[]') INTO actual FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='c';
 IF actual<>${q(JSON.stringify(checks))}::jsonb OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=t.oid AND (NOT convalidated OR condeferrable OR condeferred)) THEN RAISE EXCEPTION 'PARTICIPATION_CONSTRAINT_SHAPE';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_array((SELECT jsonb_agg(a.attname ORDER BY key.n) FROM unnest(k.conkey) WITH ORDINALITY key(v,n) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=key.v),(SELECT ns.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE c.oid=k.confrelid),(SELECT jsonb_agg(a.attname ORDER BY key.n) FROM unnest(k.confkey) WITH ORDINALITY key(v,n) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=key.v)) ORDER BY k.confrelid,k.conkey),'[]') INTO actual FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='f';
 SELECT jsonb_agg(v ORDER BY (v->>1),v->0) INTO expected FROM jsonb_array_elements(${q(JSON.stringify(foreigns))}::jsonb) v;
 IF (SELECT jsonb_agg(v ORDER BY (v->>1),v->0) FROM jsonb_array_elements(actual) v)<>expected OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=t.oid AND contype='f' AND (confupdtype<>'a' OR confdeltype<>'a' OR confmatchtype<>'s')) THEN RAISE EXCEPTION 'PARTICIPATION_FOREIGN_SHAPE';END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid=t.oid AND contype<>'n')<>22 OR (SELECT coalesce(jsonb_agg(jsonb_build_array(k.contype,(SELECT jsonb_agg(a.attname ORDER BY key.n) FROM unnest(k.conkey) WITH ORDINALITY key(v,n) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=key.v)) ORDER BY k.contype,k.conkey),'[]') FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype IN('p','u'))<>'[["p",["id"]],["u",["tenant_id","source_binding_id","actor_membership_id","request_key"]],["u",["proposal_id"]]]'::jsonb THEN RAISE EXCEPTION 'PARTICIPATION_UNIQUE_SHAPE';END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid=t.oid AND contype='n')<>(CASE WHEN current_setting('server_version_num')::int/10000>=18 THEN 21 ELSE 0 END) OR EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='n' AND (cardinality(k.conkey)<>1 OR NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum=k.conkey[1] AND a.attnotnull))) THEN RAISE EXCEPTION 'PARTICIPATION_NOT_NULL_SHAPE';END IF;
 IF (SELECT count(*) FROM pg_index WHERE indrelid=t.oid)<>5 OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid=t.oid AND (NOT indisvalid OR NOT indisready OR NOT indislive OR NOT indimmediate OR indexprs IS NOT NULL OR indnatts<>indnkeyatts)) OR NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=t.oid AND c.relname='own_participation_approval_revision' AND i.indisunique AND NOT i.indisprimary AND regexp_replace(pg_get_expr(i.indpred,i.indrelid),'[[:space:]()]','','g')='command=''approve''::text' AND (SELECT jsonb_agg(a.attname ORDER BY key.n) FROM unnest(i.indkey) WITH ORDINALITY key(v,n) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=key.v)='["tenant_id","source_binding_id","contract_id","period_month","revision"]'::jsonb) OR NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=t.oid AND c.relname='own_participation_contract_period' AND NOT i.indisunique AND NOT i.indisprimary AND i.indpred IS NULL AND (SELECT jsonb_agg(a.attname ORDER BY key.n) FROM unnest(i.indkey) WITH ORDINALITY key(v,n) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=key.v)='["tenant_id","source_binding_id","contract_id","period_month"]'::jsonb) THEN RAISE EXCEPTION 'PARTICIPATION_INDEX_SHAPE';END IF;
 IF (SELECT coalesce(jsonb_agg(jsonb_build_array(g.tgname,g.tgtype,g.tgenabled,g.tgfoid::regprocedure::text) ORDER BY g.tgname),'[]') FROM pg_trigger g WHERE g.tgrelid=t.oid AND NOT g.tgisinternal)<>${q(JSON.stringify([['own_participation_immutable',27,'O','own_participation_immutable_v1()'],['own_participation_no_truncate',34,'O','own_participation_immutable_v1()']]))}::jsonb OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t.oid AND NOT tgisinternal AND(tgqual IS NOT NULL OR tgnargs<>0 OR tgattr<>''::int2vector)) THEN RAISE EXCEPTION 'PARTICIPATION_IMMUTABLE_GUARD';END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='f' AND (SELECT count(*)<>4 OR bool_or(g.tgenabled<>'O' OR NOT g.tgisinternal OR g.tgconstrrelid NOT IN(k.conrelid,k.confrelid)) FROM pg_trigger g WHERE g.tgconstraint=k.oid)) THEN RAISE EXCEPTION 'PARTICIPATION_FOREIGN_GUARD';END IF;
 END $shape$`;
}

export function buildOwnPeriodParticipationInstallation(options) {
 const sources = {};
 const read = file => { const text = options.read(file).replace(/\r\n?/g,'\n'); sources[file] = hash(text); return text; };
 const batch = buildOwnPeriodParticipationSql({ ...options, read });
 const required = new Set(['native_salary_lock_v1','native_salary_serialized_v1','native_salary_scope_v1','own_program_exact_v1','own_program_text_v1','own_run_hash_v1','payroll_fixed_registry_subject_v2']);
 const files = ['112-native-salary-definitions.sql','122-own-payroll-programs.sql','123-own-payroll-runs.sql','138-adopted-fixed-novelties.sql'];
 const prerequisitePins = [SALARY_ADMINISTRATIVE_CONTEXT,...files.flatMap(f=>splitPostgresStatements(read('scripts/migrations/'+f)).filter(s=>/^CREATE (?:OR REPLACE )?FUNCTION public\./.test(s)&&required.has(ownInstallationFunctionPin(s).name)))].map(s=>({...ownInstallationFunctionPin(s),runtime:false}));
 assert.equal(prerequisitePins.length,8); assert.equal(new Set(prerequisitePins.map(p=>p.signature)).size,8);
 const beforeCheck = pinsCheck([...prerequisitePins,...batch.beforePins],'PARTICIPATION_PREREQUISITE_CHANGED');
 const afterCheck = pinsCheck([...prerequisitePins,...batch.afterPins,...batch.newPins],'PARTICIPATION_FUNCTION_CHANGED')+';'+participationTableCheck()+`;DO $count$ BEGIN IF(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_participation_%')<>16 THEN RAISE EXCEPTION 'PARTICIPATION_FUNCTION_COUNT';END IF;END $count$`;
 const ids = batch.beforePins.map(p=>q(p.signature)+'::regprocedure').join(',');
 const snapshot = slot => {
  let s = preservationSnapshot(slot).replaceAll('native_leave_event',table).replaceAll('native_leave_%','own_participation_%').replaceAll('municontrol_sql111.',prefix);
  s = once(s,'public.digest(to_jsonb(p)::text,',`public.digest((CASE WHEN p.oid IN(${ids}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,`);
  s = once(s,"p.oid IS DISTINCT FROM to_regclass('public."+table+"')),","p.oid IS DISTINCT FROM to_regclass('public."+table+"') AND NOT(t.tgisinternal AND t.tgconstraint IN(SELECT oid FROM pg_constraint WHERE conrelid=to_regclass('public."+table+"') AND contype='f'))),");
  return s;
 };
 const before=snapshot('before'),after=snapshot('after');
 const mode=`DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'PARTICIPATION_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132142);PERFORM pg_advisory_xact_lock(132143);PERFORM pg_advisory_xact_lock(143);PERFORM pg_advisory_xact_lock(132149);PERFORM pg_advisory_xact_lock(132150);PERFORM pg_advisory_xact_lock(145);PERFORM pg_advisory_xact_lock(132164);PERFORM pg_advisory_xact_lock(156);PERFORM pg_advisory_xact_lock(157);PERFORM set_config('${prefix}mode',CASE WHEN to_regclass('public.${table}') IS NULL THEN 'install' ELSE 'verify' END,true);END $mode$`;
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`;
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${batch.statements.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const conservation=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'PARTICIPATION_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const objectFingerprint=`encode(public.digest(jsonb_build_object('class',(SELECT to_jsonb(c) FROM pg_class c WHERE oid='public.${table}'::regclass),'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid='public.${table}'::regclass),'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_attrdef d WHERE d.adrelid='public.${table}'::regclass),'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid='public.${table}'::regclass),'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid='public.${table}'::regclass),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid='public.${table}'::regclass OR t.tgconstraint IN(SELECT oid FROM pg_constraint WHERE conrelid='public.${table}'::regclass AND contype='f')),'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(${ids}) OR p.pronamespace='public'::regnamespace AND p.proname LIKE 'own_participation_%'))::text,'sha256'),'hex')`;
 const proof=modeValue=>`SELECT jsonb_build_object('version','own-period-participation-installation.v1','sourceCommit',${q(options.sourceCommit)},'mode',${modeValue},'sourceHashes',${q(JSON.stringify(sources))}::jsonb,'newTables',1,'newFunctions',16,'runtimeFacades',4,'adaptedFunctions',6,'roleAssignmentsAdded',0,'existingAclChanges',0,'businessWrites',0,'nominalRowsReturned',0,'eventRows',(SELECT count(*) FROM public.${table}),'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',${objectFingerprint}) AS proof`;
 const verification=splitPostgresStatements([afterCheck,after,proof("'verify'")].join(';\n'));
 const statements=splitPostgresStatements([mode,choose,before,apply,afterCheck,after,conservation,proof("current_setting('"+prefix+"mode')")].join(';\n'));
 return {...batch,beforeDefinitions:batch.before,sourceHashes:sources,prerequisitePins,beforeCheck,afterCheck,before,after,mode,choose,apply,conservation,proof:proof("current_setting('"+prefix+"mode')"),statements,verification,connects:false,executesSql:false};
}
export function assertOwnPeriodParticipationDurability({installed,durable,batch}) {
 for(const proof of[installed,durable]) {
  assert.equal(proof.version,'own-period-participation-installation.v1');assert.equal(proof.sourceCommit,batch.sourceCommit);assert.deepEqual(proof.sourceHashes,batch.sourceHashes);
  for(const[k,v]of Object.entries({newTables:1,newFunctions:16,runtimeFacades:4,adaptedFunctions:6,roleAssignmentsAdded:0,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0,eventRows:0}))assert.equal(proof[k],v,'PARTICIPATION_INSTALL_PROOF_INVALID: '+k);
  for(const k of['preservationSha256','objectFingerprint'])assert.match(proof[k],/^[a-f0-9]{64}$/);
 }
 const {mode,...a}=installed,{mode:otherMode,...b}=durable;
 assert.ok(['install','verify'].includes(mode));assert.equal(otherMode,'verify');assert.deepEqual(a,b,'PARTICIPATION_INSTALL_NOT_DURABLE');
 return {passed:true,priorStatePreserved:true,metadataVerified:true,businessWrites:0,nominalRowsReturned:0};
}
