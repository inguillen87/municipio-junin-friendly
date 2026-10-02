// Offline exact-batch builder. It never connects or reads municipal rows.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {functionPin,pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
export const SQL113_SHA256='9c896bcdfeec974e665243460783dfb0d936c51fcb7f327b6b0b2aeea651b1d7';
const sha=s=>createHash('sha256').update(s).digest('hex'),lf=s=>s.replace(/\r\n?/g,'\n'),q=s=>"'"+String(s).replaceAll("'","''")+"'";
const ownNames=['native_account_contract_v1','native_employee_self_bootstrap_v1','native_self_leave_bootstrap_v1','native_self_leave_attempt_v1','native_self_leave_command_v1'];
const oldRuntime=new Set(['tenant_action_lookup_employment_v2','tenant_action_apply_provisioning_command_v2','native_leave_bootstrap_v1','native_leave_attempt_v1','native_leave_command_v1']);
function pin(definition){
 // The shared metadata parser supports the other reviewed defaults. 009 has
 // one additional integer default; parse its unchanged header explicitly.
 const numeric=/\bp_limit integer DEFAULT 20\b/.test(definition),parsed=functionPin(numeric?definition.replace('p_limit integer DEFAULT 20','p_limit integer'):definition);
 return{...parsed,defaults:numeric?'20':parsed.defaults,runtime:oldRuntime.has(parsed.name)};
}
export function buildNativeSelfInstallation({source,prerequisiteDefinitions,sourceCommit}){
 source=lf(source);assert.equal(sha(source),SQL113_SHA256,'Unreviewed SQL113 source');assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 const migration=splitPostgresStatements(source);assert.ok(migration.every(s=>!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));
 const changes=[...source.matchAll(/\('(public\.[^']+)','([a-f0-9]{64})',\s*\$old\$([\s\S]*?)\$old\$,\s*\$new\$([\s\S]*?)\$new\$\)/g)].map(m=>({signature:m[1],before:m[2],old:m[3],replacement:m[4]}));assert.equal(changes.length,7);
 const prerequisitePins=prerequisiteDefinitions.map(d=>pin(lf(d)));assert.equal(prerequisitePins.length,18);assert.equal(new Set(prerequisitePins.map(p=>p.signature)).size,18);
 const afterPins=prerequisiteDefinitions.map(d=>{d=lf(d);const p=pin(d),change=changes.find(c=>c.signature===p.signature);if(!change)return p;assert.equal(p.sha256,change.before,'Unreviewed previous body '+p.signature);assert.equal(d.split(change.old).length,2,'Patch anchor must occur exactly once');return pin(d.replace(change.old,change.replacement));});
 const ownPins=migration.filter(s=>/^CREATE FUNCTION public\./.test(s)).map(d=>({...functionPin(d),runtime:!d.includes('CREATE FUNCTION public.native_account_contract_v1(')}));assert.deepEqual(ownPins.map(p=>p.name),ownNames);assert.equal(ownPins.filter(p=>p.runtime).length,4);
 const patchNames=changes.map(c=>c.signature.split('(')[0].slice(7)),names=a=>a.map(q).join(','),oids=changes.map(c=>q(c.signature)+'::regprocedure::oid').join(',');
 const snapshot=slot=>preservationSnapshot(slot)
  .replaceAll('municontrol_sql111.','municontrol_sql113.')
  .replaceAll(" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'')
  .replace("NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')","NOT(s.nspname='public' AND p.proname IN("+names(ownNames)+'))')
  .replace("public.digest(to_jsonb(p)::text,'sha256')","public.digest((CASE WHEN p.oid=ANY(ARRAY["+oids+"]) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')");
 const before=snapshot('before'),after=snapshot('after');
 const absence=`DO $absence$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${names(ownNames)})) THEN RAISE EXCEPTION 'SQL113_ALREADY_PRESENT'; END IF; END $absence$`;
 const preflight=[absence,pinsCheck(prerequisitePins,'SQL113_PREREQUISITE_METADATA')];
 const afterCheck=pinsCheck(afterPins,'SQL113_REVIEWED_PATCH_METADATA'),ownCheck=pinsCheck(ownPins,'SQL113_NEW_FUNCTION_METADATA');
 const ownAudit=`DO $new_count$ BEGIN IF(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${names(ownNames)}))<>5 THEN RAISE EXCEPTION 'SQL113_NEW_FUNCTION_COUNT'; END IF; END $new_count$`;
 const locks=`DO $lock$ DECLARE r record;BEGIN FOR r IN SELECT p.relname,n.nspname FROM pg_class p JOIN pg_namespace n ON n.oid=p.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND p.relkind IN('r','p') ORDER BY p.oid LOOP EXECUTE format('LOCK TABLE ONLY %I.%I IN SHARE MODE NOWAIT',r.nspname,r.relname); END LOOP;END $lock$`;
 const audit=`DO $audit$ BEGIN IF current_setting('municontrol_sql113.before')::jsonb IS DISTINCT FROM current_setting('municontrol_sql113.after')::jsonb THEN RAISE EXCEPTION 'SQL113_PRIOR_STATE_CHANGED'; END IF;END $audit$`;
 const ownProof=`(SELECT encode(public.digest(jsonb_agg(to_jsonb(p) ORDER BY p.oid)::text,'sha256'),'hex') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(${names(ownNames)}))`;
 const proof=`SELECT jsonb_build_object('version','native-self-installation.v1','sourceCommit',${q(sourceCommit)},'sqlSha256',${q(SQL113_SHA256)},'database',current_database(),'owner',current_user,'serverMajor',current_setting('server_version_num')::integer/10000,'priorStateFingerprint',encode(public.digest(current_setting('municontrol_sql113.after'),'sha256'),'hex'),'newObjectFingerprint',${ownProof},'newTables',0,'newFunctions',5,'reviewedFunctionPatches',7,'runtimeFacades',4,'nominalRowsReturned',0,'checkedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) AS proof`;
 return{version:'native-self-installation-batch.v1',sourceCommit,sqlSha256:SQL113_SHA256,newTables:0,newFunctions:5,reviewedFunctionPatches:7,runtimeFacades:4,migrationStatements:migration.length,prerequisitePins,afterPins,ownPins,reviewedPatches:patchNames,preflight,before,after,locks,audit,afterCheck,ownCheck,ownAudit,proof,installation:[...preflight,locks,before,...migration,after,afterCheck,ownCheck,ownAudit,audit,proof],durableVerification:[afterCheck,ownCheck,ownAudit,after,proof]};
}
export function assertNativeSelfDurability({installed,durable,sourceCommit}){
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.ok(installed&&durable);assert.equal(installed.version,'native-self-installation.v1');assert.equal(durable.version,installed.version);assert.equal(installed.sourceCommit,sourceCommit);assert.equal(durable.sourceCommit,sourceCommit);assert.equal(installed.sqlSha256,SQL113_SHA256);assert.equal(durable.sqlSha256,SQL113_SHA256);
 assert.equal(installed.database,'neondb');assert.equal(installed.owner,'neondb_owner');assert.ok([17,18].includes(installed.serverMajor));
 for(const k of ['database','owner','serverMajor','priorStateFingerprint','newObjectFingerprint','newTables','newFunctions','reviewedFunctionPatches','runtimeFacades','nominalRowsReturned'])assert.equal(durable[k],installed[k],'Durability drift: '+k);
 assert.equal(installed.newTables,0);assert.equal(installed.newFunctions,5);assert.equal(installed.reviewedFunctionPatches,7);assert.equal(installed.runtimeFacades,4);assert.equal(installed.nominalRowsReturned,0);assert.match(installed.priorStateFingerprint,/^[a-f0-9]{64}$/);assert.match(installed.newObjectFingerprint,/^[a-f0-9]{64}$/);return true;
}
