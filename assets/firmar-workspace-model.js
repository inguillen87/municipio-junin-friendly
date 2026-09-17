// Shared read-only contracts. No caller-chosen identity, authority or signature outcome.
export const FIRMAR_PDF_LIMIT=2097152;
export const FIRMAR_PAGE_LIMIT=30;
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const SHA=/^[a-f0-9]{64}$/;
export const exact=(x,keys)=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
export const WORKSPACE_FILTERS=Object.freeze({all:'Todos',pending:'Pendientes de firma',attention:'Requieren revisión',received:'Recibidos sin validar',cancelled:'Cancelados'});
export const WORKSPACE_STATES=Object.freeze({prepared:'Listo para revisar',awaiting_authorization:'Autorización pendiente',awaiting_receipt:'Esperando devolución',outcome_unknown:'Resultado por confirmar',received_unverified:'Recibido · sin validar',expired:'Intento vencido',cancelled:'Solicitud cancelada'});
export function stateGroup(state){if(['prepared','awaiting_authorization','awaiting_receipt'].includes(state))return 'pending';if(['outcome_unknown','expired'].includes(state))return 'attention';if(state==='received_unverified')return 'received';if(state==='cancelled')return 'cancelled';throw Error('FIRMAR_WORKSPACE_CONTRACT');}
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(v,min,max)=>typeof v==='string'&&v.length>=min&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const invalid=()=>{throw Error('FIRMAR_WORKSPACE_CONTRACT');};
export function normalizeWorkspaceQuery(input={}){
 if(!exact(input,['filter','search','page','pageSize']))invalid();
 const filter=String(input.filter),search=String(input.search),page=String(input.page),pageSize=String(input.pageSize);
 if(!Object.hasOwn(WORKSPACE_FILTERS,filter)||!text(search,0,120)||search!==search.trim()||!/^[1-9][0-9]{0,3}$/.test(page)||!['10','20'].includes(pageSize))invalid();
 return Object.freeze({filter,search,page:Number(page),pageSize:Number(pageSize)});
}
export function checkWorkspaceData(x,q,{configuration=true}={}){
 const keys=['schema','checkedAt','query','counts','pagination','documents','officialEmissionEnabled',...(configuration?['signingReady']:[])];
 if(!exact(x,keys)||x.schema!=='firmar-workspace.v1'||!time(x.checkedAt)||x.officialEmissionEnabled!==false||configuration&&typeof x.signingReady!=='boolean'||!exact(x.query,['filter','search','page','pageSize'])||Object.keys(q).some(k=>q[k]!==x.query[k]))invalid();
 if(!exact(x.counts,Object.keys(WORKSPACE_FILTERS))||!Object.values(x.counts).every(n=>integer(n,0,Number.MAX_SAFE_INTEGER))||x.counts.all!==x.counts.pending+x.counts.attention+x.counts.received+x.counts.cancelled)invalid();
 const p=x.pagination;if(!exact(p,['page','pageSize','total','pages'])||p.page!==q.page||p.pageSize!==q.pageSize||p.total!==x.counts[q.filter]||p.pages!==Math.ceil(p.total/q.pageSize)||!Array.isArray(x.documents)||x.documents.length!==Math.min(q.pageSize,Math.max(0,p.total-(q.page-1)*q.pageSize)))invalid();
 const ids=new Set();let previous=null;
 for(const row of x.documents){
  if(!exact(row,['requestId','title','documentKind','version','sourceVersionId','sourceSha256','sourceBytes','createdAt','state','attemptId','expiresAt','canReview'])||!UUID.test(row.requestId||'')||ids.has(row.requestId)||!text(row.title,2,180)||!text(row.documentKind,3,64)||!/^[a-z][a-z0-9._-]{2,63}$/.test(row.documentKind)||row.version!==1||!UUID.test(row.sourceVersionId||'')||!SHA.test(row.sourceSha256||'')||!integer(row.sourceBytes,10,FIRMAR_PDF_LIMIT)||!time(row.createdAt)||!Object.hasOwn(WORKSPACE_STATES,row.state)||row.canReview!==(row.state!=='cancelled')||(row.state==='prepared'&&row.attemptId!==null)||(!['prepared','cancelled'].includes(row.state)&&row.attemptId===null)||row.attemptId!==null&&!UUID.test(row.attemptId||'')||((row.attemptId===null)!==(row.expiresAt===null))||row.expiresAt!==null&&!time(row.expiresAt))invalid();
  if(q.filter!=='all'&&stateGroup(row.state)!==q.filter)invalid();
  const rank=Date.parse(row.createdAt);if(previous&&(rank>previous.time||row.createdAt===previous.raw&&row.requestId>previous.id))invalid();previous={time:rank,raw:row.createdAt,id:row.requestId};ids.add(row.requestId);
 }
 return x;
}
export function sourceSelection(x){
 if(!exact(x,['requestId','version','sha256'])||!UUID.test(x.requestId||'')||x.version!==1||!SHA.test(x.sha256||''))invalid();return Object.freeze({...x});
}
