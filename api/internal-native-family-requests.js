import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {FAMILY_SELF_READ,FAMILY_SELF_SUBMIT,FAMILY_REVIEW_READ,FAMILY_REVIEW_WRITE,FAMILY_REQUEST_MAX_BYTES,FAMILY_REQUEST_STATES,familyRequestCommand,familyRequestKey,familyRequestUuid,familyRequestPageCursor,familyRequestFail} from '../assets/native-family-request-model.js';
import {nativeFamilyOperation,nativeFamilyError,nativeFamilyContext,prepareNativeFamilyRequest} from '../lib/internal-native-family-requests.js';
export const config={api:{bodyParser:false}};
function query(req,method){
 const q=req.query??{},entries=req.url?[...new URL(req.url,'http://local.invalid').searchParams]:Object.entries(q);if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string')||new Set(entries.map(e=>e[0])).size!==entries.length||entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||!['self','review'].includes(q.view))familyRequestFail('QUERY_INVALID',400,'La consulta no es válida.');
 const fields=method==='POST'?['view']:q.resource==='bootstrap'?['resource','view']:q.resource==='queue'?['resource','state','view']:q.resource==='detail'?['resource','id','view']:q.resource==='attempt'?['resource','key','view']:q.resource==='document'?['resource','id','requestVersion','view']:[];
 if(method==='GET'&&['bootstrap','queue'].includes(q.resource)&&q.cursor!==undefined)fields.push('cursor');
 if(!fields.length||Object.keys(q).length!==fields.length||Object.keys(q).some(k=>!fields.includes(k))||q.resource==='bootstrap'&&q.view!=='self'||q.resource==='queue'&&(q.view!=='review'||!['all',...FAMILY_REQUEST_STATES].includes(q.state))||['detail','document'].includes(q.resource)&&!familyRequestUuid(q.id)||q.resource==='attempt'&&!familyRequestKey(q.key)||q.resource==='document'&&!/^(?:[1-9][0-9]{0,2}|1000)$/.test(q.requestVersion))familyRequestFail('QUERY_INVALID',400,'La consulta utiliza tu cuenta y la solicitud; no admite otro contrato.');
 let cursor=null;if(q.cursor!==undefined){if(q.cursor.length>2048)familyRequestFail('QUERY_INVALID',400,'La página solicitada no es válida.');try{cursor=familyRequestPageCursor(JSON.parse(q.cursor));if(cursor===null)throw Error();}catch{familyRequestFail('QUERY_INVALID',400,'La página solicitada no es válida. Actualizá la consulta.');}}return {...q,cursor};
}
export function createNativeFamilyRequestsHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,sessionFor=deps.sessionFor??actionMutationSession,getSql=deps.getSql??getActionCenterSql;
 return async(req,res)=>{
  schoolCertificateHttp.headers(res);
  try{
   const method=req.method??'GET';if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');familyRequestFail('METHOD_INVALID',405,'Método no permitido.');}const q=query(req,method);
   if(method==='POST'){schoolCertificateHttp.assertOrigin(req,env);if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(schoolCertificateHttp.header(req,'content-type')))familyRequestFail('CONTENT_TYPE_REQUIRED',415,'El envío debe usar application/json.');schoolCertificateHttp.checkLength(req,FAMILY_REQUEST_MAX_BYTES);}
   const caps=q.view==='self'?(method==='POST'?FAMILY_SELF_SUBMIT:FAMILY_SELF_READ):(method==='POST'?FAMILY_REVIEW_WRITE:FAMILY_REVIEW_READ);
   const access=await authorize(req,res,{env,requiredCapabilities:caps,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});if(!access)return;
   if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,caps))familyRequestFail('FORBIDDEN',403,'Tu cuenta no permite esta operación familiar.');const session=sessionFor(access,env),context=nativeFamilyContext(access.principal,session);
   // The client pins this expectation from an authenticated server response.
   // Authority always comes from the actual principal, including for a 404
   // attempt lookup that could otherwise release another membership's attempt.
   if(method==='POST'||q.resource==='attempt'){
    const expected=schoolCertificateHttp.header(req,'x-native-family-membership');
    if(!expected)familyRequestFail('SCOPE_REQUIRED',428,'Consultá el ámbito de tu cuenta antes de continuar con este envío.');
    if(!familyRequestUuid(expected))familyRequestFail('SCOPE_INVALID',400,'El ámbito del envío no es válido. Conservá el intento original.');
    if(expected!==context.membershipId)familyRequestFail('SCOPE_CHANGED',409,'Cambió el ámbito de la cuenta. Conservamos el envío original.');
   }
   if(method==='POST'){
    const key=schoolCertificateHttp.header(req,'idempotency-key');if(!familyRequestKey(key))familyRequestFail('IDEMPOTENCY_KEY_REQUIRED',428,'El envío necesita una clave de intento válida.');const raw=await schoolCertificateHttp.readBody(req,FAMILY_REQUEST_MAX_BYTES),body=familyRequestCommand(raw);
    if(q.view==='self'?!['submit','resubmit'].includes(body.command):!['request_correction','accept','reject'].includes(body.command))familyRequestFail('FORBIDDEN',403,'La presentación propia y la revisión administrativa tienen permisos separados.');
    const prepared=await prepareNativeFamilyRequest(body,{validatePdf:deps.validatePdf});const sql=await getSql(env),data=await nativeFamilyOperation(sql,access.principal,session,'command',{...prepared,key},q.view);if(data.replayed)res.setHeader('Idempotency-Replayed','true');return res.status(data.replayed?200:201).json({ok:true,data});
   }
   const sql=await getSql(env),operation=q.resource==='queue'?'bootstrap':q.resource,data=await nativeFamilyOperation(sql,access.principal,session,operation,{id:q.id,key:q.key,state:q.state??'all',cursor:q.cursor,requestVersion:q.requestVersion?Number(q.requestVersion):undefined},q.view);
   if(operation==='document'){res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','attachment; filename="solicitud-familiar-'+q.id+'-v'+q.requestVersion+'.pdf"');res.setHeader('Content-Length',String(data.bytes.length));const content=Buffer.from(data.bytes);data.bytes.fill(0);return res.status(200).end(content);}
   if(operation==='attempt')res.setHeader('Idempotency-Replayed','true');return res.status(200).json({ok:true,data});
  }catch(error){const safe=nativeFamilyError(error);if(safe.code==='NATIVE_FAMILY_BUSY')res.setHeader('Retry-After','1');return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}
 };
}
export default createNativeFamilyRequestsHandler();
