// Review-only atomic batch. No database connection or municipal row write.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",lf=v=>v.replace(/\r\n?/g,'\n'),hash=v=>createHash('sha256').update(v).digest('hex');
export const ADOPTION_INSTALL_FILES=Object.freeze(['132-employment-adoption-preparation.sql','133-employment-adoption-application.sql','134-employment-adoption-history-read.sql','135-native-employee-read-projection.sql','136-adopted-employment-lifecycle.sql']);
export const ADOPTION_INSTALL_SHA=Object.freeze({
 '132-employment-adoption-preparation.sql':'8166f5785cf8846ba63065df506471d0f49efca0f7c3e92d6c6d755ac988a274',
 '133-employment-adoption-application.sql':'36230ca788dc8afc3312c9bbb25ecf45029bf84a1a2373669a48245cca798ea9',
 '134-employment-adoption-history-read.sql':'d326c185d37448b5b5d1517cc2d694a1eb1f947eae911ddd2a610a91ceb31120',
 '135-native-employee-read-projection.sql':'6d2e3f512340b0986ebd94845ffa86ef42d46d7d0fc2ba5958db4721a7491ea0',
 '136-adopted-employment-lifecycle.sql':'577f0c7aee2d594ec67153810e052190b1a055b17d4d0a6ba96065f68ea1870a',
});
export const ADOPTION_INSTALL_TABLES=Object.freeze(['employment_adoption_proposal','employment_adoption_seal','employment_adoption_decision','employment_adoption_application']);
export const ADOPTION_TABLE_PINS=Object.freeze({
 employment_adoption_proposal:'a286c75c611cd5426d0a0cc69213723bc5d1f1f65f0dda442581af732e415bd9',
 employment_adoption_seal:'a35224a95352def06f0b377db1d2c4723cd8ff362f067bd06337de983b9ce45c',
 employment_adoption_decision:'fa3291f45332de32bfcb47f94713948e7488b8834d509c1697d1efeac4338117',
 employment_adoption_application:'e58eaeed23e997f88caa161992695d88f0caacf728c5283e483c0e4ed261d608',
});
const facadeNames=new Set(['employment_adoption_bootstrap_v1','employment_adoption_attempt_v1','employment_adoption_propose_v1','employment_adoption_history_read_v1','native_employee_read_projection_v1','native_employee_directory_snapshot_v1',...['bootstrap','proposal','propose','review','attempt','read','projection'].map(n=>'native_employment_lifecycle_'+n+'_v2')]);
const relations=`(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN(${ADOPTION_INSTALL_TABLES.map(q).join(',')}))`;
const ownCondition="s.nspname='public' AND(p.proname LIKE 'employment_adoption_%' OR p.proname IN('native_employee_read_projection_v1','native_employee_directory_snapshot_v1') OR p.proname LIKE 'native_employment_lifecycle_%_v2')";
const guardSignature='public.grh_effective_baseline_guard_v1()';
const guardAnchor=" IF TG_TABLE_NAME='employment_contract' THEN";
const guardExtension="\n  IF TG_OP='UPDATE' AND public.employment_adoption_update_allowed_v1(OLD,NEW) IS TRUE THEN RETURN NEW; END IF;";

export function adoptionTableShapeSql(){return `SELECT jsonb_object_agg(name,shape ORDER BY name) FROM (
 SELECT c.relname AS name,jsonb_build_object('columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(k.conname,k.contype,pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred) ORDER BY k.conname COLLATE "C") FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype<>'n'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(ic.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indimmediate) ORDER BY ic.relname COLLATE "C") FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=c.oid),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY t.tgname COLLATE "C") FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'kind',c.relkind,'persistence',c.relpersistence,'options',c.reloptions,'replicaIdentity',c.relreplident) AS shape
 FROM pg_class c WHERE c.oid IN${relations}) shapes`;}

function snapshot(slot){
 let s=preservationSnapshot(slot),exclusion="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
 assert.equal(s.split(exclusion).length,3);s=s.replaceAll(exclusion,'p.oid NOT IN'+relations).replace("s.nspname='public' AND p.proname LIKE 'native_leave_%'",ownCondition).replaceAll('municontrol_sql111.','municontrol_adoption_install.');
 // Only SQL133's reviewed body change is allowed; its OID, owner, ACL and all
 // other pg_proc fields remain part of the prior-state fingerprint.
 const proc='to_jsonb(p)::text';assert.equal(s.split(proc).length,2);
 s=s.replace(proc,()=>`(CASE WHEN p.oid=to_regprocedure(${q(guardSignature)}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);
 s=s.replace(' PERFORM set_config',()=>` result:=result||jsonb_build_object('types',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND t.typrelid NOT IN${relations} AND NOT EXISTS(SELECT 1 FROM pg_type element WHERE element.oid=t.typelem AND element.typrelid IN${relations})));\n PERFORM set_config`);
 return s;
}

export function firstAdoptionInstallationStatement(migration,guardBeforeCheck){return `DO $install$ BEGIN IF current_setting('municontrol_adoption_install.mode')='first' THEN
 EXECUTE ${q(guardBeforeCheck)};
 ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')}
 IF EXISTS(SELECT 1 FROM public.employment_adoption_proposal) OR EXISTS(SELECT 1 FROM public.employment_adoption_seal) OR EXISTS(SELECT 1 FROM public.employment_adoption_decision) OR EXISTS(SELECT 1 FROM public.employment_adoption_application) THEN RAISE EXCEPTION 'ADOPTION_INSTALL_UNEXPECTED_ROW';END IF;
 END IF;END $install$`;}

export function buildEmploymentAdoptionInstallation({read,sourceCommit}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const sources=ADOPTION_INSTALL_FILES.map(f=>({file:f,source:lf(read('scripts/migrations/'+f))}));
 for(const x of sources)assert.equal(hash(x.source),ADOPTION_INSTALL_SHA[x.file],'Unreviewed adoption migration '+x.file);
 const migration=sources.flatMap(x=>splitPostgresStatements(x.source).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,'')));assert.ok(migration.every(s=>!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));
 const definitions=migration.filter(s=>/^CREATE (?:OR REPLACE )?FUNCTION public\./.test(s)),bySignature=new Map();
 for(const d of definitions){const p=ownInstallationFunctionPin(d);p.runtime=facadeNames.has(p.name);bySignature.set(p.signature,p);}
 const pins=[...bySignature.values()];assert.equal(pins.length,47);assert.equal(pins.filter(p=>p.runtime).length,13);
 const baseline=splitPostgresStatements(lf(read('scripts/migrations/096-grh-effective-source.sql'))).find(s=>s.includes('CREATE FUNCTION '+guardSignature));assert.ok(baseline);
 assert.equal(baseline.split(guardAnchor).length,2);
 const guardBefore=ownInstallationFunctionPin(baseline),guardAfter=ownInstallationFunctionPin(baseline.replace(guardAnchor,()=>guardAnchor+guardExtension));
 const guardCheck=(p,code)=>pinsCheck([{...p,runtime:false}],code);
 const ownCheck=pinsCheck(pins,'ADOPTION_INSTALL_FUNCTION_METADATA');
 assert.equal(Object.keys(ADOPTION_TABLE_PINS).length,4,'Reviewed table pins are required');
 const tableCheck=`DO $tables$ DECLARE shapes jsonb:=(${adoptionTableShapeSql()});item jsonb;c pg_class; BEGIN
 FOR item IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(Object.entries(ADOPTION_TABLE_PINS).map(([name,sha256])=>({name,sha256}))))}::jsonb) LOOP
  SELECT * INTO c FROM pg_class WHERE oid=to_regclass('public.'||(item->>'name'));
  IF c.oid IS NULL OR c.relowner<>current_user::regrole OR encode(public.digest((shapes->(item->>'name'))::text,'sha256'),'hex')<>item->>'sha256'
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner)
   OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attacl IS NOT NULL)
   OR EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)
  THEN RAISE EXCEPTION 'ADOPTION_INSTALL_TABLE_METADATA' USING DETAIL=item->>'name';END IF;
 END LOOP; END $tables$`;
 const state=`DO $state$ DECLARE n integer;t integer;BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'ADOPTION_INSTALL_ISOLATION_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(132136);
 SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${ownCondition};SELECT count(*) INTO t FROM pg_class WHERE oid IN${relations};
 IF n=0 AND t=0 THEN PERFORM set_config('municontrol_adoption_install.mode','first',true);
 ELSIF n=${pins.length} AND t=4 THEN PERFORM set_config('municontrol_adoption_install.mode','repeat',true);
 ELSE RAISE EXCEPTION 'ADOPTION_INSTALL_PARTIAL_STATE';END IF;
 END $state$`;
 const before=snapshot('before'),after=snapshot('after');
 const priorAudit=`DO $prior$ DECLARE old jsonb:=current_setting('municontrol_adoption_install.before')::jsonb;new jsonb:=current_setting('municontrol_adoption_install.after')::jsonb;x jsonb;y jsonb;BEGIN
 IF old-'triggers' IS DISTINCT FROM new-'triggers' THEN RAISE EXCEPTION 'ADOPTION_INSTALL_PRIOR_STATE_CHANGED' USING DETAIL=(SELECT jsonb_agg(key ORDER BY key)::text FROM jsonb_each(old-'triggers') o WHERE o.value IS DISTINCT FROM new->o.key);END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(old->'triggers') LOOP SELECT value INTO y FROM jsonb_array_elements(new->'triggers') WHERE value->'oid'=x->'oid';IF x IS DISTINCT FROM y THEN RAISE EXCEPTION 'ADOPTION_INSTALL_OLD_TRIGGER_CHANGED';END IF;END LOOP;
 FOR y IN SELECT value FROM jsonb_array_elements(new->'triggers') n WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(old->'triggers') o WHERE o.value->'oid'=n.value->'oid') LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_constraint k ON k.oid=t.tgconstraint WHERE t.oid=(y->>'oid')::oid AND t.tgisinternal AND t.tgenabled='O' AND k.contype='f' AND k.conrelid IN${relations}) THEN RAISE EXCEPTION 'ADOPTION_INSTALL_UNEXPECTED_TRIGGER';END IF;
 END LOOP;END $prior$`;
 const guardBeforeCheck=guardCheck(guardBefore,'ADOPTION_INSTALL_BASELINE_BEFORE');
 const first=firstAdoptionInstallationStatement(migration,guardBeforeCheck);
 const verification=[guardCheck(guardAfter,'ADOPTION_INSTALL_BASELINE_AFTER'),ownCheck,tableCheck];
 const priorPins=splitPostgresStatements(lf(read('scripts/migrations/110-native-employment-lifecycle.sql'))).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,'')).filter(s=>/^CREATE OR REPLACE FUNCTION public\.native_employment_lifecycle_/.test(s)).map(d=>{const p=ownInstallationFunctionPin(d);p.runtime=/^native_employment_lifecycle_(bootstrap|proposal|propose|review|attempt|read|projection)_v1$/.test(p.name);return p;});
 assert.equal(priorPins.length,23);
 for(const [file,names] of [['104-native-employment-changes.sql',['native_employment_change_context_v1','native_employee_contract_guard_v1']],['103-native-employment-catalog.sql',['native_employee_catalog_v1']],['112-native-salary-definitions.sql',['native_salary_serialized_v1']]])for(const name of names){const d=splitPostgresStatements(lf(read('scripts/migrations/'+file))).find(s=>new RegExp('CREATE (?:OR REPLACE )?FUNCTION public\\.'+name+'\\(').test(s));assert.ok(d,name);priorPins.push({...ownInstallationFunctionPin(d),runtime:false});}
 const contextDefinition=splitPostgresStatements(lf(read('scripts/migrations/067-native-employee-registration.sql'))).find(s=>s.includes('CREATE OR REPLACE FUNCTION native_employee_context_v1('));assert.ok(contextDefinition);
 priorPins.push({...ownInstallationFunctionPin(contextDefinition),sha256:'0511c6a642c569791839195fb36b61ff5aa22acf0a360980e7ad45458c28cf7c',runtime:false});assert.equal(priorPins.length,28);
 const prerequisiteCheck=pinsCheck(priorPins,'ADOPTION_INSTALL_PREREQUISITE_METADATA');
 const objectProof=`SELECT jsonb_build_object('functionMetadata',jsonb_agg(jsonb_build_object('oid',p.oid,'metadata',to_jsonb(p)) ORDER BY p.oid),'tables',(${adoptionTableShapeSql()}),'rows',(SELECT jsonb_build_object('proposals',count(*),'sealed',(SELECT count(*) FROM public.employment_adoption_seal),'decisions',(SELECT count(*) FROM public.employment_adoption_decision),'applications',(SELECT count(*) FROM public.employment_adoption_application)) FROM public.employment_adoption_proposal)) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE ${ownCondition}`;
 const dataProof=`DO $data$ DECLARE item text;n bigint;h text;rows jsonb:='{}';BEGIN FOREACH item IN ARRAY ARRAY[${ADOPTION_INSTALL_TABLES.map(q).join(',')}] LOOP
 EXECUTE format('SELECT count(*),encode(public.digest(coalesce(string_agg(h,'''' ORDER BY h COLLATE "C"),''''),''sha256''),''hex'') FROM(SELECT encode(public.digest(to_jsonb(r)::text,''sha256''),''hex'') h FROM public.%I r) hashed',item) INTO n,h;rows:=rows||jsonb_build_object(item,jsonb_build_object('count',n,'hash',h));END LOOP;
 PERFORM set_config('municontrol_adoption_install.data',rows::text,true);END $data$`;
 const proof=`SELECT jsonb_build_object('version','employment-adoption-installation.v1','sourceCommit',${q(sourceCommit)},'sourceHashes',${q(JSON.stringify(ADOPTION_INSTALL_SHA))}::jsonb,'allChecksPassed',true,'mode',coalesce(current_setting('municontrol_adoption_install.mode',true),'verify'),'newTables',4,'newFunctions',${pins.length},'runtimeFacades',13,'adoptionWriterGranted',false,'nominalRowsReturned',0,'priorFingerprint',encode(public.digest(current_setting('municontrol_adoption_install.after')::jsonb::text,'sha256'),'hex'),'objectFingerprint',encode(public.digest((${objectProof})::text,'sha256'),'hex'),'dataFingerprint',encode(public.digest(current_setting('municontrol_adoption_install.data')::jsonb::text,'sha256'),'hex'),'counts',current_setting('municontrol_adoption_install.data')::jsonb) AS proof`;
 // Caller supplies BEGIN REPEATABLE READ / COMMIT and records uncertain commit.
 // Repetition executes checks only. No DDL, INSERT, grants or receipt rewrite.
 const statements=[state,prerequisiteCheck,before,first,...verification,after,priorAudit,dataProof,proof];
 return {version:'employment-adoption-installation.v1',connects:false,executesSql:false,sourceCommit,sourceHashes:ADOPTION_INSTALL_SHA,pins,priorPins,guardBefore,guardAfter,guardBeforeCheck,migration,first,statements,verification:[prerequisiteCheck,...verification,after,dataProof,proof],tableShapeSql:adoptionTableShapeSql()};
}

export function assertEmploymentAdoptionDurability({installed,durable,sourceCommit}){
 for(const p of [installed,durable]){
  assert.deepEqual(Object.keys(p).sort(),['version','sourceCommit','sourceHashes','allChecksPassed','mode','newTables','newFunctions','runtimeFacades','adoptionWriterGranted','nominalRowsReturned','priorFingerprint','objectFingerprint','dataFingerprint','counts'].sort(),'ADOPTION_INSTALL_PROOF_SHAPE');assert.ok(['first','repeat','verify'].includes(p.mode));
  assert.equal(p.version,'employment-adoption-installation.v1');assert.equal(p.sourceCommit,sourceCommit);assert.deepEqual(p.sourceHashes,ADOPTION_INSTALL_SHA);
  assert.equal(p.allChecksPassed,true);assert.equal(p.newTables,4);assert.equal(p.newFunctions,47);assert.equal(p.runtimeFacades,13);assert.equal(p.adoptionWriterGranted,false);assert.equal(p.nominalRowsReturned,0);
  for(const f of ['priorFingerprint','objectFingerprint','dataFingerprint'])assert.match(p[f],/^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(p.counts).sort(),[...ADOPTION_INSTALL_TABLES].sort());
  for(const x of Object.values(p.counts)){assert.ok(Number.isSafeInteger(x.count)&&x.count>=0);assert.match(x.hash,/^[a-f0-9]{64}$/);assert.deepEqual(Object.keys(x).sort(),['count','hash']);}
 }
 for(const f of ['priorFingerprint','objectFingerprint','dataFingerprint','counts'])assert.deepEqual(durable[f],installed[f],'ADOPTION_INSTALL_DURABILITY_CHANGED: '+f);
 return {passed:true,sourceCommit,nominalRowsReturned:0};
}
