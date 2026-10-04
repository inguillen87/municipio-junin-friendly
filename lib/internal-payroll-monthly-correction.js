import {fixedContext} from './internal-payroll-fixed-novelties.js';
import {monthlyCorrectionBootstrap,monthlyCorrectionCommand,monthlyCorrectionDetail,monthlyCorrectionPreview,monthlyCorrectionReceipt} from '../assets/payroll-monthly-correction-model.js';
import {monthlyAnnulCanonical} from '../assets/payroll-monthly-annul-model.js';

export const MONTHLY_CORRECTION_MAX_BODY=64*1024;
export const MONTHLY_CORRECTION_READ_CAPS=Object.freeze(['payroll.novelty.read','payroll.novelty.nominal.read']);
const errors={
 SESSION_INVALID:[401,'La sesión ya no es válida. Volvé a ingresar.'],
 CAPABILITY_REQUIRED:[403,'Tu perfil no permite esta operación.'],
 EMPLOYMENT_REQUIRED:[403,'La operación requiere un vínculo laboral vigente del operador.'],
 AUTHORITY_REQUIRED:[403,'Falta autoridad operativa para esta operación.'],
 RELEASE_NOT_CERTIFIED:[503,'La fuente municipal no está certificada para esta operación.'],
 BINDING_REQUIRED:[503,'La fuente municipal no está disponible.'],
 INVALID_PAYLOAD:[422,'Revisá los campos elegidos, la selección completa y el motivo.'],
 NOT_FOUND:[404,'No se encontró el lote, propuesta o comprobante en este ámbito.'],
 VERSION_CONFLICT:[409,'Cambió un lote o la propuesta ya fue decidida. Consultá nuevamente.'],
 PREVIEW_CHANGED:[409,'Cambió la previa o sus observaciones. Revisá otra vez el conjunto completo.'],
 IDENTITY_CHANGED:[409,'Cambió el vínculo laboral de una fila. Revisá el conjunto; no se omitió ninguna fila.'],
 PERIOD_OUTSIDE_EMPLOYMENT:[422,'El período o mes de ajuste queda fuera del vínculo laboral de una fila. Revisá todos los lotes.'],
 PENDING_EXISTS:[409,'Un lote seleccionado ya tiene una corrección pendiente. Consultá su propuesta.'],
 MAKER_CHECKER_REQUIRED:[409,'La decisión requiere otra persona con una membresía diferente.'],
 IDEMPOTENCY_REUSE:[409,'La clave corresponde a otro contenido o acceso. Conservá el envío original.'],
 DUPLICATE_DESTINATION:[422,'La corrección crea un destino repetido. Revisá los campos de todos los lotes.'],
 EXISTING_MOVEMENT_CONFLICT:[409,'Un movimiento existente entra en conflicto con la corrección. Revisá el conjunto.'],
 NATIVE_TYPE_UNSUPPORTED:[422,'Una novedad propia de la selección admite Mensual. No se omitió ningún lote.'],
 NO_CHANGE:[422,'Un lote de la selección no tiene cambios. Retiralo expresamente o corregí los campos elegidos.'],
 READ_LIMIT:[422,'La consulta supera 1.000 lotes o propuestas. Elegí un período; no se recortaron resultados.'],
 REVIEW_LIMIT:[422,'La selección supera 100 lotes o 5.000 filas. No se omitió ni dividió ningún lote.'],
 SESSION_BUSY:[409,'Hay otra operación en curso. Recuperá el mismo envío.'],
 CAPACITY_LIMIT:[503,'No hay espacio seguro para otra operación. Se conserva el formulario; hace falta revisar la capacidad.'],
 CONTRACT_DRIFT:[503,'No se pudo comprobar la respuesta. Conservá el envío original y consultá su estado.'],
 UNAVAILABLE:[503,'No se pudo completar la operación. Conservá el envío original.'],
 QUERY_INVALID:[400,'La consulta no es válida.'],BODY_INVALID:[400,'La solicitud no es válida.'],
 BODY_TOO_LARGE:[413,'La solicitud supera el tamaño permitido.'],
 ORIGIN_INVALID:[403,'El origen de la solicitud no está permitido.'],ORIGIN_NOT_CONFIGURED:[503,'El origen no está configurado.'],
 CONTENT_TYPE_REQUIRED:[415,'La solicitud requiere application/json.'],
 IDEMPOTENCY_KEY_REQUIRED:[428,'La operación requiere una clave de intento.'],IDEMPOTENCY_KEY_INVALID:[400,'La clave de intento no es válida.'],
 METHOD_NOT_ALLOWED:[405,'Método no permitido.'],
};
export class MonthlyCorrectionError extends Error{
 constructor(suffix){const key=Object.hasOwn(errors,suffix)?suffix:'UNAVAILABLE';super(errors[key][1]);this.code='PAYROLL_MONTHLY_CORRECTION_'+key;this.status=errors[key][0];}
}
export const monthlyCorrectionFail=suffix=>{throw new MonthlyCorrectionError(suffix);};
export function monthlyCorrectionSafeError(error){
 if(error instanceof MonthlyCorrectionError)return error;
 for(const suffix of Object.keys(errors))for(const prefix of ['PAYROLL_MONTHLY_CORRECTION_','PAYROLL_MONTHLY_ANNUL_','PAYROLL_NOVELTY_','PAYROLL_FIXED_','SCHOOL_CERTIFICATE_'])
  if(error?.code===prefix+suffix||error?.message===prefix+suffix)return new MonthlyCorrectionError(suffix);
 const aliases={TENANT_IAM_SOD_CONFLICT:'AUTHORITY_REQUIRED',ACTION_SESSION_INVALID:'SESSION_INVALID',ACTION_SESSION_BUSY:'SESSION_BUSY',ACTION_RELEASE_NOT_CERTIFIED:'RELEASE_NOT_CERTIFIED',ACTION_SOURCE_BINDING_REQUIRED:'BINDING_REQUIRED'};
 return new MonthlyCorrectionError(aliases[error?.code]??aliases[error?.message]??'UNAVAILABLE');
}
export function prepareMonthlyCorrection(body){try{return monthlyCorrectionCommand(body);}catch{monthlyCorrectionFail('INVALID_PAYLOAD');}}
export async function callMonthlyCorrection(sql,principal,session,request){
 const context=fixedContext(principal,session);let query,params,verify;
 if(request.resource==='bootstrap'){
  query='SELECT public.payroll_monthly_correction_bootstrap_v1($1::jsonb,$2::date) AS result';params=[JSON.stringify(context),request.period??null];
  verify=value=>{monthlyCorrectionBootstrap(value);if(request.period&&value.candidates.some(c=>c.periodMonth!==request.period))monthlyCorrectionFail('CONTRACT_DRIFT');return value;};
 }else if(request.resource==='detail'){
  query='SELECT public.payroll_monthly_correction_detail_v1($1::jsonb,$2::text,$3::uuid) AS result';params=[JSON.stringify(context),request.kind,request.id];
  verify=value=>{monthlyCorrectionDetail(value);if(request.kind==='candidate'?value.status!=='candidate'||value.items[0].batch.id!==request.id:value.status==='candidate'||value.status==='preview'||value.proposalId!==request.id)monthlyCorrectionFail('CONTRACT_DRIFT');return value;};
 }else if(request.resource==='preview'){
  if(request.body.command!=='preview'||request.key!=null)monthlyCorrectionFail('INVALID_PAYLOAD');
  query='SELECT public.payroll_monthly_correction_preview_v1($1::jsonb,$2::jsonb) AS result';params=[JSON.stringify(context),JSON.stringify(request.body)];
  verify=value=>monthlyCorrectionPreview(value,request.body);
 }else if(request.resource==='attempt'){
  query='SELECT public.payroll_monthly_correction_attempt_v1($1::jsonb,$2::uuid) AS result';params=[JSON.stringify(context),request.key];
  verify=value=>{monthlyCorrectionReceipt(value);if(value.key!==request.key||!value.replayed)monthlyCorrectionFail('CONTRACT_DRIFT');return value;};
 }else if(request.resource==='command'){
  if(request.body.command==='preview')monthlyCorrectionFail('INVALID_PAYLOAD');
  query='SELECT public.payroll_monthly_correction_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';params=[JSON.stringify(context),JSON.stringify(request.body),request.key];
  verify=value=>monthlyCorrectionReceipt(value,{key:request.key,body:request.body});
 }else monthlyCorrectionFail('QUERY_INVALID');
 let raw;
 try{const result=await sql.query(query,params),rows=Array.isArray(result)?result:result?.rows;if(!Array.isArray(rows)||rows.length!==1)monthlyCorrectionFail('CONTRACT_DRIFT');raw=rows[0]?.result;}
 catch(error){throw monthlyCorrectionSafeError(error);}
 try{
  const value=verify(raw),caps=principal.tenant?.effectiveCapabilities??[];
  for(const [flag,cap]of [['canPropose','payroll.novelty.prepare'],['canReview','payroll.novelty.approve']]){
   if((value[flag]===true||value.permissions?.[flag]===true)&&!caps.includes(cap))monthlyCorrectionFail('CONTRACT_DRIFT');
  }
  // The original payload remains authoritative for both writing and recovery.
  if(request.resource==='command'&&monthlyAnnulCanonical(value.body)!==monthlyAnnulCanonical(request.body))monthlyCorrectionFail('CONTRACT_DRIFT');
  return value;
 }catch{monthlyCorrectionFail('CONTRACT_DRIFT');}
}
