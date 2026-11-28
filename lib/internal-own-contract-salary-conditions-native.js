import {employeeContext} from './internal-native-employees.js';
import {salaryUuid,salaryKey} from '../assets/native-salary-catalog-model.js';
import {salaryConditionsFail,salaryConditionsError,salaryConditionsFingerprint,SalaryConditionsError} from './internal-own-contract-salary-conditions.js';
import {salaryNativeQuery,salaryNativeCommand,salaryNativeBootstrap,salaryNativeHistory,salaryNativeDetail,salaryNativeReceipt} from '../assets/own-contract-salary-conditions-native-model.js';

export function salaryNativeError(error){
 const safe=salaryConditionsError(error);
 if(!(error instanceof SalaryConditionsError)&&safe.code==='SALARY_CONDITIONS_INPUT_INVALID'&&safe.status===422)return new SalaryConditionsError('INPUT_INVALID',422,'Revisá docencia, mayor dedicación de vivienda, base de días, período y constancia.');
 return safe;
}

export async function salaryNativeOperation(sql,principal,session,operation,input={}){
 try{
  const ctx=JSON.stringify(employeeContext(principal,session));let query,values,body;
  if(operation==='bootstrap'){
   salaryNativeQuery(input);query='SELECT public.own_salary_conditions_native_bootstrap_v2($1::jsonb,$2::text,$3::jsonb) AS result';values=[ctx,input.period,JSON.stringify(input.contractIds)];
  }else if(operation==='history'){
   if(typeof input.period!=='string'||!/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(input.period))salaryConditionsFail('INPUT_INVALID',400,'Elegí un período válido.');
   query='SELECT public.own_salary_conditions_native_history_v2($1::jsonb,$2::text) AS result';values=[ctx,input.period];
  }else if(operation==='detail'){
   if(!salaryUuid(input.id))salaryConditionsFail('INPUT_INVALID',400,'Elegí una propuesta válida.');
   query='SELECT public.own_salary_conditions_native_detail_v2($1::jsonb,$2::uuid) AS result';values=[ctx,input.id];
  }else{
   if(!salaryKey(input.key))salaryConditionsFail('INPUT_INVALID',428,'La operación requiere una referencia de intento.');
   if(operation==='attempt'){query='SELECT public.own_salary_conditions_native_attempt_v2($1::jsonb,$2::uuid) AS result';values=[ctx,input.key];}
   else if(operation==='command'){body=salaryNativeCommand(input.body);query='SELECT public.own_salary_conditions_native_command_v2($1::jsonb,$2::jsonb,$3::uuid) AS result';values=[ctx,JSON.stringify(body),input.key];}
   else salaryConditionsFail('INPUT_INVALID',400,'Operación no admitida.');
  }
  const rows=await sql.query(query,values),result=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;
  try{
   if(operation==='bootstrap'){
    salaryNativeBootstrap(result);
    if(result.period!==input.period||JSON.stringify(result.contractIds)!==JSON.stringify(input.contractIds))throw Error('SCOPE_MISMATCH');
   }else if(operation==='history'){
    salaryNativeHistory(result);if(result.period!==input.period)throw Error('PERIOD_MISMATCH');
   }else if(operation==='detail'){
    await salaryNativeDetail(result);if(result.proposal.id.toLowerCase()!==input.id.toLowerCase())throw Error('PROPOSAL_MISMATCH');
   }else{
    await salaryNativeReceipt(result,body?{key:input.key,body}:null);
    if(result.requestKey!==input.key||result.requestSha256!==salaryConditionsFingerprint(result.body))throw Error('ATTEMPT_MISMATCH');
   }
   return result;
  }catch{salaryConditionsFail('CONTRACT_INVALID',503,'No se verificó la respuesta de la selección. Consultá el mismo intento.');}
 }catch(e){throw salaryNativeError(e);}
}
