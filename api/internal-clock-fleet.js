import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {getActionCenterSql,actionMutationSession} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {AttendanceGatewayError} from '../lib/internal-attendance-gateway.js';
import {getClockFleet} from '../lib/internal-clock-fleet.js';
export const config={api:{bodyParser:false}};
const ORIGIN='https://municipio-junin-friendly.vercel.app';
export function createClockFleetHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.authorize??requireCompatibleInternalAccess;
 return async(req,res)=>{
  for(const [k,v]of Object.entries({'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie, Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'}))res.setHeader(k,v);
  const send=(status,body)=>res.status(status).json(body);
  try{
   if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{ok:false,code:'METHOD_NOT_ALLOWED'});}
   const u=new URL(req.url||'/',ORIGIN);
   if(u.pathname!=='/api/internal-clock-fleet'||u.search||u.hash||Object.keys(req.query||{}).length||req.body!==undefined)return send(400,{ok:false,code:'CLOCK_FLEET_QUERY_INVALID'});
   const header=k=>{const h=Object.entries(req.headers||{}).filter(([name])=>name.toLowerCase()===k);if(h.length>1||h.some(([,v])=>typeof v!=='string')||Array.isArray(req.rawHeaders)&&req.rawHeaders.filter((v,i)=>i%2===0&&String(v).toLowerCase()===k).length>1)throw new AttendanceGatewayError('CLOCK_FLEET_QUERY_INVALID',400,'Consulta ambigua.');return h[0]?.[1]||'';};
   if(header('origin')&&header('origin')!==ORIGIN||header('sec-fetch-site')&&!['same-origin','none'].includes(header('sec-fetch-site')))return send(403,{ok:false,code:'CLOCK_FLEET_ORIGIN_DENIED'});
   if(header('content-length')&&header('content-length')!=='0'||header('transfer-encoding'))return send(400,{ok:false,code:'CLOCK_FLEET_QUERY_INVALID'});
   const access=await authorize(req,res,{env,requiredCapabilities:['attendance.read'],requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});if(!access)return;
   if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,['attendance.read']))return send(403,{ok:false,code:'CLOCK_FLEET_FORBIDDEN'});
   const session=(deps.sessionFor??actionMutationSession)(access,env),sql=await(deps.getSql??getActionCenterSql)(env);
   const result=await(deps.getFleet??getClockFleet)(sql,access.principal,session);
   return send(200,{ok:true,...result});
  }catch(e){
   if(e instanceof AttendanceGatewayError)return send(e.status||503,{ok:false,code:e.code,error:e.message});
   return send(503,{ok:false,code:'CLOCK_FLEET_UNAVAILABLE',error:'No se pudo verificar la recepción. Tus marcaciones no fueron modificadas.'});
  }
 };
}
export default createClockFleetHandler();
