import {employeeContext} from './internal-native-employees.js';
import {annualBudgetOperation} from './internal-annual-position-budget.js';
import {positionComparisonQuery,verifiedPositionComparison} from '../assets/position-comparison-model.js';
export class PositionComparisonHttpError extends Error{constructor(code,status,message){super(message);Object.assign(this,{code:'POSITION_COMPARISON_'+code,status});}}
export const comparisonFail=(code,status,message)=>{throw new PositionComparisonHttpError(code,status,message);};
export function comparisonError(e){if(e instanceof PositionComparisonHttpError)return e;const m=String(e?.message??'')+' '+String(e?.code??'');if(/SESSION_INVALID/.test(m))return new PositionComparisonHttpError('SESSION_INVALID',401,'La sesión venció. Volvé a ingresar.');if(/FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(m))return new PositionComparisonHttpError('FORBIDDEN',403,'Tu membresía no permite consultar este histórico.');if(/POSITION_COMPARISON_(INPUT_INVALID|NORM_REQUIRED)/.test(m))return new PositionComparisonHttpError('INPUT_INVALID',422,'Elegí una versión anual aprobada y un período del mismo ejercicio.');if(/POSITION_COMPARISON_LIMIT/.test(m))return new PositionComparisonHttpError('LIMIT',422,'La comparación completa supera la capacidad; no se omitieron filas.');return new PositionComparisonHttpError('UNAVAILABLE',503,'No se verificó la comparación completa. Consultá nuevamente.');}
export async function positionComparisonOperation(sql,principal,session,operation,input){try{
 if(operation==='annual')return await annualBudgetOperation(sql,principal,session,'bootstrap',{year:input.year});
 if(operation!=='detail')comparisonFail('INPUT_INVALID',400,'Operación no admitida.');
 const q=positionComparisonQuery(input),rows=await sql.query('SELECT public.position_comparison_detail_v1($1::jsonb,$2::integer,$3::integer,$4::text,$5::text) AS result',[JSON.stringify(employeeContext(principal,session)),q.year,q.revision,q.period,q.liquidationType]);
 return await verifiedPositionComparison((Array.isArray(rows)?rows:rows?.rows)?.[0]?.result,q);
}catch(e){throw comparisonError(e);}}
