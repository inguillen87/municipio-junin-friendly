import {cleanWorkSave,workQuery,workUuid,exactKeys,workReceipt} from '../assets/legal-work-model.js';
export class LegalWorkError extends Error{constructor(code,status,message){super(message);this.code=code;this.status=status;}}
const MAP={LW_SESSION_INVALID:[401,'La sesión cambió. Volvé a ingresar.'],LW_FORBIDDEN:[403,'Tu perfil no permite esta operación.'],LW_NOT_FOUND:[404,'No se encontró el asunto dentro de tu acceso.'],LW_INPUT_INVALID:[400,'Revisá los datos de la solicitud.'],LW_CONFLICT:[409,'Otra persona actualizó el asunto. Conservamos tu formulario; actualizá la ficha antes de preparar otra versión.'],LW_KEY_CONFLICT:[409,'Este intento ya corresponde a otros datos. Consultá su resultado; no se generó otra actuación.'],LW_BUSY:[409,'El área está guardando otra actuación. Reintentá con el mismo intento.'],LW_RESPONSIBLE_INVALID:[409,'El responsable ya no está habilitado. Elegí uno de la lista actualizada.'],LW_STORAGE:[503,'No hay margen de almacenamiento para agregar el historial. El asunto anterior se conserva.'],LW_HISTORY_LIMIT:[409,'Este asunto alcanzó el límite de historial del piloto. No se borraron antecedentes.'],LW_UNAVAILABLE:[503,'No se pudo completar la consulta. No supongas que se guardó: recuperá el mismo intento.']};
export function workSafeError(e){if(e instanceof LegalWorkError)return e;const code=Object.hasOwn(MAP,e?.message)?e.message:'LW_UNAVAILABLE';return new LegalWorkError(code,...MAP[code]);}
export function workContext(principal,session){const t=principal?.tenant,u=principal?.user;
 if(t?.source!=='membership'||!workUuid(t.id)||!workUuid(t.membershipId)||!workUuid(session?.id)||!Number.isSafeInteger(session?.version)||session.version<1||!u?.email||u.email!==session.email)throw workSafeError(Error('LW_SESSION_INVALID'));
 return{tenantId:t.id,membershipId:t.membershipId,actorEmail:u.email,actorSessionId:session.id,actorSessionVersion:session.version};}
export async function workOperation(sql,principal,session,op,input={},key=null){
 const ctx=workContext(principal,session);
 if(!['bootstrap','list','detail','save','attempt'].includes(op))throw workSafeError(Error('LW_INPUT_INVALID'));
 let d=input;try{if(op==='save')d=cleanWorkSave(input);else if(op==='list')d=workQuery(input);else if(op==='detail'){if(!exactKeys(input,['id'])||!workUuid(input.id))throw Error();}else if(!exactKeys(input,[]))throw Error();if(['save','attempt'].includes(op)&&!workUuid(key))throw Error();}catch(e){throw new LegalWorkError('LW_INPUT_INVALID',400,e.message||'Solicitud no válida.');}
 let data;try{const r=await sql.query('SELECT public.legal_work_operation_v1($1::jsonb,$2::text,$3::jsonb,$4::uuid) AS result',[JSON.stringify(ctx),op,JSON.stringify(d),key]);data=(Array.isArray(r)?r:r?.rows)?.[0]?.result;}catch(e){throw workSafeError(e);}
 if(!data||data.version!=='legal-work.v1')throw workSafeError(Error('LW_UNAVAILABLE'));
 if(['save','attempt'].includes(op)){try{return workReceipt(data);}catch{throw workSafeError(Error('LW_UNAVAILABLE'));}}
 return data;
}
