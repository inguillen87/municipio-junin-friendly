import { employeeDraft, EmployeeInputError } from '../assets/native-employee-contract.js';
export class NativeEmployeeError extends Error { constructor(code,status,message){super(message);Object.assign(this,{name:'NativeEmployeeError',code:'NATIVE_EMPLOYEE_'+code,status});} }
const fail=(code,status,message)=>{throw new NativeEmployeeError(code,status,message);};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function employeeContext(principal,session){
 if(principal?.tenant?.source!=='membership'||typeof principal?.user?.email!=='string'||principal.user.email.toLowerCase()!==String(session?.email||'').toLowerCase()
  ||!uuid(session?.id)||!uuid(principal.tenant.id)||!uuid(principal.tenant.membershipId)||!Number.isSafeInteger(session?.version)||session.version<1||!/^[a-f0-9]{40}$/.test(session?.releaseSha||'')) fail('SESSION_INVALID',401,'La sesión operativa ya no es válida.');
 return {actorEmail:principal.user.email.toLowerCase(),actorSessionId:session.id,actorSessionVersion:session.version,releaseSha:session.releaseSha,tenantId:principal.tenant.id,membershipId:principal.tenant.membershipId};
}
const messages={
 FORBIDDEN:[403,'Tu cuenta no tiene permiso para crear legajos.'], BINDING_INVALID:[409,'Cambió el ámbito municipal. Volvé a abrir el formulario.'],
 SESSION_INVALID:[401,'La sesión operativa ya no es válida.'], INPUT_INVALID:[422,'Revisá los datos personales, el CUIL y las fechas.'],
 CATALOG_UNAVAILABLE:[503,'El catálogo de encuadres no está disponible.'], CATALOG_CHANGED:[409,'El catálogo cambió. Actualizá las opciones y revisá el encuadre.'],
 CATALOG_SELECTION_INVALID:[422,'El convenio, la categoría o la repartición no corresponden al catálogo disponible.'],
 IDENTITY_EXISTS:[409,'Ya existe una identidad con ese DNI o CUIL. Buscala en Personas antes de continuar; no se creó un duplicado.'],
 NUMBER_EXISTS:[409,'El número de legajo ya está ocupado. Usá numeración automática u otro número.'], NUMBER_LIMIT:[409,'La numeración necesita revisión administrativa.'],
 DUPLICATE:[409,'Otro registro ocupa el DNI, CUIL o legajo. Revisá Personas; no se duplicó el alta.'],
 ATTEMPT_CONFLICT:[409,'Esta clave pertenece a otro formulario. Consultá el alta anterior antes de repetirla.'], ATTEMPT_NOT_FOUND:[404,'Este intento todavía no tiene un alta confirmada.'],
 BUSY:[409,'Hay otra operación en curso. Reintentá en un momento.']};
export function nativeEmployeeError(e){
 if(e instanceof NativeEmployeeError)return e;
 if(e instanceof EmployeeInputError)return new NativeEmployeeError('INPUT_INVALID',422,e.message);
 for(const [code,[status,message]]of Object.entries(messages))if(String(e?.message).includes('NATIVE_EMPLOYEE_'+code))return new NativeEmployeeError(code,status,message);
 if(/ACTION_SESSION_INVALID|TENANT_IAM_SESSION_INVALID/.test(e?.message||''))return new NativeEmployeeError('SESSION_INVALID',401,messages.SESSION_INVALID[1]);
 return new NativeEmployeeError('UNAVAILABLE',503,'No se confirmó el alta. Consultá el mismo intento antes de crear otro.');
}
export function validateReceipt(r){
 if(!r||r.version!=='native-employee.v1'||!uuid(r.contractId)||!uuid(r.registrationId)||!/^[1-9]\d{0,8}$/.test(r.legajo)||typeof r.name!=='string'||r.origin!=='MUNICONTROL'||r.accountCreated!==false||r.payrollCalculated!==false||typeof r.replayed!=='boolean')fail('CONTRACT_INVALID',503,'La confirmación del alta no pudo verificarse.');
 return r;
}
export async function employeeOperation(sql,principal,session,operation,input={}){
 const ctx=JSON.stringify(employeeContext(principal,session));let query,values;
 try{
  if(operation==='bootstrap') {query='SELECT public.native_employee_bootstrap_v1($1::jsonb) AS result';values=[ctx];}
  else {
   if(!uuid(input.key)||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.key))fail('INPUT_INVALID',428,'La operación requiere una clave de intento.');
   if(operation==='attempt'){query='SELECT public.native_employee_attempt_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.key];}
   else if(operation==='create'){
    if(!input.body||Object.keys(input.body).sort().join('|')!=='catalogVersion|draft'||!/^[a-f0-9]{64}$/.test(input.body.catalogVersion||''))fail('INPUT_INVALID',422,'El formulario no contiene un catálogo válido.');
    const d=employeeDraft(input.body.draft);
    query='SELECT public.native_employee_create_v1($1::jsonb,$2::jsonb,$3::text,$4::uuid) AS result';values=[ctx,JSON.stringify(d),input.body.catalogVersion,input.key];
   }else fail('INPUT_INVALID',400,'Operación inválida.');
  }
  const rows=await sql.query(query,values),r=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;
  if(operation!=='bootstrap')return validateReceipt(r);
  if(r?.version!=='native-employee.v1'||typeof r.canCreate!=='boolean'||!Array.isArray(r.catalog?.items)||!/^[a-f0-9]{64}$/.test(r.catalog.version||''))fail('CONTRACT_INVALID',503,'No se pudo verificar el catálogo de altas.');
  return r;
 }catch(e){throw nativeEmployeeError(e);}
}
