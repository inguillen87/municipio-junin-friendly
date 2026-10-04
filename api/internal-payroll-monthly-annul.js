import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {schoolCertificateHttp as http} from './internal-family-certificates.js';
import {monthlyAnnulExact,monthlyAnnulUuid,monthlyAnnulKey,monthlyAnnulMonth} from '../assets/payroll-monthly-annul-model.js';
import {MONTHLY_ANNUL_MAX_BODY,MONTHLY_ANNUL_READ_CAPS,monthlyAnnulFail,monthlyAnnulSafeError,prepareMonthlyAnnul,callMonthlyAnnul} from '../lib/internal-payroll-monthly-annul.js';
export const config={api:{bodyParser:false}};
const safeKeys=value=>!value||typeof value!=='object'||Object.entries(value).every(([key,item])=>!['__proto__','prototype','constructor'].includes(key)&&safeKeys(item));
export function createInternalPayrollMonthlyAnnulHandler(deps={}){
 const env=deps.env??process.env;
 return async(req,res)=>{
  http.headers(res);
  try{
   const method=req.method??'GET';if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');monthlyAnnulFail('METHOD_NOT_ALLOWED');}
   const q=req.query??{};if(!q||typeof q!=='object'||Array.isArray(q))monthlyAnnulFail('QUERY_INVALID');
   if(req.url){const seen=new Set();for(const[k,v]of new URL(req.url,'http://localhost').searchParams){if(seen.has(k)||q[k]!==v)monthlyAnnulFail('QUERY_INVALID');seen.add(k);}if(seen.size!==Object.keys(q).length)monthlyAnnulFail('QUERY_INVALID');}
   let request;
   if(method==='POST'){if(Object.keys(q).length)monthlyAnnulFail('QUERY_INVALID');}
   else if(q.resource==='bootstrap'&&(monthlyAnnulExact(q,['resource'])||monthlyAnnulExact(q,['resource','period'])&&monthlyAnnulMonth(q.period)))request={resource:'bootstrap',period:q.period??null};
   else if(q.resource==='detail'&&monthlyAnnulExact(q,['resource','kind','id'])&&['candidate','proposal'].includes(q.kind)&&monthlyAnnulUuid(q.id))request={...q};
   else if(q.resource==='attempt'&&monthlyAnnulExact(q,['resource','key'])&&monthlyAnnulKey(q.key))request={...q};
   else monthlyAnnulFail('QUERY_INVALID');
   const access=await(deps.requireCompatibleInternalAccess??requireCompatibleInternalAccess)(req,res,{env,requiredCapabilities:MONTHLY_ANNUL_READ_CAPS,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});
   if(!access)return;if(access.mode!=='managed'||!principalHasCapabilities(access.principal,MONTHLY_ANNUL_READ_CAPS))monthlyAnnulFail('CAPABILITY_REQUIRED');
   const session=(deps.actionMutationSession??actionMutationSession)(access,env);
   if(method==='POST'){
    http.assertOrigin(req,env);if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(http.header(req,'content-type')))monthlyAnnulFail('CONTENT_TYPE_REQUIRED');
    http.checkLength(req,MONTHLY_ANNUL_MAX_BODY);const raw=await http.readBody(req,MONTHLY_ANNUL_MAX_BODY);
    if(!safeKeys(raw)||!monthlyAnnulExact(raw,['command','payload'])||raw.command!=='annul')monthlyAnnulFail('BODY_INVALID');
    const body=prepareMonthlyAnnul(raw.payload),key=http.header(req,'idempotency-key');if(!key)monthlyAnnulFail('IDEMPOTENCY_KEY_REQUIRED');if(!monthlyAnnulKey(key))monthlyAnnulFail('IDEMPOTENCY_KEY_INVALID');
    const cap=body.command==='propose'?'payroll.novelty.prepare':'payroll.novelty.approve';if(!principalHasCapabilities(access.principal,[cap]))monthlyAnnulFail('CAPABILITY_REQUIRED');
    request={resource:'command',body,key};
   }
   const sql=await(deps.getInternalSql??getActionCenterSql)(env),data=await callMonthlyAnnul(sql,access.principal,session,request);
   if(method==='POST'&&data.replayed)res.setHeader('Idempotency-Replayed','true');return res.status(method==='POST'&&!data.replayed?201:200).json({ok:true,data});
  }catch(error){const safe=monthlyAnnulSafeError(error);if(safe.code==='PAYROLL_MONTHLY_ANNUL_SESSION_BUSY')res.setHeader('Retry-After','1');return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}
 };
}
export default createInternalPayrollMonthlyAnnulHandler();
