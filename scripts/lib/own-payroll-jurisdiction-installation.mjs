// Reviewable, repeatable schema-only composition on the exact own 130/132–142
// sources. No connection. Five old function bodies change; their metadata stays.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {buildAdoptedOwnNoveltyInstallation} from './adopted-own-novelties-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'JURISDICTION_SOURCE_ANCHOR_CHANGED: '+a.slice(0,60));return s.replace(a,()=>b);};
export function buildOwnJurisdictionInstallation(options){
 const previous=buildAdoptedOwnNoveltyInstallation(options),read=f=>options.read('scripts/migrations/'+f).replace(/\r\n?/g,'\n');
 const closeSource=read('125-own-payroll-close.sql'),receiptSource=read('142-adopted-own-payroll-receipts.sql'),newSource=read('143-own-payroll-jurisdiction-snapshot.sql');
 const sourceHashes={...previous.sourceHashes,'125-own-payroll-close.sql':hash(closeSource),'143-own-payroll-jurisdiction-snapshot.sql':hash(newSource)};
 const closeDefinitions=splitPostgresStatements(closeSource).filter(s=>/^CREATE FUNCTION public\.own_close_(detail|snapshot)_v1\(/.test(s));assert.equal(closeDefinitions.length,2);
 const receiptDefinition=/EXECUTE \$definition\$(CREATE OR REPLACE FUNCTION public\.own_receipt_snapshot_v1\([\s\S]*?)\$definition\$;/.exec(receiptSource)?.[1];assert.ok(receiptDefinition);
 const definitions=[previous.capture,...closeDefinitions,receiptDefinition,previous.ready],pin=(s,runtime=false)=>({...ownInstallationFunctionPin(s),runtime});
 const beforePins=definitions.map(s=>pin(s,/FUNCTION public\.own_(run_capture|close_detail)_v1\(/.test(s)));
 const newStatements=splitPostgresStatements(newSource),newDefinition=newStatements.find(s=>s.includes('CREATE FUNCTION public.own_run_jurisdictions_v1('));assert.ok(newDefinition);const newPin=pin(newDefinition);
 let capture=once(previous.capture,'payload_value:=jsonb_build_object(',`  inventory:=inventory||jsonb_build_object('jurisdictions',jsonb_build_object('version','own-run-jurisdictions.v1','complete',true,'total',cardinality(ids),'rows',(SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',n.contract_id,'employeeNumber',ec.legacy_legajo,'registrationId',n.id,'identityToken',(SELECT e->>'identityToken' FROM jsonb_array_elements(employees) e WHERE e->>'contractId'=n.contract_id::text),'jurisdictionCode',ec.jurisdiction_code) ORDER BY n.contract_id),'[]') FROM public.native_employee_registration n JOIN public.employment_contract ec ON ec.id=n.contract_id AND ec.tenant_id=n.tenant_id AND ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL WHERE n.tenant_id=(ctx->>'tenantId')::uuid AND n.source_binding_id=(ctx->>'sourceBindingId')::uuid AND n.contract_id=ANY(ids))));\n  payload_value:=jsonb_build_object(`);
 let detail=once(closeDefinitions.find(s=>s.startsWith('CREATE FUNCTION public.own_close_detail_v1(')),"'version','own-close-detail.v1'","'version','own-close-detail.v2'");
 detail=once(detail,"state_version:=public.own_run_hash_v1(jsonb_build_object('scopeVersion'","state_version:=public.own_run_hash_v1(jsonb_build_object('snapshotVersion','own-close-snapshot.v2','scopeVersion'");
 let snapshot=closeDefinitions.find(s=>s.startsWith('CREATE FUNCTION public.own_close_snapshot_v1('));
 snapshot=once(snapshot,"formatted jsonb:='{}';BEGIN","formatted jsonb:='{}';jurisdiction_cache jsonb:='{}';BEGIN");
 snapshot=once(snapshot,"saved:=capture->'saved';",`saved:=capture->'saved';IF NOT jurisdiction_cache ? (capture->>'id') THEN jurisdiction_cache:=jurisdiction_cache||jsonb_build_object(capture->>'id',public.own_run_jurisdictions_v1(capture));END IF;IF jurisdiction_cache->(capture->>'id') IS DISTINCT FROM 'null'::jsonb AND NOT (jurisdiction_cache->(capture->>'id')) ? (row_value->>'contractId') THEN RAISE EXCEPTION 'OWN_CLOSE_JURISDICTION_INVALID';END IF;`);
 snapshot=once(snapshot,"'totals',total));","'totals',total,'jurisdiction',coalesce(jurisdiction_cache#>ARRAY[capture->>'id',row_value->>'contractId'],'{\"code\":null,\"basis\":\"not_captured\",\"sourceSha256\":null}'::jsonb)));");
 snapshot=once(snapshot,"'version','own-close-snapshot.v1'","'version','own-close-snapshot.v2'");
 const receipt=once(receiptDefinition,"g.snapshot->>'version'<>'own-close-snapshot.v1'","g.snapshot->>'version' NOT IN('own-close-snapshot.v1','own-close-snapshot.v2')");
 const firstFour=[capture,detail,snapshot,receipt].map(s=>s.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '));
 let ready=previous.ready;const afterFirst=firstFour.map(s=>pin(s,/FUNCTION public\.own_(run_capture|close_detail)_v1\(/.test(s)));
 for(const [old,updated]of [[beforePins[0],afterFirst[0]],[beforePins[3],afterFirst[3]]]){assert.ok(ready.includes(old.sha256));ready=ready.replaceAll(old.sha256,updated.sha256);}
 ready=once(ready,' BEGIN ',' BEGIN EXECUTE '+q(pinsCheck([newPin],'JURISDICTION_PRIVATE_VALIDATOR_CHANGED'))+'; ');
 const migration=[...newStatements,...firstFour,ready.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ')],afterPins=[...afterFirst,pin(ready)];
 for(let i=0;i<5;i++)assert.deepEqual({...beforePins[i],sha256:null},{...afterPins[i],sha256:null});
 const ids=beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(','),prefix='municontrol_jurisdiction.';
 const beforeCheck=pinsCheck(beforePins,'JURISDICTION_BEFORE_CHANGED'),afterCheck=pinsCheck([...afterPins,newPin],'JURISDICTION_AFTER_CHANGED');
 const snapshotSql=slot=>preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true').replace("s.nspname='public' AND p.proname LIKE 'native_leave_%'","s.nspname='public' AND p.proname='own_run_jurisdictions_v1'").replace('to_jsonb(p)::text',`(CASE WHEN p.oid IN(${ids}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`).replaceAll('municontrol_sql111.',prefix);
 const mode=`DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'JURISDICTION_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132142);PERFORM pg_advisory_xact_lock(132143);PERFORM pg_advisory_xact_lock(143);IF to_regprocedure('public.own_run_jurisdictions_v1(jsonb)') IS NULL THEN PERFORM set_config('${prefix}mode','first',true);ELSE PERFORM set_config('${prefix}mode','repeat',true);END IF;END $mode$`;
 const initial=`DO $initial$ BEGIN IF current_setting('${prefix}mode')='first' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $initial$`;
 const audit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'JURISDICTION_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='first' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const proof=`SELECT jsonb_build_object('version','own-jurisdiction-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'adaptedFunctions',5,'newPrivateFunctions',1,'newTables',0,'existingAclChanges',0,'businessOperations',0,'nominalRowsReturned',0,'priorFingerprint',public.own_run_hash_v1(current_setting('${prefix}after')::jsonb),'objectFingerprint',public.own_run_hash_v1((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(${ids},to_regprocedure('public.own_run_jurisdictions_v1(jsonb)')))))`;
 return {sourceCommit:options.sourceCommit,sourceHashes,beforeDefinitions:definitions,beforePins,afterPins,newPin,ready,readyChecks:[pinsCheck([newPin],'JURISDICTION_PRIVATE_VALIDATOR_CHANGED'),...previous.readyChecks.map(s=>s.replaceAll(beforePins[0].sha256,afterFirst[0].sha256).replaceAll(beforePins[3].sha256,afterFirst[3].sha256))],migration,installation:[mode,initial,snapshotSql('before'),apply,afterCheck,snapshotSql('after'),audit,proof],durableVerification:[afterCheck,snapshotSql('after'),proof]};
}
export function assertOwnJurisdictionDurability({installed,durable,batch}){
 assert.deepEqual(installed,durable);assert.equal(installed.version,'own-jurisdiction-installation.v1');assert.equal(installed.sourceCommit,batch.sourceCommit);assert.deepEqual(installed.sourceHashes,batch.sourceHashes);
 for(const[k,v]of Object.entries({adaptedFunctions:5,newPrivateFunctions:1,newTables:0,existingAclChanges:0,businessOperations:0,nominalRowsReturned:0}))assert.equal(installed[k],v);
 for(const k of ['priorFingerprint','objectFingerprint'])assert.match(installed[k],/^[a-f0-9]{64}$/);return {passed:true,priorStatePreserved:true,independentDurabilityVerified:true};
}
