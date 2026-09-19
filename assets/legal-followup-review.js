import {normalizeFollowup,verifyFollowupResponse,FollowupInputError,FOLLOWUP_STATES} from './legal-followups-model.js';
export const REVIEW_FIELDS=Object.freeze({title:'Tarea o asunto',status:'Estado',dueDate:'Fecha objetivo interna',note:'Nota de trabajo'});
export function followupReview(value,original=null){
 const body=normalizeFollowup(value);
 if(body.id===null){if(original!==null)throw new FollowupInputError('Un alta no puede reemplazar un seguimiento existente.');}
 else{
  if(!original)throw new FollowupInputError('Falta la revisión original del seguimiento.');
  verifyFollowupResponse('detail',{version:'legal-followup.v1',today:original?.recordedAt?.slice(0,10),canManage:false,record:original});
  if(original.id!==body.id||original.normId!==body.normId||original.normVersion!==body.normVersion||original.version!==body.expectedVersion)throw new FollowupInputError('La revisión y la norma de origen deben coincidir. Actualizá el seguimiento.');
 }
 const fields=Object.keys(REVIEW_FIELDS).map(key=>Object.freeze({key,label:REVIEW_FIELDS[key],before:original?original[key]:null,after:body[key],changed:!original||original[key]!==body[key]}));
 if(original&&!fields.some(f=>f.changed))throw new FollowupInputError('No hay cambios en la tarea, estado, fecha o nota. No se creará una revisión sólo por escribir un motivo.');
 return Object.freeze({version:'followup-change-review.v1',isNew:body.id===null,body:Object.freeze(body),fields:Object.freeze(fields),changeCount:fields.filter(f=>f.changed).length,
  originalRevision:body.expectedVersion,nextRevision:body.expectedVersion+1,normVersion:body.normVersion});
}
export function reviewFieldText(field,value){
 if(value===null)return 'No existía';if(field==='status')return FOLLOWUP_STATES[value]||'Estado no verificado';
 if(field==='dueDate')return value?value.split('-').reverse().join('/'):'Sin fecha objetivo';
 if(field==='note')return value||'Sin nota de trabajo';return String(value??'');
}
