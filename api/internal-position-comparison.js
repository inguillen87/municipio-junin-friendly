import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {COMPARISON_READ,positionComparisonQuery} from '../assets/position-comparison-model.js';
import {comparisonFail,comparisonError,positionComparisonOperation} from '../lib/internal-position-comparison.js';
import {employeeContext} from '../lib/internal-native-employees.js';
export function createPositionComparisonHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{schoolCertificateHttp.headers(res);try{
  if((req.method||'GET')!=='GET'){res.setHeader('Allow','GET');comparisonFail('METHOD_INVALID',405,'Esta consulta no admite escrituras.');}
  const q=req.query??{};if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string'))comparisonFail('QUERY_INVALID',400,'Consulta inválida.');
  if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)comparisonFail('QUERY_INVALID',400,'Consulta ambigua.');}
  let operation,input;const keys=Object.keys(q).sort().join('|');
  if(q.resource==='annual'&&keys==='resource|year'&&/^(19|20)[0-9]{2}$/.test(q.year)){operation='annual';input={year:Number(q.year)};}
  else if(q.resource==='detail'&&keys==='liquidationType|period|resource|revision|year'&&/^[1-9][0-9]{0,3}$/.test(q.revision)&&/^(19|20)[0-9]{2}$/.test(q.year)){operation='detail';try{input=positionComparisonQuery({year:Number(q.year),revision:Number(q.revision),period:q.period,liquidationType:q.liquidationType});}catch{comparisonFail('QUERY_INVALID',400,'Revisá ejercicio, versión, período y tipo.');}}
  else comparisonFail('QUERY_INVALID',400,'Consulta inválida.');
  const access=await authorize(req,res,{env,requiredCapabilities:COMPARISON_READ,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});if(!access)return;
  if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,COMPARISON_READ))comparisonFail('FORBIDDEN',403,'La membresía no permite consultar el histórico propio.');
  const session=sessionFor(access,env);employeeContext(access.principal,session);
  const data=await positionComparisonOperation(await getSql(env),access.principal,session,operation,input);return res.status(200).json({ok:true,data});
 }catch(e){const safe=comparisonError(e);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}};
}
export default createPositionComparisonHandler();
