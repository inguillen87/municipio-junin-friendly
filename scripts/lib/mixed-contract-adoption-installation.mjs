// Pure technical preparation. No identities are invented and no business command runs here.
import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{buildMunicipalOwnerAdoptionDecisionInstallation}from'./municipal-owner-adoption-decision-installation.mjs';
import{buildAdoptionSourceStreamingInstallation}from'./adoption-source-streaming-installation.mjs';
import{ownInstallationFunctionPin}from'./own-payroll-installation.mjs';
import{pinsCheck,preservationSnapshot}from'./native-leave-installation.mjs';
import{mixedContractPartitionDefinition,deriveMixedContractSourceDefinition,mixedContractBootstrapDefinition,deriveMixedContractAvailableDefinition}from'./mixed-contract-adoption-source.mjs';
import{MIXED_ADOPTION_INPUT_VERSION as V8,MIXED_ADOPTION_COHORT as COHORT}from'../../assets/employment-adoption-mixed-cohort.js';
const V7='employment-adoption-input.v7',prefix='municontrol_mixed_adoption186.',q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'MIXED_ADOPTION_ANCHOR_CHANGED:'+a.slice(0,90));return s.replace(a,()=>b);};
export function extendMixedAdoptionConsumer(definition){
 // Existing v1-v7 branches are preserved. Only closed lists and the two
 // explicit v7 dispatch sites acquire a new version-specific predecessor.
 let next=definition.replaceAll("'"+V7+"')","'"+V7+"','"+V8+"')");
 for(const actor of['body_value','r.body']){
  const source="WHEN "+actor+"->>'version'='"+V7+"' THEN public.employment_adoption_operational_source_v1";
  if(next.includes(source))next=once(next,source,"WHEN "+actor+"->>'version'='"+V8+"' THEN public.employment_adoption_mixed_source_v1(p,("+actor+"#>>'{finalSource,revisionId}')::uuid,"+actor+"#>>'{finalSource,packageSha256}') "+source);
  const cohort="CASE WHEN "+actor+"->>'version'='"+V7+"' THEN 'active-with-entry.v1'";
  if(next.includes(cohort))next=once(next,cohort,"CASE WHEN "+actor+"->>'version'='"+V8+"' THEN '"+COHORT+"' "+cohort.slice('CASE '.length));
 }
 const strip="CASE WHEN body_value->>'version'='"+V7+"' THEN body_value-ARRAY['version','finalSource','cohort']";
 if(next.includes(strip))next=once(next,strip,"CASE WHEN body_value->>'version'='"+V8+"' THEN body_value-ARRAY['version','finalSource','cohort'] "+strip.slice('CASE '.length));
 assert.notEqual(next,definition,'MIXED_ADOPTION_CONSUMER_HAS_NO_VERSION_BRANCH');return next;
}
export function buildMixedContractAdoptionInstallation(options){
 assert.ok(options&&typeof options==='object');assert.deepEqual(Object.keys(options).sort(),['read','sourceCommit']);assert.equal(typeof options.read,'function');assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);
 const sourceHashes={},cache=new Map(),read=p=>{if(!cache.has(p)){const value=options.read(p).replace(/\r\n?/g,'\n');cache.set(p,value);sourceHashes[p]=hash(value);}return cache.get(p);};
 for(const p of['scripts/lib/mixed-contract-adoption-installation.mjs','scripts/lib/mixed-contract-adoption-source.mjs','assets/employment-adoption-mixed-cohort.js'])read(p);
 const opts={read,sourceCommit:options.sourceCommit},previous=buildMunicipalOwnerAdoptionDecisionInstallation(opts),streaming=buildAdoptionSourceStreamingInstallation(opts);
 const finalSource=streaming.changed[0];assert.equal(ownInstallationFunctionPin(finalSource).name,'employment_adoption_final_source_v1');
 const available=streaming.administrative.final.newDefinitions.find(d=>/^CREATE FUNCTION public.employment_adoption_final_available_v1\(/.test(d));assert.ok(available);
 const newDefinitions=[mixedContractPartitionDefinition(),deriveMixedContractSourceDefinition(finalSource),mixedContractBootstrapDefinition(),deriveMixedContractAvailableDefinition(available)];
 const newPins=newDefinitions.map(d=>({...ownInstallationFunctionPin(d),runtime:/^CREATE FUNCTION public.employment_adoption_mixed_(bootstrap|available)_v1\(/.test(d)}));
 assert.equal(newPins.length,4);assert.equal(newPins.filter(p=>p.runtime).length,2);
 const beforeDefinitions=[streaming.administrative.changed[3],...previous.operational.afterDefinitions.slice(1,-1),previous.derived.sourceRouter,previous.derived.afterRouter,previous.derived.writer];
 assert.equal(beforeDefinitions.length,9);const afterDefinitions=beforeDefinitions.map(extendMixedAdoptionConsumer);
 const priorPins=new Map([...previous.operational.afterPins,...streaming.administrative.afterPins,...previous.newPins,...previous.changedPins].map(p=>[p.name,p]));
 const pin=d=>{const value=ownInstallationFunctionPin(d),prior=priorPins.get(value.name);assert.ok(prior,'MIXED_ADOPTION186_PRIOR_PIN_MISSING:'+value.name);if(d.includes("SET lock_timeout='2s'"))value.config.push('lock_timeout=2s');return{...value,runtime:prior.runtime};};
 const beforePins=beforeDefinitions.map(pin),afterPins=afterDefinitions.map(pin);
 const replace=s=>beforePins.reduce((value,p,n)=>value.replaceAll(p.sha256,afterPins[n].sha256),s);
 const ready=once(replace(previous.ready),' BEGIN ',' BEGIN EXECUTE '+q(pinsCheck(newPins,'MIXED_ADOPTION186_NEW_METADATA'))+';');
 beforeDefinitions.push(previous.ready);afterDefinitions.push(ready);beforePins.push(pin(previous.ready));afterPins.push(pin(ready));
 for(let n=0;n<10;n++)assert.deepEqual({...beforePins[n],sha256:null},{...afterPins[n],sha256:null});
 const beforeCheck=previous.afterCheck+';'+pinsCheck(beforePins,'MIXED_ADOPTION186_BEFORE_METADATA');
 const afterCheck=replace(beforeCheck)+';'+pinsCheck(newPins,'MIXED_ADOPTION186_NEW_METADATA');
 const absence="DO $absent$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND starts_with(proname,'employment_adoption_mixed_')) THEN RAISE EXCEPTION 'MIXED_ADOPTION186_EXPECTED_ABSENT';END IF;END $absent$";
 const count="DO $count$ BEGIN IF(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND starts_with(proname,'employment_adoption_mixed_'))<>4 THEN RAISE EXCEPTION 'MIXED_ADOPTION186_OBJECT_COUNT';END IF;END $count$";
 const finalBefore=beforeCheck+';'+absence,finalAfter=afterCheck+';'+count;
 const snapshot=slot=>{let value=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true');
 value=once(value,"AND NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'AND p.oid NOT IN(SELECT oid FROM pg_proc WHERE oid=ANY(ARRAY['+newPins.map(p=>'to_regprocedure('+q(p.signature)+')::oid').join(',')+']))');
 value=once(value,'to_jsonb(p)::text',"(CASE WHEN p.oid IN("+beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',')+") THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text");
 value=once(value,"p.relkind IN ('r','p')","p.relkind IN ('r','p','m')");return value.replaceAll('municontrol_sql111.',prefix);};
 const before=snapshot('before'),after=snapshot('after');
 const mutations=[...newDefinitions,...afterDefinitions.map(d=>d.replace(/^CREATE (?:OR REPLACE )?FUNCTION /,'CREATE OR REPLACE FUNCTION ')),
 'REVOKE ALL ON FUNCTION '+newPins.map(p=>p.signature).join(',')+' FROM PUBLIC,municontrol_actions_runtime_app',
 'GRANT EXECUTE ON FUNCTION '+newPins.filter(p=>p.runtime).map(p=>p.signature).join(',')+' TO municontrol_actions_runtime_app'];
 const mode="DO $mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'off' THEN RAISE EXCEPTION 'MIXED_ADOPTION186_TRANSACTION_REQUIRED';END IF;IF NOT pg_try_advisory_xact_lock(186) THEN RAISE EXCEPTION 'MIXED_ADOPTION186_BUSY';END IF;PERFORM set_config('"+prefix+"mode',CASE WHEN to_regprocedure('public.employment_adoption_mixed_source_v1(jsonb,uuid,text)') IS NULL THEN 'install' ELSE 'verify' END,true);END $mode$";
 const requireMode=value=>"DO $phase$ BEGIN IF current_setting('"+prefix+"mode')<>"+q(value)+" THEN RAISE EXCEPTION 'MIXED_ADOPTION186_PHASE_REQUIRED';END IF;END $phase$";
 const choose="DO $choose$ BEGIN IF current_setting('"+prefix+"mode')='install' THEN EXECUTE "+q(finalBefore)+';ELSE EXECUTE '+q(finalAfter)+';END IF;END $choose$';
 const apply="DO $apply$ BEGIN IF current_setting('"+prefix+"mode')='install' THEN "+mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')+' END IF;END $apply$';
 const audit="DO $audit$ BEGIN IF current_setting('"+prefix+"before')::jsonb IS DISTINCT FROM current_setting('"+prefix+"after')::jsonb THEN RAISE EXCEPTION 'MIXED_ADOPTION186_PRIOR_STATE_CHANGED';END IF;END $audit$";
 const objects="encode(public.digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN("+[...beforePins,...newPins].map(p=>'to_regprocedure('+q(p.signature)+')').join(',')+"))::text,'sha256'),'hex')";
 const metadata="encode(public.digest(jsonb_build_object('objects',current_setting('"+prefix+"after')::jsonb-'tables'-'sequences','tables',(SELECT jsonb_agg(v-'rows'-'rowsSha256' ORDER BY v->>'schema',v->>'name') FROM jsonb_array_elements(current_setting('"+prefix+"after')::jsonb->'tables') v),'sequences',(SELECT jsonb_agg(jsonb_build_object('definition',to_jsonb(seq),'owner',relation.relowner,'acl',relation.relacl,'options',relation.reloptions) ORDER BY seq.seqrelid) FROM pg_sequence seq JOIN pg_class relation ON relation.oid=seq.seqrelid JOIN pg_namespace ns ON ns.oid=relation.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema'))::text,'sha256'),'hex')";
 const proof=(phase,preserved)=>"SELECT jsonb_build_object('version','mixed-contract-adoption-installation.v1','sourceCommit',"+q(options.sourceCommit)+",'sourceHashes',"+q(JSON.stringify(sourceHashes))+"::jsonb,'mode',"+phase+",'newTables',0,'newFunctions',4,'adaptedFunctions',10,'businessWrites',0,'identityWrites',0,'iamWrites',0,'existingAclChanges',0,'nominalRowsReturned',0,'transactionDataPreserved',"+preserved+",'preservationSha256',encode(public.digest(current_setting('"+prefix+"after')::jsonb::text,'sha256'),'hex'),'priorMetadataSha256',"+metadata+",'objectSha256',"+objects+") AS proof";
 const phase=expected=>[mode,requireMode(expected),choose,before,apply,finalAfter,after,audit,proof("current_setting('"+prefix+"mode')",true)];
 const readonly="DO $readonly$ BEGIN IF current_setting('transaction_read_only')<>'on' THEN RAISE EXCEPTION 'MIXED_ADOPTION186_READONLY_REQUIRED';END IF;END $readonly$";
 const rollbackEmpty="DO $empty$ BEGIN IF EXISTS(SELECT 1 FROM public.employment_adoption_proposal WHERE body->>'version'='"+V8+"') THEN RAISE EXCEPTION 'MIXED_ADOPTION186_ROLLBACK_HAS_HISTORY';END IF;END $empty$";
 const rollback=[finalAfter,rollbackEmpty,before,...beforeDefinitions.map(d=>d.replace(/^CREATE (?:OR REPLACE )?FUNCTION /,'CREATE OR REPLACE FUNCTION ')),...newPins.toReversed().map(p=>'DROP FUNCTION '+p.signature),finalBefore,after,audit];
 return{version:'mixed-contract-adoption-installation.v1',sourceCommit:options.sourceCommit,sourceHashes,previous,streaming,finalSource,newDefinitions,newPins,beforeDefinitions,afterDefinitions,beforePins,afterPins,ready,beforeCheck:finalBefore,afterCheck:finalAfter,before,after,mode,choose,mutations,apply,audit,rehearsal:phase('install'),installation:phase('install'),repetition:phase('verify'),verification:[readonly,finalAfter,after,proof("'verify'",false)],rollback,rollbackVerification:[readonly,finalBefore],businessWrites:0,identityWrites:0,iamWrites:0,connects:false,executesSql:false};
}

export function assertMixedContractAdoptionDurability({installed,durable,repeated,batch}){
 assert.equal(batch.version,'mixed-contract-adoption-installation.v1');
 const counters={newTables:0,newFunctions:4,adaptedFunctions:10,businessWrites:0,identityWrites:0,iamWrites:0,existingAclChanges:0,nominalRowsReturned:0};
 const keys=['version','sourceCommit','sourceHashes','mode',...Object.keys(counters),'transactionDataPreserved','preservationSha256','priorMetadataSha256','objectSha256'].sort();
 for(const[p,mode,preserved]of[[installed,'install',true],[durable,'verify',false],[repeated,'verify',true]]){
  assert.ok(p&&typeof p==='object'&&!Array.isArray(p));assert.deepEqual(Reflect.ownKeys(p).sort(),keys);assert.equal(p.version,batch.version);assert.equal(p.sourceCommit,batch.sourceCommit);assert.deepEqual(p.sourceHashes,batch.sourceHashes);assert.equal(p.mode,mode);assert.equal(p.transactionDataPreserved,preserved);
  for(const[k,v]of Object.entries(counters))assert.equal(p[k],v);
  for(const k of['preservationSha256','priorMetadataSha256','objectSha256']){assert.equal(typeof p[k],'string');assert.equal(p[k].length,64);assert.match(p[k],/^[a-f0-9]{64}$/);}
  for(const k of['priorMetadataSha256','objectSha256'])assert.equal(p[k],installed[k]);
 }
 return{passed:true,sourceCommit:batch.sourceCommit,transactionDataPreserved:true,priorMetadataPreserved:true,objectsDurable:true,wholeDatabaseStaticAcrossConnections:false,businessWrites:0};
}
