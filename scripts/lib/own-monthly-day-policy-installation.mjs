// Pure source-pinned installation plan. No DB, network, runner or business command.
import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{buildMunicipalOwnerProgramInstallation}from'./municipal-owner-program-installation.mjs';
import{ownInstallationFunctionPin}from'./own-payroll-installation.mjs';
import{splitPostgresStatements}from'./sql-statements.mjs';
import{pinsCheck,preservationSnapshot}from'./native-leave-installation.mjs';
import{installationPriorMetadataFingerprint}from'./installation-prior-metadata.mjs';
export const MONTHLY_DAY_SQL='scripts/migrations/192-own-monthly-day-full-month-policy.sql';
export const MONTHLY_DAY_SQL_SHA256='610b1da5d7471187b261e96ed589b41b4054e57ac460a1ba15eb7b4702059d7c';
const q=v=>"'"+String(v).replaceAll("'","''")+"'",hash=v=>createHash('sha256').update(v).digest('hex'),prefix='municontrol_monthly_days192.';
const names=['own_program_definition_v1','municipal_owner_program_command_core_v1','own_run_capture_v1','municipal_adoption_ready_v1'],helpers=['own_monthly_day_source_v2','own_monthly_day_capture_v2'];
const normalized=d=>{const at=d.search(/\bAS\s+\$/);assert.ok(at>0);return d.slice(0,at).replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp').replace(/SET (?:"TimeZone"|timezone) TO 'UTC'/i,"SET timezone='UTC'").replace(/\s+/g,' ').trim()+' '+d.slice(at);};
const pin=d=>({...ownInstallationFunctionPin(normalized(d)),runtime:/FUNCTION public\.own_run_capture_v1\(/.test(d)});
const functions=s=>splitPostgresStatements(s).flatMap(d=>{const m=/\bCREATE(?: OR REPLACE)? FUNCTION public\.\w+\(/.exec(d);return m?[d.slice(m.index)]:[];});
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'MONTHLY_DAY_INSTALL_ANCHOR_CHANGED:'+a.slice(0,80));return s.replace(a,()=>b);};
export function buildMonthlyDayPolicyInstallation(options){
 assert.equal(typeof options?.read,'function');assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);assert.deepEqual(Object.keys(options).sort(),['operationalPairBaseline','read','sourceCommit']);assert.ok(['pre107','published107'].includes(options.operationalPairBaseline),'MONTHLY_DAY_EXPLICIT_BASELINE_REQUIRED');
 const sourceHashes={},cache=new Map(),read=file=>{if(!cache.has(file)){const text=options.read(file).replace(/\r\n?/g,'\n');sourceHashes[file]=hash(text);cache.set(file,text);}return cache.get(file);};
 const source=read(MONTHLY_DAY_SQL);assert.equal(hash(source),MONTHLY_DAY_SQL_SHA256,'MONTHLY_DAY_SQL_SOURCE_CHANGED');
 const definitions=functions(source);assert.equal(definitions.length,6);
 for(const file of['scripts/lib/own-monthly-day-policy-installation.mjs','assets/own-monthly-day-policy-model.js','assets/own-monthly-day-policy-program.js','lib/own-monthly-day-policy-input.js','assets/own-payroll-program-model.js','assets/own-payroll-run-model.js','lib/own-payroll-approved-input.js','lib/internal-own-payroll-run.js'])read(file);
 const previous=buildMunicipalOwnerProgramInstallation({read,sourceCommit:options.sourceCommit,operationalPairBaseline:options.operationalPairBaseline});
 const base182=functions(read('scripts/migrations/182-own-payroll-period-context.sql')),base190=functions(read('scripts/migrations/190-municipal-owner-program-decision.sql'));
 const original=names.map(name=>{const matches=[...base182,...base190].filter(d=>pin(d).name===name&&name!=='municipal_adoption_ready_v1');if(name==='municipal_adoption_ready_v1')return previous.ready;assert.equal(matches.length,1,name);return matches[0];});
 const newDefinitions=helpers.map(name=>{const found=definitions.filter(d=>pin(d).name===name);assert.equal(found.length,1);assert.ok(found[0].startsWith('CREATE FUNCTION '));return found[0];});
 const adapted=names.map(name=>{const found=definitions.filter(d=>pin(d).name===name);assert.equal(found.length,1);assert.ok(found[0].startsWith('CREATE OR REPLACE FUNCTION '));return found[0];});
 const beforePins=original.map(pin),afterPins=adapted.map(pin),newPins=newDefinitions.map(pin);assert.ok(newPins.every(p=>p.runtime===false));
 for(let i=0;i<beforePins.length;i++)assert.deepEqual({...beforePins[i],sha256:null},{...afterPins[i],sha256:null},'MONTHLY_DAY_EXISTING_METADATA_CHANGED');
 assert.deepEqual(beforePins[1],previous.newPins.find(p=>p.name==='municipal_owner_program_command_core_v1'));
 const replacedAncestorPins=beforePins.map(p=>({signature:p.signature,count:0}));
 // Compose only complete canonical metadata entries, never a blind hash replacement.
 const afterPredecessor=previous.afterCheck.replace(/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/g,(text,literal)=>{
  const rows=JSON.parse(literal.replaceAll("''","'"));if(!Array.isArray(rows))return text;let changed=false;
  const updated=rows.map(row=>{const index=beforePins.findIndex(p=>p.signature===row?.signature);if(index<0)return row;assert.deepEqual(row,beforePins[index],'MONTHLY_DAY_ANCESTOR_FULL_METADATA_CHANGED');changed=true;replacedAncestorPins[index].count++;return{...row,sha256:afterPins[index].sha256};});
  return changed?'jsonb_array_elements('+q(JSON.stringify(updated))+'::jsonb)':text;
 });
 for(const p of beforePins)assert.ok(!afterPredecessor.includes(p.sha256),'MONTHLY_DAY_UNCOMPOSED_ANCESTOR_PIN:'+p.signature);
 // Closed multiplicities derived from the exact published190 predecessor.
 assert.deepEqual(replacedAncestorPins,beforePins.map((p,i)=>({signature:p.signature,count:[1,1,1,4][i]})),'MONTHLY_DAY_ANCESTOR_PIN_MULTIPLICITY');
 const inverse=afterPredecessor.replace(/jsonb_array_elements\('((?:[^']|'')*)'::jsonb\)/g,(text,literal)=>{
  const rows=JSON.parse(literal.replaceAll("''","'"));if(!Array.isArray(rows))return text;let changed=false;
  const updated=rows.map(row=>{const index=afterPins.findIndex(p=>p.signature===row?.signature);if(index<0)return row;assert.deepEqual(row,afterPins[index],'MONTHLY_DAY_COMPOSED_FULL_METADATA_CHANGED');changed=true;return{...row,sha256:beforePins[index].sha256};});return changed?'jsonb_array_elements('+q(JSON.stringify(updated))+'::jsonb)':text;
 });assert.equal(inverse,previous.afterCheck,'MONTHLY_DAY_ANCESTOR_BYTES_CHANGED');
 const namedHelpers="SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN("+helpers.map(q).join(',')+')';
 const absent="DO $monthly_day_absent$ BEGIN IF ("+namedHelpers+")<>0 THEN RAISE EXCEPTION 'MONTHLY_DAY_NEW_OBJECT_CONFLICT';END IF;END $monthly_day_absent$";
 const exactNew="DO $monthly_day_count$ BEGIN IF ("+namedHelpers+")<>2 THEN RAISE EXCEPTION 'MONTHLY_DAY_HELPER_SET_CHANGED';END IF;END $monthly_day_count$";
 const beforeCheck=previous.afterCheck+';\n'+pinsCheck(beforePins,'MONTHLY_DAY_BEFORE_METADATA')+';\n'+absent;
 const afterCheck=afterPredecessor+';\n'+pinsCheck([...afterPins,...newPins],'MONTHLY_DAY_AFTER_METADATA')+';\n'+exactNew;
 const ids=beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(','),helperCondition="s.nspname='public' AND p.proname IN("+helpers.map(q).join(',')+')';
 const snapshot=slot=>{let s=preservationSnapshot(slot).replaceAll('municontrol_sql111.',prefix);const exclusion=" AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";assert.equal(s.split(exclusion).length-1,2);s=s.replaceAll(exclusion,'');s=once(s,"s.nspname='public' AND p.proname LIKE 'native_leave_%'",helperCondition);s=once(s,"public.digest(to_jsonb(p)::text,'sha256')","public.digest((CASE WHEN p.oid IN("+ids+") THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text,'sha256')");return s;};
 const before=snapshot('before'),after=snapshot('after'),matches=pins=>pins.map(p=>"EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure("+q(p.signature)+") AND encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex')="+q(p.sha256)+')').join(' AND ');
 const mode="DO $monthly_day_mode$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'off' OR current_setting('server_version_num')::int/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'MONTHLY_DAY_INSTALL_TRANSACTION_REQUIRED';END IF;PERFORM pg_advisory_xact_lock(192);PERFORM pg_advisory_xact_lock(190);PERFORM pg_advisory_xact_lock(182);IF "+matches(beforePins)+" AND ("+namedHelpers+")=0 THEN PERFORM set_config('"+prefix+"mode','install',true);ELSIF "+matches(afterPins)+" AND ("+namedHelpers+")=2 THEN PERFORM set_config('"+prefix+"mode','verify',true);ELSE RAISE EXCEPTION 'MONTHLY_DAY_INSTALL_CONSUMER_SET_CHANGED';END IF;END $monthly_day_mode$";
 const choose="DO $monthly_day_choose$ BEGIN IF current_setting('"+prefix+"mode')='install' THEN EXECUTE "+q(beforeCheck)+";ELSE EXECUTE "+q(afterCheck)+";END IF;END $monthly_day_choose$";
 const mutations=splitPostgresStatements(source),apply="DO $monthly_day_apply$ BEGIN IF current_setting('"+prefix+"mode')='install' THEN "+mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')+' END IF;END $monthly_day_apply$';
 const conservation="DO $monthly_day_conservation$ BEGIN IF current_setting('"+prefix+"before')::jsonb IS DISTINCT FROM current_setting('"+prefix+"after')::jsonb THEN RAISE EXCEPTION 'MONTHLY_DAY_PRIOR_STATE_CHANGED';END IF;END $monthly_day_conservation$";
 const objectSha="encode(public.digest((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN("+[...afterPins,...newPins].map(p=>'to_regprocedure('+q(p.signature)+')').join(',')+"))::text,'sha256'),'hex')";
 const proof=(phase,preserved)=>"SELECT jsonb_build_object('version','own-monthly-day-policy-installation.v1','sourceCommit',"+q(options.sourceCommit)+",'sourceHashes',"+q(JSON.stringify(sourceHashes))+"::jsonb,'mode',"+phase+",'newTables',0,'newFunctions',2,'adaptedFunctions',4,'existingAclChanges',0,'roleAssignmentsAdded',0,'businessWrites',0,'nominalRowsReturned',0,'transactionDataPreserved',"+preserved+",'preservationSha256',encode(public.digest(current_setting('"+prefix+"after')::jsonb::text,'sha256'),'hex'),'priorMetadataSha256',"+installationPriorMetadataFingerprint(prefix+'after')+",'objectSha256',"+objectSha+') AS proof';
 const expected=v=>"DO $monthly_day_phase$ BEGIN IF current_setting('"+prefix+"mode')<>"+q(v)+" THEN RAISE EXCEPTION 'MONTHLY_DAY_INSTALL_PHASE_CHANGED';END IF;END $monthly_day_phase$";
 const phase=v=>[mode,expected(v),choose,before,apply,afterCheck,after,conservation,proof("current_setting('"+prefix+"mode')",true)];
 const ro="DO $monthly_day_readonly$ BEGIN IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'on' OR current_setting('server_version_num')::int/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'MONTHLY_DAY_READONLY_REQUIRED';END IF;END $monthly_day_readonly$";
 const noHistory="DO $monthly_day_history$ BEGIN IF EXISTS(SELECT 1 FROM public.own_payroll_program_event WHERE body#>>'{program,monthlyDaysVersion}'='own-monthly-day-facts.v2') OR EXISTS(SELECT 1 FROM public.own_payroll_run_capture WHERE payload?'monthlyDays') THEN RAISE EXCEPTION 'MONTHLY_DAY_ROLLBACK_HAS_HISTORY';END IF;END $monthly_day_history$";
 const restore=original.map(s=>s.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION '));
 return{version:'own-monthly-day-policy-installation.v1',sourceCommit:options.sourceCommit,operationalPairBaseline:options.operationalPairBaseline,sourceHashes,previous,beforePins,afterPins,newPins,original,adapted,newDefinitions,mutations,beforeCheck,afterCheck,afterPredecessor,replacedAncestorPins,before,after,mode,choose,apply,conservation,rehearsal:phase('install'),installation:phase('install'),repetition:phase('verify'),verification:[ro,afterCheck,after,proof("'verify'",false)],rollback:[mode,expected('verify'),afterCheck,noHistory,before,...restore,...newPins.toReversed().map(p=>'DROP FUNCTION '+p.signature),beforeCheck,after,conservation],dependsOn191:false,connects:false,executesSql:false,executionAdmitted:false};
}
