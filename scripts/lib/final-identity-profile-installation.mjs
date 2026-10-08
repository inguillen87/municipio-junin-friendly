// Correct only the complete identity comparison and its private readiness pin.
// This module generates reviewable SQL; it never connects or adopts contracts.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildActiveAdoptionSerializationInstallation} from './active-adoption-serialization-installation.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck,preservationSnapshot} from './native-leave-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
export function buildFinalIdentityProfileInstallation(options){
 assert.match(options.sourceCommit,/^[a-f0-9]{40}$/);
 const previous=buildActiveAdoptionSerializationInstallation({...options,legacyIdentityComparison:true});
 const current=buildActiveAdoptionSerializationInstallation({...options,legacyIdentityComparison:false});
 const beforeDefinitions=[previous.afterDefinitions[1],previous.afterDefinitions.at(-1)];
 const afterDefinitions=[current.afterDefinitions[1],current.afterDefinitions.at(-1)];
 const pin=d=>({...ownInstallationFunctionPin(d),runtime:false});
 const beforePins=beforeDefinitions.map(pin),afterPins=afterDefinitions.map(pin);
 assert.deepEqual(beforePins.map(p=>p.name),['employment_adoption_final_rows_v1','municipal_adoption_ready_v1']);
 beforePins.forEach((p,n)=>assert.deepEqual({...p,sha256:null},{...afterPins[n],sha256:null}));
 assert.notEqual(beforePins[0].sha256,afterPins[0].sha256);
 assert.equal(beforeDefinitions[1].replaceAll(beforePins[0].sha256,afterPins[0].sha256),afterDefinitions[1]);
 const beforeCheck=previous.afterCheck+';'+pinsCheck(beforePins,'IDENTITY_PROFILE_BEFORE_METADATA');
 const afterCheck=current.afterCheck+';'+pinsCheck(afterPins,'IDENTITY_PROFILE_AFTER_METADATA');
 const prefix='municontrol_final_identity_profile.';
 const state=`DO $state$ DECLARE h text;BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' THEN RAISE EXCEPTION 'IDENTITY_PROFILE_ISOLATION_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(132149);
 SELECT encode(public.digest(replace(p.prosrc,E'\\r\\n',E'\\n'),'sha256'),'hex') INTO h FROM pg_proc p WHERE p.oid=to_regprocedure(${q(beforePins[0].signature)});
 IF h=${q(beforePins[0].sha256)} THEN PERFORM set_config('${prefix}mode','first',true);
 ELSIF h=${q(afterPins[0].sha256)} THEN PERFORM set_config('${prefix}mode','repeat',true);
 ELSE RAISE EXCEPTION 'IDENTITY_PROFILE_PARTIAL_STATE';END IF;END $state$`;
 const initial=`DO $initial$ BEGIN IF current_setting('${prefix}mode')='first' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $initial$`;
 const migration=afterDefinitions.map(d=>d.replace('CREATE FUNCTION public.','CREATE OR REPLACE FUNCTION public.'));
 const apply=`DO $apply$ BEGIN IF current_setting('${prefix}mode')='first' THEN ${migration.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 const snapshot=slot=>{
  const s=preservationSnapshot(slot).replaceAll("p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')",'true')
   .replace("NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",'true').replaceAll('municontrol_sql111.',prefix);
  assert.equal(s.split('to_jsonb(p)::text').length,2);
  return s.replace('to_jsonb(p)::text',`(CASE WHEN p.oid IN(${beforePins.map(p=>'to_regprocedure('+q(p.signature)+')').join(',')}) THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END)::text`);
 };
 const before=snapshot('before'),after=snapshot('after');
 const audit=`DO $audit$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'IDENTITY_PROFILE_PRIOR_STATE_CHANGED';END IF;END $audit$`;
 const runtime='DO $runtime$ BEGIN PERFORM public.municipal_adoption_ready_v1();END $runtime$';
 const sourceHashes={...current.sourceHashes,'scripts/lib/final-identity-profile-installation.mjs':createHash('sha256').update(options.read('scripts/lib/final-identity-profile-installation.mjs').replace(/\r\n?/g,'\n')).digest('hex')};
 const proof=`SELECT jsonb_build_object('version','final-identity-profile-installation.v1','sourceCommit',${q(options.sourceCommit)},'sourceHashes',${q(JSON.stringify(sourceHashes))}::jsonb,'mode',coalesce(current_setting('${prefix}mode',true),'verify'),'newTables',0,'newFunctions',0,'adaptedFunctions',2,'businessOperations',0,'nominalRowsReturned',0,'priorFingerprint',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex')) AS proof`;
 return {previous,current,beforeDefinitions,afterDefinitions,beforePins,afterPins,sourceHashes,beforeCheck,afterCheck,state,initial,before,after,migration,apply,audit,runtime,proof,
  installation:[state,initial,before,apply,afterCheck,runtime,after,audit,proof],verification:['SET TRANSACTION READ ONLY',afterCheck,runtime,after,proof]};
}

export function relocateFinalIdentityProfiles(batch,qa,previous){
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const n=qa.normalized,source=batch.afterDefinitions[1];
 const ready=n(source.slice(0,source.indexOf(' BEGIN ')))+' BEGIN '+batch.current.readyChecks.map(s=>'EXECUTE '+q(n(s))+';').join('\n')+' END $operator$';
 const readyPin={...ownInstallationFunctionPin(ready.replace('CREATE FUNCTION '+qa.schema+'.','CREATE FUNCTION public.')),signature:batch.afterPins[1].signature.replace('public.',qa.schema+'.'),runtime:false};
 const before=previous.verification[1];
 assert.ok(before.includes(batch.beforePins[0].sha256));assert.ok(before.includes(previous.readyPin.sha256));
 const after=before.replaceAll(batch.beforePins[0].sha256,batch.afterPins[0].sha256).replaceAll(previous.readyPin.sha256,readyPin.sha256);
 const initial=`DO $initial$ BEGIN IF current_setting('municontrol_final_identity_profile.mode')='first' THEN EXECUTE ${q(before)};ELSE EXECUTE ${q(after)};END IF;END $initial$`;
 const definitions=[n(batch.migration[0]),ready.replace('CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ')];
 const apply=`DO $apply$ BEGIN IF current_setting('municontrol_final_identity_profile.mode')='first' THEN ${definitions.map(s=>'EXECUTE '+q(s)+';').join('\n')} END IF;END $apply$`;
 return {...batch,readyPin,migration:definitions,installation:batch.installation.map((s,i)=>i===1?initial:i===3?apply:i===4?after:n(s)),verification:batch.verification.map((s,i)=>i===1?after:n(s))};
}
