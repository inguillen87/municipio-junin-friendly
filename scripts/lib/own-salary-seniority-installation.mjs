// Source-pinned composition of the published declarative payroll engine.
// This builder does not connect, certify a rule, resolve an identity or write data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildSalaryAuxiliaryNamespaceSql } from './salary-auxiliary-namespace-installation.mjs';
import { buildOwnRunDateInstallation } from './own-payroll-run-date-installation.mjs';
import { ownInstallationFunctionPin } from './own-payroll-installation.mjs';
import { splitPostgresStatements } from './sql-statements.mjs';
import { pinsCheck, preservationSnapshot } from './native-leave-installation.mjs';
import { SALARY_ADMINISTRATIVE_CONTEXT } from './salary-administrative-identity-installation.mjs';
const q = v => "'" + String(v).replaceAll("'", "''") + "'";
export const SQL156_SHA256 = 'fa6e85764e585f40d26974143ed79724a7f695e562f688fee39a539f2e9aab9b';
const hash = v => createHash('sha256').update(v).digest('hex');
const once = (s, a, b) => { assert.equal(s.split(a).length, 2, 'SENIORITY_SOURCE_ANCHOR_CHANGED: ' + a.slice(0, 75)); return s.replace(a, () => b); };
const get = (rows, name) => { const found = rows.filter(s => new RegExp('^CREATE (?:OR REPLACE )?FUNCTION public\\.' + name + '\\(').test(s)); assert.equal(found.length, 1, name); return found[0]; };
export function buildOwnSalarySenioritySql(options) {
 assert.match(options.sourceCommit, /^[a-f0-9]{40}$/);
 const published = buildSalaryAuxiliaryNamespaceSql(options), dated = buildOwnRunDateInstallation(options);
 const migrationFile = 'scripts/migrations/156-own-salary-seniority.sql', source = options.read(migrationFile).replace(/\r\n?/g, '\n'), migration = splitPostgresStatements(source);
 assert.equal(hash(source), SQL156_SHA256, 'SENIORITY_REVIEWED_SOURCE_CHANGED');
 const beforeDefinition = get(published.changed, 'own_program_definition_v1'), beforeCommand = get(published.changed, 'own_program_command_v1'), beforeCapture = get(dated.migration, 'own_run_capture_v1'), beforeReady = get(published.changed, 'municipal_adoption_ready_v1');
 let definition = once(beforeDefinition, 'ns boolean:=', "facts boolean:=coalesce(p->>'employmentFactsVersion'='own-salary-seniority.v1',false);ns boolean:=");
 definition = once(definition, "CASE WHEN ns THEN ARRAY['namespaceVersion','rules','bindings','totalsPrecision'] ELSE ARRAY['rules','bindings','totalsPrecision'] END", "(CASE WHEN ns THEN ARRAY['namespaceVersion','rules','bindings','totalsPrecision'] ELSE ARRAY['rules','bindings','totalsPrecision'] END)||CASE WHEN facts THEN ARRAY['employmentFactsVersion'] ELSE ARRAY[]::text[] END");
 definition = once(definition, " FOR b IN SELECT value FROM jsonb_array_elements(p->'bindings') LOOP", " IF facts AND NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;\n FOR b IN SELECT value FROM jsonb_array_elements(p->'bindings') LOOP");
 definition = once(definition, "FOREACH field IN ARRAY ARRAY['agreementCode','key','unit','sourceKind','sourceCode','onMissing','combine','ruleReference']", "FOREACH field IN ARRAY ARRAY['agreementCode','key','unit','sourceKind',CASE WHEN b->>'sourceKind'='employment_fact' THEN 'sourceField' ELSE 'sourceCode' END,'onMissing','combine','ruleReference']");
 definition = once(definition, "CASE WHEN b->>'sourceKind'='scale_reference' THEN ARRAY", "CASE WHEN b->>'sourceKind'='employment_fact' THEN ARRAY['agreementCode','key','unit','sourceKind','sourceField','onMissing','combine','ruleReference'] WHEN b->>'sourceKind'='scale_reference' THEN ARRAY");
 definition = once(definition, "b->>'sourceCode' IS NULL OR b->>'sourceCode'!~'^[0-9]{1,9}$'", "(b->>'sourceKind'<>'employment_fact' AND(b->>'sourceCode' IS NULL OR b->>'sourceCode'!~'^[0-9]{1,9}$'))");
 definition = once(definition, "IN('parameter','auxiliary_parameter','scale','scale_reference','monthly_quantity','monthly_amount','fixed_quantity','fixed_amount')", "IN('parameter','auxiliary_parameter','scale','scale_reference','monthly_quantity','monthly_amount','fixed_quantity','fixed_amount','employment_fact') AND(b->>'sourceKind'<>'employment_fact' OR facts)");
 definition = once(definition, "  IF b->>'sourceKind'='scale_reference'", "  IF b->>'sourceKind'='employment_fact' AND(b->>'sourceField' NOT IN('seniorityYears','seniorityMonths') OR b->>'unit'<>'units' OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;\n  IF b->>'sourceKind'='scale_reference'");
 definition = once(definition, "   SELECT jsonb_agg(d) INTO matching FROM jsonb_array_elements(items) d", "   IF b->>'sourceKind'<>'employment_fact' THEN\n   SELECT jsonb_agg(d) INTO matching FROM jsonb_array_elements(items) d");
 definition = once(definition, "THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_DEFINITION_MISSING';END IF;", "THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_DEFINITION_MISSING';END IF;END IF;");
 definition = once(definition, "END IF;RETURN normalized;", "END IF;IF facts THEN normalized:=normalized||jsonb_build_object('employmentFactsVersion','own-salary-seniority.v1');END IF;RETURN normalized;");
 let command = once(beforeCommand, "  IF current_program#>>'{definition,namespaceVersion}'", "  IF current_program#>>'{definition,employmentFactsVersion}'='own-salary-seniority.v1' AND definition->>'employmentFactsVersion' IS DISTINCT FROM 'own-salary-seniority.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;\n  IF current_program#>>'{definition,namespaceVersion}'");
 let capture = once(beforeCapture, 'payload_value:=jsonb_build_object(', "IF program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN\n  s:=public.own_seniority_capture_v1(ctx,employees,body->>'period');\n  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(jsonb_build_object('employees',employees,'employmentFacts',s))));\n  inventory:=inventory||jsonb_build_object('employmentFacts',jsonb_build_object('version',s->>'version','total',jsonb_array_length(s->'records'),'complete',true));\n END IF;\n payload_value:=jsonb_build_object(");
 capture = once(capture, " IF octet_length(payload_value::text)", " IF program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN payload_value:=payload_value||jsonb_build_object('employmentFacts',s);END IF;\n IF octet_length(payload_value::text)");
 let ready = beforeReady;
 const before = [beforeDefinition, beforeCommand, beforeCapture];
 const changed = [definition, command, capture];
 for (let i = 0; i < before.length; i++) {
  const oldPin = ownInstallationFunctionPin(before[i]), newPin = ownInstallationFunctionPin(changed[i]);
  if (ready.includes(oldPin.sha256)) ready = ready.replaceAll(oldPin.sha256, newPin.sha256);
 }
 assert.ok(beforeReady.includes(ownInstallationFunctionPin(beforeCapture).sha256), 'SENIORITY_CURRENT_CAPTURE_PIN_MISSING');
 changed.push(ready); before.push(beforeReady);
 const facades = new Set(['own_seniority_bootstrap_v1', 'own_seniority_detail_v1', 'own_seniority_attempt_v1', 'own_seniority_command_v1']);
 const newPins = migration.filter(s => /^CREATE FUNCTION public\.own_seniority_/.test(s)).map(s => ({ ...ownInstallationFunctionPin(s), runtime: facades.has(ownInstallationFunctionPin(s).name) }));
 assert.equal(newPins.length, 12); assert.equal(newPins.filter(p => p.runtime).length, 4);
 const pin = s => ({ ...ownInstallationFunctionPin(s), runtime: /FUNCTION public\.(own_program_command|own_run_capture)_v1\(/.test(s) });
 const beforePins = before.map(pin), afterPins = changed.map(pin);
 beforePins.forEach((p, n) => assert.deepEqual({ ...p, sha256: null }, { ...afterPins[n], sha256: null }));
 return { sourceCommit: options.sourceCommit, sourceHashes: { [migrationFile]: hash(source) }, migration, before, changed, beforePins, afterPins, newPins, statements: [...migration, ...changed], newTables: 1, adaptedFunctions: 4, connects: false, executesSql: false };
}

const table = 'own_seniority_event', prefix = 'municontrol_seniority.';
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
export function seniorityTableCheck() {
 return `DO $shape$ DECLARE actual jsonb;expected jsonb;t pg_class; BEGIN
 SELECT * INTO t FROM pg_class WHERE oid=to_regclass('public.${table}');
 IF t.oid IS NULL OR t.relkind<>'r' OR t.relowner<>current_user::regrole OR NOT t.relrowsecurity OR t.relforcerowsecurity OR t.relpersistence<>'p' OR t.reloptions IS NOT NULL OR t.relreplident<>'d' OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=t.oid) OR EXISTS(SELECT 1 FROM aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a WHERE a.grantee<>t.relowner) OR has_table_privilege('municontrol_actions_runtime_app',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'SENIORITY_TABLE_SECURITY';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum),'[]') INTO actual FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped;
 IF actual<>${q(JSON.stringify(columns))}::jsonb OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=t.oid AND attnum>0 AND (attisdropped OR attidentity<>'' OR attgenerated<>'' OR attacl IS NOT NULL)) THEN RAISE EXCEPTION 'SENIORITY_TABLE_SHAPE';END IF;
 SELECT coalesce(jsonb_agg(regexp_replace(pg_get_constraintdef(k.oid),'[[:space:]()]','','g') ORDER BY regexp_replace(pg_get_constraintdef(k.oid),'[[:space:]()]','','g') COLLATE "C"),'[]') INTO actual FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='c';
 IF actual<>${q(JSON.stringify(checks))}::jsonb OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=t.oid AND (NOT convalidated OR condeferrable OR condeferred)) THEN RAISE EXCEPTION 'SENIORITY_CONSTRAINT_SHAPE';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_array((SELECT jsonb_agg(a.attname ORDER BY key.n) FROM unnest(k.conkey) WITH ORDINALITY key(v,n) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=key.v),(SELECT ns.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE c.oid=k.confrelid),(SELECT jsonb_agg(a.attname ORDER BY key.n) FROM unnest(k.confkey) WITH ORDINALITY key(v,n) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=key.v)) ORDER BY k.confrelid,k.conkey),'[]') INTO actual FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='f';
 SELECT jsonb_agg(v ORDER BY (v->>1),v->0) INTO expected FROM jsonb_array_elements(${q(JSON.stringify(foreigns))}::jsonb) v;
 IF (SELECT jsonb_agg(v ORDER BY (v->>1),v->0) FROM jsonb_array_elements(actual) v)<>expected OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=t.oid AND contype='f' AND (confupdtype<>'a' OR confdeltype<>'a' OR confmatchtype<>'s')) THEN RAISE EXCEPTION 'SENIORITY_FOREIGN_SHAPE';END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid=t.oid AND contype<>'n')<>22 OR (SELECT coalesce(jsonb_agg(jsonb_build_array(k.contype,(SELECT jsonb_agg(a.attname ORDER BY key.n) FROM unnest(k.conkey) WITH ORDINALITY key(v,n) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=key.v)) ORDER BY k.contype,k.conkey),'[]') FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype IN('p','u'))<>'[["p",["id"]],["u",["tenant_id","source_binding_id","actor_membership_id","request_key"]],["u",["proposal_id"]]]'::jsonb THEN RAISE EXCEPTION 'SENIORITY_UNIQUE_SHAPE';END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid=t.oid AND contype='n')<>(CASE WHEN current_setting('server_version_num')::int/10000>=18 THEN 21 ELSE 0 END) OR EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='n' AND (cardinality(k.conkey)<>1 OR NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum=k.conkey[1] AND a.attnotnull))) THEN RAISE EXCEPTION 'SENIORITY_NOT_NULL_SHAPE';END IF;
 IF (SELECT count(*) FROM pg_index WHERE indrelid=t.oid)<>5 OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid=t.oid AND (NOT indisvalid OR NOT indisready OR NOT indislive OR NOT indimmediate OR indexprs IS NOT NULL OR indnatts<>indnkeyatts)) OR NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=t.oid AND c.relname='own_seniority_approval_revision' AND i.indisunique AND NOT i.indisprimary AND regexp_replace(pg_get_expr(i.indpred,i.indrelid),'[[:space:]()]','','g')='command=''approve''::text' AND (SELECT jsonb_agg(a.attname ORDER BY key.n) FROM unnest(i.indkey) WITH ORDINALITY key(v,n) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=key.v)='["tenant_id","source_binding_id","contract_id","period_month","revision"]'::jsonb) OR NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=t.oid AND c.relname='own_seniority_contract_period' AND NOT i.indisunique AND NOT i.indisprimary AND i.indpred IS NULL AND (SELECT jsonb_agg(a.attname ORDER BY key.n) FROM unnest(i.indkey) WITH ORDINALITY key(v,n) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=key.v)='["tenant_id","source_binding_id","contract_id","period_month"]'::jsonb) THEN RAISE EXCEPTION 'SENIORITY_INDEX_SHAPE';END IF;
 IF (SELECT coalesce(jsonb_agg(jsonb_build_array(g.tgname,g.tgtype,g.tgenabled,g.tgfoid::regprocedure::text) ORDER BY g.tgname),'[]') FROM pg_trigger g WHERE g.tgrelid=t.oid AND NOT g.tgisinternal)<>${q(JSON.stringify([['own_seniority_immutable',27,'O','own_seniority_immutable_v1()'],['own_seniority_no_truncate',34,'O','own_seniority_immutable_v1()']]))}::jsonb OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t.oid AND NOT tgisinternal AND(tgqual IS NOT NULL OR tgnargs<>0 OR tgattr<>''::int2vector)) THEN RAISE EXCEPTION 'SENIORITY_IMMUTABLE_GUARD';END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='f' AND (SELECT count(*)<>4 OR bool_or(g.tgenabled<>'O' OR NOT g.tgisinternal OR g.tgconstrrelid NOT IN(k.conrelid,k.confrelid)) FROM pg_trigger g WHERE g.tgconstraint=k.oid)) THEN RAISE EXCEPTION 'SENIORITY_FOREIGN_GUARD';END IF;
 END $shape$`;
}

export function buildOwnSalarySeniorityInstallation(options) {
 const sources = {};
 const read = file => { const text = options.read(file).replace(/\r\n?/g,'\n'); sources[file] = hash(text); return text; };
 const batch = buildOwnSalarySenioritySql({ ...options, read });
 const required = new Set(['native_salary_lock_v1','native_salary_serialized_v1','native_salary_scope_v1','own_program_exact_v1','own_program_text_v1','own_run_hash_v1','payroll_fixed_registry_subject_v2']);
 const files = ['112-native-salary-definitions.sql','122-own-payroll-programs.sql','123-own-payroll-runs.sql','138-adopted-fixed-novelties.sql'];
 const prerequisitePins = [SALARY_ADMINISTRATIVE_CONTEXT,...files.flatMap(f=>splitPostgresStatements(read('scripts/migrations/'+f)).filter(s=>/^CREATE (?:OR REPLACE )?FUNCTION public\./.test(s)&&required.has(ownInstallationFunctionPin(s).name)))].map(s=>({...ownInstallationFunctionPin(s),runtime:false}));
 assert.equal(prerequisitePins.length,8); assert.equal(new Set(prerequisitePins.map(p=>p.signature)).size,8);
 const beforeCheck = pinsCheck([...prerequisitePins,...batch.beforePins],'SENIORITY_PREREQUISITE_CHANGED');
 const afterCheck = pinsCheck([...prerequisitePins,...batch.afterPins,...batch.newPins],'SENIORITY_FUNCTION_CHANGED')+';'+seniorityTableCheck()+`;DO $count$ BEGIN IF(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_seniority_%')<>12 THEN RAISE EXCEPTION 'SENIORITY_FUNCTION_COUNT';END IF;END $count$`;
 const ids = batch.beforePins.map(p=>q(p.signature)+'::regprocedure').join(',');
 const snapshot = slot => {
  let s = preservationSnapshot(slot).replaceAll('native_leave_event',table).replaceAll('native_leave_%','own_seniority_%').replaceAll('municontrol_sql111.',prefix);
  s = once(s,'public.digest(to_jsonb(p)::text,',`public.digest((CASE WHEN p.oid IN(${ids}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,`);
  s = once(s,"p.oid IS DISTINCT FROM to_regclass('public."+table+"')),","p.oid IS DISTINCT FROM to_regclass('public."+table+"') AND NOT(t.tgisinternal AND t.tgconstraint IN(SELECT oid FROM pg_constraint WHERE conrelid=to_regclass('public."+table+"') AND contype='f'))),");
  return s;
 };
 const before=snapshot('before'),after=snapshot('after');
 const mode=`DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'SENIORITY_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132142);PERFORM pg_advisory_xact_lock(132143);PERFORM pg_advisory_xact_lock(143);PERFORM pg_advisory_xact_lock(132149);PERFORM pg_advisory_xact_lock(132150);PERFORM pg_advisory_xact_lock(145);PERFORM pg_advisory_xact_lock(132164);PERFORM pg_advisory_xact_lock(156);PERFORM set_config('${prefix}mode',CASE WHEN to_regclass('public.${table}') IS NULL THEN 'install' ELSE 'verify' END,true);END $mode$`;
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`;
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${batch.statements.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const conservation=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'SENIORITY_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const objectFingerprint=`encode(public.digest(jsonb_build_object('class',(SELECT to_jsonb(c) FROM pg_class c WHERE oid='public.${table}'::regclass),'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid='public.${table}'::regclass),'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_attrdef d WHERE d.adrelid='public.${table}'::regclass),'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid='public.${table}'::regclass),'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid='public.${table}'::regclass),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid='public.${table}'::regclass OR t.tgconstraint IN(SELECT oid FROM pg_constraint WHERE conrelid='public.${table}'::regclass AND contype='f')),'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(${ids}) OR p.pronamespace='public'::regnamespace AND p.proname LIKE 'own_seniority_%'))::text,'sha256'),'hex')`;
 const proof=modeValue=>`SELECT jsonb_build_object('version','own-salary-seniority-installation.v1','sourceCommit',${q(options.sourceCommit)},'mode',${modeValue},'sourceHashes',${q(JSON.stringify(sources))}::jsonb,'newTables',1,'newFunctions',12,'runtimeFacades',4,'adaptedFunctions',4,'roleAssignmentsAdded',0,'existingAclChanges',0,'businessWrites',0,'nominalRowsReturned',0,'eventRows',(SELECT count(*) FROM public.${table}),'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',${objectFingerprint}) AS proof`;
 const verification=splitPostgresStatements([afterCheck,after,proof("'verify'")].join(';\n'));
 const statements=splitPostgresStatements([mode,choose,before,apply,afterCheck,after,conservation,proof("current_setting('"+prefix+"mode')")].join(';\n'));
 return {...batch,beforeDefinitions:batch.before,sourceHashes:sources,prerequisitePins,beforeCheck,afterCheck,before,after,mode,choose,apply,conservation,proof:proof("current_setting('"+prefix+"mode')"),statements,verification,connects:false,executesSql:false};
}
export function assertOwnSalarySeniorityDurability({installed,durable,batch}) {
 for(const proof of[installed,durable]) {
  assert.equal(proof.version,'own-salary-seniority-installation.v1');assert.equal(proof.sourceCommit,batch.sourceCommit);assert.deepEqual(proof.sourceHashes,batch.sourceHashes);
  for(const[k,v]of Object.entries({newTables:1,newFunctions:12,runtimeFacades:4,adaptedFunctions:4,roleAssignmentsAdded:0,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0,eventRows:0}))assert.equal(proof[k],v,'SENIORITY_INSTALL_PROOF_INVALID: '+k);
  for(const k of['preservationSha256','objectFingerprint'])assert.match(proof[k],/^[a-f0-9]{64}$/);
 }
 const {mode,...a}=installed,{mode:otherMode,...b}=durable;
 assert.ok(['install','verify'].includes(mode));assert.equal(otherMode,'verify');assert.deepEqual(a,b,'SENIORITY_INSTALL_NOT_DURABLE');
 return {passed:true,priorStatePreserved:true,metadataVerified:true,businessWrites:0,nominalRowsReturned:0};
}
