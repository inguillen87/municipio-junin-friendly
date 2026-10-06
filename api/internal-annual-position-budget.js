import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readRawPrivateJson} from '../lib/private-json-body.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {salaryExact} from '../assets/native-salary-catalog-model.js';
import {annualBudgetCommand,BUDGET_MAX_BYTES} from '../assets/annual-position-budget-model.js';
import {BUDGET_READ,BUDGET_CAPS,budgetFail,annualBudgetError,annualBudgetOperation} from '../lib/internal-annual-position-budget.js';
export const config={api:{bodyParser:false}};
export function createAnnualBudgetHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{schoolCertificateHttp.headers(res);try{
  const method=req.method||'GET',q=req.query??{};let operation,input;
  if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');budgetFail('METHOD_INVALID',405,'Método no admitido.');}
  if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string'))budgetFail('QUERY_INVALID',400,'Consulta inválida.');
  if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)budgetFail('QUERY_INVALID',400,'Consulta ambigua.');}
  if(method==='POST'){if(Object.keys(q).length)budgetFail('QUERY_INVALID',400,'La operación no admite parámetros.');schoolCertificateHttp.assertOrigin(req,env);if(schoolCertificateHttp.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')budgetFail('CONTENT_TYPE',415,'Se requiere un formulario JSON.');schoolCertificateHttp.checkLength(req,BUDGET_MAX_BYTES);}
  else if(q.resource==='bootstrap'&&Object.keys(q).sort().join('|')==='resource|year'&&/^(19|20)[0-9]{2}$/.test(q.year)){operation='bootstrap';input={year:Number(q.year)};}
  else if(q.resource==='attempt'&&Object.keys(q).sort().join('|')==='key|resource'){operation='attempt';input={key:q.key};}
  else budgetFail('QUERY_INVALID',400,'Consulta inválida.');
  const access=await authorize(req,res,{env,requiredCapabilities:BUDGET_READ,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});if(!access)return;
  if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,BUDGET_READ))budgetFail('FORBIDDEN',403,'La membresía no permite consultar la planta anual.');
  const session=sessionFor(access,env);employeeContext(access.principal,session);
  if(method==='POST'){
   const body=await readRawPrivateJson(req,{maxBytes:BUDGET_MAX_BYTES,maxDepth:12,timeoutMs:10000,declaredLength:schoolCertificateHttp.header(req,'content-length'),fail:kind=>budgetFail(kind==='large'?'LIMIT':kind==='unavailable'?'UNAVAILABLE':'INPUT_INVALID',kind==='large'?413:kind==='unavailable'?503:400,'No se pudo verificar el formulario completo.')});
   if(!salaryExact(body,['operation','payload'])||body.operation!=='command')budgetFail('INPUT_INVALID',400,'Formulario no admitido.');const command=annualBudgetCommand(body.payload);if(!principalHasCapabilities(access.principal,BUDGET_CAPS[command.command]))budgetFail('FORBIDDEN',403,'La membresía no permite esta operación.');operation='command';input={body:command,key:schoolCertificateHttp.header(req,'idempotency-key')};
  }
  const data=await annualBudgetOperation(await getSql(env),access.principal,session,operation,input);if(data.replayed)res.setHeader('Idempotency-Replayed','true');return res.status(method==='POST'&&!data.replayed?201:200).json({ok:true,data});
 }catch(e){const safe=String(e?.code??'').startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(e):annualBudgetError(e);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}};
}
export default createAnnualBudgetHandler();
