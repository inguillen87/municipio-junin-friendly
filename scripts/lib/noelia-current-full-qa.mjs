// Disposable Noelia QA only. Both phases reuse the same full source201 producer.
// No municipal installer, production authority, altered source guard or fallback RPC.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {composeOwnReportFullQaSources} from './own-payroll-report-full-qa.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck} from './native-leave-installation.mjs';
import {ownPeriodClassificationTableCheck} from './own-period-classification-installation.mjs';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';
import {composeNoeliaSuccessionRead197Sources,projectNoeliaSuccessionRead197Readiness} from './noelia-succession-read197-qa.mjs';
const minted=new WeakMap(),hash=s=>createHash('sha256').update(s).digest('hex');
const body=s=>{const m=/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/.exec(s);assert.ok(m,'NOELIA_FULL_QA_BODY');return m[2];};
const clean=s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/g,'').trim();
const anchor='    END $seed$; COMMIT;';
export function composeNoeliaCurrentFullQaSources({read,sourceCommit,schema,jurisdictions,successionRead=false}){
 assert.equal(typeof jurisdictions,'boolean','NOELIA_FULL_QA_JURISDICTIONS_REQUIRED');assert.equal(typeof successionRead,'boolean','NOELIA_FULL_QA_SUCCESSION_MODE_REQUIRED');
 const succession197=successionRead?composeNoeliaSuccessionRead197Sources({read,sourceCommit,schema}):null;
 const full=composeOwnReportFullQaSources({read,sourceCommit,schema});
 assert.equal(full.nativePeriodPrerequisites.length,14,'NOELIA_FULL_QA_PERIOD_PHASE_CHANGED');
 assert.equal(full.decisionPrerequisites.length,4,'NOELIA_FULL_QA_DECISION_PHASE_CHANGED');
 assert.equal(full.jurisdictionPrerequisites.length,1,'NOELIA_FULL_QA_JURISDICTION_PHASE_CHANGED');
 assert.deepEqual(full.prerequisites,[...full.jurisdictionPrerequisites,...full.nativePeriodPrerequisites,...full.decisionPrerequisites]);
 const definition=splitPostgresStatements(full.jurisdictionPrerequisites[0]).map(clean).find(s=>s.startsWith('CREATE FUNCTION '+schema+'.own_run_jurisdictions_v1('));
 assert.ok(definition,'NOELIA_FULL_QA_JURISDICTION_SOURCE');
 const parsed=ownInstallationFunctionPin(definition.replace('FUNCTION '+schema+'.','FUNCTION public.'));
 const jurisdictionPin={...parsed,signature:parsed.signature.replace('public.',schema+'.'),sha256:hash(body(definition)),runtime:false};
 const jurisdictionCheck=pinsCheck([jurisdictionPin],'NOELIA_FULL_QA_EXISTING_JURISDICTION_CHANGED');
 const jurisdiction=jurisdictions?[jurisdictionCheck]:full.jurisdictionPrerequisites;
 const nativeDefinitions=full.nativePeriodPrerequisites.filter(s=>s.startsWith('CREATE FUNCTION '+schema+'.own_period_classification_'));
 assert.equal(nativeDefinitions.length,5,'NOELIA_FULL_QA_NATIVE_HELPERS_CHANGED');
 const nativePins=nativeDefinitions.map(definition=>{const parsed=ownInstallationFunctionPin(definition.replace('FUNCTION '+schema+'.','FUNCTION public.'));return{...parsed,signature:parsed.signature.replace('public.',schema+'.'),sha256:hash(body(definition)),runtime:false};});
 const localize=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(').replaceAll("'public'::regnamespace",q(schema)+'::regnamespace');
 const nativeVerification=[pinsCheck(nativePins,'NOELIA_FULL_QA_NATIVE_PERIOD_CHANGED'),localize(ownPeriodClassificationTableCheck())];
 // The real177 table has no writer facade in this fixture. Its two omitted
 // branches require approved events or a177 capture; reject either, never stub.
 const nativeOnly=`DO $noelia_full_native_epoch$ BEGIN IF EXISTS(SELECT 1 FROM ${schema}.own_period_classification_event) OR EXISTS(SELECT 1 FROM ${schema}.own_payroll_run_capture WHERE payload#>'{sourceInventory,periodClassifications}' IS NOT NULL) OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='${schema}'::regnamespace AND proname=ANY(ARRAY['own_period_classification_bootstrap_v1','own_period_classification_detail_v1','own_period_classification_attempt_v1','own_period_classification_command_v1'])) THEN RAISE EXCEPTION 'NOELIA_FULL_QA_PERIOD_EPOCH_CHANGED';END IF;END $noelia_full_native_epoch$`;
 const plan=Object.freeze({version:'noelia-current-full-source201-qa.v1',sourceCommit,schema,jurisdictions,sourceHashes:Object.freeze({...full.sourceHashes,...succession197?.sourceHashes}),source201Sha256:full.sourceHashes['scripts/migrations/201-own-full-payroll-decision-capacity.sql'],authorityFixture:full.authorityFixture,institutionalAuthority200Proven:false,fullFunctions:full.inheritedFullFunctions,sourcePredecessors:11,sourcePostdecessors:27,nativePeriodPins:Object.freeze(nativePins.map(Object.freeze)),newSeedCount:0,newDatabaseCount:0,businessWrites:0,productionAuthority:false});
 minted.set(plan,{full,succession197,prefix:Object.freeze([...nativeVerification,nativeOnly,...jurisdiction,...full.decisionPrerequisites]),seed:Object.freeze([...full.nativePeriodPrerequisites]),installation:Object.freeze([...nativeVerification,nativeOnly,...jurisdiction,...full.decisionPrerequisites,...full.installation]),verification:Object.freeze([...nativeVerification,nativeOnly,jurisdictionCheck,full.afterGuard])});
 return plan;
}
export function noeliaCurrentFullQaPhaseStatements(plan,phase,ready={}){
 const saved=minted.get(plan);assert.ok(saved,'NOELIA_FULL_QA_ORIGINAL_PLAN_REQUIRED');
 assert.ok(['seed-empty','after-historical'].includes(phase),'NOELIA_FULL_QA_PHASE_REQUIRED');
 if(phase==='seed-empty')return saved.seed;
 if(saved.succession197){const projected=projectNoeliaSuccessionRead197Readiness({plan:saved.succession197,readyDefinition:ready?.readyDefinition,readyPin:ready?.readyPin});return Object.freeze({installation:Object.freeze([...saved.prefix,...projected.installation,...saved.full.installation]),verification:Object.freeze([...saved.verification,...projected.verification]),successionRead197:projected.evidence});}
 return Object.freeze({installation:saved.installation,verification:saved.verification});
}
export function noeliaCurrentFullQaSeed(seedSql,plan){
 const statements=noeliaCurrentFullQaPhaseStatements(plan,'seed-empty');
 assert.equal(typeof seedSql,'string');assert.equal(seedSql.split(anchor).length,2,'NOELIA_FULL_QA_SEED_ANCHOR_CHANGED');
 assert.ok(!seedSql.includes('CREATE TABLE '+plan.schema+'.own_period_classification_event('),'NOELIA_FULL_QA_PERIOD_ALREADY_IN_SEED');
 const added=statements.map(s=>'EXECUTE '+q(s)+';').join('\n');
 return seedSql.replace(anchor,()=>added+'\n'+anchor);
}
// Exact application emissions only; normalize the function identifier before
// inlining q(values). Opaque JSON is never passed through a normalizer/replace.
export const NOELIA_FULL_DECISION_STATEMENTS=Object.freeze({
 'SELECT public.own_novelty_succession_context_v1($1::jsonb,$2::uuid) AS result':2,
 'SELECT public.own_liquidation_detail_full_v1($1::jsonb,$2::uuid) AS result':2,
 'SELECT public.own_close_detail_full_v1($1::jsonb,$2::text,$3::text) AS result':3,
 'SELECT public.own_close_group_full_v1($1::jsonb,$2::uuid) AS result':2,
 'SELECT public.own_close_attempt_full_v1($1::jsonb,$2::uuid) AS result':2,
 'SELECT public.own_close_command_full_v1($1::jsonb,$2::jsonb,$3::uuid) AS result':3,
 'SELECT public.own_close_report_census_v1($1::jsonb,$2::text,$3::text) AS result':3,
 // Period annulment profile (208 over 201): the exact emissions of lib/internal-own-payroll-annulment.js.
 'SELECT public.own_annul_review_v2($1::jsonb,$2::text,$3::text) AS result':3,
 'SELECT public.own_annul_review_full_v2($1::jsonb,$2::text,$3::text) AS result':3,
 'SELECT public.own_annul_attempt_v1($1::jsonb,$2::uuid) AS result':2,
 'SELECT public.own_annul_attempt_full_v1($1::jsonb,$2::uuid) AS result':2,
 'SELECT public.own_annul_command_v2($1::jsonb,$2::jsonb,$3::uuid) AS result':3,
 'SELECT public.own_annul_command_full_v2($1::jsonb,$2::jsonb,$3::uuid) AS result':3
});
export function noeliaFullDecisionStatement(text,values,schema){
 if(typeof text!=='string'||!Object.hasOwn(NOELIA_FULL_DECISION_STATEMENTS,text))return null;
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/,'NOELIA_FULL_QA_SCHEMA');
 const size=NOELIA_FULL_DECISION_STATEMENTS[text];
 assert.ok(Array.isArray(values)&&values.length===size&&Reflect.ownKeys(values).length===size+1&&Array.from({length:size},(_,i)=>Object.hasOwn(values,i)&&typeof values[i]==='string').every(Boolean),'NOELIA_FULL_QA_RPC_VALUES');
 return text.replace('public.',schema+'.').replace(/\$(\d+)/g,(_,n)=>q(values[Number(n)-1]));
}
