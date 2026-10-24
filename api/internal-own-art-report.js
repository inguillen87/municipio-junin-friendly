import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {OWN_ART_READ,OWN_ART_MAX_BYTES,ownArtParams,verifiedOwnArtSource} from '../assets/own-art-report-model.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {sendOwnArtSource} from '../lib/own-art-response.js';
export const config={api:{bodyParser:false}};
export function createOwnArtReportHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{schoolCertificateHttp.headers(res);try{
  if((req.method??'GET')!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,code:'OWN_ART_METHOD_INVALID',error:'Método no admitido.'});}
  const q=req.query??{};if(!q||typeof q!=='object'||Array.isArray(q)||Object.keys(q).sort().join('|')!=='period|types'||Object.values(q).some(v=>typeof v!=='string'))return res.status(400).json({ok:false,code:'OWN_ART_QUERY_INVALID',error:'Elegí período y tipos completos.'});
  if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)return res.status(400).json({ok:false,code:'OWN_ART_QUERY_INVALID',error:'Consulta ambigua.'});}
  let params;try{params=ownArtParams({period:q.period,types:q.types.split(',')});}catch{return res.status(400).json({ok:false,code:'OWN_ART_INPUT_INVALID',error:'Elegí período y tipos válidos, sin repetirlos.'});}
  const access=await authorize(req,res,{env,requiredCapabilities:OWN_ART_READ,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});if(!access)return;
  if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,OWN_ART_READ))return res.status(403).json({ok:false,code:'OWN_ART_FORBIDDEN',error:'Tu cuenta no permite consultar ART nominal propio.'});
  const ctx=employeeContext(access.principal,sessionFor(access,env)),sql=await getSql(env),rows=await sql.query('SELECT public.own_art_report_source_full_v1($1::jsonb,$2::jsonb) AS result',[JSON.stringify(ctx),JSON.stringify(params)]),data=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;
  if(Buffer.byteLength(JSON.stringify(data??null))>OWN_ART_MAX_BYTES)throw Error('OWN_ART_LIMIT');
  try{await verifiedOwnArtSource(data);if(salarySerialized(data.content.params)!==salarySerialized(params))throw Error('different query');}catch{throw Error('OWN_ART_CONTRACT_INVALID');}
  return await sendOwnArtSource(res,data);
 }catch(e){const message=String(e?.message??''),code=String(e?.code??'');
  if(res.headersSent||res.destroyed){res.destroy?.();return;}
  if(/SESSION_INVALID/.test(message+' '+code))return res.status(401).json({ok:false,code:'OWN_ART_SESSION_INVALID',error:'La sesión venció. Volvé a ingresar.'});
  if(/FORBIDDEN|SOD_CONFLICT/.test(message+' '+code))return res.status(403).json({ok:false,code:'OWN_ART_FORBIDDEN',error:'Tu cuenta no permite consultar ART nominal propio.'});
  if(/OWN_ART_LIMIT/.test(message))return res.status(422).json({ok:false,code:'OWN_ART_LIMIT',error:'El conjunto completo supera la capacidad. No se recortaron agentes ni liquidaciones.'});
  if(/OWN_ART_IDENTITY_CHANGED/.test(message))return res.status(409).json({ok:false,code:'OWN_ART_IDENTITY_CHANGED',error:'Cambió una identidad respecto del cierre. Revisá la fuente antes de generar ART.'});
  if(/BUSY|lock_not_available/.test(message+' '+code))return res.status(409).json({ok:false,code:'OWN_ART_BUSY',error:'Otra operación está en curso. Volvé a consultar el conjunto completo.'});
  return res.status(503).json({ok:false,code:'OWN_ART_UNAVAILABLE',error:'No se verificó la fuente completa de ART. Volvé a consultar.'});
 }};
}
export default createOwnArtReportHandler();
