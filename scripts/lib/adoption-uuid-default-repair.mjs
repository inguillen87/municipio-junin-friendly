// Exact schema-only repair of two EMPTY adoption tables. No connection or DML.
import assert from 'node:assert/strict';
import {buildOwnJurisdictionInstallation} from './own-payroll-jurisdiction-installation.mjs';
import {adoptionTableShapeSql,ADOPTION_TABLE_PINS,ADOPTION_INSTALL_TABLES} from './employment-adoption-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
const q=s=>"'"+String(s).replaceAll("'","''")+"'",prefix='municontrol_adoption_uuid.';
export const UUID_REPAIR_TABLES=Object.freeze(['employment_adoption_proposal','employment_adoption_decision']);
// Observed pgcrypto-wrapper shapes under the actual runtime search_path.
export const UUID_WRAPPER_TABLE_PINS=Object.freeze({employment_adoption_proposal:'8c6b4fb849252ccdbf2c312f362a876d017246d0f5194b50eaee0dccd20fc776',employment_adoption_decision:'508011adacd83a33f4317beda406012583da717b81338b397aa896883a97f4ab'});
const targets=UUID_REPAIR_TABLES.map(n=>`to_regclass(${q('public.'+n)})`).join(',');
export function adoptionUuidPreservation(slot){
 let s=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true').replace("NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'true').replaceAll('municontrol_sql111.',prefix);
 const expr='pg_get_expr(d.adbin,d.adrelid)';assert.equal(s.split(expr).length,2);
 // Exclude ONLY the two separately shape-pinned id defaults from conservation.
 // Every attribute, row, table OID, ACL, constraint, index and trigger remains.
 s=s.replace(expr,()=>`CASE WHEN c.oid IN(${targets}) AND a.attname='id' THEN 'gen_random_uuid()' ELSE ${expr} END`);
 const anchor=' PERFORM set_config';assert.equal(s.split(anchor).length,2);
 s=s.replace(anchor,()=>` result:=result||jsonb_build_object('otherDefaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum JOIN pg_class dc ON dc.oid=d.adrelid JOIN pg_namespace dn ON dn.oid=dc.relnamespace WHERE dn.nspname NOT LIKE 'pg_%' AND dn.nspname<>'information_schema' AND NOT(dc.oid IN(${targets}) AND a.attname='id')));\n PERFORM set_config`);
 return s;
}
export function adoptionUuidTableCheck(after){return `DO $uuid_tables$ DECLARE shapes jsonb:=(${adoptionTableShapeSql()});item jsonb;c pg_class;actual text;allowed text; BEGIN
 FOR item IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(Object.entries(ADOPTION_TABLE_PINS).map(([name,sha256])=>({name,sha256,wrapper:UUID_WRAPPER_TABLE_PINS[name]??null}))))}::jsonb) LOOP
 SELECT * INTO c FROM pg_class WHERE oid=to_regclass('public.'||(item->>'name'));
 actual:=encode(public.digest((shapes->(item->>'name'))::text,'sha256'),'hex');allowed:=item->>'sha256';
 IF c.oid IS NULL OR c.relowner<>current_user::regrole OR actual IS NULL OR (actual IS DISTINCT FROM allowed ${after?'':"AND actual IS DISTINCT FROM (item->>'wrapper')"})
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner)
 OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attacl IS NOT NULL)
 OR EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid) THEN RAISE EXCEPTION 'ADOPTION_UUID_TABLE_CHANGED' USING DETAIL=item->>'name';END IF;
 END LOOP;
 IF ${ADOPTION_INSTALL_TABLES.map(n=>`EXISTS(SELECT 1 FROM public.${n})`).join(' OR ')} THEN RAISE EXCEPTION 'ADOPTION_UUID_TABLE_NOT_EMPTY';END IF;
 END $uuid_tables$`;}
export function buildAdoptionUuidDefaultRepair(options){
 assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);
 const jurisdiction=buildOwnJurisdictionInstallation(options),readyPin=jurisdiction.afterPins.at(-1);
 const prerequisite=pinsCheck([...jurisdiction.afterPins,jurisdiction.newPin],'ADOPTION_UUID_PREREQUISITE_CHANGED');
 const state=`DO $uuid_state$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('search_path')<>'pg_catalog, public, pg_temp' THEN RAISE EXCEPTION 'ADOPTION_UUID_CONTEXT_CHANGED';END IF;
 PERFORM pg_advisory_xact_lock(130);PERFORM pg_advisory_xact_lock(132136);PERFORM pg_advisory_xact_lock(132142);PERFORM pg_advisory_xact_lock(132143);PERFORM pg_advisory_xact_lock(143); END $uuid_state$`;
 const lock='LOCK TABLE '+UUID_REPAIR_TABLES.map(n=>'public.'+n).join(',')+' IN ACCESS EXCLUSIVE MODE';
 const apply=UUID_REPAIR_TABLES.map(n=>`DO $uuid_apply$ DECLARE expression text; BEGIN
 SELECT pg_get_expr(d.adbin,d.adrelid) INTO expression FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE d.adrelid='public.${n}'::regclass AND a.attname='id';
 IF expression='public.gen_random_uuid()' THEN ALTER TABLE public.${n} ALTER COLUMN id SET DEFAULT pg_catalog.gen_random_uuid();
 ELSIF expression IS DISTINCT FROM 'gen_random_uuid()' THEN RAISE EXCEPTION 'ADOPTION_UUID_DEFAULT_CHANGED';END IF; END $uuid_apply$`);
 const before=adoptionUuidPreservation('before'),after=adoptionUuidPreservation('after'),initial=adoptionUuidTableCheck(false),final=adoptionUuidTableCheck(true);
 const audit=`DO $uuid_audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'ADOPTION_UUID_PRIOR_STATE_CHANGED';END IF;END $uuid_audit$`;
 const runtime='DO $uuid_runtime$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $uuid_runtime$';
 const proof=`SELECT jsonb_build_object('version','adoption-uuid-default-repair.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(jurisdiction.sourceHashes))}::jsonb,'allChecksPassed',true,'runtimeReadinessPassed',true,'reviewedDefaults',2,'newTables',0,'newFunctions',0,'permissionChanges',0,'businessOperations',0,'nominalRowsReturned',0,'adoptionRows',0,'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'tableFingerprint',encode(public.digest((${adoptionTableShapeSql()})::text,'sha256'),'hex')) AS proof`;
 return {version:'adoption-uuid-default-repair.v1',sourceCommit:options.sourceCommit,sourceHashes:jurisdiction.sourceHashes,connects:false,executesSql:false,readyPin,prerequisite,state,lock,initial,final,before,after,apply,audit,runtime,proof,
 installation:[state,lock,prerequisite,initial,before,...apply,final,prerequisite,runtime,after,audit,proof],
 durableVerification:['SET TRANSACTION READ ONLY',prerequisite,final,runtime,after,proof]};
}
export function assertAdoptionUuidRepairDurability({installed,durable,batch}){
 assert.deepEqual(installed,durable,'ADOPTION_UUID_DURABILITY_CHANGED');
 assert.deepEqual(Object.keys(installed).sort(),['version','sourceCommit','sourceHashes','allChecksPassed','runtimeReadinessPassed','reviewedDefaults','newTables','newFunctions','permissionChanges','businessOperations','nominalRowsReturned','adoptionRows','priorFingerprint','tableFingerprint'].sort());
 for(const[k,v]of Object.entries({version:batch.version,sourceCommit:batch.sourceCommit,sourceHashes:batch.sourceHashes,allChecksPassed:true,runtimeReadinessPassed:true,reviewedDefaults:2,newTables:0,newFunctions:0,permissionChanges:0,businessOperations:0,nominalRowsReturned:0,adoptionRows:0}))assert.deepEqual(installed[k],v);
 for(const k of ['priorFingerprint','tableFingerprint'])assert.match(installed[k],/^[a-f0-9]{64}$/);
 return {passed:true,priorStatePreserved:true,runtimeReadinessPassed:true,independentDurabilityVerified:true};
}
