import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {salaryUuid} from '../assets/native-salary-catalog-model.js';
import {OWN_RUN_FULL_JSON} from '../assets/own-payroll-response.js';
import {supportsOwnPayrollStream,sendOwnPayrollStream} from '../lib/own-payroll-response.js';
import {OWN_RUN_PREPARE,annulPreparationFail,annulPreparationError,ownAnnulPreparationOperation} from '../lib/internal-own-payroll-annulment-preparation.js';

export const config={api:{bodyParser:false}};
export function createOwnAnnulPreparationHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,
  getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{
  schoolCertificateHttp.headers(res);
  try{
   // This resource cannot mutate. Reject methods before headers, body access,
   // authorisation or a DB connection; old commands keep their original route.
   if((req.method||'GET')!=='GET'){res.setHeader('Allow','GET');annulPreparationFail('METHOD_INVALID',405,'Esta consulta sólo admite GET.');}
   const q=req.query??{};
   if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(value=>typeof value!=='string')||Object.keys(q).sort().join('|')!=='id|resource'||q.resource!=='detail'||!salaryUuid(q.id))annulPreparationFail('QUERY_INVALID',400,'Elegí una referencia de anulación válida.');
   if(req.url){
    const entries=[...new URL(req.url,'http://local.invalid').searchParams];
    if(entries.length!==Object.keys(q).length||entries.some(([key,value])=>q[key]!==value)||new Set(entries.map(([key])=>key)).size!==entries.length)annulPreparationFail('QUERY_INVALID',400,'La consulta contiene referencias ambiguas.');
   }
   const sourceId=q.id,accept=schoolCertificateHttp.header(req,'accept').trim().toLowerCase();
   if(!['','*/*','application/json',OWN_RUN_FULL_JSON].includes(accept))annulPreparationFail('RESPONSE_PROFILE_INVALID',406,'Elegí el formato JSON de consulta completa admitido.');
   const fullJson=accept===OWN_RUN_FULL_JSON;
   if(fullJson&&!supportsOwnPayrollStream(res))annulPreparationFail('UNAVAILABLE',503,'No está disponible la lectura completa. Volvé a consultar la misma referencia.');
   const access=await authorize(req,res,{env,requiredCapabilities:OWN_RUN_PREPARE,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});
   if(!access)return;
   if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,OWN_RUN_PREPARE))annulPreparationFail('FORBIDDEN',403,'Tu membresía no permite preparar este alcance nominal.');
   const session=sessionFor(access,env);employeeContext(access.principal,session);
   const data=await ownAnnulPreparationOperation(await getSql(env),access.principal,session,'detail',{id:sourceId},{fullJson});
   if(fullJson)return await sendOwnPayrollStream(res,200,data);
   return res.status(200).json({ok:true,data});
  }catch(error){
   if(res.headersSent){res.destroy();return;}
   const safe=String(error?.code??'').startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(error):annulPreparationError(error);
   return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});
  }
 };
}
export default createOwnAnnulPreparationHandler();
