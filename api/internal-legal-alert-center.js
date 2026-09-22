import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp as http} from './internal-family-certificates.js';
import {legalContext,legalSafeError} from '../lib/internal-legal-registry.js';
import {verifyLegalAlertCenterResponse,verifyLegalAlertCenterResponseV2} from '../assets/legal-alert-center-model.js';

function requestedVersion(req){
 const q=req.query||{},u=new URL(req.url||'','http://local.invalid').searchParams;
 if(q.resource!=='alerts'||u.get('resource')!=='alerts')return null;
 if(Object.keys(q).length===1&&u.size===1)return 1;
 if(Object.keys(q).length===2&&q.version==='2'&&u.size===2&&u.get('version')==='2')return 2;
 return null;
}

export function createLegalAlertCenterHandler(deps={}){
 const env=deps.env??process.env;
 return async(req,res)=>{
  http.headers(res);
  try{
   if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'Método no permitido.'});
   }
   const version=requestedVersion(req);
   if(version===null)return res.status(422).json({ok:false,error:'Consulta de alertas no válida.'});
   const caps=['legal.norm.read'];
   const access=await(deps.authorize??requireCompatibleInternalAccess)(req,res,{
    env,requiredCapabilities:caps,capabilityMode:'all',allowLegacy:false,
    requireDataPlaneReady:false,requireCertifiedDataBinding:false,
   });
   if(!access)return;
   if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,caps))
    return res.status(403).json({ok:false,error:'No tenés permiso para consultar alertas jurídicas.'});
   const context=legalContext(access.principal,access.session);
   const sql=await(deps.getSql??getActionCenterSql)(env);
   // Cached v1 clients keep their original contract. A failed explicit v2 read
   // must not silently fall back to a response that omits matters or assignees.
   const query=version===2
    ?'SELECT public.legal_alert_center_v2($1::jsonb) AS result'
    :'SELECT public.legal_alert_center_v1($1::jsonb) AS result';
   const rows=await sql.query(query,[JSON.stringify(context)]);
   let data;
   try{
    const verify=version===2?verifyLegalAlertCenterResponseV2:verifyLegalAlertCenterResponse;
    data=verify((Array.isArray(rows)?rows:rows?.rows)?.[0]?.result);
   }catch{throw Error('LEGAL_ALERT_CENTER_RESPONSE_INVALID');}
   return res.status(200).json({ok:true,data});
  }catch(e){
   const safe=legalSafeError(e);
   return res.status(safe.status).json({ok:false,error:safe.status===503
    ?'No se pudieron verificar las alertas. Reintentá en un momento; no se modificó ningún registro.'
    :safe.message});
  }
 };
}
export default createLegalAlertCenterHandler();
