// Pure, source-pinned relocation for the existing legacy synthetic QA chain.
// It neither observes production bodies nor accepts alternate production pins.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildOwnPeriodClassificationQaRelocation} from './own-period-classification-qa-relocation.mjs';
import {buildOwnAgreementWorkingTimeInstallation} from './own-agreement-working-time-installation.mjs';
const q=s=>"'"+s.replaceAll("'","''")+"'";
const hash=s=>createHash('sha256').update(s).digest('hex');
const body=s=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(s);assert.ok(m);return m[2];};
const preface=s=>{if(!/^\s*CREATE(?: OR REPLACE)? FUNCTION\b/i.test(s))return s;const at=/\bAS\s+\$[\w]*\$/.exec(s);assert.ok(at);return s.slice(0,at.index).replaceAll("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp').replaceAll('SET "TimeZone" TO \'UTC\'',"SET timezone='UTC'")+s.slice(at.index);};
export function buildAgreementWorkingTimeQaRelocation({read,sourceCommit,schema,relocate,batch=buildOwnAgreementWorkingTimeInstallation({read,sourceCommit})}){
 assert.equal(typeof relocate,'function');assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.equal(batch.sourceCommit,sourceCommit);
 const predecessor=buildOwnPeriodClassificationQaRelocation({read,sourceCommit,schema,relocate,batch:batch.previous});
 const beforePin=batch.beforePins.find(p=>p.name==='municipal_adoption_ready_v1'),afterPin=batch.afterConsumerPins.find(p=>p.name==='municipal_adoption_ready_v1');
 const beforeCapture=batch.beforePins.find(p=>p.name==='own_run_capture_v1'),afterCapture=batch.afterConsumerPins.find(p=>p.name==='own_run_capture_v1');
 assert.equal(predecessor.liveBeforeReadinessSha256,batch.previous.beforePins.find(p=>p.name==='municipal_adoption_ready_v1').sha256);
 assert.equal(predecessor.afterDefinition.split(beforeCapture.sha256).length,2,'AGREEMENT_QA_CAPTURE_READY_ANCHOR_CHANGED');
 const afterDefinition=predecessor.afterDefinition.replace(beforeCapture.sha256,afterCapture.sha256);
 const canonical=s=>s.replaceAll('search_path=pg_catalog, '+schema+', public, pg_temp','search_path=pg_catalog, public, pg_temp').replaceAll(schema,'public');
 const fixtureBeforeSha256=hash(body(canonical(predecessor.afterDefinition))),fixtureAfterSha256=hash(body(canonical(afterDefinition)));
 assert.equal(fixtureBeforeSha256,predecessor.fixtureAfterSha256);assert.notEqual(fixtureBeforeSha256,fixtureAfterSha256);
 const map=s=>relocate(preface(s)).replaceAll(beforePin.sha256,fixtureBeforeSha256).replaceAll(afterPin.sha256,fixtureAfterSha256);
 const beforeCheck=map(batch.beforeCheck),afterCheck=map(batch.afterCheck);
 const mutations=batch.mutations.map(s=>s.includes('FUNCTION public.municipal_adoption_ready_v1(')?afterDefinition:map(s));
 assert.equal(mutations.length,batch.mutations.length);
 const choose="DO $agreement_choose$ BEGIN IF current_setting('municontrol_agreement_time.mode')='install' THEN EXECUTE "+q(beforeCheck)+";ELSE EXECUTE "+q(afterCheck)+";END IF;END $agreement_choose$";
 const apply="DO $agreement_apply$ BEGIN IF current_setting('municontrol_agreement_time.mode')='install' THEN "+mutations.map(s=>'EXECUTE '+q(s)+';').join('\n')+"END IF;END $agreement_apply$";
 const guard="DO $agreement_fixture$ BEGIN IF current_database()<>'own_payroll_run_qa' OR current_setting('neon.project_id',true) IS NOT NULL OR current_setting('neon.branch_id',true) IS NOT NULL THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_QA_ONLY';END IF;END $agreement_fixture$";
 const statements=[guard,...batch.statements.map(s=>s===batch.choose?choose:s===batch.apply?apply:s===batch.afterCheck?afterCheck:map(s))];
 const verification=[guard,...batch.verification.map(s=>s===batch.afterCheck?afterCheck:map(s))];
 return{productionCompatible:false,fixtureChain:predecessor.fixtureChain,fixtureSourceHashes:predecessor.fixtureSourceHashes,fixtureBeforeSha256,fixtureAfterSha256,beforeCheck,afterCheck,mutations,statements,verification,connects:false,executesSql:false};
}
