import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readPrivateJsonBody} from './internal-employment-catalog.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {nativeLeaveExact,nativeLeaveCommand} from '../assets/native-leave-contract.js';
import {NATIVE_LEAVE_READ,NATIVE_LEAVE_CAPS,NATIVE_LEAVE_MAX_BYTES,nativeLeaveFail,nativeLeaveError,nativeLeaveOperation} from '../lib/internal-native-leave.js';
export const config={api:{bodyParser:false}};

export function createNativeLeaveHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 const selfService=deps.selfService===true,readCaps=selfService?['actions.read','leave.request.self.read']:NATIVE_LEAVE_READ,operate=deps.operation??nativeLeaveOperation;
 const errorFor=deps.errorFor??nativeLeaveError;
 return async(req,res)=>{
  schoolCertificateHttp.headers(res);
  try{
   const method=req.method||'GET',q=req.query??{};let operation,input;
   if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');nativeLeaveFail('METHOD_INVALID',405,'Método no admitido.');}
   if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string'))nativeLeaveFail('QUERY_INVALID',400,'Consulta inválida.');
   if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)nativeLeaveFail('QUERY_INVALID',400,'Consulta ambigua.');}
   if(method==='POST'){
    if(Object.keys(q).length)nativeLeaveFail('QUERY_INVALID',400,'La operación no admite parámetros.');
    schoolCertificateHttp.assertOrigin(req,env);
    if(schoolCertificateHttp.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')nativeLeaveFail('CONTENT_TYPE',415,'Se requiere un formulario JSON.');
    schoolCertificateHttp.checkLength(req,NATIVE_LEAVE_MAX_BYTES);
   }else if(q.resource==='bootstrap'&&Object.keys(q).sort().join('|')==='contractId|resource'){operation='bootstrap';input={contractId:q.contractId};}
   else if(q.resource==='attempt'&&Object.keys(q).sort().join('|')==='contractId|key|resource'){operation='attempt';input={contractId:q.contractId,key:q.key};}
   else nativeLeaveFail('QUERY_INVALID',400,'Consulta inválida.');
   const access=await authorize(req,res,{env,requiredCapabilities:readCaps,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});
   if(!access)return;
   if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,readCaps))nativeLeaveFail('FORBIDDEN',403,'La membresía no permite consultar el legajo y sus solicitudes.');
   const session=sessionFor(access,env);
   employeeContext(access.principal,session);
   if(method==='POST'){
    const body=await readPrivateJsonBody(req,{maxBytes:NATIVE_LEAVE_MAX_BYTES});
    if(!nativeLeaveExact(body,['operation','payload'])||body.operation!=='command')nativeLeaveFail('INPUT_INVALID',400,'Operación o formulario no admitidos.');
    const command=nativeLeaveCommand(body.payload);
    if(selfService&&!['create','update_draft','submit','cancel'].includes(command.command))nativeLeaveFail('FORBIDDEN',403,'La autogestión no permite decisiones administrativas.');
    if(selfService&&!principalHasCapabilities(access.principal,['leave.request.self.'+({update_draft:'update'}[command.command]??command.command)]))nativeLeaveFail('FORBIDDEN',403,'Tu cuenta no permite esta operación sobre tus solicitudes.');
    if(!principalHasCapabilities(access.principal,NATIVE_LEAVE_CAPS[command.command],'any'))nativeLeaveFail('FORBIDDEN',403,'La membresía no permite esta operación sobre las licencias.');
    operation='command';input={body:command,key:schoolCertificateHttp.header(req,'idempotency-key')};
   }
   const data=await operate(await getSql(env),access.principal,session,operation,input);
   if(data.replayed)res.setHeader('Idempotency-Replayed','true');
   return res.status(method==='POST'&&!data.replayed?201:200).json({ok:true,data});
  }catch(error){const safe=String(error?.code||'').startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(error):errorFor(error);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}
 };
}
export default createNativeLeaveHandler();
