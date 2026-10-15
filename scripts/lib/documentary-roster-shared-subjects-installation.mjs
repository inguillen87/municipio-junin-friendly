// Reviewable technical construction only: no connection or SQL execution.
import assert from 'node:assert/strict';import{createHash}from'node:crypto';
import{splitPostgresStatements}from'./sql-statements.mjs';
import{pinsCheck}from'./native-leave-installation.mjs';
import{buildAdoptedDocumentaryInstallation,documentaryInstallationSnapshot,DOCUMENTARY_INSTALL_SQL_SHA256}from'./adopted-documentary-installation.mjs';
export const DOCUMENTARY_SHARED_FILE='scripts/migrations/181-documentary-roster-shared-subjects.sql';
export const DOCUMENTARY_SHARED_SQL_SHA256='0cec373f040ff91a8f18e72160bdfbbd12b43170f77aed9db29d0e05c85fde3c';
export const DOCUMENTARY_SHARED_BEFORE_SHA256='35fd9c09629bfb49687c446c0293aa8ea748aefa4e4d66031d0358bb87a6702b';
export const DOCUMENTARY_SHARED_AFTER_SHA256='65b2d0f266b3cac9e5870f79e68e67d10f0a9ca459aa06609328f61523288659';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",lf=s=>s.replace(/\r\n?/g,'\n'),hash=s=>createHash('sha256').update(s).digest('hex');
const signature='public.payroll_export_roster_v1(text,uuid,integer,text,uuid,uuid,uuid)',prefix='municontrol_documentary_shared.';
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'DOCUMENTARY_SHARED_SNAPSHOT_SOURCE_CHANGED');return s.replace(a,()=>b);};
export function documentarySharedSnapshot(slot,previous){
 let s=documentaryInstallationSnapshot(slot);
 s=once(s,"AND p.oid IS DISTINCT FROM to_regprocedure('public.payroll_document_subject_v1(jsonb,uuid)')",'');
 const ids=previous.pairs.map(p=>'to_regprocedure('+q(p.signature)+')').join(',');
 s=once(s,'CASE WHEN p.oid IN('+ids+')','CASE WHEN p.oid=to_regprocedure('+q(signature)+')');
 return s.replaceAll('municontrol_documentary_install.',prefix);
}
export function buildDocumentarySharedSubjectsInstallation({read,sourceCommit,major}){
 assert.equal(typeof read,'function');assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.ok([17,18].includes(major));
 const previous=buildAdoptedDocumentaryInstallation({read,sourceCommit,major});
 const source=lf(read(DOCUMENTARY_SHARED_FILE));assert.equal(hash(source),DOCUMENTARY_SHARED_SQL_SHA256,'DOCUMENTARY_SHARED_REVIEWED_SOURCE_CHANGED');
 const migration=splitPostgresStatements(source);assert.equal(migration.length,1);assert.match(migration[0],/^\s*--[\s\S]*\bDO \$documentary181\$/);
 const replacement=/\$body181\$([\s\S]*?)\$body181\$/.exec(source);assert.ok(replacement);assert.equal(hash(replacement[1]),DOCUMENTARY_SHARED_AFTER_SHA256);
 const beforePins=[...previous.afterPins,previous.helperPin];assert.equal(beforePins.find(p=>p.signature===signature).sha256,DOCUMENTARY_SHARED_BEFORE_SHA256);
 const afterPins=beforePins.map(p=>p.signature===signature?{...p,sha256:DOCUMENTARY_SHARED_AFTER_SHA256}:p);
 const firstCheck=pinsCheck(beforePins,'DOCUMENTARY_SHARED_BEFORE_METADATA'),finalCheck=pinsCheck(afterPins,'DOCUMENTARY_SHARED_AFTER_METADATA');
 const before=documentarySharedSnapshot('before',previous),after=documentarySharedSnapshot('after',previous);
 const state=purpose=>`DO $shared_state$ DECLARE actual text; BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'DOCUMENTARY_SHARED_ISOLATION_REQUIRED';END IF;
 IF current_setting('transaction_read_only')<>${q(purpose==='verify'?'on':'off')} THEN RAISE EXCEPTION 'DOCUMENTARY_SHARED_TRANSACTION_MODE_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(181);PERFORM pg_advisory_xact_lock(178);
 SELECT encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(${q(signature)});
 IF actual='${DOCUMENTARY_SHARED_BEFORE_SHA256}' ${purpose==='install'?'':'AND false'} THEN PERFORM set_config('${prefix}mode','install',true);
 ELSIF actual='${DOCUMENTARY_SHARED_AFTER_SHA256}' THEN PERFORM set_config('${prefix}mode',${q(purpose==='verify'?'verify':'repeat')},true);
 ELSE RAISE EXCEPTION 'DOCUMENTARY_SHARED_UNREVIEWED_STATE';END IF;END $shared_state$`;
 const choose=`DO $shared_choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(firstCheck)};ELSE EXECUTE ${q(finalCheck)};END IF;END $shared_choose$`;
 const audit=`DO $shared_audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'DOCUMENTARY_SHARED_PRIOR_STATE_CHANGED';END IF;END $shared_audit$`;
 const fingerprint=slot=>`encode(public.digest(current_setting('${prefix}${slot}')::jsonb::text,'sha256'),'hex')`;
 const ids=beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',');
 const objects=`(SELECT encode(public.digest(jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid IN(${ids}))`;
 const metadata=`encode(public.digest(jsonb_build_object('objects',current_setting('${prefix}after')::jsonb-'tables'-'sequences','tables',(SELECT jsonb_agg(value-'rows'-'rowsSha256' ORDER BY value->>'schema',value->>'name') FROM jsonb_array_elements(current_setting('${prefix}after')::jsonb->'tables')),'sequences',(SELECT jsonb_agg(jsonb_build_object('oid',value->'oid','metadata',value->'metadata') ORDER BY value->>'oid') FROM jsonb_array_elements(current_setting('${prefix}after')::jsonb->'sequences')))::text,'sha256'),'hex')`;
 const proof=tx=>`SELECT jsonb_build_object('version','documentary-shared-subjects-installation.v1','sourceCommit',${q(sourceCommit)},'sqlSha256','${DOCUMENTARY_SHARED_SQL_SHA256}','baselineSqlSha256','${DOCUMENTARY_INSTALL_SQL_SHA256}','targetMajor',${major},'allChecksPassed',true,'mode',current_setting('${prefix}mode'),'newTables',0,'newFunctions',0,'adaptedReaders',1,'existingAclChanges',0,'businessWrites',0,'nominalRowsReturned',0,'priorTableCount',jsonb_array_length(current_setting('${prefix}after')::jsonb->'tables'),'transactionDataPreserved',${tx},${tx?"'beforeFingerprint',"+fingerprint('before')+",":''}'priorFingerprint',${fingerprint('after')},'priorMetadataSha256',${metadata},'objectsFingerprint',${objects}) AS proof`;
 const settings=previous.settings,destination=previous.destination;
 const installation=[...settings,destination,state('install'),choose,before,...migration,after,audit,finalCheck,proof(true)];
 const repetition=[...settings,destination,state('repeat'),finalCheck,before,...migration,after,audit,finalCheck,proof(true)];
 const durableVerification=['SET TRANSACTION READ ONLY',...settings,destination,state('verify'),finalCheck,after,proof(false)];
 const transaction=(statements,completion,readOnly=false)=>({begin:'BEGIN',statements,completion,readOnly});
 return{version:'documentary-shared-subjects-installation.v1',sourceCommit,major,sourceHashes:{[DOCUMENTARY_SHARED_FILE]:DOCUMENTARY_SHARED_SQL_SHA256,'scripts/migrations/178-adopted-documentary-read.sql':DOCUMENTARY_INSTALL_SQL_SHA256},previous,beforePins,afterPins,migration,settings,destination,before,after,firstCheck,finalCheck,choose,audit,installation,repetition,durableVerification,
  transactions:{rehearsal:transaction(installation,'ROLLBACK'),install:transaction(installation,'COMMIT'),durable:transaction(durableVerification,'COMMIT',true),repeat:transaction(repetition,'COMMIT')},connects:false,executesSql:false};
}
export function assertDocumentarySharedSubjectsDurability({installed,durable,repeated,sourceCommit,major}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.ok([17,18].includes(major));
 const keys=['version','sourceCommit','sqlSha256','baselineSqlSha256','targetMajor','allChecksPassed','mode','newTables','newFunctions','adaptedReaders','existingAclChanges','businessWrites','nominalRowsReturned','priorTableCount','transactionDataPreserved','priorFingerprint','priorMetadataSha256','objectsFingerprint'];
 for(const[label,p]of Object.entries({installed,durable,repeated})){
  assert.deepEqual(Object.keys(p).sort(),[...keys,...(label==='durable'?[]:['beforeFingerprint'])].sort());
  assert.equal(p.version,'documentary-shared-subjects-installation.v1');assert.equal(p.sourceCommit,sourceCommit);assert.equal(p.sqlSha256,DOCUMENTARY_SHARED_SQL_SHA256);assert.equal(p.baselineSqlSha256,DOCUMENTARY_INSTALL_SQL_SHA256);assert.equal(p.targetMajor,major);assert.equal(p.allChecksPassed,true);
  for(const[k,v]of Object.entries({newTables:0,newFunctions:0,adaptedReaders:1,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0}))assert.equal(p[k],v);
  assert.ok(Number.isSafeInteger(p.priorTableCount)&&p.priorTableCount>0);assert.equal(p.transactionDataPreserved,label!=='durable');
  assert.ok(label==='installed'?['install','repeat'].includes(p.mode):p.mode===(label==='durable'?'verify':'repeat'));
  for(const k of['priorFingerprint','priorMetadataSha256','objectsFingerprint'])assert.match(p[k],/^[a-f0-9]{64}$/);
  if(label!=='durable'){assert.match(p.beforeFingerprint,/^[a-f0-9]{64}$/);assert.equal(p.beforeFingerprint,p.priorFingerprint,'DOCUMENTARY_SHARED_TRANSACTION_STATE_CHANGED');}
 }
 for(const p of[durable,repeated])for(const k of['priorTableCount','priorMetadataSha256','objectsFingerprint'])assert.equal(p[k],installed[k],'DOCUMENTARY_SHARED_DURABILITY_CHANGED: '+k);
 return{passed:true,transactionDataPreserved:true,wholeDatabaseStaticAcrossConnections:false,privateHelperPreserved:true,adaptedReaders:1,businessWrites:0};
}
