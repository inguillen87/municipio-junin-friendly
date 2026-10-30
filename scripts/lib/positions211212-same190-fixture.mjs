// Private source fixture over the admitted same190 h. No source author execution.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {employmentLifecycleOperation} from '../../lib/internal-employment-lifecycle.js';
import {lifecycleProposalInput,lifecycleReviewInput} from '../../assets/native-employment-lifecycle-model.js';
import {lifecycleFixture} from '../../tests/fixtures/native-employment-lifecycle-synthetic.js';
import {performancePreservationSnapshot} from '../verify-documentary-roster-performance.mjs';
import {createPositions210Sql,positions210Rpc,assertPositions210Admission} from './positions210-same190-native-continuation.mjs';

const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const immutableEmployment=value=>({intervals:value.intervals,revision:value.revision,appliedAt:value.appliedAt,status:value.status,...(Object.hasOwn(value,'datesVerified')?{datesVerified:value.datesVerified}:{})});
const allowed=Object.freeze(['native_employment_lifecycle_proposal','native_employment_lifecycle_review']);
function snapshot(h){return h.json([performancePreservationSnapshot(),"SELECT current_setting('municontrol_documentary_install.after')::jsonb"],{readOnly:true,fullJson:true});}
function withoutHistoryRows(value,schema){const copy=structuredClone(value);for(const name of allowed){const rows=copy.tables.filter(row=>row.schema===schema&&row.name===name);assert.equal(rows.length,1);delete rows[0].rows;delete rows[0].rowsSha256;}return copy;}
function prefix(h){return h.json([`DO $lifecycle212_prefix$ DECLARE relation record;rows_value jsonb;result jsonb:='[]';BEGIN
 FOR relation IN SELECT c.relname FROM pg_class c WHERE c.relnamespace=${q(h.qa.schema)}::regnamespace AND c.relname IN('native_employment_lifecycle_proposal','native_employment_lifecycle_review') ORDER BY c.relname LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''sha256'',x.sha256,''count'',x.total) ORDER BY x.sha256),''[]''::jsonb) FROM(SELECT encode(public.digest(to_jsonb(r)::text,''sha256''),''hex'') sha256,count(*) total FROM %I.%I r GROUP BY 1)x',${q(h.qa.schema)},relation.relname) INTO rows_value;result:=result||jsonb_build_array(jsonb_build_object('name',relation.relname,'rows',rows_value));
 END LOOP;PERFORM set_config('municontrol_lifecycle212.prefix',result::text,true);END $lifecycle212_prefix$;SELECT current_setting('municontrol_lifecycle212.prefix')::jsonb`],{readOnly:true,fullJson:true});}
function assertPrefix(before,after){assert.equal(before.length,2);assert.equal(after.length,2);for(const old of before){const next=after.find(row=>row.name===old.name);assert.ok(next);const counts=new Map(next.rows.map(row=>[row.sha256,row.count]));assert.equal(counts.size,next.rows.length);for(const row of old.rows)assert.ok((counts.get(row.sha256)??0)>=row.count,'LIFECYCLE212_PRIOR_HISTORY_ROW_CHANGED');}}

export async function verifyLifecycle212Same190({h,db,admission,contracts}){
 assertPositions210Admission({h,db,admission});assert.equal(admission.dependentInstallations?.passed,true);assert.equal(contracts.length,855);assert.equal(new Set(contracts).size,855);const target=contracts[6];assert.ok(target&&!admission.pair.contractsReserved.includes(target)&&!contracts.slice(0,4).includes(target));
 const sql=createPositions210Sql({h,db}),actors=admission.pair.actors,operate=(name,operation,input={})=>employmentLifecycleOperation(sql,actors[name].principal,actors[name].session,operation,{...input,current:true});
 const before=snapshot(h),prefixBefore=prefix(h),first=await operate('maker','bootstrap',{contractId:target}),initial=await operate('checker','history',{contractId:target});
 assert.equal(first.subject.origin,'MUNICONTROL');assert.equal(first.subject.contractId,target);assert.equal(first.employment.status,'active');assert.deepEqual(first.employment.intervals,[{startDate:admission.period+'-01',endDate:null}]);assert.equal(initial.total,0);
 const baseline=immutableEmployment(first.employment),checkpoints=[{count:0,history:initial}],ids=[];
 const observe=async count=>{const beforeRead=h.readFullSnapshot(),value=await operate('checker','history',{contractId:target}),boot=await operate('checker','bootstrap',{contractId:target});assert.deepEqual(h.readFullSnapshot(),beforeRead);
  assert.equal(value.total,count);assert.equal(value.proposals.length,count);assert.equal(value.bootstrap.proposals.length,Math.min(count,20));assert.equal(value.bootstrap.historyTruncated,count>20);assert.deepEqual(value.bootstrap,boot);assert.deepEqual(value.proposals.slice(0,20),boot.proposals);assert.deepEqual(value.proposals.map(row=>row.id).sort(),[...ids].sort());assert.ok(value.proposals.every(row=>row.status==='rejected'));assert.deepEqual(immutableEmployment(boot.employment),baseline);checkpoints.push({count,history:value});return value;};
 h.setPhase('lifecycle212-real-propose-reject-history');
 for(let index=0;index<100;index++){
  const boot=await operate('maker','bootstrap',{contractId:target}),seed=lifecycleFixture('propose').body.payload;
  const body=lifecycleProposalInput({...seed,contractId:target,identityToken:boot.subject.identityToken,scopeVersion:boot.scopeVersion,baseVersion:boot.employment.version,date:admission.period+'-01'});
  const submitted=await operate('maker','propose',{body,key:randomUUID()});assert.equal(submitted.status,'pending');ids.push(submitted.proposalId);assert.equal(new Set(ids).size,ids.length);
  const current=await operate('checker','bootstrap',{contractId:target}),review=lifecycleReviewInput({...lifecycleFixture('review','reject').body.payload,contractId:target,proposalId:submitted.proposalId,scopeVersion:current.scopeVersion});
  const rejected=await operate('checker','review',{body:review,key:randomUUID()});assert.equal(rejected.status,'rejected');assert.equal(rejected.payrollModified,false);
  if([20,21,100].includes(index+1))await observe(index+1);
 }
 const boot=await operate('maker','bootstrap',{contractId:target}),body=lifecycleProposalInput({...lifecycleFixture('propose').body.payload,contractId:target,identityToken:boot.subject.identityToken,scopeVersion:boot.scopeVersion,baseVersion:boot.employment.version,date:admission.period+'-01'}),key=randomUUID();
 const text='SELECT public.native_employment_lifecycle_propose_v2($1::jsonb,$2::jsonb,$3::uuid) AS result',values=[JSON.stringify(employeeContext(actors.maker.principal,actors.maker.session)),JSON.stringify(body),key],statement=positions210Rpc(text,values,h.qa.schema),limitBefore=h.readFullSnapshot();
 h.setPhase('lifecycle212-101st-proposal-native-limit');
 await db.expectRunError({caseId:'212-101st-proposal-limit',nativeCode:'NATIVE_EMPLOYMENT_LIFECYCLE_LIMIT',statement,runtime:true},async()=>{await assert.rejects(()=>operate('maker','propose',{body,key}),error=>error.code==='NATIVE_EMPLOYMENT_LIFECYCLE_LIMIT'&&error.status===409);assert.deepEqual(h.readFullSnapshot(),limitBefore);});
 const final=await observe(100);assert.equal(final.total,100);
 const rows=h.json([`SELECT jsonb_build_object('proposals',(SELECT jsonb_agg(id ORDER BY id) FROM ${h.qa.schema}.native_employment_lifecycle_proposal WHERE contract_id=${q(target)}::uuid),'reviewed',(SELECT jsonb_agg(proposal_id ORDER BY proposal_id) FROM ${h.qa.schema}.native_employment_lifecycle_review WHERE contract_id=${q(target)}::uuid AND decision='reject'),'unexpectedDecisions',(SELECT count(*)::integer FROM ${h.qa.schema}.native_employment_lifecycle_review WHERE contract_id=${q(target)}::uuid AND decision<>'reject'))`],{readOnly:true});
 assert.deepEqual(rows,{proposals:[...ids].sort(),reviewed:[...ids].sort(),unexpectedDecisions:0});
 const after=snapshot(h),prefixAfter=prefix(h);assertPrefix(prefixBefore,prefixAfter);assert.deepEqual(withoutHistoryRows(after,h.qa.schema),withoutHistoryRows(before,h.qa.schema),'LIFECYCLE212_CHANGED_OTHER_STATE');
 for(const name of allowed){const old=before.tables.find(row=>row.schema===h.qa.schema&&row.name===name),next=after.tables.find(row=>row.schema===h.qa.schema&&row.name===name);assert.equal(next.rows,old.rows+100);}
 const aclBefore=h.readFullSnapshot();h.setPhase('lifecycle212-private-table-denial');
 const denied=h.json(['SET LOCAL ROLE municontrol_actions_runtime_app',`DO $lifecycle212_private_table$ DECLARE native_state text; BEGIN
 BEGIN PERFORM 1 FROM ${h.qa.schema}.native_employment_lifecycle_proposal;RAISE EXCEPTION 'QA_LIFECYCLE212_PRIVATE_TABLE_UNEXPECTED_SUCCESS';
 EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS native_state=RETURNED_SQLSTATE;IF native_state IS DISTINCT FROM '42501' THEN RAISE;END IF;PERFORM set_config('municontrol_lifecycle212.private',jsonb_build_object('denied',true,'sqlstate',native_state)::text,true);END;
 END $lifecycle212_private_table$;SELECT current_setting('municontrol_lifecycle212.private')::jsonb`],{command:true,end:'ROLLBACK'});
 assert.deepEqual(denied,{denied:true,sqlstate:'42501'});assert.deepEqual(h.readFullSnapshot(),aclBefore);
 h.check('212 exposes exact0/20/21/100 recent-prefix history via real native facades;101st proposal is rejected natively, all100 rejections preserve employment and prior state');
 return Object.freeze({version:'lifecycle212-same190-history.v1',passed:true,sourceCommit:h.sourceCommit,target,checkpoints,proposals:100,rejections:100,limit101Native:true,forced101Rows:false,privateTableNativeDenied:true,oldRowsPreserved:true,effectiveEmploymentPreserved:true,payrollModified:false,synthetic:true,productionWrites:0,municipalAcceptance:false});
}
