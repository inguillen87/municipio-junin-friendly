// Pure, source-pinned preparation; no connection, IAM or municipal decision.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {buildMixedContractAdoptionInstallation} from './mixed-contract-adoption-installation.mjs';
import {CLASSIFICATION_USE_PRIOR_PINS,CLASSIFICATION_USE_FINAL_HASHES} from './classification-registration-use-pins.mjs';
import {installationPriorMetadataFingerprint} from './installation-prior-metadata.mjs';
export const OWNER_CATALOG_SQL='scripts/migrations/187-municipal-owner-catalog-decision.sql';
export const OWNER_CATALOG_SQL_SHA256='c829c3d81da2bc3cc7e651597420c7f27ed0e02388f0a737ecd0351aaa3734a8';
const hash=v=>createHash('sha256').update(v).digest('hex'),q=v=>"'"+String(v).replaceAll("'","''")+"'",prefix='municontrol_owner_catalog187.',table='public.municipal_owner_catalog_provenance';
const facade=new Set(['municipal_owner_catalog_authority_v1','municipal_owner_catalog_preview_v1','municipal_owner_catalog_attempt_v1','municipal_owner_catalog_command_v1']);
const pin=d=>({...ownInstallationFunctionPin(d),runtime:facade.has(ownInstallationFunctionPin(d).name)});
function functions(source){return splitPostgresStatements(source).flatMap(s=>{const m=/\bCREATE(?: OR REPLACE)? FUNCTION public\.[a-z0-9_]+\(/.exec(s);return m?[s.slice(m.index)]:[];});}

/** Includes leave, materialized rows, all previous routines, schemas, types,
 * constraints, triggers, ACLs, roles and sequence metadata+values. Only the new
 * audited family/ledger and its own FK triggers are excluded. The ONE adapted
 * routine loses only prosrc here and is separately pinned before and after. */
export function ownerCatalogInstallationSnapshot(slot){
 assert.ok(['before','after'].includes(slot));
 const priorRelation="c.oid IS DISTINCT FROM to_regclass('"+table+"') AND NOT EXISTS(SELECT 1 FROM pg_index ledger_index WHERE ledger_index.indexrelid=c.oid AND ledger_index.indrelid=to_regclass('"+table+"'))";
 const priorTrigger="t.tgrelid IS DISTINCT FROM to_regclass('"+table+"') AND NOT(t.tgisinternal AND EXISTS(SELECT 1 FROM pg_constraint ledger_fk WHERE ledger_fk.oid=t.tgconstraint AND ledger_fk.contype='f' AND ledger_fk.conrelid=to_regclass('"+table+"')))";
 return `DO $snapshot$ DECLARE snapshot_relation record;n bigint;h text;meta jsonb;tables jsonb:='[]';sequences jsonb:='[]';result jsonb;BEGIN
 IF EXISTS(SELECT 1 FROM pg_class foreign_relation JOIN pg_namespace ns ON ns.oid=foreign_relation.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND foreign_relation.relkind='f') THEN RAISE EXCEPTION 'OWNER_CATALOG_UNAUDITED_OBJECT_SCOPE';END IF;
 FOR snapshot_relation IN SELECT relation.*,ns.nspname FROM pg_class relation JOIN pg_namespace ns ON ns.oid=relation.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND relation.relkind IN('r','p','m') AND relation.oid IS DISTINCT FROM to_regclass('${table}') ORDER BY relation.oid LOOP
  EXECUTE format('SELECT count(*),encode(public.digest(coalesce(string_agg(h, '''' ORDER BY h COLLATE "C"),''''),''sha256''),''hex'') FROM(SELECT encode(public.digest(to_jsonb(r)::text,''sha256''),''hex'') h FROM %I.%I r) hashed',snapshot_relation.nspname,snapshot_relation.relname) INTO n,h;
  SELECT jsonb_build_object('class',jsonb_build_object('owner',snapshot_relation.relowner,'acl',snapshot_relation.relacl,'kind',snapshot_relation.relkind,'persistence',snapshot_relation.relpersistence,'options',snapshot_relation.reloptions,'rls',snapshot_relation.relrowsecurity,'forceRls',snapshot_relation.relforcerowsecurity,'replicaIdentity',snapshot_relation.relreplident),
  'columns',(SELECT jsonb_agg(jsonb_build_object('attribute',to_jsonb(a),'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=snapshot_relation.oid AND a.attnum>0),
  'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid=snapshot_relation.oid),'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=snapshot_relation.oid),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE p.polrelid=snapshot_relation.oid)) INTO meta;
  tables:=tables||jsonb_build_array(jsonb_build_object('oid',snapshot_relation.oid,'schema',snapshot_relation.nspname,'name',snapshot_relation.relname,'rows',n,'rowsSha256',h,'metaSha256',encode(public.digest(meta::text,'sha256'),'hex')));
 END LOOP;
 FOR snapshot_relation IN SELECT relation.oid,relation.relname,ns.nspname,relation.relowner,relation.relacl,relation.reloptions,seq.* FROM pg_sequence seq JOIN pg_class relation ON relation.oid=seq.seqrelid JOIN pg_namespace ns ON ns.oid=relation.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' ORDER BY relation.oid LOOP
  EXECUTE format('SELECT encode(public.digest(jsonb_build_object(''last_value'',last_value,''is_called'',is_called)::text,''sha256''),''hex'') FROM %I.%I',snapshot_relation.nspname,snapshot_relation.relname) INTO h;sequences:=sequences||jsonb_build_array(jsonb_build_object('oid',snapshot_relation.oid,'hash',h,'meta',to_jsonb(snapshot_relation)));
 END LOOP;
 SELECT jsonb_build_object('tables',tables,'sequences',sequences,
 'functions',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'hash',encode(public.digest((CASE WHEN p.oid=to_regprocedure('public.native_employment_catalog_review_v1(jsonb,jsonb,uuid)') THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256'),'hex')) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND NOT(ns.nspname='public' AND left(p.proname,24)='municipal_owner_catalog_')),
 'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND ${priorTrigger}),
 'schemas',(SELECT jsonb_agg(to_jsonb(ns) ORDER BY ns.oid) FROM pg_namespace ns WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema'),
 'defaultAcl',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.oid) FROM pg_default_acl a),'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.oid) FROM pg_auth_members m),
 'views',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'definition',pg_get_viewdef(c.oid),'owner',c.relowner,'acl',c.relacl,'options',c.reloptions) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND c.relkind IN('v','m')),
 'relations',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.relname,'namespace',c.relnamespace,'owner',c.relowner,'kind',c.relkind,'persistence',c.relpersistence,'acl',c.relacl,'options',c.reloptions,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'replicaIdentity',c.relreplident,'tablespace',c.reltablespace,'accessMethod',c.relam,'isPartition',c.relispartition,'partBound',c.relpartbound::text) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND ${priorRelation}),
 'types',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_type t JOIN pg_namespace ns ON ns.oid=t.typnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND t.typrelid IS DISTINCT FROM to_regclass('${table}') AND NOT EXISTS(SELECT 1 FROM pg_type ledger_type WHERE ledger_type.oid=t.typelem AND ledger_type.typrelid=to_regclass('${table}'))),
 'attributes',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND ${priorRelation}),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('catalog',to_jsonb(i),'definition',pg_get_indexdef(i.indexrelid)) ORDER BY i.indexrelid) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND c.oid IS DISTINCT FROM to_regclass('${table}')),
 'eventTriggers',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) FROM pg_event_trigger e)) INTO result;
 PERFORM set_config('${prefix}${slot}',result::text,true);END $snapshot$`;
}

export function ownerCatalogTableCheck(){
 const checks=["decision_mode = 'owner'::text","independence IS FALSE",...['preview','command','receipt'].map(k=>`jsonb_typeof(${k}) = 'object'::text`),"length(command_sha256) = 64 AND command_sha256 ~ '^[a-f0-9]{64}$'::text","octet_length(preview::text) + octet_length(command::text) + octet_length(receipt::text) <= 8388608"].map(v=>v.replace(/[\s()]/g,''));
 return `DO $ledger_shape$ DECLARE ledger oid:=to_regclass('${table}');BEGIN
 IF ledger IS NULL OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND left(proname,24)='municipal_owner_catalog_')<>11 OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=ledger AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relpersistence='p' AND c.relrowsecurity AND NOT c.relforcerowsecurity)
 OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=ledger AND a.grantee<>c.relowner)
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=ledger) OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=ledger AND(a.attisdropped OR a.attidentity<>'' OR a.attgenerated<>'' OR a.attacl IS NOT NULL))
 OR (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=ledger AND a.attnum>0)
 IS DISTINCT FROM '[ ["review_id","uuid",true,null],["decision_mode","text",true,null],["independence","boolean",true,null],["preview","jsonb",true,null],["command","jsonb",true,null],["command_sha256","text",true,null],["receipt","jsonb",true,null],["created_at","timestamp with time zone",true,"clock_timestamp()"] ]'::jsonb
 THEN RAISE EXCEPTION 'OWNER_CATALOG_TABLE_SECURITY';END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid=ledger AND contype NOT IN('n','c'))<>2
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=ledger AND(contype NOT IN('p','f','c','n') OR NOT convalidated OR condeferrable OR condeferred))
 OR (SELECT array_agg(regexp_replace(pg_get_expr(conbin,conrelid),'[[:space:]()]','','g') ORDER BY regexp_replace(pg_get_expr(conbin,conrelid),'[[:space:]()]','','g')) FROM pg_constraint WHERE conrelid=ledger AND contype='c')
 IS DISTINCT FROM (SELECT array_agg(value ORDER BY value) FROM jsonb_array_elements_text(${q(JSON.stringify(checks))}::jsonb))
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=ledger AND contype='p' AND conkey=ARRAY[1]::smallint[])
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=ledger AND contype='f' AND conkey=ARRAY[1]::smallint[] AND confrelid='public.native_employment_catalog_review'::regclass AND confkey=ARRAY[1]::smallint[] AND confupdtype='a' AND confdeltype='a' AND confmatchtype='s')
 OR (SELECT count(*) FROM pg_index WHERE indrelid=ledger)<>1 OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid=ledger AND(NOT indisunique OR NOT indisvalid OR NOT indisready OR NOT indimmediate OR indexprs IS NOT NULL OR indpred IS NOT NULL OR indnatts<>1 OR indnkeyatts<>1 OR indkey::text<>'1'))
 THEN RAISE EXCEPTION 'OWNER_CATALOG_TABLE_SHAPE';END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid=ledger AND NOT tgisinternal)<>2
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=ledger AND tgname='municipal_owner_catalog_immutable' AND tgtype=58 AND tgenabled='O' AND NOT tgisinternal AND tgqual IS NULL AND tgfoid='public.native_employment_catalog_immutable_v1()'::regprocedure)
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=ledger AND tgname='municipal_owner_catalog_provenance_before' AND tgtype=7 AND tgenabled='O' AND NOT tgisinternal AND tgqual IS NULL AND tgfoid='public.municipal_owner_catalog_provenance_guard_v1()'::regprocedure)
 THEN RAISE EXCEPTION 'OWNER_CATALOG_TABLE_TRIGGER';END IF;
END $ledger_shape$`;
}

export function buildMunicipalOwnerCatalogInstallation(options){
 assert.ok(options&&typeof options==='object');assert.deepEqual(Object.keys(options).sort(),['read','sourceCommit']);assert.equal(typeof options.read,'function');assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);
 const sourceHashes={},cache=new Map(),read=p=>{if(!cache.has(p)){const text=options.read(p).replace(/\r\n?/g,'\n');sourceHashes[p]=hash(text);cache.set(p,text);}return cache.get(p);};
 const source=read(OWNER_CATALOG_SQL);assert.equal(hash(source),OWNER_CATALOG_SQL_SHA256,'OWNER_CATALOG_SOURCE_CHANGED');
 for(const file of['scripts/lib/municipal-owner-catalog-installation.mjs','assets/municipal-owner-catalog-model.js','scripts/lib/installation-prior-metadata.mjs'])read(file);
 const previous=buildMixedContractAdoptionInstallation({read,sourceCommit:options.sourceCommit}),original=functions(read('scripts/migrations/103-native-employment-catalog.sql')).find(d=>/^CREATE OR REPLACE FUNCTION public.native_employment_catalog_review_v1\(/.test(d));assert.ok(original);
 const definitions=functions(source),adapted=definitions.filter(d=>/^CREATE OR REPLACE FUNCTION public.native_employment_catalog_review_v1\(/.test(d)),newDefinitions=definitions.filter(d=>!adapted.includes(d));
 assert.equal(adapted.length,1);assert.equal(newDefinitions.length,11);assert.ok(newDefinitions.every(d=>/^CREATE FUNCTION public.municipal_owner_catalog_/.test(d)));
 const beforePin={...ownInstallationFunctionPin(original),runtime:true},afterPin={...ownInstallationFunctionPin(adapted[0]),runtime:true},newPins=newDefinitions.map(pin);
 assert.equal(new Set(newPins.map(p=>p.signature)).size,11);assert.equal(newPins.filter(p=>p.runtime).length,4);assert.deepEqual({...beforePin,sha256:null},{...afterPin,sha256:null});
 const classificationPins=CLASSIFICATION_USE_PRIOR_PINS.map(p=>({...p,sha256:CLASSIFICATION_USE_FINAL_HASHES[p.name]})),classification=pinsCheck(classificationPins,'OWNER_CATALOG_CLASSIFICATION_CHANGED');
 // 184/185/186 remain prerequisites. No old migration or policy is rewritten.
 const prerequisite=previous.afterCheck+';'+classification;
 assert.ok(!previous.afterCheck.includes(beforePin.signature),'OWNER_CATALOG_READINESS_REQUIRES_EXPLICIT_COMPOSITION');
 const beforeCheck=prerequisite+';'+pinsCheck([beforePin],'OWNER_CATALOG_PRIOR_FUNCTION_CHANGED'),afterCheck=prerequisite+';'+pinsCheck([afterPin,...newPins],'OWNER_CATALOG_FUNCTION_CHANGED')+';'+ownerCatalogTableCheck();
 const before=ownerCatalogInstallationSnapshot('before'),after=ownerCatalogInstallationSnapshot('after'),mutations=splitPostgresStatements(source);
 const mode=`DO $mode$ DECLARE present boolean;count_functions integer;BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'OWNER_CATALOG_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132187);present:=to_regclass('${table}') IS NOT NULL;SELECT count(*) INTO count_functions FROM pg_proc WHERE pronamespace='public'::regnamespace AND left(proname,24)='municipal_owner_catalog_';IF present AND count_functions=11 THEN PERFORM set_config('${prefix}mode','verify',true);ELSIF NOT present AND count_functions=0 THEN PERFORM set_config('${prefix}mode','install',true);ELSE RAISE EXCEPTION 'OWNER_CATALOG_PARTIAL_STATE';END IF;END $mode$`;
 const requireMode=expected=>`DO $strict$ BEGIN IF current_setting('${prefix}mode')<>${q(expected)} THEN RAISE EXCEPTION 'OWNER_CATALOG_PHASE_CHANGED';END IF;END $strict$`;
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`,apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')}END IF;END $apply$`;
 const audit=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'OWNER_CATALOG_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const objectSha=`encode(public.digest(jsonb_build_object('functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(${[afterPin,...newPins].map(p=>'to_regprocedure('+q(p.signature)+')').join(',')})),'ledger',(SELECT jsonb_build_object('class',to_jsonb(c),'attributes',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid),'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid=c.oid),'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid=c.oid)) FROM pg_class c WHERE c.oid='${table}'::regclass))::text,'sha256'),'hex')`;
 const proof=(phase,preserved)=>`SELECT jsonb_build_object('version','municipal-owner-catalog-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'mode',${phase},'newTables',1,'newFunctions',11,'adaptedFunctions',1,'businessWrites',0,'iamWrites',0,'existingAclChanges',0,'nominalRowsReturned',0,'transactionDataPreserved',${preserved},'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'priorMetadataSha256',${installationPriorMetadataFingerprint(prefix+'after')},'objectSha256',${objectSha}) AS proof`;
 const phase=expected=>[mode,requireMode(expected),choose,before,apply,afterCheck,after,audit,proof("current_setting('"+prefix+"mode')",true)];
 const readonly="DO $readonly$ BEGIN IF current_setting('transaction_read_only')<>'on' OR current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'OWNER_CATALOG_READONLY_REQUIRED';END IF;END $readonly$";
 const noHistory=`DO $history$ BEGIN IF EXISTS(SELECT 1 FROM ${table}) THEN RAISE EXCEPTION 'OWNER_CATALOG_ROLLBACK_HAS_HISTORY';END IF;END $history$`;
 const rollback=[afterCheck,noHistory,before,original,'DROP TRIGGER municipal_owner_catalog_provenance_before ON '+table,'DROP TRIGGER municipal_owner_catalog_immutable ON '+table,...newPins.toReversed().map(p=>'DROP FUNCTION '+p.signature),'DROP TABLE '+table,beforeCheck,after,audit];
 return{version:'municipal-owner-catalog-installation.v1',sourceCommit:options.sourceCommit,sourceHashes,previous,original,adapted:adapted[0],newDefinitions,newPins,beforePin,afterPin,prerequisite,beforeCheck,afterCheck,before,after,mutations,mode,choose,apply,audit,rehearsal:phase('install'),installation:phase('install'),repetition:phase('verify'),verification:[readonly,afterCheck,after,proof("'verify'",false)],rollback,rollbackVerification:[readonly,beforeCheck],connects:false,executesSql:false};
}

export function assertMunicipalOwnerCatalogDurability({installed,durable,repeated,batch}){
 assert.equal(batch.version,'municipal-owner-catalog-installation.v1');
 for(const[p,mode,preserved]of[[installed,'install',true],[durable,'verify',false],[repeated,'verify',true]]){
  assert.equal(p.version,batch.version);assert.equal(p.sourceCommit,batch.sourceCommit);assert.deepEqual(p.sourceHashes,batch.sourceHashes);assert.equal(p.mode,mode);assert.equal(p.transactionDataPreserved,preserved);
  for(const[k,v]of Object.entries({newTables:1,newFunctions:11,adaptedFunctions:1,businessWrites:0,iamWrites:0,existingAclChanges:0,nominalRowsReturned:0}))assert.equal(p[k],v);
  for(const k of['preservationSha256','priorMetadataSha256','objectSha256'])assert.match(p[k],/^[a-f0-9]{64}$/);
  for(const k of['priorMetadataSha256','objectSha256'])assert.equal(p[k],installed[k]);
 }
 return{passed:true,sourceCommit:batch.sourceCommit,transactionDataPreserved:true,priorMetadataPreserved:true,objectsDurable:true,wholeDatabaseStaticAcrossConnections:false,businessWrites:0};
}
