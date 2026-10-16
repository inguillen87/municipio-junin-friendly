// Pure technical preparation; no connection, authority decision, or SQL execution.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';import {pinsCheck} from './native-leave-installation.mjs';
import {buildMunicipalOwnerSalaryInstallation} from './municipal-owner-salary-installation.mjs';
import {ownerAdoptionAuthorityInstallationOptions} from './municipal-owner-adoption-authority-installation.mjs';
import {buildPayrollPeriodContextInstallation} from './own-payroll-period-context-installation.mjs';
import {buildSalaryAdministrativeIdentityInstallation} from './salary-administrative-identity-installation.mjs';
import {installationPriorMetadataFingerprint} from './installation-prior-metadata.mjs';
export const OWNER_PROGRAM_SQL='scripts/migrations/190-municipal-owner-program-decision.sql';
export const OWNER_PROGRAM_SQL_SHA256='8f8f3751bbdd95cc3c735913237179060a9b4537d9a65c799147c130188b74c9';
const hash=v=>createHash('sha256').update(v).digest('hex'),q=v=>"'"+String(v).replaceAll("'","''")+"'",prefix='municontrol_owner_program190.',table='public.municipal_owner_program_provenance';
const facades=new Set(['authority','preview','attempt','command'].map(n=>'municipal_owner_program_'+n+'_v1'));
const normalized=d=>{const at=d.search(/\bAS\s+\$/);assert.ok(at>0);return d.slice(0,at).replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp').replace(/SET (?:"TimeZone"|timezone) TO 'UTC'/i,"SET timezone='UTC'").replace(/\s+/g,' ').trim()+' '+d.slice(at);};
const pin=(d,runtime=false)=>({...ownInstallationFunctionPin(normalized(d)),runtime});
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'OWNER_PROGRAM_CANONICAL_ANCHOR_CHANGED:'+a.slice(0,100));return s.replace(a,()=>b);};
const functions=s=>splitPostgresStatements(s).flatMap(d=>{const m=/\bCREATE(?: OR REPLACE)? FUNCTION public\.\w+\(/.exec(d);return m?[d.slice(m.index)]:[];});

export function ownerProgramInstallationSnapshot(slot){
 assert.ok(['before','after'].includes(slot));
 const priorRelation="c.oid IS DISTINCT FROM to_regclass('"+table+"') AND NOT EXISTS(SELECT 1 FROM pg_index ledger_index WHERE ledger_index.indexrelid=c.oid AND ledger_index.indrelid=to_regclass('"+table+"'))";
 const priorTrigger="t.tgrelid IS DISTINCT FROM to_regclass('"+table+"') AND NOT(t.tgisinternal AND EXISTS(SELECT 1 FROM pg_constraint ledger_fk WHERE ledger_fk.oid=t.tgconstraint AND ledger_fk.contype='f' AND ledger_fk.conrelid=to_regclass('"+table+"')))";
 return `DO $snapshot$ DECLARE snapshot_relation record;n bigint;h text;meta jsonb;tables jsonb:='[]';sequences jsonb:='[]';result jsonb;BEGIN
 IF EXISTS(SELECT 1 FROM pg_class foreign_relation JOIN pg_namespace ns ON ns.oid=foreign_relation.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND foreign_relation.relkind='f') THEN RAISE EXCEPTION 'OWNER_PROGRAM_UNAUDITED_OBJECT_SCOPE';END IF;
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
 'functions',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'hash',encode(public.digest((CASE WHEN p.oid=to_regprocedure('public.own_program_command_v1(jsonb,jsonb,uuid)') THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256'),'hex')) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND NOT(ns.nspname='public' AND left(p.proname,24)='municipal_owner_program_')),
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

export function ownerProgramSharedCoreDefinition(value){
 const original=normalized(value),canonical="jsonb_build_object('command','approve','scopeVersion',owner_command->>'scopeVersion','baseVersion',owner_command->>'baseVersion','salaryVersion',owner_command->>'salaryVersion','proposalId',owner_command->>'proposalId','proposalSha256',owner_command->>'proposalSha256','program',NULL,'reason',owner_command->>'reason','reviewConfirmed',true)";
 let core=once(original,'CREATE OR REPLACE FUNCTION public.own_program_command_v1(p jsonb, body jsonb, key uuid)','CREATE FUNCTION public.municipal_owner_program_command_core_v1(p jsonb,body jsonb,key uuid,decision_mode text,owner_command jsonb)');
 core=once(core,'source_items jsonb;field text;','source_items jsonb;field text;\n authority_value jsonb;preview_value jsonb;owner_value jsonb;existing jsonb;inserted public.own_payroll_program_event;');
 core=once(core," ctx:=public.native_salary_administrative_context_v1(p);cmd:=body->>'command';",` IF decision_mode='owner' THEN authority_value:=public.municipal_owner_program_context_v1(p);PERFORM public.municipal_owner_program_command_check_v1(owner_command);
 ELSIF decision_mode IS DISTINCT FROM 'independent' OR owner_command IS NOT NULL THEN RAISE EXCEPTION 'OWNER_PROGRAM_AUTHORITY_REQUIRED';END IF;
 ctx:=public.native_salary_administrative_context_v1(p);cmd:=body->>'command';`);
 const capability=" IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'OWN_PROGRAM_FORBIDDEN';END IF;";
 core=once(core,capability,` IF decision_mode='independent' THEN\n${capability}\n ELSIF cmd IS DISTINCT FROM 'approve' THEN RAISE EXCEPTION 'OWNER_PROGRAM_INPUT_INVALID';END IF;`);
 const prior=" SELECT * INTO prior FROM public.own_payroll_program_event cap WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;\n IF FOUND THEN IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'OWN_PROGRAM_IDEMPOTENCY_REUSE';END IF;RETURN public.own_program_attempt_v1(p,key);END IF;";
 core=once(core,prior,` IF decision_mode='owner' THEN
  IF body IS DISTINCT FROM ${canonical} THEN RAISE EXCEPTION 'OWNER_PROGRAM_INPUT_INVALID';END IF;
  existing:=public.municipal_owner_program_stored_v1(p,key,true);
  IF existing IS NOT NULL THEN IF existing->'command' IS DISTINCT FROM owner_command THEN RAISE EXCEPTION 'OWN_PROGRAM_IDEMPOTENCY_REUSE';END IF;RETURN existing;END IF;
 ELSE
${prior.replace('IF FOUND THEN IF prior.request_sha256',"IF FOUND THEN IF EXISTS(SELECT 1 FROM public.municipal_owner_program_provenance WHERE event_id=prior.id) THEN RAISE EXCEPTION 'OWN_PROGRAM_IDEMPOTENCY_REUSE';END IF;IF prior.request_sha256")}
 END IF;`);
 const independent="  IF NOT(public.own_program_proposal_v1(ctx,proposal)->>'canReview')::boolean THEN RAISE EXCEPTION 'OWN_PROGRAM_INDEPENDENT_REQUIRED';END IF;";
 core=once(core,independent,`  IF decision_mode='independent' THEN\n${independent}
  ELSE
   preview_value:=public.municipal_owner_program_preview_v1(p,pid);
   IF preview_value->'context' IS DISTINCT FROM authority_value OR owner_command->>'previewSha256' IS DISTINCT FROM preview_value->>'previewSha256'
    OR owner_command->>'definitionSha256' IS DISTINCT FROM preview_value->>'definitionSha256' OR owner_command->>'salaryItemsSha256' IS DISTINCT FROM preview_value->>'salaryItemsSha256'
    OR owner_command->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR owner_command->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion' OR owner_command->>'salaryVersion' IS DISTINCT FROM proposal.body->>'salaryVersion'
   THEN RAISE EXCEPTION 'OWNER_PROGRAM_PREVIEW_CHANGED';END IF;
  END IF;`);
 core=once(core,"p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value);RETURN receipt_value;",`p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value) RETURNING * INTO inserted;
 IF decision_mode='independent' THEN RETURN receipt_value;END IF;
 owner_value:=public.municipal_owner_program_receipt_v1(inserted,preview_value,owner_command);
 INSERT INTO public.municipal_owner_program_provenance(event_id,tenant_id,source_binding_id,decision_mode,independence,preview,command,command_sha256,receipt)
 VALUES(inserted.id,inserted.tenant_id,inserted.source_binding_id,'owner',false,preview_value,owner_command,public.employment_adoption_hash_v1(jsonb_build_object('operation','approve_owner','body',owner_command)),owner_value);
 RETURN jsonb_build_object('version','municipal-owner-program-attempt.v1','authorization',authority_value,'preview',preview_value,'command',owner_command,'receipt',owner_value);`);
 return core;
}
export function ownerProgramOrdinaryWrapper(value){const d=normalized(value),m=/\bAS\s+(\$\w*\$)([\s\S]*)\1\s*;?$/.exec(d);assert.ok(m);return once(d,m[2],"\nBEGIN RETURN public.municipal_owner_program_command_core_v1(p,body,key,'independent',NULL);END\n");}


export function ownerProgramTableCheck(){
 const checks=["decision_mode = 'owner'::text","independence IS FALSE",...['preview','command','receipt'].map(k=>`jsonb_typeof(${k}) = 'object'::text`),"length(command_sha256) = 64 AND command_sha256 ~ '^[a-f0-9]{64}$'::text","octet_length(preview::text) + octet_length(command::text) + octet_length(receipt::text) <= 16777216"].map(v=>v.replace(/[\s()]/g,''));
 return `DO $ledger_shape$ DECLARE ledger oid:=to_regclass('${table}');BEGIN
 IF ledger IS NULL OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND left(proname,24)='municipal_owner_program_')<>11 OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=ledger AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relpersistence='p' AND c.relrowsecurity AND NOT c.relforcerowsecurity)
 OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=ledger AND a.grantee<>c.relowner)
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=ledger) OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=ledger AND(a.attisdropped OR a.attidentity<>'' OR a.attgenerated<>'' OR a.attacl IS NOT NULL))
 OR (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=ledger AND a.attnum>0)
 IS DISTINCT FROM '[ ["event_id","uuid",true,null],["tenant_id","uuid",true,null],["source_binding_id","uuid",true,null],["decision_mode","text",true,null],["independence","boolean",true,null],["preview","jsonb",true,null],["command","jsonb",true,null],["command_sha256","text",true,null],["receipt","jsonb",true,null],["created_at","timestamp with time zone",true,"clock_timestamp()"] ]'::jsonb
 THEN RAISE EXCEPTION 'OWNER_PROGRAM_TABLE_SECURITY';END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid=ledger AND contype NOT IN('n','c'))<>3
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=ledger AND(contype NOT IN('p','f','c','n') OR NOT convalidated OR condeferrable OR condeferred))
 OR (SELECT array_agg(regexp_replace(pg_get_expr(conbin,conrelid),'[[:space:]()]','','g') ORDER BY regexp_replace(pg_get_expr(conbin,conrelid),'[[:space:]()]','','g')) FROM pg_constraint WHERE conrelid=ledger AND contype='c')
 IS DISTINCT FROM (SELECT array_agg(value ORDER BY value) FROM jsonb_array_elements_text(${q(JSON.stringify(checks))}::jsonb))
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=ledger AND contype='p' AND conkey=ARRAY[1]::smallint[])
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=ledger AND contype='f' AND conkey=ARRAY[1]::smallint[] AND confrelid='public.own_payroll_program_event'::regclass AND confkey=ARRAY[1]::smallint[] AND confupdtype='a' AND confdeltype='a' AND confmatchtype='s')
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=ledger AND contype='f' AND conkey=ARRAY[2,3]::smallint[] AND confrelid='public.platform_tenant_source_binding'::regclass AND confkey=ARRAY[2,1]::smallint[] AND confupdtype='a' AND confdeltype='a' AND confmatchtype='s')
 OR (SELECT count(*) FROM pg_index WHERE indrelid=ledger)<>1 OR EXISTS(SELECT 1 FROM pg_index WHERE indrelid=ledger AND(NOT indisunique OR NOT indisvalid OR NOT indisready OR NOT indimmediate OR indexprs IS NOT NULL OR indpred IS NOT NULL OR indnatts<>1 OR indnkeyatts<>1 OR indkey::text<>'1'))
 THEN RAISE EXCEPTION 'OWNER_PROGRAM_TABLE_SHAPE';END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid=ledger AND NOT tgisinternal)<>2
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=ledger AND tgname='municipal_owner_program_immutable' AND tgtype=58 AND tgenabled='O' AND NOT tgisinternal AND tgqual IS NULL AND tgfoid='public.own_program_immutable_v1()'::regprocedure)
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=ledger AND tgname='municipal_owner_program_provenance_before' AND tgtype=7 AND tgenabled='O' AND NOT tgisinternal AND tgqual IS NULL AND tgfoid='public.municipal_owner_program_provenance_guard_v1()'::regprocedure)
 THEN RAISE EXCEPTION 'OWNER_PROGRAM_TABLE_TRIGGER';END IF;
END $ledger_shape$`;
}

export function buildMunicipalOwnerProgramInstallation(options){
 const{operationalPairBaseline}=ownerAdoptionAuthorityInstallationOptions(options);
 const sourceHashes={},cache=new Map(),read=p=>{if(!cache.has(p)){const text=options.read(p).replace(/\r\n?/g,'\n');sourceHashes[p]=hash(text);cache.set(p,text);}return cache.get(p);};
 const source=read(OWNER_PROGRAM_SQL);assert.equal(hash(source),OWNER_PROGRAM_SQL_SHA256,'OWNER_PROGRAM_SOURCE_CHANGED');
 for(const file of['scripts/lib/municipal-owner-program-installation.mjs','assets/municipal-owner-program-model.js','assets/municipal-owner-program-workspace-model.js','assets/municipal-owner-program-workspace.js','lib/municipal-owner-program-policy.js','lib/internal-municipal-owner-program.js','api/internal-municipal-owner-program.js','assets/own-payroll-program-model.js','assets/own-payroll-program-workspace-model.js','assets/own-payroll-program-panel.js','scripts/lib/installation-prior-metadata.mjs','scripts/lib/own-payroll-period-context-installation.mjs','scripts/lib/salary-administrative-identity-installation.mjs'])read(file);
 const previous=buildMunicipalOwnerSalaryInstallation({read,sourceCommit:options.sourceCommit,operationalPairBaseline}),mixed=previous.previous.previous;
 assert.equal(mixed.version,'mixed-contract-adoption-installation.v1');
 const period=buildPayrollPeriodContextInstallation({read,sourceCommit:options.sourceCommit}),administrative=buildSalaryAdministrativeIdentityInstallation({read,sourceCommit:options.sourceCommit});
 const original=period.mutations.flatMap(s=>functions(s)).find(d=>/^CREATE OR REPLACE FUNCTION public\.own_program_command_v1\(/.test(d));assert.ok(original);
 const originalReady=mixed.ready,beforePin=pin(original,true),beforeReadyPin=pin(originalReady,false);
 assert.equal(beforePin.sha256,'aee3c8e7f99707c4011eddaaebb16bf42b0915b6c39d508daab41c3e16722fd2');
 const definitions=functions(source),adapted=definitions.filter(d=>/^CREATE OR REPLACE FUNCTION public\.own_program_command_v1\(/.test(d)),newDefinitions=definitions.filter(d=>!adapted.includes(d));
 assert.equal(adapted.length,1);assert.equal(newDefinitions.length,11);assert.ok(newDefinitions.every(d=>/^CREATE FUNCTION public\.municipal_owner_program_/.test(d)));
 const newPins=newDefinitions.map(d=>pin(d,facades.has(pin(d).name))),afterPin=pin(adapted[0],true);
 assert.equal(new Set(newPins.map(p=>p.signature)).size,11);assert.equal(newPins.filter(p=>p.runtime).length,4);assert.deepEqual({...beforePin,sha256:null},{...afterPin,sha256:null});
 assert.equal(adapted[0],ownerProgramOrdinaryWrapper(original),'OWNER_PROGRAM_FIXED_WRAPPER_CHANGED');
 assert.equal(newDefinitions.find(d=>d.startsWith('CREATE FUNCTION public.municipal_owner_program_command_core_v1(')),ownerProgramSharedCoreDefinition(original),'OWNER_PROGRAM_CANONICAL_CORE_CHANGED');
 const ready=originalReady,afterReadyPin=beforeReadyPin;assert.ok(!ready.includes(beforePin.signature)&&!ready.includes(beforePin.sha256),'OWNER_PROGRAM_READINESS_REQUIRES_NEW_REVIEW');
 // Current ready186 does not pin this writer. Preserve its whole body; only
 // the single writer metadata entry in the predecessor proof is composed.
 assert.equal(previous.afterCheck.split(beforePin.sha256).length,2);assert.ok(previous.afterCheck.includes(beforeReadyPin.sha256));
 const composedPrior=once(previous.afterCheck,beforePin.sha256,afterPin.sha256);
 const base=functions(read('scripts/migrations/122-own-payroll-programs.sql'));
 const supportDefinitions=[...administrative.changed.filter(d=>/^CREATE OR REPLACE FUNCTION public\.own_program_(?:proposal|bootstrap|attempt)_v1\(/.test(d)),...base.filter(d=>/^CREATE FUNCTION public\.own_program_(?:current|immutable|lock|exact|text)_v1\(/.test(d))];
 assert.equal(supportDefinitions.length,8);const supportPins=supportDefinitions.map(d=>pin(d,/FUNCTION public\.own_program_(?:bootstrap|attempt)_v1\(/.test(d)));
 const supportCheck=pinsCheck(supportPins,'OWNER_PROGRAM_SUPPORT_CHANGED');
 const prerequisite=previous.afterCheck+';'+supportCheck;
 const beforeCheck=prerequisite+';'+pinsCheck([beforePin,beforeReadyPin],'OWNER_PROGRAM_PRIOR_FUNCTION_CHANGED');
 const afterCheck=composedPrior+';'+supportCheck+';'+pinsCheck([afterPin,afterReadyPin,...newPins],'OWNER_PROGRAM_FUNCTION_CHANGED')+';'+ownerProgramTableCheck();
 const before=ownerProgramInstallationSnapshot('before'),after=ownerProgramInstallationSnapshot('after'),mutations=splitPostgresStatements(source);
 const mode=`DO $mode$ DECLARE present boolean;count_functions integer;BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'OWNER_PROGRAM_ISOLATION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(132190);present:=to_regclass('${table}') IS NOT NULL;SELECT count(*) INTO count_functions FROM pg_proc WHERE pronamespace='public'::regnamespace AND left(proname,24)='municipal_owner_program_';IF present AND count_functions=11 THEN PERFORM set_config('${prefix}mode','verify',true);ELSIF NOT present AND count_functions=0 THEN PERFORM set_config('${prefix}mode','install',true);ELSE RAISE EXCEPTION 'OWNER_PROGRAM_PARTIAL_STATE';END IF;END $mode$`;
 const requireMode=expected=>`DO $strict$ BEGIN IF current_setting('${prefix}mode')<>${q(expected)} THEN RAISE EXCEPTION 'OWNER_PROGRAM_PHASE_CHANGED';END IF;END $strict$`;
 const choose=`DO $choose$ BEGIN IF current_setting('${prefix}mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`,apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN ${mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')}END IF;END $apply$`;
 const audit=`DO $conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'OWNER_PROGRAM_PRIOR_STATE_CHANGED';END IF;END $conservation$`;
 const objectSha=`encode(public.digest(jsonb_build_object('functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(${[afterPin,afterReadyPin,...newPins].map(p=>'to_regprocedure('+q(p.signature)+')').join(',')})),'ledger',(SELECT jsonb_build_object('class',to_jsonb(c),'attributes',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid),'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid=c.oid),'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=c.oid),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid=c.oid)) FROM pg_class c WHERE c.oid='${table}'::regclass))::text,'sha256'),'hex')`;
 const proof=(phase,preserved)=>`SELECT jsonb_build_object('version','municipal-owner-program-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'mode',${phase},'newTables',1,'newFunctions',11,'adaptedFunctions',1,'businessWrites',0,'iamWrites',0,'existingAclChanges',0,'nominalRowsReturned',0,'transactionDataPreserved',${preserved},'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),'priorMetadataSha256',${installationPriorMetadataFingerprint(prefix+'after')},'objectSha256',${objectSha}) AS proof`;
 const phase=expected=>[mode,requireMode(expected),choose,before,apply,afterCheck,after,audit,proof("current_setting('"+prefix+"mode')",true)];
 const readonly="DO $readonly$ BEGIN IF current_setting('transaction_read_only')<>'on' OR current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'OWNER_PROGRAM_READONLY_REQUIRED';END IF;END $readonly$";
 const noHistory=`DO $history$ BEGIN IF EXISTS(SELECT 1 FROM ${table}) THEN RAISE EXCEPTION 'OWNER_PROGRAM_ROLLBACK_HAS_HISTORY';END IF;END $history$`;
 const rollback=[afterCheck,noHistory,before,original,'DROP TRIGGER municipal_owner_program_provenance_before ON '+table,'DROP TRIGGER municipal_owner_program_immutable ON '+table,...newPins.toReversed().map(p=>'DROP FUNCTION '+p.signature),'DROP TABLE '+table,beforeCheck,after,audit];
 return{version:'municipal-owner-program-installation.v1',sourceCommit:options.sourceCommit,sourceHashes,previous,original,originalReady,ready,adapted:adapted[0],supportDefinitions,supportPins,newDefinitions,newPins,beforePin,afterPin,beforeReadyPin,afterReadyPin,prerequisite,beforeCheck,afterCheck,before,after,mutations,mode,choose,apply,audit,rehearsal:phase('install'),installation:phase('install'),repetition:phase('verify'),verification:[readonly,afterCheck,after,proof("'verify'",false)],rollback,rollbackVerification:[readonly,beforeCheck],connects:false,executesSql:false};
}

export function assertMunicipalOwnerProgramDurability({installed,durable,repeated,batch}){
 assert.equal(batch.version,'municipal-owner-program-installation.v1');
 const keys=['version','sourceCommit','sourceHashes','mode','newTables','newFunctions','adaptedFunctions','businessWrites','iamWrites','existingAclChanges','nominalRowsReturned','transactionDataPreserved','preservationSha256','priorMetadataSha256','objectSha256'].sort();
 for(const[p,mode,preserved]of[[installed,'install',true],[durable,'verify',false],[repeated,'verify',true]]){
  assert.ok(p&&typeof p==='object'&&!Array.isArray(p));assert.deepEqual(Reflect.ownKeys(p).sort(),keys);
  assert.equal(p.version,batch.version);assert.equal(p.sourceCommit,batch.sourceCommit);assert.deepEqual(p.sourceHashes,batch.sourceHashes);assert.equal(p.mode,mode);assert.equal(p.transactionDataPreserved,preserved);
  for(const[k,v]of Object.entries({newTables:1,newFunctions:11,adaptedFunctions:1,businessWrites:0,iamWrites:0,existingAclChanges:0,nominalRowsReturned:0}))assert.equal(p[k],v);
  for(const k of['preservationSha256','priorMetadataSha256','objectSha256'])assert.match(p[k],/^[a-f0-9]{64}$/);
  for(const k of['priorMetadataSha256','objectSha256'])assert.equal(p[k],installed[k]);
 }
 return{passed:true,sourceCommit:batch.sourceCommit,transactionDataPreserved:true,priorMetadataPreserved:true,objectsDurable:true,wholeDatabaseStaticAcrossConnections:false,businessWrites:0};
}
