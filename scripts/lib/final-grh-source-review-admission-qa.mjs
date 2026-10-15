// Pure relocation of canonical144/183 into one disposable synthetic schema.
// No database, role, process or network action is performed by this module.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildFinalAdoptionQa} from './final-contract-adoption-qa.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {finalReviewAdmissionSnapshot} from './final-grh-source-review-admission-installation.mjs';
import {ownerAdoptionQaDestinationGuard} from './municipal-owner-adoption-qa-transport.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=s=>createHash('sha256').update(s).digest('hex');

export function finalReviewAdmissionQaDirectory(value){
 assert.equal(typeof value,'string');assert.match(value,/^[A-Za-z]:[\\/]/);assert.doesNotMatch(value,/[\0\r\n]/);return value.replaceAll('\\','/');
}
export function finalReviewAdmissionQaDirectoryPredicate(expected){
 return`replace(current_setting('data_directory'),chr(92),'/') IS DISTINCT FROM ${q(finalReviewAdmissionQaDirectory(expected))}`;
}

export function finalReviewAdmissionQaFoundation(major){
 assert.ok([17,18].includes(major));const qa=buildFinalAdoptionQa(major);
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.doesNotMatch(qa.sql+'\n'+qa.sourceFixture,/\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|DATABASE)\b/i);
 return qa;
}

export function finalReviewAdmissionQaSeed(qa,guard){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(typeof guard,'string');assert.ok(guard.startsWith('DO '));
 const statements=splitPostgresStatements(qa.sql);assert.equal(statements.length,5);assert.equal(statements[0],'BEGIN ISOLATION LEVEL READ COMMITTED');assert.equal(statements.at(-1),'COMMIT');assert.ok(statements[3].startsWith('DO $seed$'));
 const pin=statements[3].indexOf(qa.pins),ddl=statements[3].search(/\bCREATE\s+(?:SCHEMA|TABLE|FUNCTION|TRIGGER)\b/i);assert.ok(pin>=0&&pin<ddl,'FINAL_REVIEW_QA_SEED_GUARD_ORDER');
 statements.splice(3,0,guard);return statements.join(';\n')+';';
}

export function finalReviewAdmissionQaTransaction({statements,schema,guard,end='COMMIT'}){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok(['COMMIT','ROLLBACK'].includes(end));assert.equal(typeof guard,'string');assert.ok(guard.startsWith('DO '));
 const characteristics=statements.filter(s=>s.startsWith('SET TRANSACTION '));assert.ok(characteristics.every(s=>s==='SET TRANSACTION READ ONLY')&&characteristics.length<=1);
 return`BEGIN ISOLATION LEVEL REPEATABLE READ${characteristics.length?' READ ONLY':''};SET LOCAL statement_timeout='160s';SET LOCAL lock_timeout='2s';SET LOCAL search_path=pg_catalog,${schema},public,pg_temp;${guard};${statements.filter(s=>!characteristics.includes(s)).join(';\n')};${end};`;
}

export function relocateFinalReviewAdmissionInstallation(batch,qa,{databaseOid,read,transport='local',destinationIdentity}){
 assert.ok(Number.isSafeInteger(databaseOid)&&databaseOid>0&&databaseOid<=4294967295);assert.equal(typeof read,'function');
 assert.ok(['local','ci'].includes(transport));if(transport==='ci')assert.ok(destinationIdentity);if(destinationIdentity){assert.equal(destinationIdentity.transport,transport);assert.equal(destinationIdentity.major,batch.major);assert.equal(destinationIdentity.databaseOid,databaseOid);}
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok([17,18].includes(batch.major));
 const source=read('scripts/migrations/144-final-grh-source-revision.sql').replace(/\r\n?/g,'\n'),definitions=splitPostgresStatements(source).filter(s=>s.startsWith('CREATE FUNCTION public.grh_final_source_'));
 assert.equal(definitions.length,9);const n=qa.normalized,pins=[];
 for(const old of batch.sourcePrerequisite.pins){const d=definitions.find(v=>v.startsWith('CREATE FUNCTION public.'+old.name+'('));assert.ok(d);const body=/AS \$\$([\s\S]*)\$\$\s*$/.exec(d)?.[1],relocated=/AS \$\$([\s\S]*)\$\$\s*$/.exec(n(d))?.[1];assert.ok(body&&relocated);assert.equal(hash(body),old.sha256);pins.push({...old,signature:old.signature.replace('public.',qa.schema+'.'),sha256:hash(relocated)});}
 let metadata=n(batch.sourcePrerequisite.check);for(const old of batch.sourcePrerequisite.pins){const pin=pins.find(p=>p.name===old.name);assert.equal(metadata.split(old.sha256).length,2);metadata=metadata.replace(old.sha256,pin.sha256);}
 const inverse=`replace(replace(p.prosrc,E'\\r\\n',E'\\n'),${q(qa.schema+'.')},'public'||'.')`;
 assert.equal(metadata.split(inverse).length,2,'FINAL_REVIEW_QA_HASH_ADAPTER_CHANGED');metadata=metadata.replace(inverse,"replace(p.prosrc,E'\\r\\n',E'\\n')");
 const guard=transport==='ci'?`DO $final_review_qa_destination$ BEGIN ${qa.pins}
 ${ownerAdoptionQaDestinationGuard(destinationIdentity)} END $final_review_qa_destination$`:`DO $final_review_qa_destination$ BEGIN ${qa.pins}
 IF current_user<>'postgres' OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' OR inet_server_port()<>${55400+batch.major} OR(SELECT oid FROM pg_database WHERE datname=current_database())<>${databaseOid}::oid THEN RAISE EXCEPTION 'FINAL_REVIEW_QA_DESTINATION_CHANGED';END IF;END $final_review_qa_destination$`;
 const transform=s=>{
  if(s===batch.destination)return guard;
  if(s===batch.sourcePrerequisite.check)return metadata;
  let relocated=n(s).replace('SET LOCAL search_path=pg_catalog,public,pg_temp',`SET LOCAL search_path=pg_catalog,${qa.schema},public,pg_temp`);
  if(s.includes("'sourceRowsSha256'")){const selector="value->>'schema'='public'";assert.equal(relocated.split(selector).length,2,'FINAL_REVIEW_QA_SOURCE_ROWS_NAMESPACE_CHANGED');relocated=relocated.replace(selector,"value->>'schema'="+q(qa.schema));}
  return relocated;
 };
 const transactions=Object.fromEntries(Object.entries(batch.transactions).map(([name,t])=>[name,{...t,statements:t.statements.map(transform)}]));
 const relocated={...batch,destination:guard,sourcePrerequisite:{pins,check:metadata},preflight:batch.preflight.map(transform),transactions,guardedRollback:{...batch.guardedRollback,statements:batch.guardedRollback.statements.map(transform)},productionCompatible:false,transport:transport==='ci'?'github-actions-service-only':'existing-loopback-only',schema:qa.schema,relocation:{originalPins:batch.sourcePrerequisite.pins,relocatedPins:pins,originalMigrationSha256:batch.sourceHashes['scripts/migrations/183-final-grh-source-review-admission.sql'],relocatedMigrationSha256:hash(n(batch.migration[0])),functionSemanticsChanged:false,metadataChecksRemoved:0,sourceTuplesChanged:false}};
 assert.equal(relocated.sourcePrerequisite.pins.length,9);assert.ok(metadata.includes('FINAL_ADOPTION_SOURCE_METADATA')&&metadata.includes('FINAL_ADOPTION_SOURCE_PROTECTION'));
 for(const t of Object.values(transactions)){assert.ok(t.statements.includes(guard));assert.ok(t.statements.includes(metadata));assert.doesNotMatch(t.statements.join('\n'),/\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|DATABASE)\b/i);}
 return relocated;
}

export function finalReviewAdmissionQaCleanup(schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 return[`DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=${q(schema)} AND nspowner=current_user::regrole) THEN RAISE EXCEPTION 'FINAL_REVIEW_QA_SCHEMA_OWNER_CHANGED';END IF;
 IF EXISTS(WITH RECURSIVE dependent(classid,objid,objsubid) AS(
  SELECT 'pg_namespace'::regclass::oid,${q(schema)}::regnamespace::oid,0
  UNION SELECT d.classid,d.objid,d.objsubid FROM pg_depend d JOIN dependent parent ON d.refclassid=parent.classid AND d.refobjid=parent.objid AND(parent.objsubid=0 OR d.refobjsubid=parent.objsubid)
 ) SELECT 1 FROM dependent d CROSS JOIN LATERAL pg_identify_object(d.classid,d.objid,d.objsubid) object
 WHERE(object.schema IS NOT NULL AND object.schema<>${q(schema)} AND NOT(
  object.schema='pg_toast' AND d.classid='pg_class'::regclass AND d.objsubid=0 AND EXISTS(
   SELECT 1 FROM pg_class owner_table WHERE owner_table.relnamespace=${q(schema)}::regnamespace AND owner_table.relowner=current_user::regrole AND owner_table.reltoastrelid<>0
   AND(owner_table.reltoastrelid=d.objid OR EXISTS(SELECT 1 FROM pg_index toast_index WHERE toast_index.indrelid=owner_table.reltoastrelid AND toast_index.indexrelid=d.objid))
  )
 )) OR d.classid IN('pg_event_trigger'::regclass,'pg_extension'::regclass)) THEN RAISE EXCEPTION 'FINAL_REVIEW_QA_EXTERNAL_DEPENDENCY';END IF;
 END $$`,`DROP SCHEMA ${schema} CASCADE`];
}

export function finalReviewAdmissionQaGlobalSnapshot(){
 const raw=finalReviewAdmissionSnapshot('after'),filter=/ AND NOT\(k\.conrelid='public\.grh_final_source_revision'::regclass AND k\.conname IN\([^\n]*?\)\)/g,matches=[...raw.matchAll(filter)];assert.equal(matches.length,1);
 const snapshot=raw.replace(filter,'');assert.ok(!snapshot.includes("'public.grh_final_source_revision'::regclass"));
 return snapshot;
}

export function finalReviewAdmissionQaOptions(argv){
 const result={};for(const arg of argv){const m=/^--(major|source-commit|output)=(.+)$/.exec(arg);assert.ok(m&&!Object.hasOwn(result,m[1]),'FINAL_REVIEW_QA_OPTION_INVALID');result[m[1]]=m[2];}
 assert.ok(['17','18'].includes(result.major));assert.match(result['source-commit']??'',/^[a-f0-9]{40}$/);assert.match(result.output??'',/^verification[\/\\][a-z0-9-]+$/);
 return{major:Number(result.major),sourceCommit:result['source-commit'],output:result.output};
}
