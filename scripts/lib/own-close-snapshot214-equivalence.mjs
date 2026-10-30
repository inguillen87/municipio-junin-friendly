// Source-only SQL equivalence supplement for the guarded214 rehearsal.
// Its author did not import this module or execute any SQL/test/constructor.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {closeDetail} from '../../tests/fixtures/own-payroll-close-synthetic.js';
import {auxiliaryCapture} from '../../tests/fixtures/own-payroll-auxiliary-synthetic.js';
import {ownCloseSnapshot} from '../../assets/own-payroll-close-model.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';

export const OWN_CLOSE_SNAPSHOT214_EQUIVALENCE_ENTRIES=Object.freeze([
 "assets/civil-date.js",
 "assets/employment-adoption-mixed-cohort.js",
 "assets/employment-adoption-operational-cohort.js",
 "assets/employment-adoption-review-model.js",
 "assets/employment-source-declarations.js",
 "assets/native-employee-confirmation-model.js",
 "assets/native-employee-contract.js",
 "assets/native-employment-catalog-model.js",
 "assets/native-employment-lifecycle-model.js",
 "assets/native-salary-catalog-model.js",
 "assets/native-salary-stream-model.js",
 "assets/own-agreement-working-time-model.js",
 "assets/own-agreement-working-time-program.js",
 "assets/own-contract-salary-conditions-model.js",
 "assets/own-contract-working-time-model.js",
 "assets/own-monthly-day-declaration-model.js",
 "assets/own-monthly-day-declaration-program.js",
 "assets/own-monthly-day-policy-model.js",
 "assets/own-monthly-day-policy-program.js",
 "assets/own-payroll-close-model.js",
 "assets/own-payroll-conditions.js",
 "assets/own-payroll-engine.js",
 "assets/own-payroll-exact.js",
 "assets/own-payroll-jurisdiction-model.js",
 "assets/own-payroll-monetary-manifest.js",
 "assets/own-payroll-monetary-policy.js",
 "assets/own-payroll-novelties-model.js",
 "assets/own-payroll-period-classification.js",
 "assets/own-payroll-period-context.js",
 "assets/own-payroll-program-model.js",
 "assets/own-payroll-receipt-model.js",
 "assets/own-payroll-report-census-model.js",
 "assets/own-payroll-report-legajo.js",
 "assets/own-payroll-report-model.js",
 "assets/own-payroll-report-statement.js",
 "assets/own-payroll-report-variables.js",
 "assets/own-payroll-response.js",
 "assets/own-payroll-run-date.js",
 "assets/own-payroll-run-model.js",
 "assets/own-payroll-run-workspace-model.js",
 "assets/own-period-classification-model.js",
 "assets/own-period-participation-model.js",
 "assets/own-period-participation-program.js",
 "assets/own-salary-seniority-model.js",
 "assets/payroll-fixed-capacity-model.js",
 "assets/payroll-fixed-novelties-model.js",
 "assets/payroll-native-monthly-model.js",
 "lib/internal-native-employees.js",
 "lib/internal-native-salary.js",
 "lib/internal-own-payroll-run.js",
 "lib/own-monthly-day-declaration-input.js",
 "lib/own-monthly-day-policy-input.js",
 "lib/own-payroll-approved-input.js",
 "lib/own-payroll-monetary-verification.js",
 "lib/own-payroll-snapshot.js",
 "scripts/lib/own-close-snapshot214-equivalence.mjs",
 "tests/fixtures/native-salary-synthetic.js",
 "tests/fixtures/novelty-saved-review-synthetic.js",
 "tests/fixtures/own-payroll-approved-synthetic.js",
 "tests/fixtures/own-payroll-auxiliary-synthetic.js",
 "tests/fixtures/own-payroll-close-synthetic.js",
 "tests/fixtures/own-payroll-liquidation-synthetic.js",
 "tests/fixtures/own-payroll-program-synthetic.js",
 "tests/fixtures/own-payroll-receipt-synthetic.js",
 "tests/fixtures/own-payroll-run-synthetic.js",
 "tests/fixtures/own-payroll-synthetic.js",
 "tests/fixtures/payroll-fixed-novelties-synthetic.js",
 "tests/fixtures/payroll-monthly-annul-synthetic.js",
 "tests/own-close-snapshot214-equivalence.test.js"
]);
const VERSION='own-close-snapshot214-equivalence.v1',PREFIX='municontrol_close_snapshot214.equivalence_';
const hash=s=>createHash('sha256').update(s).digest('hex'),q=v=>"'"+String(v).replaceAll("'","''")+"'";
const uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const clone=v=>structuredClone(v),freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
const all=()=>({kind:'all',values:[]});
function baseDetail(){const value=closeDetail(6);value.version='own-close-detail.v2';return value;}
function jurisdictions(detail){
 for(const capture of detail.captures){const people=capture.payload.population.employees;
  capture.payload.sourceInventory.jurisdictions={version:'own-run-jurisdictions.v1',complete:true,total:people.length,rows:people.map((e,n)=>({contractId:e.contractId,employeeNumber:e.employeeNumber,registrationId:uid(30000+n),identityToken:e.identityToken,jurisdictionCode:n%3===0?'42':n%3===1?'55':null}))};
  capture.payloadSha256=ownRunHash(capture.payload);
 }
 return detail;
}
function namespacedDetail(){
 const detail=baseDetail(),one=auxiliaryCapture(6),two=clone(one);two.id=detail.captures[1].id;two.key=detail.captures[1].key;two.saved.id=two.id;
 detail.captures=[one,two];detail.rows=detail.rows.map((row,n)=>{const capture=n%2?two:one,e=capture.saved.input.employees.find(e=>e.contractId===row.contractId);assert.ok(e);return{...row,employeeNumber:e.employeeNumber,agreementCode:e.agreementCode,departmentCode:e.departmentCode,runId:capture.id,resultSha256:capture.saved.resultSha256};});
 return jurisdictions(detail);
}
export function ownCloseSnapshot214EquivalenceCases(){
 const cases=[],positive=(id,detail,selection)=>{const expected=ownCloseSnapshot(detail,selection);cases.push({id,detail,selection,expected,expectedCanonicalHash:ownRunHash(expected),expectedError:null});},negative=(id,change,code,selection=all())=>{const detail=baseDetail();change(detail);cases.push({id,detail,selection,expected:null,expectedCanonicalHash:null,expectedError:code});};
 const first=baseDetail();positive('all-six-two-captures',first,all());
 positive('contracts-two-captures',baseDetail(),{kind:'contracts',values:[first.rows[1].contractId,first.rows[4].contractId].sort()});
 positive('agreements-complete-group',baseDetail(),{kind:'agreements',values:['1']});
 positive('departments-complete-group',baseDetail(),{kind:'departments',values:['1']});
 const reversed=baseDetail();reversed.rows.reverse();reversed.captures.reverse();positive('reversed-detail-order',reversed,all());
 positive('namespaces-two-captures-jurisdictions',namespacedDetail(),all());
 positive('jurisdictions-42-55-null',jurisdictions(baseDetail()),all());
 negative('empty-detail',d=>{d.rows=[];},'OWN_CLOSE_SELECTION_INVALID');
 negative('empty-contract-selection',()=>{},'OWN_CLOSE_SELECTION_INVALID',{kind:'contracts',values:[]});
 negative('unconfirmed-final-row',d=>{d.rows[5].state='missing';d.rows[5].canClose=false;},'OWN_CLOSE_DECISION_INVALID');
 negative('inconsistent-saved-total',d=>{d.captures[0].saved.result.employeeTotals[0].net='0.00';},'OWN_CLOSE_CONTRACT_INVALID');
 negative('missing-saved-total',d=>{delete d.captures[0].saved.result.employeeTotals[0].net;},'OWN_CLOSE_CONTRACT_INVALID');
 negative('precision-out-of-range',d=>{for(const c of d.captures)c.saved.input.totalsPrecision=9;},'OWN_CLOSE_CONTRACT_INVALID');
 negative('precision-scale-mismatch',d=>{for(const c of d.captures)c.saved.input.totalsPrecision=3;},'OWN_CLOSE_CONTRACT_INVALID');
 assert.equal(cases.length,14);assert.equal(new Set(cases.map(c=>c.id)).size,14);
 for(const c of cases){assert.equal(c.detail.captures.length,2);if(c.expected){assert.ok(c.expected.employeeCount>0);assert.equal(c.expected.employeeCount,c.expected.employees.length);assert.equal(c.expected.conceptCount,c.expected.concepts.length);}}
 return freeze(cases);
}
export function composeOwnCloseSnapshot214Equivalence({schema,sourceCommit,read,sourcePins}){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.equal(typeof read,'function');
 assert.ok(sourcePins&&typeof sourcePins==='object'&&!Array.isArray(sourcePins));assert.deepEqual(Object.keys(sourcePins).sort(),[...OWN_CLOSE_SNAPSHOT214_EQUIVALENCE_ENTRIES].sort(),'CLOSE214_EQ_SOURCE_SET_CHANGED');
 for(const file of OWN_CLOSE_SNAPSHOT214_EQUIVALENCE_ENTRIES){const expected=sourcePins[file];assert.match(expected,/^[a-f0-9]{64}$/);assert.equal(hash(read(file).replace(/\r\n?/g,'\n')),expected,'CLOSE214_EQ_SOURCE_CHANGED:'+file);}
 const cases=ownCloseSnapshot214EquivalenceCases(),caseIds=cases.map(c=>c.id),spec=JSON.stringify(cases),caseDigest=hash(spec),signature=schema+'.own_close_snapshot_v1(jsonb,jsonb)';
 const runCases=`
 FOR spec_row IN SELECT value FROM jsonb_array_elements(spec) LOOP
  actual:=NULL;native_state:='00000';native_message:=NULL;
  BEGIN actual:=${schema}.own_close_snapshot_v1(spec_row->'detail',spec_row->'selection');
  EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS native_state=RETURNED_SQLSTATE,native_message=MESSAGE_TEXT;END;
  IF spec_row->>'expectedError' IS NULL THEN
   IF native_state<>'00000' THEN RAISE EXCEPTION 'CLOSE214_EQ_POSITIVE_NATIVE_ERROR' USING DETAIL=spec_row->>'id';END IF;
   IF actual IS DISTINCT FROM spec_row->'expected' OR ${schema}.own_run_hash_v1(actual) IS DISTINCT FROM spec_row->>'expectedCanonicalHash'
    OR jsonb_array_length(actual->'employees')<>(actual->>'employeeCount')::integer OR jsonb_array_length(actual->'concepts')<>(actual->>'conceptCount')::integer
   THEN RAISE EXCEPTION 'CLOSE214_EQ_JS_ORACLE_CHANGED' USING DETAIL=spec_row->>'id';END IF;
  ELSIF native_state<>'P0001' OR native_message IS DISTINCT FROM spec_row->>'expectedError' THEN
   RAISE EXCEPTION 'CLOSE214_EQ_NATIVE_ERROR_CHANGED' USING DETAIL=spec_row->>'id';
  END IF;
  results:=results||jsonb_build_array(jsonb_build_object('id',spec_row->>'id','json',actual,'text',actual::text,'textSha256',CASE WHEN actual IS NULL THEN NULL ELSE encode(public.digest(actual::text,'sha256'),'hex')END,'canonicalSha256',CASE WHEN actual IS NULL THEN NULL ELSE ${schema}.own_run_hash_v1(actual)END,'sqlstate',native_state,'message',native_message));
 END LOOP;
 IF jsonb_array_length(results)<>14 OR (SELECT jsonb_agg(value->>'id' ORDER BY ordinal)FROM jsonb_array_elements(results)WITH ORDINALITY r(value,ordinal)) IS DISTINCT FROM ${q(JSON.stringify(caseIds))}::jsonb THEN RAISE EXCEPTION 'CLOSE214_EQ_OMITTED_CASE';END IF;`;
 const declarations=`DECLARE spec jsonb;spec_row jsonb;actual jsonb;results jsonb:='[]';native_state text;native_message text;metadata jsonb;stored jsonb;`;
 const meta=`SELECT to_jsonb(p)-'prosrc' INTO STRICT metadata FROM pg_proc p WHERE p.oid=to_regprocedure(${q(signature)});`;
 const context=`IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>'off' OR current_setting('municontrol_close_snapshot214.mode',true) IS DISTINCT FROM 'install' THEN RAISE EXCEPTION 'CLOSE214_EQ_REHEARSAL_INSTALL_REQUIRED';END IF;`;
 const before=`DO $close214_equivalence_before$ ${declarations} BEGIN
 ${context}
 IF NULLIF(current_setting('${PREFIX}before',true),'') IS NOT NULL THEN RAISE EXCEPTION 'CLOSE214_EQ_ALREADY_CAPTURED';END IF;
 spec:=${q(spec)}::jsonb;${meta}${runCases}
 stored:=jsonb_build_object('version',${q(VERSION)},'schema',${q(schema)},'sourceCommit',${q(sourceCommit)},'caseDigest',${q(caseDigest)},'caseIds',${q(JSON.stringify(caseIds))}::jsonb,'metadata',metadata,'results',results);
 PERFORM set_config('${PREFIX}spec',spec::text,true);PERFORM set_config('${PREFIX}before',stored::text,true);
 END $close214_equivalence_before$`;
 const after=`DO $close214_equivalence_after$ ${declarations} BEGIN
 ${context}
 stored:=NULLIF(current_setting('${PREFIX}before',true),'')::jsonb;spec:=NULLIF(current_setting('${PREFIX}spec',true),'')::jsonb;
 IF stored IS NULL OR spec IS NULL OR stored->>'version' IS DISTINCT FROM ${q(VERSION)} OR stored->>'schema' IS DISTINCT FROM ${q(schema)} OR stored->>'sourceCommit' IS DISTINCT FROM ${q(sourceCommit)} OR stored->>'caseDigest' IS DISTINCT FROM ${q(caseDigest)} OR spec IS DISTINCT FROM ${q(spec)}::jsonb THEN RAISE EXCEPTION 'CLOSE214_EQ_CAPTURE_CHANGED';END IF;
 ${meta}${runCases}
 IF stored->'metadata' IS DISTINCT FROM metadata OR stored->'results' IS DISTINCT FROM results THEN RAISE EXCEPTION 'CLOSE214_EQ_OLD_NEW_CHANGED';END IF;
 PERFORM set_config('${PREFIX}passed',jsonb_build_object('version',${q(VERSION)},'sourceCommit',${q(sourceCommit)},'caseDigest',${q(caseDigest)},'caseIds',${q(JSON.stringify(caseIds))}::jsonb,'cases',14,'positives',7,'negatives',7,'oldNewEqual',true,'javascriptOracleEqual',true,'metadataEqual',true,'omitted',0)::text,true);
 END $close214_equivalence_after$`;
 const proof=`DO $close214_equivalence_proof$ DECLARE p jsonb:=NULLIF(current_setting('${PREFIX}passed',true),'')::jsonb;BEGIN
 IF p IS DISTINCT FROM jsonb_build_object('version',${q(VERSION)},'sourceCommit',${q(sourceCommit)},'caseDigest',${q(caseDigest)},'caseIds',${q(JSON.stringify(caseIds))}::jsonb,'cases',14,'positives',7,'negatives',7,'oldNewEqual',true,'javascriptOracleEqual',true,'metadataEqual',true,'omitted',0) THEN RAISE EXCEPTION 'CLOSE214_EQ_PROOF_MISSING';END IF;
 END $close214_equivalence_proof$`;
 return freeze({version:VERSION,schema,sourceCommit,sourceEntries:[...OWN_CLOSE_SNAPSHOT214_EQUIVALENCE_ENTRIES],sourceHashes:{...sourcePins},caseDigest,caseIds,caseCount:cases.length,positives:cases.filter(c=>c.expectedError===null).length,negatives:cases.filter(c=>c.expectedError!==null).length,cases,before,after,proof,connects:false,executesSql:false});
}
