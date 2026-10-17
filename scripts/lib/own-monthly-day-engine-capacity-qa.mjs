// Synthetic normal067/193 writers. This module builds a CI transaction only.
import assert from'node:assert/strict';
import{employeeDraft}from'../../assets/native-employee-contract.js';
import{monthlyQaLiteral as q}from'./own-monthly-participation-qa.mjs';
const j=v=>q(JSON.stringify(v))+'::jsonb';
export function monthly194CapacityDrafts(){return Array.from({length:601},(_,i)=>{const dni=String(98019400+i),prefix='20'+dni,remainder=11-[5,4,3,2,7,6,5,4,3,2].reduce((n,w,k)=>n+w*Number(prefix[k]),0)%11,cuil=prefix+(remainder===11?'0':remainder===10?'9':String(remainder));return employeeDraft({legajo:String(819400+i),fullName:'Agente exclusivamente ficticio QA194 '+i,dni,cuil,birthDate:'1990-01-01',sexCode:'X',startDate:i===600?'2026-10-16':'2026-01-01',agreementCode:'1',categoryCode:'1',organizationId:'1',sectorCode:'1',jobTitle:'Capacidad mensual exclusivamente sintética',legalReference:'Alta exclusivamente sintética QA194',jurisdictionCode:'42'});});}
export function monthly194CapacitySql({maker,checker,schema}){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.notEqual(maker.membershipId,checker.membershipId);const drafts=monthly194CapacityDrafts();
 const sql=`DO $monthly194_capacity$ DECLARE draft jsonb;created jsonb;boot jsonb;cb jsonb;body jsonb;proposal jsonb;approved jsonb;employees jsonb:='[]';contracts jsonb:='[]';i integer:=0;last_created jsonb;last_body jsonb;last_proposal jsonb;missing_rejected boolean:=false;facts jsonb;BEGIN
  FOR draft IN SELECT value FROM jsonb_array_elements(${j(drafts)}) LOOP
   boot:=public.native_employee_bootstrap_v1(${j(maker)});
   created:=public.native_employee_create_v1(${j(maker)},draft,boot#>>'{catalog,version}',gen_random_uuid());
   IF created->>'origin'<>'MUNICONTROL' THEN RAISE EXCEPTION 'MONTHLY194_CAPACITY_NATIVE_REQUIRED';END IF;
   boot:=public.own_monthly_days_bootstrap_v1(${j(maker)},(created->>'contractId')::uuid,'2026-10');
   body:=jsonb_build_object('command','propose','contractId',created->>'contractId','period','2026-10','scopeVersion',boot->>'scopeVersion','baseVersion',boot#>>'{configuration,version}','sourceVersion',boot#>>'{source,version}','proposalId',NULL,'proposalSha256',NULL,'definition',jsonb_build_object('recognizedDays',CASE WHEN i=600 THEN '16' ELSE '30' END,'baseDays','30','unit','days','policyVersion','own-monthly-approved-days-policy.v1','fullMonthDeclared',i<>600,'asOfDate','2026-10-01','documentReference','Constancia exclusivamente sintética QA194'),'reason','Propuesta exclusivamente sintética de capacidad QA194','reviewConfirmed',false);
   proposal:=public.own_monthly_days_command_v1(${j(maker)},body,gen_random_uuid());
   IF i<600 THEN
    cb:=public.own_monthly_days_bootstrap_v1(${j(checker)},(created->>'contractId')::uuid,'2026-10');
    approved:=public.own_monthly_days_command_v1(${j(checker)},body||jsonb_build_object('command','approve','scopeVersion',cb->>'scopeVersion','definition',NULL,'proposalId',proposal->>'proposalId','proposalSha256',proposal->>'requestSha256','reason','Revisión independiente sintética de capacidad QA194','reviewConfirmed',true),gen_random_uuid());
    IF approved->>'status'<>'approved' THEN RAISE EXCEPTION 'MONTHLY194_CAPACITY_APPROVAL_REQUIRED';END IF;
   ELSE last_created:=created;last_body:=body;last_proposal:=proposal;END IF;
   employees:=employees||jsonb_build_array(jsonb_build_object('contractId',created->>'contractId','identityToken',boot#>>'{source,subject,identityToken}'));contracts:=contracts||jsonb_build_array(created->>'contractId');i:=i+1;
  END LOOP;
  IF i<>601 THEN RAISE EXCEPTION 'MONTHLY194_CAPACITY_POPULATION_CHANGED';END IF;
  BEGIN PERFORM public.own_monthly_days_capture_v1(public.native_salary_administrative_context_v1(${j(maker)}),employees,'2026-10');EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'MONTHLY_DAY_DECLARATION_APPROVAL_REQUIRED' THEN RAISE;END IF;missing_rejected:=true;END;
  IF NOT missing_rejected THEN RAISE EXCEPTION 'MONTHLY194_CAPACITY_LAST_ROW_NOT_REJECTED';END IF;
  cb:=public.own_monthly_days_bootstrap_v1(${j(checker)},(last_created->>'contractId')::uuid,'2026-10');
  approved:=public.own_monthly_days_command_v1(${j(checker)},last_body||jsonb_build_object('command','approve','scopeVersion',cb->>'scopeVersion','definition',NULL,'proposalId',last_proposal->>'proposalId','proposalSha256',last_proposal->>'requestSha256','reason','Revisión independiente final601 exclusivamente sintética','reviewConfirmed',true),gen_random_uuid());
  facts:=public.own_monthly_days_capture_v1(public.native_salary_administrative_context_v1(${j(maker)}),employees,'2026-10');
  IF jsonb_array_length(facts->'records')<>601 OR facts#>>'{records,600,configuration,definition,recognizedDays}'<>'16' THEN RAISE EXCEPTION 'MONTHLY194_CAPACITY_CAPTURE_CHANGED';END IF;
  PERFORM set_config('municontrol_qa194.capacity',jsonb_build_object('contracts',contracts,'recordCount',601,'lastRecognizedDays','16','missingLastApprovalRejected',missing_rejected,'legacyCounterparts',(SELECT count(*) FROM public.grh_employees WHERE company_id=(public.native_salary_administrative_context_v1(${j(maker)})->>'sourceCompanyId')::bigint AND legajo=ANY(ARRAY(SELECT value->>'legajo' FROM jsonb_array_elements(${j(drafts)})))),'adoptionApplications',(SELECT count(*) FROM public.employment_adoption_application WHERE contract_id::text IN(SELECT value#>>'{}' FROM jsonb_array_elements(contracts))))::text,true);
 END $monthly194_capacity$;
 SELECT current_setting('municontrol_qa194.capacity')::jsonb`;
 // Normal application façades perform every creation/proposal/decision above.
 // Private capture checks run as disposable fixture owner, never runtime ACL.
 return sql;
}
