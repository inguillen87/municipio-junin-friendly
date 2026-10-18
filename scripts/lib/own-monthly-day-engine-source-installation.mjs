// Pure source-pinned194 installation protocol. No connection, SQL or business write.
import assert from 'node:assert/strict';import{createHash}from'node:crypto';
import{buildMonthlyDayPolicyInstallation}from'./own-monthly-day-policy-installation.mjs';
import{buildOwnMonthlyDayDeclarationInstallation}from'./own-monthly-day-declaration-installation.mjs';
import{ownInstallationFunctionPin}from'./own-payroll-installation.mjs';
import{splitPostgresStatements}from'./sql-statements.mjs';
import{pinsCheck,preservationSnapshot}from'./native-leave-installation.mjs';
import{installationPriorMetadataFingerprint}from'./installation-prior-metadata.mjs';
export const MONTHLY194_SQL='scripts/migrations/194-own-monthly-day-engine-source.sql';
export const MONTHLY194_SHA256='914a21aef1afaf77582ec9f6ca95e4e5e0cb04598c04d6b864ec8e4aa6b4b062';
export const MONTHLY194_FUNCTIONS=Object.freeze(['own_program_definition_v1','municipal_owner_program_command_core_v1','own_run_capture_v1','municipal_adoption_ready_v1']);
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex'),prefix='municontrol_monthly194.';
const normalize=d=>{const at=d.search(/\bAS\s+\$/);assert.ok(at>0);return d.slice(0,at).replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp').replace(/SET (?:"TimeZone"|timezone) TO 'UTC'/i,"SET timezone='UTC'").replace(/\s+/g,' ').trim()+' '+d.slice(at);};
const pin=d=>({...ownInstallationFunctionPin(normalize(d)),runtime:/FUNCTION public\.own_run_capture_v1\(/.test(d)});
const definitions=s=>splitPostgresStatements(s).flatMap(d=>{const at=d.search(/\bCREATE(?: OR REPLACE)? FUNCTION public\./);return at<0?[]:[d.slice(at)];});
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'MONTHLY194_SNAPSHOT_ANCHOR_CHANGED');return s.replace(a,()=>b);};
export function buildOwnMonthlyDayEngineSourceInstallation(options){
 assert.equal(typeof options?.read,'function');assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);
 assert.deepEqual(Object.keys(options).sort(),['operationalPairBaseline','prerequisiteDefinitions','prerequisiteRuntime','read','sourceCommit']);assert.ok(['pre107','published107'].includes(options.operationalPairBaseline));
 const sourceHashes={},cache=new Map(),read=file=>{if(!cache.has(file)){const text=options.read(file).replace(/\r\n?/g,'\n');sourceHashes[file]=hash(text);cache.set(file,text);}return cache.get(file);};
 const source=read(MONTHLY194_SQL);assert.equal(hash(source),MONTHLY194_SHA256,'MONTHLY194_REVIEWED_SOURCE_CHANGED');
 const mutations=splitPostgresStatements(source),adapted=definitions(source);assert.equal(mutations.length,4);assert.equal(adapted.length,4);assert.ok(adapted.every(d=>d.startsWith('CREATE OR REPLACE FUNCTION ')));
 assert.deepEqual(adapted.map(d=>pin(d).name),[...MONTHLY194_FUNCTIONS]);
 for(const file of['scripts/lib/own-monthly-day-engine-source-installation.mjs','assets/own-monthly-day-declaration-program.js','assets/own-monthly-day-declaration-model.js','lib/own-monthly-day-declaration-input.js','assets/own-payroll-program-model.js','assets/own-payroll-run-model.js','lib/own-payroll-approved-input.js','lib/internal-own-payroll-run.js'])read(file);
 const previous=buildMonthlyDayPolicyInstallation({read,sourceCommit:options.sourceCommit,operationalPairBaseline:options.operationalPairBaseline});
 const declaration=buildOwnMonthlyDayDeclarationInstallation({read,sourceCommit:options.sourceCommit,prerequisiteDefinitions:options.prerequisiteDefinitions,prerequisiteRuntime:options.prerequisiteRuntime});
 const original=previous.adapted,beforePins=original.map(pin),afterPins=adapted.map(pin);
 assert.deepEqual(beforePins,previous.afterPins,'MONTHLY194_CANONICAL192_SOURCE_CHANGED');
 for(let i=0;i<4;i++)assert.deepEqual({...beforePins[i],sha256:null},{...afterPins[i],sha256:null},'MONTHLY194_EXISTING_METADATA_CHANGED');
 const beforeCheck=previous.afterCheck+';\n'+declaration.afterCheck;
 const replaced=beforePins.map(p=>({signature:p.signature,count:0}));
 function compose(text,from,to,count){
  return text.replace(/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/g,(whole,literal)=>{
   let rows;try{rows=JSON.parse(literal.replaceAll("''","'"));}catch{return whole;}if(!Array.isArray(rows))return whole;let changed=false;
   const next=rows.map(row=>{const i=from.findIndex(p=>p.signature===row?.signature);if(i<0)return row;assert.deepEqual(row,from[i],'MONTHLY194_FULL_METADATA_CHANGED');changed=true;if(count)replaced[i].count++;return {...row,sha256:to[i].sha256};});
   return changed?'jsonb_array_elements('+q(JSON.stringify(next))+'::jsonb)':whole;
  });
 }
 const afterPredecessor=compose(beforeCheck,beforePins,afterPins,true);for(const r of replaced)assert.ok(r.count>0,'MONTHLY194_ANCESTOR_PIN_MISSING:'+r.signature);
 assert.equal(compose(afterPredecessor,afterPins,beforePins,false),beforeCheck,'MONTHLY194_ANCESTOR_BYTES_CHANGED');
 for(const p of beforePins)assert.ok(!afterPredecessor.includes(p.sha256),'MONTHLY194_STALE_METADATA_PIN:'+p.signature);
 const afterCheck=afterPredecessor+';\n'+pinsCheck(afterPins,'MONTHLY194_AFTER_METADATA');
 const ids=beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',');
 function snapshot(slot){let s=preservationSnapshot(slot).replaceAll('municontrol_sql111.',prefix);const exclusion=" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";assert.equal(s.split(exclusion).length-1,2);s=s.replaceAll(exclusion,'');s=once(s,"s.nspname='public' AND p.proname LIKE 'native_leave_%'",'false');return once(s,"public.digest(to_jsonb(p)::text,'sha256')","public.digest((CASE WHEN p.oid IN("+ids+") THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')");}
 const before=snapshot('before'),after=snapshot('after');
 const matches=pins=>pins.map(p=>"EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure("+q(p.signature)+") AND encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')="+q(p.sha256)+')').join(' AND ');
 const mode="DO $monthly194_mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'off' OR current_setting('server_version_num')::int/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'MONTHLY194_INSTALL_TRANSACTION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(194);PERFORM pg_advisory_xact_lock(193);PERFORM pg_advisory_xact_lock(192);IF "+matches(beforePins)+" THEN PERFORM set_config('"+prefix+"mode','install',true);ELSIF "+matches(afterPins)+" THEN PERFORM set_config('"+prefix+"mode','verify',true);ELSE RAISE EXCEPTION 'MONTHLY194_CONSUMER_SET_CHANGED';END IF;END $monthly194_mode$";
 const expect=m=>"DO $monthly194_phase$ BEGIN IF current_setting('"+prefix+"mode')<>"+q(m)+" THEN RAISE EXCEPTION 'MONTHLY194_PHASE_CHANGED';END IF;END $monthly194_phase$";
 const choose="DO $monthly194_choose$ BEGIN IF current_setting('"+prefix+"mode')='install' THEN EXECUTE "+q(beforeCheck)+";ELSE EXECUTE "+q(afterCheck)+";END IF;END $monthly194_choose$";
 const apply="DO $monthly194_apply$ BEGIN IF current_setting('"+prefix+"mode')='install' THEN "+mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')+" END IF;END $monthly194_apply$";
 const conservation="DO $monthly194_conservation$ BEGIN IF current_setting('"+prefix+"before')::jsonb IS DISTINCT FROM current_setting('"+prefix+"after')::jsonb THEN RAISE EXCEPTION 'MONTHLY194_PRIOR_STATE_CHANGED';END IF;END $monthly194_conservation$";
 const fingerprint="encode(public.digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN("+ids+"))::text,'sha256'),'hex')";
 const proof=(m,preserved)=>"SELECT jsonb_build_object('version','own-monthly-day-engine-source-installation.v1','sourceCommit',"+q(options.sourceCommit)+",'sourceHashes',"+q(JSON.stringify(sourceHashes))+"::jsonb,'mode',"+m+",'newTables',0,'newFunctions',0,'runtimeFacades',0,'adaptedFunctions',4,'existingAclChanges',0,'roleAssignmentsAdded',0,'businessWrites',0,'nominalRowsReturned',0,'transactionDataPreserved',"+preserved+",'preservationSha256',encode(public.digest(current_setting('"+prefix+"after')::jsonb::text,'sha256'),'hex'),'priorMetadataSha256',"+installationPriorMetadataFingerprint(prefix+'after')+",'objectSha256',"+fingerprint+") AS proof";
 const phase=m=>[mode,expect(m),choose,before,apply,afterCheck,after,conservation,proof("current_setting('"+prefix+"mode')",true)];
 const ro="DO $monthly194_readonly$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'on' OR current_setting('server_version_num')::int/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'MONTHLY194_READONLY_REQUIRED';END IF;END $monthly194_readonly$";
 const noHistory="DO $monthly194_history$ BEGIN IF EXISTS(SELECT 1 FROM public.own_payroll_program_event WHERE body#>>'{program,monthlyDayDeclarationVersion}'='own-monthly-approved-days.v1') OR EXISTS(SELECT 1 FROM public.own_payroll_run_capture WHERE payload?'monthlyDayDeclarations') THEN RAISE EXCEPTION 'MONTHLY194_ROLLBACK_HAS_HISTORY';END IF;END $monthly194_history$";
 return {version:'own-monthly-day-engine-source-installation.v1',sourceCommit:options.sourceCommit,operationalPairBaseline:options.operationalPairBaseline,sourceHashes,previous,declaration,original,adapted,beforePins,afterPins,newPins:[],mutations,replacedAncestorPins:replaced,beforeCheck,afterCheck,afterPredecessor,before,after,mode,choose,apply,conservation,rehearsal:phase('install'),installation:phase('install'),repetition:phase('verify'),verification:[ro,afterCheck,after,proof("'verify'",false)],rollback:[mode,expect('verify'),afterCheck,noHistory,before,...original,beforeCheck,after,conservation],connects:false,executesSql:false,executionAdmitted:false,newTables:0,newFunctions:0,runtimeFacades:0,adaptedFunctions:4};
}
export function assertOwnMonthlyDayEngineSourceDurability({installed,durable,repeated,batch}){
 const counts={newTables:0,newFunctions:0,runtimeFacades:0,adaptedFunctions:4,existingAclChanges:0,roleAssignmentsAdded:0,businessWrites:0,nominalRowsReturned:0};
 for(const [v,mode,preserved]of[[installed,'install',true],[durable,'verify',false],[repeated,'verify',true]]){
  assert.equal(v.version,batch.version);assert.equal(v.sourceCommit,batch.sourceCommit);assert.deepEqual(v.sourceHashes,batch.sourceHashes);assert.equal(v.mode,mode);assert.equal(v.transactionDataPreserved,preserved);for(const[k,n]of Object.entries(counts))assert.equal(v[k],n,k);
  for(const k of['preservationSha256','priorMetadataSha256','objectSha256'])assert.match(v[k],/^[a-f0-9]{64}$/);
  assert.equal(v.objectSha256,installed.objectSha256);assert.equal(v.priorMetadataSha256,installed.priorMetadataSha256);
 }return{passed:true,objectSha256:installed.objectSha256,technicalWritesOnly:true,wholeDatabaseStaticAcrossConnections:false};
}
