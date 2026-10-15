// Pure source-derived technical preparation. Never connects or adopts records.
import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{splitPostgresStatements}from'./sql-statements.mjs';import{ownInstallationFunctionPin}from'./own-payroll-installation.mjs';
import{pinsCheck,preservationSnapshot}from'./native-leave-installation.mjs';
import{buildOperationalContractAdoptionInstallation}from'./operational-contract-adoption-installation.mjs';
import{buildPayrollPeriodContextInstallation}from'./own-payroll-period-context-installation.mjs';
import{buildMunicipalOwnerAdoptionAuthorityInstallation}from'./municipal-owner-adoption-authority-installation.mjs';
import{installationPriorMetadataFingerprint}from'./installation-prior-metadata.mjs';

export const OWNER_ADOPTION_DECISION_SQL='scripts/migrations/185-municipal-owner-adoption-decision.sql';
export const OWNER_ADOPTION_DECISION_SOURCE_PINS=Object.freeze({
 'scripts/lib/installation-prior-metadata.mjs':'b86d85a76a3c61bf963f61b9a991df65b1caec6056a74fe0c7396db4e808f8c9',
 [OWNER_ADOPTION_DECISION_SQL]:'d224acd070abc1a0b4e0a813cb75a67e910a8045eda3b7cb339a8302b55eb7c3',
 'scripts/lib/municipal-owner-adoption-authority-installation.mjs':'ee0bcb9e151a01b4b582c970f76662f6664e61ab1be2fcd7569cc79f75ebe231',
 'scripts/lib/own-payroll-period-context-installation.mjs':'d7f3194379165102f3e1432b09700e5387d3102cb5a3d2d6a42ad30b4158546d',
 'scripts/lib/operational-contract-adoption-installation.mjs':'34d02464f43eb2cd3964ab073e080f9ff843d2b21c225b76e1e20ea0a09f6234',
 'scripts/lib/native-leave-installation.mjs':'57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef',
 'scripts/lib/own-payroll-installation.mjs':'6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0',
 'scripts/lib/sql-statements.mjs':'d81477c5aed918e944aefe16d05015080acc4fe543059cbf15e2c69e9f5201c2',
});
const table='public.municipal_owner_adoption_provenance',prefix='municontrol_owner_decision185.',q=v=>"'"+String(v).replaceAll("'","''")+"'",lf=v=>v.replace(/\r\n?/g,'\n'),hash=v=>createHash('sha256').update(v).digest('hex');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'OWNER_DECISION185_SOURCE_ANCHOR_CHANGED:'+a.slice(0,90));return s.replace(a,()=>b);};
const pin=d=>{const p=ownInstallationFunctionPin(d);if(d.includes("SET lock_timeout='2s'"))p.config.push('lock_timeout=2s');return{...p,runtime:/^municipal_owner_adoption_(preview|command|attempt)_v1$/.test(p.name)};};
const clean=s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,'');
const find=(definitions,name)=>{const matches=definitions.map(clean).filter(d=>new RegExp('^CREATE (?:OR REPLACE )?FUNCTION (?:public\\.)?'+name+'\\(').test(d));assert.equal(matches.length,1,'OWNER_DECISION185_FUNCTION_MISSING:'+name);return matches[0];};

export function deriveMunicipalOwnerAdoptionDecisionWriter(legacyWriter){
 assert.equal(ownInstallationFunctionPin(legacyWriter).sha256,'7f3c86ccd71be4e494c17d210c6883ebf42ca45aa27c4f9418d04056fc908a8c','OWNER_DECISION185_CURRENT_WRITER_CHANGED');
 const sourceLine=legacyWriter.split('\n').filter(s=>s.startsWith('  raw:=CASE '));assert.equal(sourceLine.length,1);
 const sourceExpression=sourceLine[0].trim().slice('raw:='.length,-1);
 const sourceRouter=`CREATE FUNCTION public.municipal_owner_adoption_source_for_proposal_v1(p jsonb,r public.employment_adoption_proposal) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' SET lock_timeout='2s' AS $source$ BEGIN RETURN ${sourceExpression};END $source$`;
 const afterLine=legacyWriter.split('\n').filter(s=>s.includes('THEN new_contract:=public.employment_adoption_final_after_v1('));assert.equal(afterLine.length,1);
 const afterBody=afterLine[0].trim().replace('new_contract:=','RETURN ').replace(' END IF;',' END IF;RETURN new_contract;');
 const afterRouter=`CREATE FUNCTION public.municipal_owner_adoption_after_v1(r public.employment_adoption_proposal,old_contract jsonb,new_contract jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $after$ BEGIN ${afterBody}END $after$`;
 let writer=once(legacyWriter,'public.employment_adoption_decide_v1(p jsonb,input jsonb,k uuid)','public.municipal_owner_adoption_apply_v1(p jsonb,input jsonb,k uuid,owner_stage jsonb,owner_command jsonb)');
 writer=once(writer,"SET timezone='UTC' AS $$","SET timezone='UTC' SET lock_timeout='2s' AS $$");
 assert.equal(writer.split('public.employment_adoption_context_v1(p)').length,4);writer=writer.replaceAll('public.employment_adoption_context_v1(p)','public.municipal_owner_adoption_context_v1(p)');
 const independent=" IF NOT public.employment_adoption_independent_v1(ctx,r) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELF_REVIEW'; END IF;";
 const authority=` IF review_value->>'decision' IS DISTINCT FROM 'approve' OR owner_stage#>'{preview,scope}' IS DISTINCT FROM ctx#>'{ownerResolved,scope}'
 OR owner_stage#>'{preview,authority}' IS DISTINCT FROM ctx#>'{ownerResolved,authority}' OR owner_stage#>>'{preview,proposal,proposalId}' IS DISTINCT FROM r.id::text
 OR owner_command->>'previewSha256' IS DISTINCT FROM owner_stage#>>'{preview,previewSha256}'
 THEN RAISE EXCEPTION 'OWNER_ADOPTION_AUTHORITY_REQUIRED';END IF;`;
 writer=once(writer,independent,authority);writer=once(writer,sourceLine[0],"  raw:=public.municipal_owner_adoption_source_for_proposal_v1(p,r);");writer=once(writer,afterLine[0],"   new_contract:=public.municipal_owner_adoption_after_v1(r,old_contract,new_contract);");
 const constraints=' -- Evaluate deferred conservation guards before returning a success receipt.';
 writer=once(writer,constraints,' PERFORM public.municipal_owner_adoption_record_v1(decision_id,owner_stage,owner_command);\n'+constraints);
 return{writer,sourceRouter,afterRouter,sourceLine:sourceLine[0],afterLine:afterLine[0],independent,authority};
}

const checks=["decision_mode = 'owner'::text","independence IS FALSE",...['preview','raw_review','command','receipt'].map(name=>`jsonb_typeof(${name}) = 'object'::text`),"length(command_sha256) = 64 AND command_sha256 ~ '^[a-f0-9]{64}$'::text",'octet_length(preview::text) + octet_length(raw_review::text) + octet_length(command::text) + octet_length(receipt::text) <= 8388608'].map(value=>value.replace(/[\s()]/g,''));
function tableCheck(){return `DO $owner_table$ DECLARE r oid:=to_regclass('${table}');BEGIN
 IF r IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=r AND c.relkind='r' AND c.relpersistence='p' AND c.relowner=current_user::regrole AND c.relrowsecurity AND NOT c.relforcerowsecurity)
 OR (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'municipal_owner_adoption_%' AND p.proname<>'municipal_owner_adoption_authority_v1')<>13
 OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=r AND a.grantee<>c.relowner)
 OR (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=r AND a.attnum>0 AND NOT a.attisdropped)
 IS DISTINCT FROM '[ ["decision_id","uuid",true,null],["decision_mode","text",true,null],["independence","boolean",true,null],["preview","jsonb",true,null],["raw_review","jsonb",true,null],["command","jsonb",true,null],["command_sha256","text",true,null],["receipt","jsonb",true,null],["created_at","timestamp with time zone",true,"clock_timestamp()"] ]'::jsonb
 OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=r AND a.attnum>0 AND(a.attisdropped OR a.attidentity<>'' OR a.attgenerated<>'' OR a.attacl IS NOT NULL))
 OR (SELECT count(*) FROM pg_constraint k WHERE k.conrelid=r AND k.contype<>'n')<>10
 OR EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=r AND(k.contype NOT IN('p','f','c','n') OR NOT k.convalidated OR k.condeferrable OR k.condeferred))
 OR (SELECT count(*) FROM pg_constraint k WHERE k.conrelid=r AND k.contype='c' AND k.convalidated AND NOT k.condeferrable)<>8
 OR (SELECT jsonb_agg(v ORDER BY v COLLATE "C") FROM(SELECT regexp_replace(pg_get_expr(k.conbin,k.conrelid),'[[:space:]()]','','g') v FROM pg_constraint k WHERE k.conrelid=r AND k.contype='c') expressions)
 IS DISTINCT FROM (SELECT jsonb_agg(v ORDER BY v COLLATE "C") FROM jsonb_array_elements_text(${q(JSON.stringify(checks))}::jsonb) v)
 OR (SELECT count(*) FROM pg_constraint k WHERE k.conrelid=r AND k.contype='p' AND k.conkey=ARRAY[1]::smallint[] AND k.convalidated)<>1
 OR (SELECT count(*) FROM pg_constraint k WHERE k.conrelid=r AND k.contype='f' AND k.confrelid='public.employment_adoption_decision'::regclass AND k.conkey=ARRAY[1]::smallint[] AND k.confkey=ARRAY[1]::smallint[] AND k.convalidated AND NOT k.condeferrable AND k.confupdtype='a' AND k.confdeltype='a' AND k.confmatchtype='s')<>1
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=r) OR (SELECT count(*) FROM pg_index WHERE indrelid=r)<>1
 OR NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=r AND i.indisprimary AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate AND NOT i.indisexclusion AND i.indkey::text='1' AND i.indnatts=1 AND i.indnkeyatts=1 AND i.indexprs IS NULL AND i.indpred IS NULL AND c.relowner=current_user::regrole AND c.relkind='i' AND c.relpersistence='p')
 OR (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=r AND NOT t.tgisinternal)<>2
 OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=r AND NOT t.tgisinternal AND(t.tgqual IS NOT NULL OR t.tgnargs<>0 OR t.tgconstraint<>0 OR t.tgdeferrable OR t.tginitdeferred OR t.tgparentid<>0))
 OR (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=r AND NOT t.tgisinternal AND t.tgenabled='O' AND ((t.tgname='municipal_owner_adoption_provenance_immutable' AND t.tgtype=58 AND t.tgfoid='public.employment_adoption_immutable_v1()'::regprocedure) OR(t.tgname='municipal_owner_adoption_provenance_before' AND t.tgtype=7 AND t.tgfoid='public.municipal_owner_adoption_provenance_guard_v1()'::regprocedure)))<>2
 OR (SELECT count(*) FROM pg_trigger t JOIN pg_constraint k ON k.oid=t.tgconstraint WHERE k.conrelid=r AND k.contype='f' AND t.tgisinternal AND t.tgenabled='O')<>4
 OR (SELECT array_agg(p.proname::text ORDER BY p.proname::text COLLATE "C") FROM pg_trigger t JOIN pg_constraint k ON k.oid=t.tgconstraint JOIN pg_proc p ON p.oid=t.tgfoid WHERE k.conrelid=r AND k.contype='f' AND t.tgisinternal AND p.pronamespace='pg_catalog'::regnamespace)
 IS DISTINCT FROM ARRAY['RI_FKey_check_ins','RI_FKey_check_upd','RI_FKey_noaction_del','RI_FKey_noaction_upd']
 THEN RAISE EXCEPTION 'OWNER_DECISION185_TABLE_CHANGED';END IF;END $owner_table$`;}

export function ownerDecision185Snapshot(slot,newPins,changedPins){
 assert.ok(['before','after'].includes(slot));let s=preservationSnapshot(slot),leave="p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
 assert.equal(s.split(leave).length,3);s=s.replaceAll(leave,'p.oid IS DISTINCT FROM to_regclass('+q(table)+')');
 s=once(s,"AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'AND p.oid NOT IN(SELECT oid FROM pg_proc WHERE oid=ANY(ARRAY['+newPins.map(p=>'to_regprocedure('+q(p.signature)+')::oid').join(',')+']))');
 s=once(s,'to_jsonb(p)::text',"(CASE WHEN p.oid IN("+changedPins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',')+") THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text");
 const triggerWhere="WHERE s.nspname NOT LIKE 'pg_%' AND s.nspname<>'information_schema' AND p.oid IS DISTINCT FROM to_regclass("+q(table)+'))';
 s=once(s,triggerWhere,triggerWhere.slice(0,-1)+" AND NOT EXISTS(SELECT 1 FROM pg_constraint fk WHERE fk.oid=t.tgconstraint AND fk.contype='f' AND fk.conrelid=to_regclass("+q(table)+'))'+')');
 s=once(s,"p.relkind IN ('r','p')","p.relkind IN ('r','p','m')");return s.replaceAll('municontrol_sql111.',prefix);
}

export function buildMunicipalOwnerAdoptionDecisionInstallation(options){
 assert.ok(options&&typeof options==='object');assert.deepEqual(Object.keys(options).sort(),['read','sourceCommit']);assert.equal(typeof options.read,'function');assert.equal(options.sourceCommit?.length,40);assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);
 const sourceHashes={},read=file=>{const value=lf(options.read(file));sourceHashes[file]=hash(value);if(OWNER_ADOPTION_DECISION_SOURCE_PINS[file])assert.equal(sourceHashes[file],OWNER_ADOPTION_DECISION_SOURCE_PINS[file],'OWNER_DECISION185_SOURCE_CHANGED:'+file);return value;};
 for(const file of Object.keys(OWNER_ADOPTION_DECISION_SOURCE_PINS))read(file);
 const opts={read,sourceCommit:options.sourceCommit},operational=buildOperationalContractAdoptionInstallation(opts),period=buildPayrollPeriodContextInstallation(opts),authority=buildMunicipalOwnerAdoptionAuthorityInstallation(opts);
 const legacyWriter=find(operational.afterDefinitions,'employment_adoption_decide_v1'),derived=deriveMunicipalOwnerAdoptionDecisionWriter(legacyWriter);
 const source=read(OWNER_ADOPTION_DECISION_SQL),statements=splitPostgresStatements(source).map(clean),sourceDefinitions=statements.filter(s=>/^CREATE FUNCTION public\./.test(s));assert.equal(sourceDefinitions.length,10);
 const definitions=[...sourceDefinitions,derived.sourceRouter,derived.afterRouter,derived.writer],newPins=definitions.map(pin);assert.equal(newPins.length,13);assert.equal(new Set(newPins.map(p=>p.signature)).size,13);assert.equal(newPins.filter(p=>p.runtime).length,3);
 const originalGuard=find(splitPostgresStatements(read('scripts/migrations/133-employment-adoption-application.sql')),'employment_adoption_decision_guard_v1'),guardPin=ownInstallationFunctionPin(originalGuard);
 const guardPrefix=" IF EXISTS(SELECT 1 FROM public.municipal_owner_adoption_provenance WHERE decision_id=NEW.id) THEN PERFORM public.municipal_owner_adoption_decision_guard_v1(NEW);RETURN NEW;END IF;\n";
 const guard=once(originalGuard,'BEGIN\n SELECT * INTO r','BEGIN\n'+guardPrefix+' SELECT * INTO r'),changedGuardPin=ownInstallationFunctionPin(guard);
 assert.equal(guard.replace(guardPrefix,''),originalGuard);assert.equal(guardPin.sha256,'28281dd1098d95ce662873f5a0ae5171014bf51efe41b1b3c2f8b5c4820afa57');
 const originalReady=find(period.mutations,'municipal_adoption_ready_v1'),readyPin=ownInstallationFunctionPin(originalReady);assert.equal(readyPin.sha256,'da28158f0e6f4312008696452d394319dd38e317397a5ec454a1ba37ff87535d');assert.equal(originalReady.split(guardPin.sha256).length,2);
 // The historical readiness body predates the reviewed176 novelty context.
 // Keep that exact body as the rollback/before state, but require the same
 // current source pin as179/182 after this integration. No source guard is removed.
 const noveltySources=period.prerequisites.filter(p=>p.signature==='public.own_novelty_sources_v1(jsonb,date,text,uuid[])');
 assert.equal(noveltySources.length,1,'OWNER_DECISION185_NOVELTY_SOURCE_PIN_REQUIRED');
 assert.equal(noveltySources[0].sha256,'56ad14cb761541880c1a37ccca2aa8387b7ee20e598ccbcd645309568dfa5253','OWNER_DECISION185_NOVELTY_SOURCE_CHANGED');
 const readySources=once(originalReady,'b2b0a8339bd275e511f2e7fe53c74d1b02763fcf19ddd61772a74dca0d6ed2e0',noveltySources[0].sha256);
 const objects=tableCheck(),ready=once(readySources.replaceAll(guardPin.sha256,changedGuardPin.sha256),' BEGIN ',' BEGIN EXECUTE '+q(pinsCheck(newPins,'OWNER_DECISION185_FUNCTION_CHANGED')+';'+objects)+';'),changedReadyPin=ownInstallationFunctionPin(ready);
 const changedPins=[changedGuardPin,changedReadyPin],beforePins=[guardPin,readyPin];for(let n=0;n<2;n++)assert.deepEqual({...beforePins[n],sha256:null},{...changedPins[n],sha256:null});
 const baseCheck=period.afterCheck+';'+authority.afterCheck+';'+pinsCheck([ownInstallationFunctionPin(legacyWriter)],'OWNER_DECISION185_CURRENT_WRITER_CHANGED');
 const absent="DO $absent$ BEGIN IF to_regclass('"+table+"') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'municipal_owner_adoption_%' AND p.proname<>'municipal_owner_adoption_authority_v1') THEN RAISE EXCEPTION 'OWNER_DECISION185_EXPECTED_ABSENT';END IF;END $absent$";
 const beforeCheck=baseCheck+';'+absent,afterCheck=baseCheck.replaceAll(guardPin.sha256,changedGuardPin.sha256).replaceAll(readyPin.sha256,changedReadyPin.sha256)+';'+objects+';'+pinsCheck([...changedPins,...newPins],'OWNER_DECISION185_AFTER_CHANGED');
 const acl=['REVOKE ALL ON FUNCTION '+newPins.map(p=>p.signature).join(',')+' FROM PUBLIC,municontrol_actions_runtime_app','GRANT EXECUTE ON FUNCTION '+newPins.filter(p=>p.runtime).map(p=>p.signature).join(',')+' TO municontrol_actions_runtime_app'];
 const mutations=[...statements,derived.sourceRouter,derived.afterRouter,derived.writer,guard.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '),ready.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION '),...acl];
 const mode="DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'OWNER_DECISION185_ISOLATION_REQUIRED';END IF;IF NOT pg_try_advisory_xact_lock(185) THEN RAISE EXCEPTION 'OWNER_DECISION185_BUSY';END IF;PERFORM set_config('"+prefix+"mode',CASE WHEN to_regclass('"+table+"') IS NULL THEN 'install' ELSE 'verify' END,true);END $mode$";
 const requireMode=value=>"DO $phase$ BEGIN IF current_setting('"+prefix+"mode')<>"+q(value)+" THEN RAISE EXCEPTION 'OWNER_DECISION185_PHASE_REQUIRED';END IF;END $phase$";
 const choose="DO $choose$ BEGIN IF current_setting('"+prefix+"mode')='install' THEN EXECUTE "+q(beforeCheck)+';ELSE EXECUTE '+q(afterCheck)+';END IF;END $choose$';
 const apply="DO $apply$ BEGIN IF current_setting('"+prefix+"mode')='install' THEN "+mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')+' END IF;END $apply$';
 const before=ownerDecision185Snapshot('before',newPins,changedPins),after=ownerDecision185Snapshot('after',newPins,changedPins),audit="DO $audit$ BEGIN IF current_setting('"+prefix+"before')::jsonb IS DISTINCT FROM current_setting('"+prefix+"after')::jsonb THEN RAISE EXCEPTION 'OWNER_DECISION185_PRIOR_STATE_CHANGED';END IF;END $audit$";
 const objectIds=[...newPins,...changedPins].map(p=>'to_regprocedure('+q(p.signature)+')').join(',');
 const objectHash="encode(public.digest(jsonb_build_object('functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN("+objectIds+")),'table',(SELECT to_jsonb(c) FROM pg_class c WHERE c.oid='"+table+"'::regclass),'columns',(SELECT jsonb_agg(jsonb_build_object('attribute',to_jsonb(a),'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='"+table+"'::regclass AND a.attnum>0),'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid='"+table+"'::regclass),'indexes',(SELECT jsonb_agg(jsonb_build_object('index',to_jsonb(i),'definition',pg_get_indexdef(i.indexrelid)) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid='"+table+"'::regclass),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid='"+table+"'::regclass OR t.tgconstraint IN(SELECT k.oid FROM pg_constraint k WHERE k.conrelid='"+table+"'::regclass)),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE p.polrelid='"+table+"'::regclass))::text,'sha256'),'hex')";
 const proof=(value,preserved)=>"SELECT jsonb_build_object('version','municipal-owner-adoption-decision-installation.v1','sourceCommit',"+q(options.sourceCommit)+",'sourceHashes',"+q(JSON.stringify(sourceHashes))+"::jsonb,'mode',"+value+",'policy',"+q(JSON.stringify(authority.policy))+"::jsonb,'newTables',1,'newFunctions',13,'adaptedFunctions',2,'businessWrites',0,'identityWrites',0,'iamWrites',0,'existingAclChanges',0,'nominalRowsReturned',0,'transactionDataPreserved',"+preserved+",'preservationSha256',encode(public.digest(current_setting('"+prefix+"after')::jsonb::text,'sha256'),'hex'),'priorMetadataSha256',"+installationPriorMetadataFingerprint(prefix+'after')+",'objectSha256',"+objectHash+') AS proof';
 const phase=value=>[mode,requireMode(value),choose,before,apply,afterCheck,after,audit,proof("current_setting('"+prefix+"mode')",true)];
 const readonly="DO $readonly$ BEGIN IF current_setting('transaction_read_only')<>'on' THEN RAISE EXCEPTION 'OWNER_DECISION185_READONLY_REQUIRED';END IF;END $readonly$";
 const empty="DO $empty$ BEGIN IF EXISTS(SELECT 1 FROM "+table+") THEN RAISE EXCEPTION 'OWNER_DECISION185_ROLLBACK_HAS_HISTORY';END IF;END $empty$";
 const rollback=[afterCheck,empty,before,originalGuard.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION '),originalReady.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION '),'DROP TRIGGER municipal_owner_adoption_provenance_before ON '+table,...newPins.toReversed().map(p=>'DROP FUNCTION '+p.signature),'DROP TABLE '+table,beforeCheck,after,audit];
 return{version:'municipal-owner-adoption-decision-installation.v1',sourceCommit:options.sourceCommit,sourceHashes,policy:authority.policy,authority,period,operational,legacyWriter,derived,originalGuard,guard,guardPrefix,originalReady,ready,beforePins,changedPins,newPins,definitions,statements,mutations,objects,beforeCheck,afterCheck,mode,choose,apply,before,after,audit,rehearsal:phase('install'),installation:phase('install'),repetition:phase('verify'),verification:[readonly,afterCheck,after,proof("'verify'",false)],rollback,rollbackVerification:[readonly,beforeCheck],
 transactionContract:{rehearsal:'ROLLBACK',installation:'COMMIT',repetition:'COMMIT',verification:'READ ONLY',rollback:'COMMIT only without owner history'},newTables:1,newFunctions:13,adaptedFunctions:2,existingAclChanges:0,businessWrites:0,identityWrites:0,iamWrites:0,connects:false,executesSql:false};
}

// These are independent database proof comparisons, not execution evidence
// generated by this pure builder. All three observations are mandatory.
export function assertMunicipalOwnerAdoptionDecisionDurability({installed,durable,repeated,batch}){
 assert.equal(batch.version,'municipal-owner-adoption-decision-installation.v1');
 const counters={newTables:1,newFunctions:13,adaptedFunctions:2,businessWrites:0,identityWrites:0,iamWrites:0,existingAclChanges:0,nominalRowsReturned:0};
 const keys=['version','sourceCommit','sourceHashes','mode','policy',...Object.keys(counters),'preservationSha256','priorMetadataSha256','objectSha256','transactionDataPreserved'].sort();
 for(const[proof,mode,preserved]of[[installed,'install',true],[durable,'verify',false],[repeated,'verify',true]]){
  assert.ok(proof&&typeof proof==='object'&&!Array.isArray(proof));assert.deepEqual(Reflect.ownKeys(proof).sort(),keys);
  assert.equal(proof.version,batch.version);assert.equal(proof.sourceCommit,batch.sourceCommit);assert.deepEqual(proof.sourceHashes,batch.sourceHashes);assert.deepEqual(proof.policy,batch.policy);assert.equal(proof.mode,mode);
  for(const[key,value]of Object.entries(counters))assert.equal(proof[key],value);
  assert.equal(proof.transactionDataPreserved,preserved);
  for(const key of['preservationSha256','priorMetadataSha256','objectSha256']){assert.equal(typeof proof[key],'string');assert.equal(proof[key].length,64);assert.match(proof[key],/^[a-f0-9]{64}$/);}
  for(const key of['priorMetadataSha256','objectSha256'])assert.equal(proof[key],installed[key]);
 }
 return{ok:true,version:batch.version,sourceCommit:batch.sourceCommit,transactionDataPreserved:true,wholeDatabaseStaticAcrossConnections:false,priorMetadataSha256:installed.priorMetadataSha256,objectSha256:installed.objectSha256};
}
