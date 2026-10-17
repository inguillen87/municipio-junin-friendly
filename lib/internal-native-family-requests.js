import {createHash} from 'node:crypto';
import {employeeContext} from './internal-native-employees.js';
import {employeeFamilySafeError} from './internal-family-members.js';
import {schoolCertificatePrincipalValues,schoolCertificateSafeError,decodeSchoolCertificate,validateSchoolCertificatePdf} from './internal-family-certificates.js';
import {familyRequestCommand,familyRequestReceipt,familyRequestList,familyRequestDetail,familyRequestKey,familyRequestUuid,familyRequestExact,familyRequestSerialized,familyRequestPageCursor,familyRequestFail,FamilyRequestError} from '../assets/native-family-request-model.js';
export const nativeFamilyBodyHash=body=>createHash('sha256').update(familyRequestSerialized(body)).digest('hex');
const messages={SESSION_INVALID:[401,'La sesión cambió. Volvé a ingresar.'],FORBIDDEN:[403,'Tu cuenta no permite esta operación familiar.'],UNLINKED:[403,'No hay un contrato propio verificado para tu cuenta. Consultá con Administración.'],IDENTITY_CHANGED:[409,'Cambió el vínculo de tu cuenta o la identidad familiar. Consultá nuevamente.'],STATE_CHANGED:[409,'La solicitud cambió. Consultá su revisión antes de decidir.'],INDEPENDENT_REVIEW_REQUIRED:[403,'La revisión requiere otra persona autorizada.'],NOT_FOUND:[404,'No se encontró la solicitud o el intento en tu ámbito.'],IDEMPOTENCY_REUSE:[409,'La clave corresponde a otro contenido. Conservá el intento original.'],STORAGE_FULL:[503,'El archivo privado no tiene capacidad disponible. Conservá el envío para reintentar.'],LIMIT:[422,'La consulta completa supera el límite. Acotá el estado; no se omitieron solicitudes.'],BUSY:[409,'Otra operación está en curso. Reintentá el mismo contenido.'],UNAVAILABLE:[503,'No se confirmó la operación. Consultá el mismo intento antes de repetirla.']};
export function nativeFamilyError(error){
 if(error instanceof FamilyRequestError)return error;
 const code=String(error?.code??'')+' '+String(error?.message??'');
 if(/\bNATIVE_FAMILY_INPUT_INVALID\b/.test(code))return new FamilyRequestError('INPUT_INVALID',400,'Revisá los datos de la solicitud. Conservá el contenido para corregirlo.');
 if(/\bNATIVE_FAMILY_DOCUMENT_INVALID\b/.test(code))return new FamilyRequestError('DOCUMENT_INVALID',422,'El archivo no pudo verificarse. Conservá los datos y elegí un PDF válido.');
 if(/\bNATIVE_FAMILY_ISOLATION_UNSUPPORTED\b/.test(code))return new FamilyRequestError('UNAVAILABLE',...messages.UNAVAILABLE);
 if(/\bNATIVE_FAMILY_CAPACITY_FULL\b/.test(code))return new FamilyRequestError('CAPACITY_FULL',503,'Se alcanzó la capacidad administrativa segura. El contenido y el historial se conservan; avisá a Administración antes de volver a presentar.');
 if(/\bNATIVE_FAMILY_METADATA_TOO_LARGE\b/.test(code))return new FamilyRequestError('METADATA_TOO_LARGE',413,'La presentación supera el tamaño permitido. Conservá los datos para revisarlos; no se recortó el contenido.');
 if(/\bNATIVE_FAMILY_VERSION_LIMIT\b/.test(code))return new FamilyRequestError('VERSION_LIMIT',409,'Esta solicitud llegó al límite de correcciones. Personal puede registrar una decisión final; el historial se conserva.');
 for(const [name,[status,message]]of Object.entries(messages))if(new RegExp('\\bNATIVE_FAMILY_'+name+'\\b').test(code))return new FamilyRequestError(name,status,message);
 if(/\b(?:ACTION_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|SCHOOL_CERTIFICATE_SESSION_INVALID)\b/.test(code))return new FamilyRequestError('SESSION_INVALID',...messages.SESSION_INVALID);
 if(/\bSCHOOL_CERTIFICATE_STORAGE_FULL\b/.test(code))return new FamilyRequestError('STORAGE_FULL',...messages.STORAGE_FULL);
 if(/\bSCHOOL_CERTIFICATE_(?:PDF_INVALID|PDF_ENCRYPTED|PDF_TOO_MANY_PAGES|PDF_TIMEOUT|PDF_TOO_LARGE|SHA256_MISMATCH)\b/.test(code))return new FamilyRequestError('DOCUMENT_INVALID',422,'El PDF no pudo verificarse. Conservá los datos y elegí un archivo válido de hasta 2 MiB y 30 páginas.');
 const schoolCode=/\bSCHOOL_CERTIFICATE_[A-Z_]+\b/.exec(code)?.[0];if(schoolCode){const safe=schoolCertificateSafeError({code:schoolCode});return new FamilyRequestError(safe.code.replace('SCHOOL_CERTIFICATE_',''),safe.status,safe.message);}
 const familyCode=/\bEMPLOYEE_FAMILY_[A-Z_]+\b/.exec(code)?.[0];if(familyCode){const safe=employeeFamilySafeError({code:familyCode});return new FamilyRequestError(safe.code.replace('EMPLOYEE_FAMILY_',''),safe.status,safe.message);}
 return new FamilyRequestError('UNAVAILABLE',...messages.UNAVAILABLE);
}
export function nativeFamilyContext(principal,session){schoolCertificatePrincipalValues(principal,session);return employeeContext(principal,session);}
export async function prepareNativeFamilyRequest(input,{validatePdf=validateSchoolCertificatePdf,now=new Date()}={}){
 const body=familyRequestCommand(input,{now});let document=null;
 if(body.payload?.document){const d=body.payload.document,bytes=decodeSchoolCertificate(d.contentBase64,d.sha256);try{const validated=await validatePdf(bytes);if(!Number.isInteger(validated?.pages)||validated.pages<1||validated.pages>30)familyRequestFail('DOCUMENT_INVALID',422,'El PDF no pudo verificarse.');document={filename:d.filename,sha256:d.sha256,byteLength:bytes.length,pages:validated.pages};}finally{bytes.fill(0);}}
 return {body,document};
}
export async function nativeFamilyOperation(sql,principal,session,operation,input={},view='self'){
 try{
  if(!['self','review'].includes(view))familyRequestFail('INPUT_INVALID',400,'La vista solicitada no es válida.');
  const context=nativeFamilyContext(principal,session),scope={tenantId:context.tenantId,membershipId:context.membershipId},ctx=JSON.stringify(context),prefix='public.native_family_'+view+'_';let query,values;
  if(operation==='bootstrap'){query='SELECT '+prefix+'bootstrap_v1($1::jsonb,$2::text,$3::jsonb) AS result';values=[ctx,input.state??'all',JSON.stringify(familyRequestPageCursor(input.cursor??null))];}
  else if(operation==='detail'){if(!familyRequestUuid(input.id))familyRequestFail('INPUT_INVALID',400,'La solicitud no es válida.');query='SELECT '+prefix+'detail_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.id];}
  else if(operation==='attempt'){if(!familyRequestKey(input.key))familyRequestFail('INPUT_INVALID',400,'La clave de intento no es válida.');query='SELECT '+prefix+'attempt_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.key];}
  else if(operation==='command'){
   if(!familyRequestKey(input.key))familyRequestFail('INPUT_INVALID',428,'El envío necesita una clave de intento.');const body=familyRequestCommand(input.body);
   if(view==='self'?!['submit','resubmit'].includes(body.command):!['request_correction','accept','reject'].includes(body.command))familyRequestFail('FORBIDDEN',403,messages.FORBIDDEN[1]);
   if(body.payload?.document?!familyRequestExact(input.document,['filename','sha256','byteLength','pages'])||input.document.filename!==body.payload.document.filename||input.document.sha256!==body.payload.document.sha256:input.document!==null)familyRequestFail('DOCUMENT_INVALID',422,'El archivo debe verificarse antes del envío.');
   query='SELECT '+prefix+'command_v1($1::jsonb,$2::jsonb,$3::uuid,$4::jsonb) AS result';values=[ctx,JSON.stringify(body),input.key,JSON.stringify(input.document)];
  }else if(operation==='document'){
   if(!familyRequestUuid(input.id)||!Number.isInteger(input.requestVersion)||input.requestVersion<1||input.requestVersion>1000)familyRequestFail('INPUT_INVALID',400,'La versión documental no es válida.');query='SELECT '+prefix+'document_v1($1::jsonb,$2::uuid,$3::integer) AS result';values=[ctx,input.id,input.requestVersion];
  }else familyRequestFail('INPUT_INVALID',400,'La operación no es válida.');
  const raw=await sql.query(query,values),rows=Array.isArray(raw)?raw:raw?.rows;if(!Array.isArray(rows)||rows.length!==1||!rows[0]?.result)familyRequestFail('CONTRACT_INVALID',503,'La respuesta no pudo verificarse.');const value=rows[0].result;
  if(operation==='bootstrap')return familyRequestList(value,{scope,view,cursor:input.cursor??null});
  if(operation==='detail')return familyRequestDetail(value,{scope,view,id:input.id});
  if(operation==='attempt')return familyRequestReceipt(value,{key:input.key,scope});
  if(operation==='command')return familyRequestReceipt(value,{key:input.key,body:input.body,bodySha256:nativeFamilyBodyHash(input.body),scope});
  if(!familyRequestExact(value,['version','requestId','requestVersion','filename','sha256','byteLength','contentBase64'])||value.version!=='native-family-request-document.v1'||value.requestId!==input.id||value.requestVersion!==input.requestVersion||typeof value.filename!=='string'||!/^.{1,176}\.pdf$/iu.test(value.filename)||/[\x00-\x1f\x7f\\/:*?"<>|]/.test(value.filename)||!Number.isInteger(value.byteLength))familyRequestFail('CONTRACT_INVALID',503,'No se verificó el archivo solicitado.');
  const bytes=decodeSchoolCertificate(value.contentBase64,value.sha256,value.byteLength);return {filename:value.filename,bytes};
 }catch(error){throw nativeFamilyError(error);}
}
