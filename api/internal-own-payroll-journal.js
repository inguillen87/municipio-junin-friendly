import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readRawPrivateJson} from '../lib/private-json-body.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {salaryExact} from '../assets/native-salary-catalog-model.js';
import {journalCommand,JOURNAL_MAX_BYTES} from '../assets/own-payroll-journal-model.js';
import {JOURNAL_READ,JOURNAL_CAPS,journalFail,journalError,journalOperation} from '../lib/internal-own-payroll-journal.js';
export const config={api:{bodyParser:false}};
export function createOwnJournalHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{schoolCertificateHttp.headers(res);try{
  const method=req.method||'GET',q=req.query??{};let operation,input;
  if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');journalFail('METHOD_INVALID',405,'Método no admitido.');}
  if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string'))journalFail('QUERY_INVALID',400,'Consulta inválida.');
  if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)journalFail('QUERY_INVALID',400,'Consulta ambigua.');}
  const keys=Object.keys(q).sort().join('|');
  if(method==='POST'){if(keys)journalFail('QUERY_INVALID',400,'La operación no admite parámetros.');schoolCertificateHttp.assertOrigin(req,env);if(schoolCertificateHttp.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')journalFail('CONTENT_TYPE',415,'Se requiere un formulario JSON.');schoolCertificateHttp.checkLength(req,JOURNAL_MAX_BYTES);}
  else if(q.resource==='bootstrap'&&keys==='liquidationType|period|resource'){operation='bootstrap';input={period:q.period,liquidationType:q.liquidationType};}
  else if(q.resource==='source'&&keys==='basis|id|resource'){operation='source';input={id:q.id,basis:q.basis};}
  else if(q.resource==='detail'&&keys==='id|resource'){operation='detail';input={id:q.id};}
  else if(q.resource==='attempt'&&keys==='key|resource'){operation='attempt';input={key:q.key};}
  else journalFail('QUERY_INVALID',400,'Consulta inválida.');
  const access=await authorize(req,res,{env,requiredCapabilities:JOURNAL_READ,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});if(!access)return;
  if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,JOURNAL_READ))journalFail('FORBIDDEN',403,'La membresía no permite consultar la imputación.');
  const session=sessionFor(access,env);employeeContext(access.principal,session);
  if(method==='POST'){
   const raw=await readRawPrivateJson(req,{maxBytes:JOURNAL_MAX_BYTES,maxDepth:5,timeoutMs:10000,declaredLength:schoolCertificateHttp.header(req,'content-length'),fail:kind=>{if(kind==='large')journalFail('LIMIT',413,'El envío supera su tamaño permitido.');if(kind==='unavailable')journalFail('UNAVAILABLE',503,'No se pudo leer el envío. Conservá el mismo intento.');journalFail('INPUT_INVALID',400,'El formulario contiene datos ambiguos o inválidos.');}});
   if(!salaryExact(raw,['operation','payload'])||raw.operation!=='command')journalFail('INPUT_INVALID',400,'Operación o formulario no admitidos.');const body=journalCommand(raw.payload);
   if(!principalHasCapabilities(access.principal,JOURNAL_CAPS[body.command]))journalFail('FORBIDDEN',403,'La membresía no permite esta operación.');operation='command';input={body,key:schoolCertificateHttp.header(req,'idempotency-key')};
  }
  const data=await journalOperation(await getSql(env),access.principal,session,operation,input);if(data.replayed)res.setHeader('Idempotency-Replayed','true');return res.status(method==='POST'&&!data.replayed?201:200).json({ok:true,data});
 }catch(e){const safe=String(e?.code??'').startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(e):journalError(e);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}};
}
export default createOwnJournalHandler();
