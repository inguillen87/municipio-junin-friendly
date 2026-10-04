import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {schoolCertificateHttp as http} from './internal-family-certificates.js';
import {fixedFail,fixedSafeError,fixedUuid,FIXED_READ_CAPS} from '../lib/internal-payroll-fixed-novelties.js';
import {FIXED_GROUP_MAX_BODY,prepareFixedGroup,fixedGroupCall} from '../lib/internal-payroll-fixed-groups.js';
export const config={api:{bodyParser:false}};
export function createInternalPayrollFixedGroupsHandler(deps={}){
 const env=deps.env??process.env;
 return async(req,res)=>{
  http.headers(res);
  try{
   const method=req.method??'GET';if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');fixedFail('METHOD_NOT_ALLOWED');}
   const q=req.query??{};if(!q||typeof q!=='object'||Array.isArray(q))fixedFail('QUERY_INVALID');
   if(req.url){const params=new URL(req.url,'http://localhost').searchParams,seen=new Set();for(const[k,v]of params){if(seen.has(k)||q[k]!==v)fixedFail('QUERY_INVALID');seen.add(k);}if(seen.size!==Object.keys(q).length)fixedFail('QUERY_INVALID');}
   if(method==='POST'?Object.keys(q).length!==0:Object.keys(q).length!==2||q.resource!=='attempt'||!fixedUuid(q.key))fixedFail('QUERY_INVALID');
   const caps=[...FIXED_READ_CAPS,'payroll.fixed.prepare'];
   const access=await(deps.requireCompatibleInternalAccess??requireCompatibleInternalAccess)(req,res,{env,requiredCapabilities:caps,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});
   if(!access)return;if(access.mode!=='managed'||!principalHasCapabilities(access.principal,caps))fixedFail('CAPABILITY_REQUIRED');
   const session=(deps.actionMutationSession??actionMutationSession)(access,env);let payload,key;
   if(method==='POST'){
    http.assertOrigin(req,env);if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(http.header(req,'content-type')))fixedFail('CONTENT_TYPE_REQUIRED');
    http.checkLength(req,FIXED_GROUP_MAX_BODY);const body=await http.readBody(req,FIXED_GROUP_MAX_BODY);
    if(Object.keys(body).length!==2||body.command!=='annul'||!Object.hasOwn(body,'payload'))fixedFail('BODY_INVALID');
    payload=prepareFixedGroup(body.payload);key=http.header(req,'idempotency-key');if(!key)fixedFail('IDEMPOTENCY_KEY_REQUIRED');if(!fixedUuid(key))fixedFail('IDEMPOTENCY_KEY_INVALID');
   }else key=q.key;
   key=key.toLowerCase();const sql=await(deps.getInternalSql??getActionCenterSql)(env);
   const data=await fixedGroupCall(sql,access.principal,session,{key,...(payload?{payload}:{})});
   if(method==='POST'&&data.duplicate)res.setHeader('Idempotency-Replayed','true');return res.status(method==='POST'&&!data.duplicate?201:200).json({ok:true,data});
  }catch(error){const safe=fixedSafeError(error);if(safe.code==='PAYROLL_FIXED_SESSION_BUSY')res.setHeader('Retry-After','1');return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}
 };
}
export default createInternalPayrollFixedGroupsHandler();
