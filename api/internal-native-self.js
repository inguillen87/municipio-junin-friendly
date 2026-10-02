import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {nativeSelfView} from '../assets/native-self-model.js';
import {nativeLeaveFail} from '../lib/internal-native-leave.js';
import {nativeSelfError} from '../lib/internal-native-self.js';
const CAPS=['actions.read','leave.request.self.read'];
export function createNativeSelfHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{
  schoolCertificateHttp.headers(res);
  try{
   if(req.method&&req.method!=='GET'){res.setHeader('Allow','GET');nativeLeaveFail('METHOD_INVALID',405,'Esta consulta no modifica datos.');}
   const q=req.query??{},entries=req.url?[...new URL(req.url,'http://local.invalid').searchParams]:Object.entries(q);
   if(!q||typeof q!=='object'||Array.isArray(q)||Object.keys(q).join('|')!=='resource'||q.resource!=='bootstrap'||entries.length!==1||entries[0][0]!=='resource'||entries[0][1]!=='bootstrap')nativeLeaveFail('QUERY_INVALID',400,'La consulta usa el contrato de tu cuenta; no admite otro legajo.');
   const access=await authorize(req,res,{env,requiredCapabilities:CAPS,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});if(!access)return;
   if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,CAPS))nativeLeaveFail('FORBIDDEN',403,'Tu cuenta no permite esta consulta.');
   const context=employeeContext(access.principal,sessionFor(access,env)),sql=await getSql(env),rows=await sql.query('SELECT public.native_employee_self_bootstrap_v1($1::jsonb) AS result',[JSON.stringify(context)]);
   const value=nativeSelfView((Array.isArray(rows)?rows:rows?.rows)?.[0]?.result);
   return res.status(200).json({ok:true,data:value});
  }catch(error){const safe=error?.code==='NATIVE_SELF_CONTRACT_INVALID'?{status:503,code:error.code,message:error.message}:nativeSelfError(error);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}
 };
}
export default createNativeSelfHandler();
