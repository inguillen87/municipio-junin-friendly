import {employeeContext} from './internal-native-employees.js';
import {salaryUuid,salaryKey} from '../assets/native-salary-catalog-model.js';
import {familyPayrollFactsFail,familyPayrollFactsError,familyPayrollFactsFingerprint} from './internal-own-contract-family-payroll-facts.js';
import {familySelectedQuery,familySelectedCommand,familySelectedBootstrap,familySelectedHistory,familySelectedDetail,familySelectedReceipt} from '../assets/own-contract-family-payroll-facts-selection.js';

export async function familySelectedOperation(sql,principal,session,operation,input={}){
 try{
  const ctx=JSON.stringify(employeeContext(principal,session));let query,values,body;
  if(operation==='bootstrap'){
   familySelectedQuery(input);query='SELECT public.own_family_payroll_facts_bootstrap_v2($1::jsonb,$2::text,$3::jsonb) AS result';values=[ctx,input.period,JSON.stringify(input.contractIds)];
  }else if(operation==='history'){
   if(typeof input.period!=='string'||!/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(input.period))familyPayrollFactsFail('INPUT_INVALID',400,'Elegí un período válido.');
   query='SELECT public.own_family_payroll_facts_history_v2($1::jsonb,$2::text) AS result';values=[ctx,input.period];
  }else if(operation==='detail'){
   if(!salaryUuid(input.id))familyPayrollFactsFail('INPUT_INVALID',400,'Elegí una propuesta válida.');
   query='SELECT public.own_family_payroll_facts_detail_v2($1::jsonb,$2::uuid) AS result';values=[ctx,input.id];
  }else{
   if(!salaryKey(input.key))familyPayrollFactsFail('INPUT_INVALID',428,'La operación requiere una referencia de intento.');
   if(operation==='attempt'){query='SELECT public.own_family_payroll_facts_attempt_v2($1::jsonb,$2::uuid) AS result';values=[ctx,input.key];}
   else if(operation==='command'){body=familySelectedCommand(input.body);query='SELECT public.own_family_payroll_facts_command_v2($1::jsonb,$2::jsonb,$3::uuid) AS result';values=[ctx,JSON.stringify(body),input.key];}
   else familyPayrollFactsFail('INPUT_INVALID',400,'Operación no admitida.');
  }
  const rows=await sql.query(query,values),result=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;
  try{
   if(operation==='bootstrap'){
    familySelectedBootstrap(result);
    if(result.period!==input.period||JSON.stringify(result.contractIds)!==JSON.stringify(input.contractIds))throw Error('SCOPE_MISMATCH');
   }else if(operation==='history'){
    familySelectedHistory(result);if(result.period!==input.period)throw Error('PERIOD_MISMATCH');
   }else if(operation==='detail'){
    await familySelectedDetail(result);if(result.proposal.id.toLowerCase()!==input.id.toLowerCase())throw Error('PROPOSAL_MISMATCH');
   }else{
    await familySelectedReceipt(result,body?{key:input.key,body}:null);
    if(result.requestKey!==input.key||result.requestSha256!==familyPayrollFactsFingerprint(result.body))throw Error('ATTEMPT_MISMATCH');
   }
   return result;
  }catch{familyPayrollFactsFail('CONTRACT_INVALID',503,'No se verificó la respuesta de la selección. Consultá el mismo intento.');}
 }catch(e){throw familyPayrollFactsError(e);}
}
