import {fixedContext} from './internal-payroll-fixed-novelties.js';
import {monthlyAnnulCommand,monthlyAnnulBootstrap,monthlyAnnulDetail,monthlyAnnulReceipt} from '../assets/payroll-monthly-annul-model.js';
export const MONTHLY_ANNUL_MAX_BODY=64*1024;
export const MONTHLY_ANNUL_READ_CAPS=Object.freeze(['payroll.novelty.read','payroll.novelty.nominal.read']);
const errors={
 SESSION_INVALID:[401,'La sesión ya no es válida. Volvé a ingresar.'],CAPABILITY_REQUIRED:[403,'Tu perfil no permite esta operación.'],
 EMPLOYMENT_REQUIRED:[403,'La operación requiere un vínculo laboral vigente del operador.'],AUTHORITY_REQUIRED:[403,'Falta autoridad operativa para esta operación.'],
 RELEASE_NOT_CERTIFIED:[503,'La fuente municipal no está certificada para esta operación.'],BINDING_REQUIRED:[503,'La fuente municipal no está disponible.'],
 INVALID_PAYLOAD:[422,'Revisá la selección completa, el motivo y la decisión.'],NOT_FOUND:[404,'No se encontró el lote, propuesta o comprobante en este ámbito.'],
 VERSION_CONFLICT:[409,'Cambió un lote o la propuesta ya fue decidida. Consultá nuevamente.'],PENDING_EXISTS:[409,'Un lote seleccionado ya tiene una propuesta de anulación pendiente.'],
 MAKER_CHECKER_REQUIRED:[409,'La decisión requiere otra persona con una membresía diferente.'],IDEMPOTENCY_REUSE:[409,'La clave corresponde a otro contenido o acceso. Conservá el envío original.'],
 SESSION_BUSY:[409,'Hay otra operación en curso. Recuperá el mismo envío.'],ROW_LIMIT:[422,'Se alcanzó el límite de la consulta o revisión. Elegí el período; no se omitieron ni dividieron lotes.'],
 CAPACITY_LIMIT:[503,'No hay espacio seguro para otra operación. Se conserva el formulario; hace falta revisar la capacidad.'],
 CONTRACT_DRIFT:[503,'No se pudo comprobar la respuesta. Conservá el envío original y consultá su estado.'],UNAVAILABLE:[503,'No se pudo completar la operación. Conservá el envío original.'],
 QUERY_INVALID:[400,'La consulta no es válida.'],BODY_INVALID:[400,'La solicitud no es válida.'],BODY_TOO_LARGE:[413,'La solicitud supera el tamaño permitido.'],
 ORIGIN_INVALID:[403,'El origen de la solicitud no está permitido.'],ORIGIN_NOT_CONFIGURED:[503,'El origen no está configurado.'],CONTENT_TYPE_REQUIRED:[415,'La solicitud requiere application/json.'],
 IDEMPOTENCY_KEY_REQUIRED:[428,'La operación requiere una clave de intento.'],IDEMPOTENCY_KEY_INVALID:[400,'La clave de intento no es válida.'],METHOD_NOT_ALLOWED:[405,'Método no permitido.'],
};
export class MonthlyAnnulError extends Error{constructor(suffix){const key=Object.hasOwn(errors,suffix)?suffix:'UNAVAILABLE';super(errors[key][1]);this.code='PAYROLL_MONTHLY_ANNUL_'+key;this.status=errors[key][0];}}
export const monthlyAnnulFail=suffix=>{throw new MonthlyAnnulError(suffix);};
export function monthlyAnnulSafeError(error){
 if(error instanceof MonthlyAnnulError)return error;
 for(const suffix of Object.keys(errors))for(const prefix of ['PAYROLL_MONTHLY_ANNUL_','PAYROLL_NOVELTY_','PAYROLL_FIXED_','SCHOOL_CERTIFICATE_'])
 if(error?.message===prefix+suffix||error?.code===prefix+suffix)return new MonthlyAnnulError(suffix);
 const aliases={TENANT_IAM_SOD_CONFLICT:'AUTHORITY_REQUIRED',ACTION_SESSION_INVALID:'SESSION_INVALID',ACTION_SESSION_BUSY:'SESSION_BUSY',ACTION_RELEASE_NOT_CERTIFIED:'RELEASE_NOT_CERTIFIED',ACTION_SOURCE_BINDING_REQUIRED:'BINDING_REQUIRED'};
 return new MonthlyAnnulError(aliases[error?.code]??aliases[error?.message]??'UNAVAILABLE');
}
export function prepareMonthlyAnnul(body){try{return monthlyAnnulCommand(body);}catch{monthlyAnnulFail('INVALID_PAYLOAD');}}
export async function callMonthlyAnnul(sql,principal,session,request){
 const context=fixedContext(principal,session);let query,params,verify;
 if(request.resource==='bootstrap'){query='SELECT public.payroll_monthly_annul_bootstrap_v1($1::jsonb,$2::date) AS result';params=[JSON.stringify(context),request.period??null];verify=monthlyAnnulBootstrap;}
 else if(request.resource==='detail'){query='SELECT public.payroll_monthly_annul_detail_v1($1::jsonb,$2::text,$3::uuid) AS result';params=[JSON.stringify(context),request.kind,request.id];verify=monthlyAnnulDetail;}
 else if(request.resource==='attempt'){query='SELECT public.payroll_monthly_annul_attempt_v1($1::jsonb,$2::uuid) AS result';params=[JSON.stringify(context),request.key];verify=value=>{monthlyAnnulReceipt(value);if(value.key!==request.key||!value.replayed)monthlyAnnulFail('CONTRACT_DRIFT');return value;};}
 else if(request.resource==='command'){query='SELECT public.payroll_monthly_annul_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';params=[JSON.stringify(context),JSON.stringify(request.body),request.key];verify=value=>monthlyAnnulReceipt(value,{key:request.key,body:request.body});}
 else monthlyAnnulFail('QUERY_INVALID');
 let raw;try{const result=await sql.query(query,params),rows=Array.isArray(result)?result:result?.rows;if(!Array.isArray(rows)||rows.length!==1)monthlyAnnulFail('CONTRACT_DRIFT');raw=rows[0]?.result;}catch(error){throw monthlyAnnulSafeError(error);}
 try{return verify(raw);}catch{monthlyAnnulFail('CONTRACT_DRIFT');}
}
