// Source-bound canonical cleanup. Same owner190 transaction and native runner.
// No connection, process, permission or municipal operation is performed here.
import assert from 'node:assert/strict';
import {finalReviewAdmissionQaCleanup} from './final-grh-source-review-admission-qa.mjs';
import {performancePreservationSnapshot} from '../verify-documentary-roster-performance.mjs';
import {ownerDecisionQaTransaction} from '../verify-municipal-owner-adoption-decision.mjs';
import {registerOwner190CleanupProfile} from './owner190-cleanup-profile.mjs';

const plans=new WeakMap(),q=v=>"'"+String(v).replaceAll("'","''")+"'";
const validSchema=s=>assert.match(s,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
const exact=(o,keys)=>assert.deepEqual(Reflect.ownKeys(o).sort(),[...keys].sort());
const positive=n=>Number.isSafeInteger(n)&&n>0&&n<=4294967295;
export function owner190OwnedSchemaSql(schema,sourceCommit){
 validSchema(schema);assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 return "SELECT jsonb_build_object('version','owner190-owned-schema.v1','schema',n.nspname,'schemaOid',n.oid,'ownerOid',n.nspowner,'serverVersionNum',current_setting('server_version_num')::integer,'sourceCommit',"+q(sourceCommit)+") FROM pg_namespace n WHERE n.nspname="+q(schema)+" AND n.nspowner=current_user::regrole";
}
export function assertOwner190OwnedSchema(value,{schema,sourceCommit}){
 exact(value,['version','schema','schemaOid','ownerOid','serverVersionNum','sourceCommit']);
 assert.equal(value.version,'owner190-owned-schema.v1');assert.equal(value.schema,schema);assert.equal(value.sourceCommit,sourceCommit);
 assert.ok(positive(value.schemaOid)&&positive(value.ownerOid));
 // The diagnostic producers are reviewed for PG17/18. Bind the concrete
 // observed patch version below; another major cannot inherit the profile.
 assert.ok(Number.isSafeInteger(value.serverVersionNum)&&[17,18].includes(Math.floor(value.serverVersionNum/10000)),'OWNER190_CLEANUP_REVIEWED_MAJOR_REQUIRED');
 return Object.freeze({...value});
}
const dependencyCte=ns=>"WITH RECURSIVE dependent(classid,objid,objsubid) AS (SELECT 'pg_namespace'::regclass::oid,"+ns+"::oid,0 UNION SELECT d.classid,d.objid,d.objsubid FROM pg_depend d JOIN dependent parent ON d.refclassid=parent.classid AND d.refobjid=parent.objid AND(parent.objsubid=0 OR d.refobjsubid=parent.objsubid)) ";
function inventorySql({schema,schemaOid,ownerOid,sourceCommit,serverVersionNum}){
 const ns=String(schemaOid),own=String(ownerOid);
 const ownRelation="c.relnamespace="+ns+" OR(c.relnamespace='pg_toast'::regnamespace AND EXISTS(SELECT 1 FROM pg_class t WHERE t.relnamespace="+ns+" AND t.relowner="+own+" AND(t.reltoastrelid=c.oid OR EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=t.reltoastrelid AND i.indexrelid=c.oid))))";
 return [
 "DO $cleanup_inventory$ DECLARE node record;actual_owner oid;description text;objects jsonb:='[]';BEGIN",
 "IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'off' OR current_setting('server_version_num')::integer<>"+serverVersionNum+" OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE oid="+ns+" AND nspname="+q(schema)+" AND nspowner="+own+") OR current_user::regrole::oid<>"+own+" THEN RAISE EXCEPTION 'OWNER190_CLEANUP_OWNED_SCHEMA_CHANGED';END IF;",
 "FOR node IN "+dependencyCte(ns)+"SELECT * FROM dependent ORDER BY classid,objid,objsubid LOOP",
 "actual_owner:=NULL;",
 "IF node.classid='pg_namespace'::regclass AND node.objid="+ns+" AND node.objsubid=0 THEN actual_owner:="+own+";",
 "ELSIF node.classid='pg_class'::regclass THEN SELECT c.relowner INTO actual_owner FROM pg_class c WHERE c.oid=node.objid AND("+ownRelation+");",
 "ELSIF node.classid='pg_proc'::regclass AND node.objsubid=0 THEN SELECT proowner INTO actual_owner FROM pg_proc WHERE oid=node.objid AND pronamespace="+ns+";",
 "ELSIF node.classid='pg_type'::regclass AND node.objsubid=0 THEN SELECT typowner INTO actual_owner FROM pg_type WHERE oid=node.objid AND typnamespace="+ns+";",
 "ELSIF node.classid='pg_constraint'::regclass AND node.objsubid=0 THEN SELECT coalesce(c.relowner,t.typowner) INTO actual_owner FROM pg_constraint k LEFT JOIN pg_class c ON c.oid=k.conrelid AND c.relnamespace="+ns+" LEFT JOIN pg_type t ON t.oid=k.contypid AND t.typnamespace="+ns+" WHERE k.oid=node.objid AND k.connamespace="+ns+";",
 "ELSIF node.classid='pg_trigger'::regclass AND node.objsubid=0 THEN SELECT c.relowner INTO actual_owner FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.oid=node.objid AND c.relnamespace="+ns+";",
 "ELSIF node.classid='pg_rewrite'::regclass AND node.objsubid=0 THEN SELECT c.relowner INTO actual_owner FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class WHERE r.oid=node.objid AND c.relnamespace="+ns+";",
 "ELSIF node.classid='pg_attrdef'::regclass AND node.objsubid=0 THEN SELECT c.relowner INTO actual_owner FROM pg_attrdef d JOIN pg_class c ON c.oid=d.adrelid WHERE d.oid=node.objid AND c.relnamespace="+ns+";",
 "ELSIF node.classid='pg_policy'::regclass AND node.objsubid=0 THEN SELECT c.relowner INTO actual_owner FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE p.oid=node.objid AND c.relnamespace="+ns+";",
 "ELSE RAISE EXCEPTION 'OWNER190_CLEANUP_UNCOVERED_OBJECT_CLASS';END IF;",
 "IF actual_owner IS DISTINCT FROM "+own+"::oid THEN RAISE EXCEPTION 'OWNER190_CLEANUP_OBJECT_OWNER_OR_SCOPE_CHANGED';END IF;",
 "description:=pg_describe_object(node.classid,node.objid,node.objsubid);",
 "IF description IS NULL OR description='' OR description~'[[:cntrl:]]' THEN RAISE EXCEPTION 'OWNER190_CLEANUP_DESCRIPTION_INVALID';END IF;",
 "objects:=objects||jsonb_build_array(jsonb_build_object('classid',node.classid,'objid',node.objid,'objsubid',node.objsubid,'description',description));",
 "IF jsonb_array_length(objects)>16384 OR octet_length(objects::text)>8388608 THEN RAISE EXCEPTION 'OWNER190_CLEANUP_INVENTORY_LIMIT';END IF;",
 "END LOOP;",
 "IF jsonb_array_length(objects)<2 THEN RAISE EXCEPTION 'OWNER190_CLEANUP_UNSUPPORTED_EMPTY_SCHEMA';END IF;",
 "PERFORM set_config('municontrol_owner190_cleanup.inventory',objects::text,true);",
 "PERFORM set_config('municontrol_owner190_cleanup.inventory_sha',encode(public.digest(objects::text,'sha256'),'hex'),true);",
 "END $cleanup_inventory$",
 ].join('\n');
}
export function composeOwner190CanonicalCleanup({schema,pins,ownedSchema,outerBefore,sourceCommit}){
 validSchema(schema);assert.equal(typeof pins,'string');assert.ok(pins.length>0);
 const owned=assertOwner190OwnedSchema(ownedSchema,{schema,sourceCommit});
 exact(outerBefore,['fingerprint','tables']);assert.ok(Number.isSafeInteger(outerBefore.tables)&&outerBefore.tables>=0);assert.match(outerBefore.fingerprint,/^[a-f0-9]{64}$/);
 const original=finalReviewAdmissionQaCleanup(schema);
 assert.equal(original.length,2);assert.equal(original[1],'DROP SCHEMA '+schema+' CASCADE');
 const inventory=inventorySql({...owned,schema,sourceCommit});
 const beforeProof="SELECT jsonb_build_object('version','owner190-cleanup-inventory.v1','sourceCommit',"+q(sourceCommit)+",'schema',"+q(schema)+",'schemaOid',"+owned.schemaOid+",'ownerOid',"+owned.ownerOid+",'objects',current_setting('municontrol_owner190_cleanup.inventory')::jsonb,'nodeCount',jsonb_array_length(current_setting('municontrol_owner190_cleanup.inventory')::jsonb),'inventorySha256',current_setting('municontrol_owner190_cleanup.inventory_sha'))";
 const after=performancePreservationSnapshot();
 const postGuard="DO $cleanup_post$ DECLARE snapshot jsonb:=current_setting('municontrol_documentary_install.after')::jsonb;BEGIN IF to_regnamespace("+q(schema)+") IS NOT NULL OR jsonb_array_length(snapshot->'tables')<>"+outerBefore.tables+" OR encode(public.digest(snapshot::text,'sha256'),'hex')<>"+q(outerBefore.fingerprint)+" THEN RAISE EXCEPTION 'OWNER190_CLEANUP_GLOBAL_BASELINE_NOT_RESTORED';END IF;END $cleanup_post$";
 const proof="SELECT jsonb_build_object('version','owner190-cleanup-proof.v1','sourceCommit',"+q(sourceCommit)+",'schema',"+q(schema)+",'schemaOidBefore',"+owned.schemaOid+",'schemaAbsent',to_regnamespace("+q(schema)+") IS NULL,'globalTables',jsonb_array_length(current_setting('municontrol_documentary_install.after')::jsonb->'tables'),'globalFingerprint',encode(public.digest(current_setting('municontrol_documentary_install.after')::jsonb::text,'sha256'),'hex'),'inventorySha256',current_setting('municontrol_owner190_cleanup.inventory_sha'),'production',false)";
 // Original ownership/external-dependency guard is emitted byte for byte.
 // The second copy is deliberately adjacent to the DROP; no scope is widened.
 const statements=[original[0],inventory,beforeProof,original[0],original[1],after,postGuard,proof];
 const transaction=Object.freeze({sql:ownerDecisionQaTransaction({schema,pins,statements,end:'COMMIT'}),end:'COMMIT'});
 const plan=Object.freeze({version:'owner190-canonical-cleanup-source.v1',schema,transaction});
 plans.set(plan,Object.freeze({sql:transaction.sql,schema,schemaOid:owned.schemaOid,ownerOid:owned.ownerOid,sourceCommit,outerBefore:Object.freeze({...outerBefore})}));
 return plan;
}
export function bindOwner190CanonicalCleanup(plan,transaction,sqlFile){
 const record=plans.get(plan);assert.ok(record,'OWNER190_CLEANUP_UNMINTED_PLAN');
 assert.strictEqual(plan.transaction,transaction,'OWNER190_CLEANUP_TRANSACTION_IDENTITY');
 assert.equal(transaction.sql,record.sql);assert.equal(transaction.end,'COMMIT');
 return registerOwner190CleanupProfile(record,sqlFile);
}
export function assertOwner190CanonicalCleanupProof(proof,plan){
 const record=plans.get(plan);assert.ok(record,'OWNER190_CLEANUP_UNMINTED_PLAN');
 assert.equal(proof.version,'owner190-cleanup-proof.v1');assert.equal(proof.schema,record.schema);
 assert.equal(proof.sourceCommit,record.sourceCommit);assert.equal(proof.schemaOidBefore,record.schemaOid);
 assert.equal(proof.schemaAbsent,true);assert.equal(proof.globalTables,record.outerBefore.tables);assert.equal(proof.globalFingerprint,record.outerBefore.fingerprint);assert.equal(proof.production,false);
}
