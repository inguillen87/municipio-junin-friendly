import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { actionMutationSession,getActionCenterSql } from './internal-actions.js';
import { BANK_CAPABILITIES,bankFail,bankSafeError,parseBankReportQuery,readBankReport } from '../lib/internal-payroll-bank-report.js';
export const config={api:{bodyParser:false}};
export function createInternalPayrollBankReportHandler(dependencies={}) {
 const env=dependencies.env??process.env,accessFn=dependencies.requireCompatibleInternalAccess??requireCompatibleInternalAccess;
 const sessionFn=dependencies.actionMutationSession??actionMutationSession,sqlFn=dependencies.getInternalSql??getActionCenterSql;
 return async function internalPayrollBankReport(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Pragma','no-cache');res.setHeader('Vary','Cookie, Origin');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'; frame-ancestors 'none'");
  try{
   if((req.method??'GET')!=='GET'){res.setHeader('Allow','GET');bankFail('METHOD_NOT_ALLOWED')}
   const query=parseBankReportQuery(req);
   const access=await accessFn(req,res,{env,requiredCapabilities:BANK_CAPABILITIES,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});
   if(!access)return;
   if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,BANK_CAPABILITIES))bankFail('CAPABILITY_REQUIRED');
   const data=await readBankReport(await sqlFn(env),access.principal,sessionFn(access,env),query);
   return res.status(200).json({ok:true,data});
  }catch(error){const safe=bankSafeError(error);if(safe.code==='PAYROLL_BANK_SESSION_BUSY')res.setHeader('Retry-After','1');return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message})}
 };
}
export default createInternalPayrollBankReportHandler();
