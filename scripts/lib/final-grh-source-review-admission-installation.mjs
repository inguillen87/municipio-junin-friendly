// Review-only schema construction. No connections, environment reads or SQL execution.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {projectOctober28RegistryParent} from './grh-october28-candidate-registry-source.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {finalSourcePrerequisite} from './final-contract-adoption-installation.mjs';
import {preservationSnapshot} from './native-leave-installation.mjs';
import {OWN_RELEASE_TARGETS} from './own-payroll-release-target.mjs';
import {ownInstallationDestination,ownInstallationSettings} from '../prepare-own-payroll-installation.mjs';

export const FINAL_REVIEW_ADMISSION_FILE='scripts/migrations/183-final-grh-source-review-admission.sql';
export const FINAL_REVIEW_ADMISSION_SQL_SHA256='a85c01c1bf2ae620b1af32a2e1564c52544562f39235557ee5e5549717f47e94';
export const FINAL_REVIEW_ADMISSION_REGISTRY_PARENT_SHA256='cd121a9a5fff31c9784f250cc410adfeb65cf6284288deddbfec3634b3be3dc6';
export const FINAL_REVIEW_ADMISSION_PROFILES=Object.freeze([
 Object.freeze({profile:'grh-junin-2026-10-01',sha256:'50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f',cutoff:'2026-10-01T15:17:29'}),
 Object.freeze({profile:'grh-junin-2026-10-14',sha256:'3efa61a77e5b160dff14dbb53a3634054dbc70a284c3f5101acd98ee9b5aecf4',cutoff:'2026-10-14T15:18:17'}),
]);
const sourcePins=Object.freeze({
 'scripts/migrations/144-final-grh-source-revision.sql':'818e53c560da8ec3cad55073071d0a56669c6581f51c20d910600ea58b9697d5',
 'scripts/lib/final-contract-adoption-installation.mjs':'c1fc4d150ee118cbeb42f0650f7d7e78db6d4689017870180b969051bbf12d6f',
 'scripts/lib/native-leave-installation.mjs':'57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef',
 'scripts/lib/grh-source-profiles.json':'fe04d0a5fc96d38ca2e6839556f63ea51a73626b3d1685c1f8ec3f6dfaf42a77',
 'scripts/lib/grh-october28-candidate-registry-source.mjs':'690af52ab26bec7ee02ddf5e9e2ccc6987491716ec939a126cac47d49d6ece1e',
});
const prefix='municontrol_final_review.',names=['grh_final_source_revision','grh_final_source_delta','grh_final_source_seal'];
const managed=['grh_final_source_revision_source_profile_check','grh_final_source_revision_source_sha256_check','grh_final_source_revision_source_cutoff_check','grh_final_source_revision_source_tuple_check'];
const q=v=>"'"+String(v).replaceAll("'","''")+"'",lf=v=>v.replace(/\r\n?/g,'\n'),hash=v=>createHash('sha256').update(v).digest('hex');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'FINAL_REVIEW_SNAPSHOT_ANCHOR_CHANGED');return s.replace(a,()=>b);};
const ids=names.map(n=>q('public.'+n)+'::regclass').join(',');
const columns=[
 [['id','uuid',true,'gen_random_uuid()'],['tenant_id','uuid'],['source_binding_id','uuid'],['parent_core_version_id','uuid'],['parent_curated_version_id','uuid'],['parent_publication_sha256','text'],['source_profile','text'],['source_sha256','text'],['source_cutoff','timestamp without time zone'],['core_manifest_sha256','text'],['curated_manifest_sha256','text'],['package_sha256','text'],['evidence','jsonb'],['created_transaction','bigint',true,'txid_current()'],['created_at','timestamp with time zone',true,'clock_timestamp()']],
 [['revision_id','uuid'],['entity','text'],['row_key','text'],['operation','text'],['previous_record','jsonb',false],['record','jsonb',false],['source_payload','jsonb',false]],
 [['revision_id','uuid'],['fingerprints','jsonb'],['sealed_at','timestamp with time zone',true,'clock_timestamp()']],
].map(shape=>shape.map(([name,type,notNull=true,defaultValue=null])=>[name,type,notNull,defaultValue]));
const foreign=[
 [[['parent_core_version_id'],'public.grh_core_source_version',['id']],[['parent_curated_version_id'],'public.grh_curated_source_version',['id']],[['tenant_id','source_binding_id'],'public.platform_tenant_source_binding',['tenant_id','id']]],
 [[['revision_id'],'public.grh_final_source_revision',['id']]],
 [[['revision_id'],'public.grh_final_source_revision',['id']]],
];
const keys=[[[['id'],'p'],[['tenant_id','source_binding_id','source_sha256'],'u']],[[['revision_id','entity','row_key'],'p']],[[['revision_id'],'p']]];
const fixedChecks=[
 [['grh_final_source_revision_parent_publication_sha256_check',"(parent_publication_sha256 ~ '^[a-f0-9]{64}$'::text)"],['grh_final_source_revision_core_manifest_sha256_check',"(core_manifest_sha256 ~ '^[a-f0-9]{64}$'::text)"],['grh_final_source_revision_curated_manifest_sha256_check',"(curated_manifest_sha256 ~ '^[a-f0-9]{64}$'::text)"],['grh_final_source_revision_package_sha256_check',"(package_sha256 ~ '^[a-f0-9]{64}$'::text)"],['grh_final_source_revision_evidence_check',"(jsonb_typeof(evidence) = 'object'::text)"]],
 [['grh_final_source_delta_row_key_check',"(row_key ~ '^[a-f0-9]{64}$'::text)"],['grh_final_source_delta_operation_check',"(operation = ANY (ARRAY['add'::text, 'replace'::text, 'remove'::text]))"],['grh_final_source_delta_previous_record_check',"((previous_record IS NULL) OR (jsonb_typeof(previous_record) = 'object'::text))"],['grh_final_source_delta_record_check',"((record IS NULL) OR (jsonb_typeof(record) = 'object'::text))"],['grh_final_source_delta_source_payload_check',"((source_payload IS NULL) OR (jsonb_typeof(source_payload) = 'object'::text))"],['grh_final_source_delta_check',"(((operation = 'add'::text) AND (previous_record IS NULL) AND (record IS NOT NULL)) OR ((operation = 'replace'::text) AND (previous_record IS NOT NULL) AND (record IS NOT NULL) AND (previous_record <> record)) OR ((operation = 'remove'::text) AND (previous_record IS NOT NULL) AND (record IS NULL)))"],['grh_final_source_delta_check1',"(((entity ~~ 'core/%'::text) AND (((operation = 'remove'::text) AND (source_payload IS NULL)) OR ((operation <> 'remove'::text) AND (source_payload IS NOT NULL)))) OR ((entity ~~ 'curated/%'::text) AND (source_payload IS NULL)))"]],
 [['grh_final_source_seal_fingerprints_check',"(jsonb_typeof(fingerprints) = 'object'::text)"]],
];
const oldChecks=[
 [managed[0],"(source_profile = 'grh-junin-2026-10-01'::text)"],
 [managed[1],"(source_sha256 = '50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f'::text)"],
 [managed[2],"(source_cutoff = '2026-10-01 15:17:29'::timestamp without time zone)"],
];
const triggers=names.flatMap(name=>[[name,'a_final_revision_guard','public.grh_final_source_guard_v1()',31,false,false],[name,'a_final_revision_no_truncate','public.grh_final_source_guard_v1()',34,false,false]]).concat([
 [names[2],'b_final_revision_seal','public.grh_final_source_seal_guard_v1()',7,false,false],
 [names[0],'final_revision_seal_at_commit','public.grh_final_source_seal_required_v1()',5,true,true],
]);

// Compare all previous rows, functions, leave data, roles and metadata. Only
// these four named CHECK records can differ, and they have a separate exact audit.
export function finalReviewAdmissionSnapshot(slot){
 let s=preservationSnapshot(slot);const leave=" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
 assert.equal(s.split(leave).length,3);s=s.replaceAll(leave,'');
 s=once(s,"AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'');
 s=once(s,"p.relkind IN ('r','p')","p.relkind IN ('r','p','m')");
 s=once(s,'FROM pg_constraint k WHERE k.conrelid=c.oid)',`FROM pg_constraint k WHERE k.conrelid=c.oid AND NOT(k.conrelid='public.grh_final_source_revision'::regclass AND k.conname IN(${managed.map(q).join(',')})))`);
 s=once(s,'p.oid,p.relname,s.nspname FROM pg_class p','p.*,s.nspname FROM pg_class p');
 s=once(s,"jsonb_build_object('oid',c.oid,'hash',h)","jsonb_build_object('oid',c.oid,'hash',h,'metadata',jsonb_build_object('owner',c.relowner,'acl',c.relacl,'kind',c.relkind,'options',c.reloptions,'persistence',c.relpersistence,'sequence',(SELECT to_jsonb(seq) FROM pg_sequence seq WHERE seq.seqrelid=c.oid),'ownership',(SELECT jsonb_agg(to_jsonb(dep) ORDER BY dep.refobjid,dep.refobjsubid,dep.deptype) FROM pg_depend dep WHERE dep.classid='pg_class'::regclass AND dep.objid=c.oid AND dep.deptype IN('a','i'))))");
 s=once(s,' PERFORM set_config',` result:=result||jsonb_build_object(
 'types',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_type t JOIN pg_namespace ns ON ns.oid=t.typnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema'),
 'relations',(SELECT jsonb_agg(jsonb_build_object('oid',r.oid,'schema',r.relnamespace,'name',r.relname,'kind',r.relkind,'owner',r.relowner,'acl',r.relacl,'options',r.reloptions,'persistence',r.relpersistence,'rls',r.relrowsecurity,'forceRls',r.relforcerowsecurity,'replicaIdentity',r.relreplident,'tablespace',r.reltablespace,'accessMethod',r.relam,'rowType',r.reltype,'typedTable',r.reloftype,'isPartition',r.relispartition,'partitionBound',r.relpartbound) ORDER BY r.oid) FROM pg_class r JOIN pg_namespace ns ON ns.oid=r.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema'),
 'attributes',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class r ON r.oid=a.attrelid JOIN pg_namespace ns ON ns.oid=r.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema'),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('metadata',to_jsonb(i),'definition',pg_get_indexdef(i.indexrelid)) ORDER BY i.indexrelid) FROM pg_index i JOIN pg_class r ON r.oid=i.indrelid JOIN pg_namespace ns ON ns.oid=r.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema'),
 'eventTriggers',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) FROM pg_event_trigger e));
 PERFORM set_config`);
 s=once(s,' BEGIN\n FOR c'," BEGIN\n IF EXISTS(SELECT 1 FROM pg_class r JOIN pg_namespace ns ON ns.oid=r.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND r.relkind='f') THEN RAISE EXCEPTION 'FINAL_REVIEW_FOREIGN_TABLE_UNAUDITED';END IF;\n FOR c");
 return s.replaceAll('municontrol_sql111.',prefix);
}

function shapeCheck(tuple,phase){
 assert.ok(['before','after','old'].includes(phase));
 const expectations=names.map((name,i)=>({name,columns:columns[i],foreign:foreign[i],keys:keys[i],checks:fixedChecks[i]}));
 return `DO $final_review_shape$ DECLARE item jsonb;relation oid;expected_checks jsonb;actual jsonb;mode text:=current_setting('${prefix}mode'); BEGIN
 FOR item IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(expectations))}::jsonb) LOOP
 relation:=to_regclass('public.'||(item->>'name'));
 IF relation IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=relation AND relkind='r' AND relpersistence='p' AND relowner=current_user::regrole AND relrowsecurity AND NOT relforcerowsecurity AND reloptions IS NULL AND relreplident='d' AND NOT relispartition)
 OR EXISTS(SELECT 1 FROM pg_class r CROSS JOIN LATERAL aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) a WHERE r.oid=relation AND a.grantee<>r.relowner)
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=relation)
 OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=relation AND attnum>0 AND(attisdropped OR attidentity<>'' OR attgenerated<>'' OR attacl IS NOT NULL)) THEN RAISE EXCEPTION 'FINAL_REVIEW_TABLE_PROTECTION';END IF;
 SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) INTO actual FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=relation AND a.attnum>0;
 IF actual IS DISTINCT FROM item->'columns' THEN RAISE EXCEPTION 'FINAL_REVIEW_COLUMN_SHAPE';END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY value::text COLLATE "C"),'[]') INTO actual FROM(SELECT jsonb_build_array((SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num),ns.nspname||'.'||r.relname,(SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.confkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num)) value FROM pg_constraint c JOIN pg_class r ON r.oid=c.confrelid JOIN pg_namespace ns ON ns.oid=r.relnamespace WHERE c.conrelid=relation AND c.contype='f') f;
 IF actual IS DISTINCT FROM(SELECT jsonb_agg(value ORDER BY value::text COLLATE "C") FROM jsonb_array_elements(item->'foreign')) THEN RAISE EXCEPTION 'FINAL_REVIEW_FOREIGN_SHAPE';END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY value::text COLLATE "C"),'[]') INTO actual FROM(SELECT jsonb_build_array((SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num),c.contype::text) value FROM pg_constraint c WHERE c.conrelid=relation AND c.contype IN('p','u')) k;
 IF actual IS DISTINCT FROM(SELECT jsonb_agg(value ORDER BY value::text COLLATE "C") FROM jsonb_array_elements(item->'keys')) THEN RAISE EXCEPTION 'FINAL_REVIEW_KEY_SHAPE';END IF;
 expected_checks:=item->'checks';
 IF item->>'name'='grh_final_source_revision' THEN expected_checks:=expected_checks||CASE WHEN ${phase==='old'?'true':phase==='before'?"mode IN('install','preflight_before')":'false'} THEN ${q(JSON.stringify(oldChecks))}::jsonb ELSE ${q(JSON.stringify([[managed[3],tuple]]))}::jsonb END;END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_array(c.conname,pg_get_expr(c.conbin,c.conrelid,false)) ORDER BY c.conname),'[]') INTO actual FROM pg_constraint c WHERE c.conrelid=relation AND c.contype='c';
 IF actual IS DISTINCT FROM(SELECT jsonb_agg(value ORDER BY value->>0) FROM jsonb_array_elements(expected_checks)) THEN RAISE EXCEPTION 'FINAL_REVIEW_CHECK_SHAPE';END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=relation AND(c.contype NOT IN('p','u','f','c','n','t') OR NOT c.convalidated OR NOT c.conislocal OR c.coninhcount<>0 OR c.conparentid<>0 OR NOT coalesce((to_jsonb(c)->>'conenforced')::boolean,true) OR c.contype<>'t' AND(c.condeferrable OR c.condeferred) OR c.contype='f' AND(c.confupdtype<>'a' OR c.confdeltype<>'a' OR c.confmatchtype<>'s') OR c.contype='c' AND c.connoinherit OR c.contype='t' AND(item->>'name'<>'grh_final_source_revision' OR c.conname<>'final_revision_seal_at_commit' OR NOT c.condeferrable OR NOT c.condeferred)))
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid=relation AND contype='t')<>(CASE WHEN item->>'name'='grh_final_source_revision' THEN 1 ELSE 0 END)
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid=relation AND contype='n')<>(CASE WHEN current_setting('server_version_num')::int>=180000 THEN(SELECT count(*) FROM pg_attribute WHERE attrelid=relation AND attnum>0 AND attnotnull) ELSE 0 END)
 OR EXISTS(SELECT 1 FROM pg_constraint fk WHERE fk.conrelid=relation AND fk.contype='f' AND((SELECT count(*) FROM pg_trigger t WHERE t.tgconstraint=fk.oid AND t.tgisinternal)<>4 OR EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE t.tgconstraint=fk.oid AND(t.tgenabled<>'O' OR NOT t.tgisinternal OR ns.nspname<>'pg_catalog' OR p.proname NOT IN('RI_FKey_check_ins','RI_FKey_check_upd','RI_FKey_noaction_del','RI_FKey_noaction_upd'))))) THEN RAISE EXCEPTION 'FINAL_REVIEW_CONSTRAINT_FLAGS';END IF;
 IF (SELECT count(*) FROM pg_index WHERE indrelid=relation)<>jsonb_array_length(item->'keys') OR EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=relation AND(NOT i.indisunique OR NOT i.indisvalid OR NOT i.indisready OR NOT i.indimmediate OR i.indexprs IS NOT NULL OR i.indpred IS NOT NULL OR i.indnatts<>i.indnkeyatts OR i.indnullsnotdistinct OR NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=relation AND c.conindid=i.indexrelid AND c.contype IN('p','u')))) THEN RAISE EXCEPTION 'FINAL_REVIEW_INDEX_SHAPE';END IF;
 END LOOP;
 SELECT jsonb_agg(jsonb_build_array(r.relname,t.tgname,ns.nspname||'.'||p.proname||'()',t.tgtype,t.tgdeferrable,t.tginitdeferred) ORDER BY r.relname,t.tgname) INTO actual FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE t.tgrelid IN(${ids}) AND NOT t.tgisinternal;
 IF actual IS DISTINCT FROM(SELECT jsonb_agg(value ORDER BY value->>0,value->>1) FROM jsonb_array_elements(${q(JSON.stringify(triggers))}::jsonb)) OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid IN(${ids}) AND NOT t.tgisinternal AND(t.tgenabled<>'O' OR t.tgqual IS NOT NULL OR t.tgnargs<>0 OR t.tgargs<>''::bytea OR t.tgattr<>''::int2vector OR t.tgoldtable IS NOT NULL OR t.tgnewtable IS NOT NULL OR t.tgparentid<>0)) THEN RAISE EXCEPTION 'FINAL_REVIEW_TRIGGER_SHAPE';END IF;
 END $final_review_shape$`;
}

export function buildFinalGrhSourceReviewAdmissionInstallation({read,sourceCommit,major}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.ok([17,18].includes(major));
 const sourceHashes={};for(const[file,digest]of Object.entries(sourcePins)){const text=lf(read(file));assert.equal(hash(text),digest,'FINAL_REVIEW_PREREQUISITE_SOURCE_CHANGED: '+file);sourceHashes[file]=digest;}
 const registryParent=projectOctober28RegistryParent(read('scripts/lib/grh-source-profiles.json'));
 assert.equal(registryParent.parentRegistrySha256,FINAL_REVIEW_ADMISSION_REGISTRY_PARENT_SHA256,'FINAL_REVIEW_REGISTRY_PARENT_CHANGED');
 assert.equal(registryParent.currentRegistrySha256,sourceHashes['scripts/lib/grh-source-profiles.json'],'FINAL_REVIEW_REGISTRY_CURRENT_CHANGED');
 const registryCustody=Object.freeze({version:registryParent.version,currentRegistrySha256:registryParent.currentRegistrySha256,parentRegistrySha256:registryParent.parentRegistrySha256,wholeInverseVerified:registryParent.wholeInverseVerified,sqlValidityGranted:false});
 const profiles=JSON.parse(registryParent.parentRegistryRaw);for(const p of FINAL_REVIEW_ADMISSION_PROFILES){const actual=profiles.profiles.find(v=>v.id===p.profile);assert.ok(actual);assert.equal(actual.source.sha256.toLowerCase(),p.sha256);assert.equal(actual.source.cutoff,p.cutoff);assert.equal(actual.publicationMode,'candidate_only');}
 const source=lf(read(FINAL_REVIEW_ADMISSION_FILE));assert.equal(hash(source),FINAL_REVIEW_ADMISSION_SQL_SHA256,'FINAL_REVIEW_REVIEWED_SQL_CHANGED');sourceHashes[FINAL_REVIEW_ADMISSION_FILE]=FINAL_REVIEW_ADMISSION_SQL_SHA256;
 const migration=splitPostgresStatements(source);assert.equal(migration.length,1);assert.match(migration[0],/\bDO \$final_review183\$/);const tuple=/\$tuple183\$([^]*?)\$tuple183\$/.exec(source)?.[1];assert.ok(tuple);
 const sourcePrerequisite=finalSourcePrerequisite(read),target=OWN_RELEASE_TARGETS.find(t=>t.major===major);assert.equal(sourcePrerequisite.pins.length,9);
 const destination=ownInstallationDestination(target).replace(/END IF;END \$destination\$$/,`END IF;IF (SELECT oid FROM pg_database WHERE datname=current_database())<>${major===17?16395:16396}::oid THEN RAISE EXCEPTION 'FINAL_REVIEW_DATABASE_OID';END IF;END $destination$`);
 assert.match(destination,/FINAL_REVIEW_DATABASE_OID/);const settings=[...ownInstallationSettings];
 const state=purpose=>`DO $final_review_state$ DECLARE old_count integer;new_count integer; BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${q(['verify','preflight'].includes(purpose)?'on':'off')} THEN RAISE EXCEPTION 'FINAL_REVIEW_TRANSACTION_MODE';END IF;
 IF NOT pg_try_advisory_xact_lock(183) THEN RAISE EXCEPTION 'FINAL_REVIEW_ADMISSION_BUSY';END IF;
 LOCK TABLE public.grh_final_source_revision,public.grh_final_source_delta,public.grh_final_source_seal IN ACCESS SHARE MODE NOWAIT;
 SELECT count(*) INTO old_count FROM pg_constraint WHERE conrelid='public.grh_final_source_revision'::regclass AND conname IN(${managed.slice(0,3).map(q).join(',')});SELECT count(*) INTO new_count FROM pg_constraint WHERE conrelid='public.grh_final_source_revision'::regclass AND conname=${q(managed[3])};
 IF old_count=3 AND new_count=0 AND ${['install','preflight'].includes(purpose)} THEN
 ${purpose==='install'?'LOCK TABLE public.grh_final_source_revision IN ACCESS EXCLUSIVE MODE NOWAIT;':''}
 PERFORM set_config('${prefix}mode',${q(purpose==='install'?'install':'preflight_before')},true);
 ELSIF old_count=0 AND new_count=1 THEN PERFORM set_config('${prefix}mode',${q(purpose==='install'?'repeat':purpose==='preflight'?'preflight_after':purpose)},true);
 ELSE RAISE EXCEPTION 'FINAL_REVIEW_UNREVIEWED_STATE';END IF;
 PERFORM set_config('${prefix}managed_before',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]')::text FROM pg_constraint c WHERE c.conrelid='public.grh_final_source_revision'::regclass AND c.conname IN(${managed.map(q).join(',')})),true);
 EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'FINAL_REVIEW_ADMISSION_BUSY';END $final_review_state$`;
 const before=finalReviewAdmissionSnapshot('before'),after=finalReviewAdmissionSnapshot('after'),initial=shapeCheck(tuple,'before'),final=shapeCheck(tuple,'after');
 const audit=`DO $final_review_audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'FINAL_REVIEW_PRIOR_STATE_CHANGED';END IF;END $final_review_audit$`;
 const fingerprint=slot=>`encode(public.digest(current_setting('${prefix}${slot}')::jsonb::text,'sha256'),'hex')`;
 const metadata=`encode(public.digest(jsonb_build_object('objects',current_setting('${prefix}after')::jsonb-'tables'-'sequences','tables',(SELECT jsonb_agg(value-'rows'-'rowsSha256' ORDER BY value->>'schema',value->>'name') FROM jsonb_array_elements(current_setting('${prefix}after')::jsonb->'tables')),'sequences',(SELECT jsonb_agg(value-'hash' ORDER BY value->>'oid') FROM jsonb_array_elements(current_setting('${prefix}after')::jsonb->'sequences')))::text,'sha256'),'hex')`;
 const constraintFingerprint=`(SELECT encode(public.digest(coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.oid),'[]')::text,'sha256'),'hex') FROM pg_constraint c WHERE c.conrelid='public.grh_final_source_revision'::regclass AND c.conname IN(${managed.map(q).join(',')}))`;
 const sourceRows=`(SELECT encode(public.digest(jsonb_agg(jsonb_build_array(value->'oid',value->'rows',value->'rowsSha256') ORDER BY value->>'oid')::text,'sha256'),'hex') FROM jsonb_array_elements(current_setting('${prefix}after')::jsonb->'tables') WHERE value->>'schema'='public' AND value->>'name' IN(${names.map(q).join(',')}))`;
 const proof=transactional=>`SELECT jsonb_build_object('version','final-grh-source-review-admission.v1','sourceCommit',${q(sourceCommit)},'sqlSha256','${FINAL_REVIEW_ADMISSION_SQL_SHA256}','baselineSqlSha256','${sourcePins['scripts/migrations/144-final-grh-source-revision.sql']}','targetMajor',${major},'mode',current_setting('${prefix}mode'),'allChecksPassed',true,'newTables',0,'newFunctions',0,'existingAclChanges',0,'businessWrites',0,'nominalRowsReturned',0,'managedCheckNames',${q(JSON.stringify(managed))}::jsonb,'priorTableCount',jsonb_array_length(current_setting('${prefix}after')::jsonb->'tables'),'transactionDataPreserved',${transactional},${transactional?"'beforeFingerprint',"+fingerprint('before')+",":''}'priorFingerprint',${fingerprint('after')},'priorMetadataSha256',${metadata},'managedConstraintsSha256',${constraintFingerprint},'sourceRowsSha256',${sourceRows}) AS proof`;
 const installation=[...settings,destination,state('install'),sourcePrerequisite.check,initial,before,...migration,sourcePrerequisite.check,final,after,audit,proof(true)];
 const repetition=[...settings,destination,state('repeat'),sourcePrerequisite.check,final,before,...migration,sourcePrerequisite.check,final,after,audit,proof(true)];
 const durableVerification=['SET TRANSACTION READ ONLY',...settings,destination,state('verify'),sourcePrerequisite.check,final,after,proof(false)];
 const preflight=['SET TRANSACTION READ ONLY',...settings,destination,state('preflight'),sourcePrerequisite.check,initial,after,proof(false)];
 const rollbackSql=`DO $final_review_rollback$ BEGIN
 LOCK TABLE public.grh_final_source_revision IN ACCESS EXCLUSIVE MODE NOWAIT;
 IF EXISTS(SELECT 1 FROM public.grh_final_source_revision WHERE source_profile='grh-junin-2026-10-14' OR source_sha256='3efa61a77e5b160dff14dbb53a3634054dbc70a284c3f5101acd98ee9b5aecf4' OR source_cutoff=timestamp '2026-10-14 15:18:17') THEN RAISE EXCEPTION 'FINAL_REVIEW_ROLLBACK_NEW_SOURCE_EXISTS';END IF;
 ALTER TABLE public.grh_final_source_revision DROP CONSTRAINT grh_final_source_revision_source_tuple_check,
 ADD CONSTRAINT grh_final_source_revision_source_profile_check CHECK(source_profile='grh-junin-2026-10-01'),
 ADD CONSTRAINT grh_final_source_revision_source_sha256_check CHECK(source_sha256='50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f'),
 ADD CONSTRAINT grh_final_source_revision_source_cutoff_check CHECK(source_cutoff=timestamp '2026-10-01 15:17:29');
 EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'FINAL_REVIEW_ADMISSION_BUSY';END $final_review_rollback$`;
 const rollback=[...settings,destination,state('rollback'),sourcePrerequisite.check,final,before,rollbackSql,sourcePrerequisite.check,shapeCheck(tuple,'old'),after,audit,proof(true)];
 const transaction=(statements,completion,readOnly=false)=>({begin:'BEGIN',statements,completion,readOnly});
 return{version:'final-grh-source-review-admission.v1',sourceCommit,major,target,sourceHashes,registryCustody,sourcePrerequisite,managedCheckNames:[...managed],migration,settings,destination,before,after,initial,final,audit,preflight,installation,repetition,durableVerification,guardedRollback:transaction(rollback,'COMMIT'),transactions:{rehearsal:transaction(installation,'ROLLBACK'),install:transaction(installation,'COMMIT'),durable:transaction(durableVerification,'COMMIT',true),repeat:transaction(repetition,'COMMIT')},connects:false,executesSql:false};
}

export function assertFinalGrhSourceReviewAdmissionDurability({installed,durable,repeated,sourceCommit,major}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.ok([17,18].includes(major));
 const keys=['version','sourceCommit','sqlSha256','baselineSqlSha256','targetMajor','mode','allChecksPassed','newTables','newFunctions','existingAclChanges','businessWrites','nominalRowsReturned','managedCheckNames','priorTableCount','transactionDataPreserved','priorFingerprint','priorMetadataSha256','managedConstraintsSha256','sourceRowsSha256'];
 for(const[label,p]of Object.entries({installed,durable,repeated})){
  assert.deepEqual(Object.keys(p).sort(),[...keys,...(label==='durable'?[]:['beforeFingerprint'])].sort());
  assert.equal(p.version,'final-grh-source-review-admission.v1');assert.equal(p.sourceCommit,sourceCommit);assert.equal(p.sqlSha256,FINAL_REVIEW_ADMISSION_SQL_SHA256);assert.equal(p.baselineSqlSha256,sourcePins['scripts/migrations/144-final-grh-source-revision.sql']);assert.equal(p.targetMajor,major);assert.equal(p.allChecksPassed,true);assert.deepEqual(p.managedCheckNames,managed);
  for(const k of['newTables','newFunctions','existingAclChanges','businessWrites','nominalRowsReturned'])assert.equal(p[k],0);
  assert.ok(Number.isSafeInteger(p.priorTableCount)&&p.priorTableCount>=3);assert.equal(p.transactionDataPreserved,label!=='durable');assert.ok(label==='installed'?['install','repeat'].includes(p.mode):p.mode===(label==='durable'?'verify':'repeat'));
  for(const k of['priorFingerprint','priorMetadataSha256','managedConstraintsSha256','sourceRowsSha256'])assert.match(p[k],/^[a-f0-9]{64}$/);
  if(label!=='durable'){assert.equal(p.beforeFingerprint,p.priorFingerprint);assert.match(p.beforeFingerprint,/^[a-f0-9]{64}$/);}
 }
 for(const p of[durable,repeated])for(const k of['priorTableCount','priorMetadataSha256','managedConstraintsSha256'])assert.equal(p[k],installed[k]);
 return{passed:true,transactionDataPreserved:true,wholeDatabaseStaticAcrossConnections:false,oldSourceRowsPreserved:true,sourceActivated:false,existingAclChanges:0,businessWrites:0};
}
