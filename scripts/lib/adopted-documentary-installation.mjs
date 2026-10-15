// Review-only SQL construction. This module never opens a connection or executes SQL.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {preservationSnapshot,pinsCheck} from './native-leave-installation.mjs';
import {OWN_RELEASE_TARGETS} from './own-payroll-release-target.mjs';
import {ownInstallationDestination,ownInstallationSettings} from '../prepare-own-payroll-installation.mjs';

export const DOCUMENTARY_INSTALL_SQL_SHA256='91f6435ae28293423634e408780891b8cc7816dd53b750d79c70e28fc687f582';
export const DOCUMENTARY_INSTALL_HELPER_SHA256='b92e8220de522a9644bca8ccc5261c1a345101f88ae046e4519d36b42c48c7dd';
export const DOCUMENTARY_INSTALL_FILE='scripts/migrations/178-adopted-documentary-read.sql';
const helperSignature='public.payroll_document_subject_v1(jsonb,uuid)';
const signatures=Object.freeze([
 'public.employee_payroll_detail_v1(text,uuid,integer,text,uuid,uuid,uuid,date,text,integer,integer)',
 'public.employee_payroll_documents_v1(text,uuid,integer,text,uuid,uuid,uuid)',
 'public.payroll_export_roster_v1(text,uuid,integer,text,uuid,uuid,uuid)',
]);
// These are exact observed bodies, not a PostgreSQL-version inference or a
// whitespace-normalized allowlist. A different body in either base stops here.
const targetBefore=Object.freeze({
 17:Object.freeze(['ad5c9ce9df693d51e326b1708c79977e11fb1c49901be1c8d17d013d3fb4109c','fbb185e0809d25c0244c841d07b8fe44f26c6780115f8a36be3d692d7c3f50b9','4e38106e906d20e220b1ab58037474ab3d931f06c1e6af114f1b8a465363b3f1']),
 18:Object.freeze(['80c11c8410657b17a0739d41d11fe45c398ec309f26d5db3ea819c83eda1b827','726d9068326a7dbc9659f2509f958d2ae062a546e0a7cd91b7b5e6abcb4cbb25','4e38106e906d20e220b1ab58037474ab3d931f06c1e6af114f1b8a465363b3f1']),
});
const databaseOids=Object.freeze({17:16395,18:16396});
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const lf=v=>v.replace(/\r\n?/g,'\n');
const hash=v=>createHash('sha256').update(v).digest('hex');
const once=(s,from,to)=>{assert.equal(s.split(from).length,2,'DOCUMENTARY_INSTALL_SNAPSHOT_SOURCE_CHANGED');return s.replace(from,()=>to);};
const ids=signatures.map(s=>'to_regprocedure('+q(s)+')').join(',');
const namespace="documentary_namespace.nspname NOT LIKE 'pg_%' AND documentary_namespace.nspname<>'information_schema'";
const prefix='municontrol_documentary_install';

// Reuse the existing conservation audit, removing both of SQL111's deliberate
// leave exclusions. No data or object other than the four named functions is
// outside this audit; the three facade bodies have separate exact hash checks.
export function documentaryInstallationSnapshot(slot){
 let sql=preservationSnapshot(slot);
 const leave=" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
 assert.equal(sql.split(leave).length,3,'DOCUMENTARY_INSTALL_LEAVE_SNAPSHOT_CHANGED');
 sql=sql.replaceAll(leave,'');
 sql=once(sql,"p.relkind IN ('r','p')","p.relkind IN ('r','p','m')");
 sql=once(sql,"AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'AND p.oid IS DISTINCT FROM to_regprocedure('+q(helperSignature)+')');
 sql=once(sql,'to_jsonb(p)::text',`(CASE WHEN p.oid IN(${ids}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);
 sql=once(sql,"p.oid,p.relname,s.nspname FROM pg_class p","p.*,s.nspname FROM pg_class p");
 sql=once(sql,"jsonb_build_object('oid',c.oid,'hash',h)",`jsonb_build_object('oid',c.oid,'hash',h,'metadata',jsonb_build_object('class',jsonb_build_object('owner',c.relowner,'acl',c.relacl,'kind',c.relkind,'persistence',c.relpersistence,'options',c.reloptions),'sequence',(SELECT to_jsonb(seq) FROM pg_sequence seq WHERE seq.seqrelid=c.oid),'ownership',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.refobjid,d.refobjsubid,d.deptype) FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype IN('a','i'))))`);
 sql=once(sql," BEGIN\n FOR c",` BEGIN
 IF EXISTS(SELECT 1 FROM pg_class documentary_relation JOIN pg_namespace documentary_namespace ON documentary_namespace.oid=documentary_relation.relnamespace WHERE ${namespace} AND documentary_relation.relkind='f') THEN RAISE EXCEPTION 'DOCUMENTARY_INSTALL_FOREIGN_TABLE_UNAUDITED';END IF;
 FOR c`);
 sql=once(sql,' PERFORM set_config',` result:=result||jsonb_build_object(
  'types',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_type t JOIN pg_namespace documentary_namespace ON documentary_namespace.oid=t.typnamespace WHERE ${namespace}),
  'relations',(SELECT jsonb_agg(jsonb_build_object('oid',documentary_relation.oid,'schema',documentary_relation.relnamespace,'name',documentary_relation.relname,'kind',documentary_relation.relkind,'owner',documentary_relation.relowner,'acl',documentary_relation.relacl,'options',documentary_relation.reloptions,'persistence',documentary_relation.relpersistence,'rls',documentary_relation.relrowsecurity,'forceRls',documentary_relation.relforcerowsecurity,'replicaIdentity',documentary_relation.relreplident,'tablespace',documentary_relation.reltablespace,'accessMethod',documentary_relation.relam,'rowType',documentary_relation.reltype,'typedTable',documentary_relation.reloftype,'isPartition',documentary_relation.relispartition,'partitionBound',documentary_relation.relpartbound) ORDER BY documentary_relation.oid) FROM pg_class documentary_relation JOIN pg_namespace documentary_namespace ON documentary_namespace.oid=documentary_relation.relnamespace WHERE ${namespace}),
  'attributes',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class documentary_relation ON documentary_relation.oid=a.attrelid JOIN pg_namespace documentary_namespace ON documentary_namespace.oid=documentary_relation.relnamespace WHERE ${namespace}),
  'indexes',(SELECT jsonb_agg(jsonb_build_object('metadata',to_jsonb(i),'definition',pg_get_indexdef(i.indexrelid)) ORDER BY i.indexrelid) FROM pg_index i JOIN pg_class documentary_relation ON documentary_relation.oid=i.indexrelid JOIN pg_namespace documentary_namespace ON documentary_namespace.oid=documentary_relation.relnamespace WHERE ${namespace}),
  'eventTriggers',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) FROM pg_event_trigger e));
 PERFORM set_config`);
 return sql.replaceAll('municontrol_sql111.',prefix+'.');
}

function metadataPin(signature,index,sha256){
 const argNames=[['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_contract','p_date','p_type','p_period','p_month'],['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_contract'],['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_dataset']][index];
 return {name:signature.slice(7,signature.indexOf('(')),signature,sha256,argNames,defaults:'',resultType:'jsonb',language:'plpgsql',returnsSet:false,strict:false,definer:true,volatility:'v',config:['search_path=public, pg_temp'],runtime:true};
}

function stateCheck(pairs,purpose){
 assert.ok(['install','repeat','verify'].includes(purpose));
 return `DO $state178$ DECLARE x jsonb;actual text;all_before boolean:=true;all_after boolean:=true; BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'DOCUMENTARY_INSTALL_ISOLATION_REQUIRED';END IF;
 ${purpose==='verify'?"IF current_setting('transaction_read_only')<>'on' THEN RAISE EXCEPTION 'DOCUMENTARY_INSTALL_READ_ONLY_REQUIRED';END IF;":''}
 PERFORM pg_advisory_xact_lock(178);
 FOR x IN SELECT value FROM jsonb_array_elements(${q(JSON.stringify(pairs))}::jsonb) LOOP
  SELECT encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(x->>'signature');
  all_before:=all_before AND actual IS NOT DISTINCT FROM x->>'beforeHash';all_after:=all_after AND actual IS NOT DISTINCT FROM x->>'afterHash';
 END LOOP;
 IF all_before AND to_regprocedure(${q(helperSignature)}) IS NULL ${purpose==='install'?'':'AND false'} THEN PERFORM set_config('${prefix}.mode','first',true);
 ELSIF all_after AND to_regprocedure(${q(helperSignature)}) IS NOT NULL THEN PERFORM set_config('${prefix}.mode',${q(purpose==='verify'?'verify':'repeat')},true);
 ELSE RAISE EXCEPTION 'DOCUMENTARY_INSTALL_PARTIAL_OR_UNREVIEWED_STATE';END IF;
 END $state178$`;
}

export function buildAdoptedDocumentaryInstallation({read,sourceCommit,major}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 assert.ok(major===17||major===18,'DOCUMENTARY_INSTALL_TARGET_INVALID');
 const source=lf(read(DOCUMENTARY_INSTALL_FILE));assert.equal(hash(source),DOCUMENTARY_INSTALL_SQL_SHA256,'Unreviewed documentary migration');
 const json=tag=>{const m=new RegExp('\\$'+tag+'\\$([\\s\\S]*?)\\$'+tag+'\\$').exec(source);assert.ok(m,'DOCUMENTARY_INSTALL_PIN_BLOCK_MISSING');return JSON.parse(m[1]);};
 const canonical=json('pins178'),variants=json('variants178');assert.equal(canonical.length,3);assert.equal(variants.length,3);
 const pairs=signatures.map((signature,index)=>{const matches=[...canonical,...variants].filter(p=>p.signature===signature&&p.beforeHash===targetBefore[major][index]);assert.equal(matches.length,1,'DOCUMENTARY_INSTALL_TARGET_PIN_MISSING');return {signature,beforeHash:matches[0].beforeHash,afterHash:matches[0].afterHash};});
 const beforePins=pairs.map((p,i)=>metadataPin(p.signature,i,p.beforeHash)),afterPins=pairs.map((p,i)=>metadataPin(p.signature,i,p.afterHash));
 const helper=/\$definition178\$([\s\S]*?)\$definition178\$/.exec(source);assert.ok(helper);
 const helperPin={...ownInstallationFunctionPin(helper[1]),runtime:false};assert.equal(helperPin.signature,helperSignature);assert.equal(helperPin.sha256,DOCUMENTARY_INSTALL_HELPER_SHA256);
 const migration=splitPostgresStatements(source);assert.equal(migration.length,1);assert.ok(/\bDO \$documentary178\$/.test(migration[0]),'DOCUMENTARY_INSTALL_STATEMENT_CHANGED');assert.ok(migration.every(s=>!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));
 const target=OWN_RELEASE_TARGETS.find(t=>t.major===major);assert.ok(target);
 const destination=ownInstallationDestination(target).replace(/END IF;END \$destination\$$/,`END IF;IF (SELECT oid FROM pg_database WHERE datname=current_database())<>${databaseOids[major]}::oid THEN RAISE EXCEPTION 'DOCUMENTARY_INSTALL_DATABASE_OID';END IF;END $destination$`);assert.ok(destination.includes('DOCUMENTARY_INSTALL_DATABASE_OID'));
 const settings=[...ownInstallationSettings];
 const before=documentaryInstallationSnapshot('before'),after=documentaryInstallationSnapshot('after');
 const finalCheck=pinsCheck([...afterPins,helperPin],'DOCUMENTARY_INSTALL_FINAL_METADATA');
 const firstCheck=pinsCheck(beforePins,'DOCUMENTARY_INSTALL_BEFORE_METADATA');
 const preflight=`DO $preflight178$ BEGIN IF current_setting('${prefix}.mode')='first' THEN EXECUTE ${q(firstCheck)};ELSE EXECUTE ${q(finalCheck)};END IF;END $preflight178$`;
 const audit=`DO $audit178$ BEGIN IF current_setting('${prefix}.before')::jsonb IS DISTINCT FROM current_setting('${prefix}.after')::jsonb THEN RAISE EXCEPTION 'DOCUMENTARY_INSTALL_PRIOR_STATE_CHANGED';END IF;END $audit178$`;
 const fingerprint=slot=>`encode(public.digest(current_setting('${prefix}.${slot}')::jsonb::text,'sha256'),'hex')`;
 const objectFingerprint=`(SELECT encode(public.digest(jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid IN(${ids},to_regprocedure(${q(helperSignature)})))`;
 const dataFingerprint=`encode(public.digest((jsonb_build_object('tables',current_setting('${prefix}.after')::jsonb->'tables','sequences',current_setting('${prefix}.after')::jsonb->'sequences'))::text,'sha256'),'hex')`;
 const proof=includeBefore=>`SELECT jsonb_build_object('version','adopted-documentary-installation.v1','sourceCommit',${q(sourceCommit)},'sqlSha256',${q(DOCUMENTARY_INSTALL_SQL_SHA256)},'targetMajor',${major},'allChecksPassed',true,'mode',current_setting('${prefix}.mode'),'newTables',0,'newFunctions',1,'adaptedReaders',3,'runtimeHelpers',0,'nominalRowsReturned',0,'priorTableCount',jsonb_array_length(current_setting('${prefix}.after')::jsonb->'tables'),${includeBefore?"'beforeFingerprint',"+fingerprint('before')+",":''}'priorFingerprint',${fingerprint('after')},'objectsFingerprint',${objectFingerprint},'dataFingerprint',${dataFingerprint}) AS proof`;
 const installCore=[stateCheck(pairs,'install'),preflight,before,...migration,after,audit,finalCheck,proof(true)];
 const repeatCore=[stateCheck(pairs,'repeat'),finalCheck,before,...migration,after,audit,finalCheck,proof(true)];
 const verifyCore=[stateCheck(pairs,'verify'),finalCheck,after,proof(false)];
 const installation=[...settings,destination,...installCore],repetition=[...settings,destination,...repeatCore];
 const durableVerification=['SET TRANSACTION READ ONLY',...settings,destination,...verifyCore];
 const transaction=(statements,completion,readOnly=false)=>({begin:'BEGIN',statements,completion,readOnly});
 return {version:'adopted-documentary-installation.v1',connects:false,executesSql:false,sourceCommit,major,target:{...target,databaseOid:databaseOids[major]},sqlSha256:DOCUMENTARY_INSTALL_SQL_SHA256,pairs,beforePins,afterPins,helperPin,migration,settings,destination,before,after,preflight,audit,finalCheck,installation,durableVerification,repetition,
  transactions:{rehearsal:transaction(installation,'ROLLBACK'),install:transaction(installation,'COMMIT'),durable:transaction(durableVerification,'COMMIT',true),repeat:transaction(repetition,'COMMIT')}};
}

export function assertAdoptedDocumentaryDurability({installed,durable,repeated,sourceCommit,major}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.ok(major===17||major===18);
 const keys=['version','sourceCommit','sqlSha256','targetMajor','allChecksPassed','mode','newTables','newFunctions','adaptedReaders','runtimeHelpers','nominalRowsReturned','priorTableCount','priorFingerprint','objectsFingerprint','dataFingerprint'];
 for(const [label,p] of [['installed',installed],['durable',durable],['repeated',repeated]]){
  assert.ok(p&&typeof p==='object');assert.deepEqual(Object.keys(p).sort(),[...keys,...(label==='durable'?[]:['beforeFingerprint'])].sort(),'DOCUMENTARY_INSTALL_PROOF_SHAPE');
  assert.equal(p.version,'adopted-documentary-installation.v1');assert.equal(p.sourceCommit,sourceCommit);assert.equal(p.sqlSha256,DOCUMENTARY_INSTALL_SQL_SHA256);assert.equal(p.targetMajor,major);assert.equal(p.allChecksPassed,true);
  assert.ok(label==='installed'?['first','repeat'].includes(p.mode):p.mode===(label==='durable'?'verify':'repeat'));
  for(const [key,value] of Object.entries({newTables:0,newFunctions:1,adaptedReaders:3,runtimeHelpers:0,nominalRowsReturned:0}))assert.equal(p[key],value,key);
  assert.ok(Number.isSafeInteger(p.priorTableCount)&&p.priorTableCount>0);
  for(const key of ['priorFingerprint','objectsFingerprint','dataFingerprint'])assert.match(p[key],/^[a-f0-9]{64}$/);
  if(label!=='durable'){assert.match(p.beforeFingerprint,/^[a-f0-9]{64}$/);assert.equal(p.beforeFingerprint,p.priorFingerprint,'DOCUMENTARY_INSTALL_PRIOR_STATE_CHANGED');}
 }
 for(const p of [durable,repeated])for(const key of ['priorTableCount','priorFingerprint','objectsFingerprint','dataFingerprint'])assert.equal(p[key],installed[key],'DOCUMENTARY_INSTALL_DURABILITY_CHANGED: '+key);
 return {passed:true,sourceCommit,major,sqlSha256:DOCUMENTARY_INSTALL_SQL_SHA256,priorStatePreserved:true,readersPreserved:true,privateHelperPreserved:true,nominalRowsReturned:0};
}
