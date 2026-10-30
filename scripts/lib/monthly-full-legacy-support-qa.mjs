// PRIVATE TEXT CANDIDATE for scripts/lib/monthly-full-legacy-support-qa.mjs.
// Its author did not import, construct, parse, test or execute this module.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {monthlyDayLegacyCompatibilityFixture,MONTHLY_DAY_LEGACY_FIXTURE_SOURCE} from './monthly-day-policy-legacy-fixture.mjs';
import {preservationSnapshot} from './native-leave-installation.mjs';

const VERSION='monthly-full-legacy-support-source.v1',PROOF='monthly-full-legacy-support-proof.v1';
const SELF='scripts/lib/monthly-full-legacy-support-qa.mjs',HELPER='scripts/lib/monthly-day-policy-legacy-fixture.mjs',TEST='tests/own-monthly-full-legacy-support.test.js';
const HELPER_SHA='610ec8b5bfc946a44099be65442c9d29ff27fd58483d6d4e50c16a7294a43b32';
const SOURCE_SHA='323f97779c6e63439e9048c737223835a5a2ffeec11b71d5b63b4a436001a775';
const TABLES=Object.freeze(['payroll_fixed_assignment','payroll_fixed_change','payroll_fixed_event']);
const CAPABILITIES=Object.freeze([
 ['payroll.fixed.approve','Revisar novedades fijas','Ensayo aislado','tenant','restricted'],
 ['payroll.fixed.prepare','Preparar novedades fijas','Ensayo aislado','tenant','privileged']
].map(Object.freeze));
const CONFLICT=Object.freeze(['payroll.fixed.approve','payroll.fixed.prepare','Una persona distinta debe revisar']);
const SLOT='municontrol_monthly_full_legacy.';
const hash=value=>createHash('sha256').update(value).digest('hex');
const lf=value=>{assert.equal(typeof value,'string');return value.replace(/\r\n?/g,'\n');};
const q=value=>"'"+String(value).replaceAll("'","''")+"'",j=value=>q(JSON.stringify(value))+'::jsonb';
const exact=(value,keys)=>assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort());
const plans=new WeakMap();
const once=(value,from,to)=>{assert.equal(value.split(from).length,2,'MONTHLY_FULL_LEGACY_SNAPSHOT_ANCHOR');return value.replace(from,()=>to);};

// Preserve all old row multisets, including all65 GRH contracts, all IAM
// assignments/overrides, functions/ACL/roles, sequences, views and metadata.
// Only three proved-new relations and three exact IAM additions are projected.
function snapshot(slot){
 let value=preservationSnapshot(slot);
 const oldTable="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
 assert.equal(value.split(oldTable).length,3);
 const relationExclusion=TABLES.map(name=>"p.oid IS DISTINCT FROM to_regclass('public."+name+"')").join(' AND ');
 value=value.replaceAll(oldTable,relationExclusion);
 value=once(value,"NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'true');
 const anchor="FROM %I.%I r) hashed',c.nspname,c.relname) INTO n,h;";
 const caps=CAPABILITIES.map(row=>q(row[0])).join(',');
 const capabilityFilter=' WHERE r.capability_key NOT IN('+caps+')';
 const conflictFilter=' WHERE NOT(r.capability_key='+q(CONFLICT[0])+' AND r.conflicts_with_key='+q(CONFLICT[1])+')';
 const replacement="FROM %I.%I r%s) hashed',c.nspname,c.relname,CASE WHEN c.oid=to_regclass('public.iam_capability') THEN "+q(capabilityFilter)+" WHEN c.oid=to_regclass('public.iam_capability_conflict') THEN "+q(conflictFilter)+" ELSE '' END) INTO n,h;";
 value=once(value,anchor,replacement).replaceAll('municontrol_sql111.',SLOT);
 assert.equal(value.includes('native_leave_'),false);
 return value;
}

function objectCheck(schema,major){
 const names=TABLES.map(q).join(','),caps=CAPABILITIES.map(row=>q(row[0])).join(',');
 return `DO $monthly_full_legacy_objects$
 DECLARE target_name text;target_oid oid;actual_rows bigint;expected_type text;
 BEGIN
 FOREACH target_name IN ARRAY ARRAY[${names}] LOOP
  target_oid:=to_regclass(${q(schema)}||'.'||target_name);
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=target_oid AND c.relnamespace=${q(schema)}::regnamespace AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relpersistence='p' AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity
   AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner))
  THEN RAISE EXCEPTION 'MONTHLY_FULL_LEGACY_TABLE_SECURITY_CHANGED';END IF;
  expected_type:=CASE WHEN target_name='payroll_fixed_event' THEN 'bigint' ELSE 'uuid' END;
  IF (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=target_oid AND a.attnum>0 AND NOT a.attisdropped)
   IS DISTINCT FROM jsonb_build_array(jsonb_build_array('id',expected_type,true,NULL),jsonb_build_array('tenant_id','uuid',true,NULL))
   OR(SELECT count(*) FROM pg_constraint k WHERE k.conrelid=target_oid AND k.contype<>'n')<>1
   OR NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=target_oid AND k.contype='p' AND k.convalidated AND k.conkey=ARRAY[1]::smallint[])
   OR(SELECT coalesce(jsonb_agg(to_jsonb(k.conkey) ORDER BY k.conkey),'[]'::jsonb) FROM pg_constraint k WHERE k.conrelid=target_oid AND k.contype='n')
    IS DISTINCT FROM ${major===18?"'[[1],[2]]'::jsonb":"'[]'::jsonb"}
   OR EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=target_oid AND(NOT k.convalidated OR NOT k.conislocal OR k.coninhcount<>0 OR k.conparentid<>0 OR k.condeferrable OR k.condeferred OR NOT coalesce((to_jsonb(k)->>'conenforced')::boolean,true)))
   OR(SELECT count(*) FROM pg_index i WHERE i.indrelid=target_oid AND i.indisprimary AND i.indisunique AND i.indisvalid)<>1
   OR(SELECT count(*) FROM pg_index i WHERE i.indrelid=target_oid)<>1
   OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=target_oid)
   OR EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=target_oid)
  THEN RAISE EXCEPTION 'MONTHLY_FULL_LEGACY_TABLE_SHAPE_CHANGED';END IF;
  EXECUTE format('SELECT count(*) FROM %I.%I',${q(schema)},target_name) INTO actual_rows;
  IF actual_rows<>0 THEN RAISE EXCEPTION 'MONTHLY_FULL_LEGACY_SUPPORT_NOT_EMPTY';END IF;
 END LOOP;
 IF (SELECT jsonb_agg(jsonb_build_array(capability_key,label,description,scope_kind,sensitivity) ORDER BY capability_key COLLATE "C")
  FROM ${schema}.iam_capability WHERE capability_key IN(${caps})) IS DISTINCT FROM ${j(CAPABILITIES)}
 THEN RAISE EXCEPTION 'MONTHLY_FULL_LEGACY_CAPABILITY_DEFINITION_CHANGED';END IF;
 IF (SELECT jsonb_agg(jsonb_build_array(capability_key,conflicts_with_key,reason)) FROM ${schema}.iam_capability_conflict
  WHERE capability_key=${q(CONFLICT[0])} AND conflicts_with_key=${q(CONFLICT[1])}) IS DISTINCT FROM ${j([CONFLICT])}
 THEN RAISE EXCEPTION 'MONTHLY_FULL_LEGACY_CONFLICT_DEFINITION_CHANGED';END IF;
 END $monthly_full_legacy_objects$`;
}

function objectFingerprint(schema){
 const names=TABLES.map(q).join(','),caps=CAPABILITIES.map(row=>q(row[0])).join(',');
 return `encode(public.digest(jsonb_build_object(
 'tables',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c WHERE c.relnamespace=${q(schema)}::regnamespace AND c.relname IN(${names})),
 'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace=${q(schema)}::regnamespace AND c.relname IN(${names})),
 'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid WHERE c.relnamespace=${q(schema)}::regnamespace AND c.relname IN(${names})),
 'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace=${q(schema)}::regnamespace AND c.relname IN(${names})),
 'capabilities',(SELECT jsonb_agg(to_jsonb(c) ORDER BY capability_key) FROM ${schema}.iam_capability c WHERE capability_key IN(${caps})),
 'conflict',(SELECT jsonb_agg(to_jsonb(c)) FROM ${schema}.iam_capability_conflict c WHERE capability_key=${q(CONFLICT[0])} AND conflicts_with_key=${q(CONFLICT[1])}))::text,'sha256'),'hex')`;
}

export function composeMonthlyFullLegacySupportPlan({monthly,foundation,major,sourceCommit,read}){
 assert.ok(monthly&&monthly.qa192&&foundation);
 assert.strictEqual(monthly.qa192.qa,foundation,'MONTHLY_FULL_LEGACY_FOUNDATION_CHANGED');
 assert.equal(monthly.schema,foundation.schema);assert.equal(monthly.qa192.schema,foundation.schema);
 assert.equal(monthly.qa192.major,major);assert.ok([17,18].includes(major));
 assert.equal(monthly.qa192.sourceCommit,sourceCommit);assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 assert.match(foundation.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.equal(monthly.qa192.operationalPairBaseline,'published107');
 assert.equal(typeof read,'function');assert.equal(typeof monthly.qa192.normalized,'function');
 assert.equal(hash(lf(read(HELPER))),HELPER_SHA,'MONTHLY_FULL_LEGACY_HELPER_SOURCE_CHANGED');
 const fixture=monthlyDayLegacyCompatibilityFixture(file=>lf(read(file)));
 assert.equal(fixture.sourceSha256,SOURCE_SHA);assert.equal(fixture.statements.length,6);
 assert.equal(monthly.qa192.sourceHashes[MONTHLY_DAY_LEGACY_FIXTURE_SOURCE],SOURCE_SHA,'MONTHLY_FULL_LEGACY_SOURCE_CUSTODY_CHANGED');
 const normalize=monthly.qa192.normalized,seed=fixture.statements.map(normalize).join(';\n');
 assert.equal(monthly.qa192.legacyCompatibilitySeed,seed,'MONTHLY_FULL_LEGACY_PREPARED_SEED_CHANGED');
 const schema=foundation.schema,names=TABLES.map(q).join(','),caps=CAPABILITIES.map(row=>q(row[0])).join(',');
 const preflight=`DO $monthly_full_legacy_preflight$ BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'off'
  OR current_setting('server_version_num')::integer/10000<>${major}
  OR NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE n.oid=${q(schema)}::regnamespace AND n.nspowner=current_user::regrole)
 THEN RAISE EXCEPTION 'MONTHLY_FULL_LEGACY_WRITABLE_OWNER_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace=${q(schema)}::regnamespace AND c.relname IN(${names}))
  OR EXISTS(SELECT 1 FROM pg_type t WHERE t.typnamespace=${q(schema)}::regnamespace AND t.typname IN(${names}))
 THEN RAISE EXCEPTION 'MONTHLY_FULL_LEGACY_SUPPORT_ALREADY_PRESENT';END IF;
 LOCK TABLE ${schema}.iam_capability,${schema}.iam_capability_conflict IN SHARE ROW EXCLUSIVE MODE NOWAIT;
 IF EXISTS(SELECT 1 FROM ${schema}.iam_capability WHERE capability_key IN(${caps}))
 THEN RAISE EXCEPTION 'MONTHLY_FULL_LEGACY_CAPABILITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM ${schema}.iam_capability_conflict WHERE capability_key=${q(CONFLICT[0])} AND conflicts_with_key=${q(CONFLICT[1])})
 THEN RAISE EXCEPTION 'MONTHLY_FULL_LEGACY_CONFLICT_ALREADY_PRESENT';END IF;
 END $monthly_full_legacy_preflight$`;
 const before=normalize(snapshot('before')),after=normalize(snapshot('after'));
 const audit=`DO $monthly_full_legacy_conserved$ BEGIN
 IF current_setting('${SLOT}before')::jsonb IS DISTINCT FROM current_setting('${SLOT}after')::jsonb
 THEN RAISE EXCEPTION 'MONTHLY_FULL_LEGACY_PRIOR_STATE_CHANGED';END IF;
 END $monthly_full_legacy_conserved$`;
 const check=objectCheck(schema,major),guard='SELECT '+schema+'.payroll_fixed_registry_legacy_guard_v1()';
 const proof="SELECT jsonb_build_object('version',"+q(PROOF)+",'sourceCommit',"+q(sourceCommit)+",'schema',"+q(schema)+",'helperSha256',"+q(HELPER_SHA)+",'compatibilitySourceSha256',"+q(SOURCE_SHA)+",'newTables',3,'emptyLegacyTables',3,'capabilityDefinitionsAdded',2,'conflictsAdded',1,'roleAssignmentsAdded',0,'businessRowsAdded',0,'guardFunctionChanged',false,'priorStatePreserved',true,'priorFingerprint',encode(public.digest(current_setting('"+SLOT+"after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',"+objectFingerprint(schema)+")";
 const sourceHashes=Object.freeze({[HELPER]:HELPER_SHA,[MONTHLY_DAY_LEGACY_FIXTURE_SOURCE]:SOURCE_SHA});
 const plan=Object.freeze({version:VERSION,foundation,monthly,schema,major,sourceCommit,sourceHashes,
  sourceEntries:Object.freeze([SELF,HELPER,MONTHLY_DAY_LEGACY_FIXTURE_SOURCE,'scripts/lib/native-leave-installation.mjs',TEST]),
  installation:Object.freeze([preflight,before,monthly.qa192.legacyCompatibilitySeed,guard,check,after,audit,proof]),
  verification:Object.freeze([check,after,proof])});
 plans.set(plan,{read,sourceHashes});return plan;
}

export function assertMonthlyFullLegacySupportProof(proof,plan){
 exact(proof,['version','sourceCommit','schema','helperSha256','compatibilitySourceSha256','newTables','emptyLegacyTables','capabilityDefinitionsAdded','conflictsAdded','roleAssignmentsAdded','businessRowsAdded','guardFunctionChanged','priorStatePreserved','priorFingerprint','objectFingerprint']);
 assert.equal(proof.version,PROOF);assert.equal(proof.sourceCommit,plan.sourceCommit);assert.equal(proof.schema,plan.schema);
 assert.equal(proof.helperSha256,HELPER_SHA);assert.equal(proof.compatibilitySourceSha256,SOURCE_SHA);
 assert.equal(proof.newTables,3);assert.equal(proof.emptyLegacyTables,3);assert.equal(proof.capabilityDefinitionsAdded,2);assert.equal(proof.conflictsAdded,1);
 assert.equal(proof.roleAssignmentsAdded,0);assert.equal(proof.businessRowsAdded,0);assert.equal(proof.guardFunctionChanged,false);assert.equal(proof.priorStatePreserved,true);
 assert.match(proof.priorFingerprint,/^[a-f0-9]{64}$/);assert.match(proof.objectFingerprint,/^[a-f0-9]{64}$/);
 return proof;
}

export function installMonthlyFullLegacySupport(h){
 const plan=h.prepared?.legacySupport,record=plans.get(plan);
 assert.ok(record,'MONTHLY_FULL_LEGACY_UNMINTED_PLAN');
 assert.strictEqual(plan.foundation,h.qa);assert.strictEqual(plan.monthly,h.prepared.monthly);
 assert.equal(plan.schema,h.qa.schema);assert.equal(plan.major,h.major);assert.equal(plan.sourceCommit,h.sourceCommit);
 assert.equal(h.sourceCustody?.sourceCommit,h.sourceCommit,'MONTHLY_FULL_LEGACY_HOST_CUSTODY_REQUIRED');
 for(const[file,sha256]of Object.entries(record.sourceHashes))assert.equal(hash(lf(record.read(file))),sha256,'MONTHLY_FULL_LEGACY_SOURCE_CHANGED:'+file);
 const before=h.readFullSnapshot();
 h.setPhase('monthly-full-legacy-support-rehearsal');
 const rehearsal=h.json(plan.installation,{end:'ROLLBACK',fullJson:true});assertMonthlyFullLegacySupportProof(rehearsal,plan);
 assert.deepEqual(h.readFullSnapshot(),before,'MONTHLY_FULL_LEGACY_REHEARSAL_CHANGED_STATE');
 h.setPhase('monthly-full-legacy-support-installation');
 const installed=h.json(plan.installation,{fullJson:true});assertMonthlyFullLegacySupportProof(installed,plan);
 h.setPhase('monthly-full-legacy-support-durable-readonly');
 // The real092 guard takes LOCK TABLE; the independent durable batch omits it.
 const durable=h.json(plan.verification,{readOnly:true,fullJson:true});assertMonthlyFullLegacySupportProof(durable,plan);
 assert.deepEqual(durable,installed,'MONTHLY_FULL_LEGACY_DURABILITY_CHANGED');
 h.check('six source-pinned synthetic092 supports rehearse, commit and persist before192; real legacy guard/roles/old rows remain intact');
 return Object.freeze({version:'monthly-full-legacy-support-admission.v1',passed:true,sourceCommit:h.sourceCommit,
  rehearsal,installed,durable,syntheticCompatibilityFixture:true,migration044Reconstructed:false,newGrants:0,newRoles:0,sourceHashes:plan.sourceHashes,production:false});
}
