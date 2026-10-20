// Employee submissions and explicit HR review. Neither is salary eligibility.
import {salarySerialized} from './native-salary-catalog-model.js';
export const FAMILY_REQUEST_VERSION='native-family-request-command.v1';
export const FAMILY_SELF_READ=Object.freeze(['actions.read','employee.family.self.read']);
export const FAMILY_SELF_SUBMIT=Object.freeze([...FAMILY_SELF_READ,'employee.family.self.submit']);
export const FAMILY_REVIEW_READ=Object.freeze(['actions.read','workforce.employee.read','employee.family.review']);
export const FAMILY_REVIEW_WRITE=Object.freeze([...FAMILY_REVIEW_READ,'employee.record.propose']);
export const FAMILY_REQUEST_MAX_BYTES=3*1024*1024,FAMILY_DOCUMENT_MAX_BYTES=2*1024*1024,FAMILY_REQUEST_MAX_ROWS=1000;
export const FAMILY_REQUEST_STATES=Object.freeze(['submitted','correction_requested','accepted','rejected']);
export const FAMILY_REQUEST_PAGE_SIZE=50;
export class FamilyRequestError extends Error{constructor(code='INPUT_INVALID',status=422,message='Revisá los datos de la solicitud familiar.'){super(message);Object.assign(this,{name:'FamilyRequestError',code:'NATIVE_FAMILY_'+code,status});}}
export const familyRequestFail=(code,status,message)=>{throw new FamilyRequestError(code,status,message);};
const require=(v,message)=>{if(!v)familyRequestFail('INPUT_INVALID',422,message);};
export const familyRequestExact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const familyRequestUuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export const familyRequestKey=v=>familyRequestUuid(v)&&v[14]==='4'&&/[89ab]/.test(v[19]);
export const familyRequestHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=(v,min,max)=>typeof v==='string'&&v===v.trim()&&v===v.normalize('NFC')&&Array.from(v).length>=min&&Array.from(v).length<=max&&!/[<>\u0000-\u001f\u007f]/.test(v);
const civil=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&v>='1900-01-01'&&v<='2100-12-31'&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const stamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&civil(v.slice(0,10))&&Number.isFinite(Date.parse(v));
const nullableDate=v=>v===null||civil(v);
const familyRef=v=>familyRequestExact(v,['kind','id'])&&v.kind==='own'&&familyRequestUuid(v.id);
const filename=v=>text(v,5,180)&&/\.pdf$/i.test(v)&&!/[\\/:*?"|]/.test(v);
function documentInput(v){
 require(familyRequestExact(v,['filename','sha256','contentBase64'])&&filename(v.filename)&&familyRequestHash(v.sha256)&&typeof v.contentBase64==='string'&&v.contentBase64.length>0&&v.contentBase64.length<=Math.ceil(FAMILY_DOCUMENT_MAX_BYTES/3)*4&&v.contentBase64.length%4===0&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v.contentBase64),'Elegí un PDF válido de hasta 2 MiB; el servidor verificará su contenido.');
 return {...v};
}
function child(v,now){
 require(familyRequestExact(v,['familyName','birthDate','dni','validFrom','validTo'])&&text(v.familyName,1,180)&&/\p{L}/u.test(v.familyName)&&[v.birthDate,v.validFrom,v.validTo].every(nullableDate),'Revisá los datos y las fechas del hijo o hija.');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 require((v.dni===null||typeof v.dni==='string'&&/^[0-9]{5,12}$/.test(v.dni)&&!/^0+$/.test(v.dni))&&(!v.birthDate||v.birthDate<=today)&&(!v.validFrom||!v.validTo||v.validTo>=v.validFrom)&&(!v.birthDate||[v.validFrom,v.validTo].every(d=>d===null||d>=v.birthDate)),'Revisá el DNI, el nacimiento y la vigencia declarada. No se completan fechas ausentes.');
 return {...v};
}
function schooling(v){
 require(familyRequestExact(v,['familyRef','identityToken','expectedCertificateId','institution','educationLevel','course','schoolYear','issuedOn','presentedOn','expiresOn','evidenceMode','paperReference'])&&familyRef(v.familyRef)&&familyRequestHash(v.identityToken)&&(v.expectedCertificateId===null||familyRequestUuid(v.expectedCertificateId)),'Elegí un familiar propio de tu cuenta y su versión actual.');
 require([['institution',180],['educationLevel',80],['course',100]].every(([k,max])=>v[k]===null||text(v[k],1,max))&&(v.schoolYear===null||Number.isInteger(v.schoolYear)&&v.schoolYear>=1900&&v.schoolYear<=2100)&&[v.issuedOn,v.expiresOn].every(nullableDate)&&civil(v.presentedOn),'Revisá los datos escritos y las fechas declaradas del certificado.');
 require(['pdf','paper_declared'].includes(v.evidenceMode)&&(v.evidenceMode==='pdf'?v.paperReference===null:text(v.paperReference,5,500)),'Diferenciá un PDF adjunto de una presentación previa en papel.');
 return {...v,familyRef:{...v.familyRef}};
}
export function familyRequestPayload(v,{now=new Date()}={}){
 require(familyRequestExact(v,['kind','definition','document'])&&['child','schooling'].includes(v.kind),'La solicitud debe declarar un hijo o presentar escolaridad.');
 const definition=v.kind==='child'?child(v.definition,now):schooling(v.definition),document=v.document===null?null:documentInput(v.document);
 require(v.kind!=='schooling'||(definition.evidenceMode==='pdf')===!!document,'El modo de presentación debe coincidir con el archivo adjunto.');
 return {kind:v.kind,definition,document};
}
export function familyRequestCommand(v,{now=new Date()}={}){
 require(familyRequestExact(v,['version','command','requestId','expectedVersion','subjectVersion','payload','reason','reviewConfirmed'])&&v.version===FAMILY_REQUEST_VERSION&&['submit','resubmit','request_correction','accept','reject'].includes(v.command)&&text(v.reason,10,500)&&v.reviewConfirmed===true,'Revisá la solicitud completa y confirmá expresamente su envío o decisión.');
 const self=['submit','resubmit'].includes(v.command);
 require(v.command==='submit'?v.requestId===null&&v.expectedVersion===0:familyRequestUuid(v.requestId)&&Number.isSafeInteger(v.expectedVersion)&&v.expectedVersion>0&&v.expectedVersion<1000,'La solicitud o su versión cambió. Consultala antes de continuar.');
 require(v.command!=='request_correction'||v.expectedVersion<=997,'La solicitud no admite otra corrección. Conservá el historial y registrá una decisión final.');
 require(v.command!=='resubmit'||v.expectedVersion<=998,'La solicitud no admite otro reenvío. Personal debe registrar una decisión final.');
 require(self?familyRequestHash(v.subjectVersion)&&v.payload!==null:v.subjectVersion===null&&v.payload===null,'No se admite otro contrato ni una identidad enviada por el cliente.');
 const result={...v,payload:self?familyRequestPayload(v.payload,{now}):null};
 require(new TextEncoder().encode(JSON.stringify(result)).length<=FAMILY_REQUEST_MAX_BYTES,'La solicitud completa supera el límite; no se recorta ni se divide.');
 return result;
}
export const familyRequestSerialized=salarySerialized;
export function familyRequestReceipt(v,{key=null,body=null,bodySha256=null,scope=null}={}){
 const invalid=()=>familyRequestFail('CONTRACT_INVALID',503,'No se pudo verificar el comprobante. Consultá el mismo intento antes de repetirlo.');
 if(!familyRequestExact(v,['version','scope','key','requestId','requestVersion','requestKind','command','state','bodySha256','recordedAt','replayed','administrativeRecord','payrollModified','benefitGranted'])||v.version!=='native-family-request-receipt.v1'||!familyRequestKey(v.key)||!familyRequestUuid(v.requestId)||!Number.isInteger(v.requestVersion)||v.requestVersion<1||v.requestVersion>1000||!['child','schooling'].includes(v.requestKind)||!['submit','resubmit','request_correction','accept','reject'].includes(v.command)||!familyRequestHash(v.bodySha256)||!stamp(v.recordedAt)||typeof v.replayed!=='boolean'||v.payrollModified!==false||v.benefitGranted!==false)invalid();
 if(scope)familyRequestScope(v.scope,scope);else if(!familyRequestExact(v.scope,['tenantId','membershipId'])||![v.scope.tenantId,v.scope.membershipId].every(familyRequestUuid))invalid();
 const states={submit:'submitted',resubmit:'submitted',request_correction:'correction_requested',accept:'accepted',reject:'rejected'};
 if(v.state!==states[v.command])invalid();
 if(v.command==='accept'){
  const r=v.administrativeRecord;
  if(!familyRequestExact(r,['kind','familyRef','certificateId'])||r.kind!==v.requestKind||!familyRef(r.familyRef)||(r.kind==='child'?r.certificateId!==null:!familyRequestUuid(r.certificateId)))invalid();
 }else if(v.administrativeRecord!==null)invalid();
 if(key!==null&&v.key!==key||bodySha256!==null&&v.bodySha256!==bodySha256)invalid();
 if(body&&(v.command!==body.command||v.requestVersion!==body.expectedVersion+1||(body.requestId!==null&&body.requestId!==v.requestId)||(body.payload&&body.payload.kind!==v.requestKind)))invalid();
 return v;
}
export function familyRequestScope(v,expected){
 if(!familyRequestExact(v,['tenantId','membershipId'])||!familyRequestUuid(v.tenantId)||!familyRequestUuid(v.membershipId)||v.tenantId!==expected.tenantId||v.membershipId!==expected.membershipId)familyRequestFail('CONTRACT_INVALID',503,'La respuesta no corresponde a tu ámbito municipal.');return v;
}
export function familyRequestPageCursor(v){
 if(v===null)return v;
 if(!familyRequestExact(v,['version','contextVersion','snapshotVersion','offset','after'])||v.version!=='native-family-page-cursor.v1'||!familyRequestHash(v.contextVersion)||!familyRequestHash(v.snapshotVersion)||!Number.isSafeInteger(v.offset)||v.offset<1||v.offset>999999999||!familyRequestExact(v.after,['receivedAt','id'])||!stamp(v.after.receivedAt)||!familyRequestUuid(v.after.id))familyRequestFail('INPUT_INVALID',400,'La página de solicitudes no es válida. Actualizá la consulta.');return v;
}
export function familyRequestList(v,{scope,view,cursor=null}={}){
 const invalid=()=>familyRequestFail('CONTRACT_INVALID',503,'No se verificó el conjunto completo de solicitudes.');
 if(!familyRequestExact(v,['version','view','scope','state','subject','families','requests','total','complete','canSubmit','page'])||v.version!=='native-family-requests.v1'||v.view!==view||!['self','review'].includes(view)||!Array.isArray(v.requests)||v.requests.length>FAMILY_REQUEST_PAGE_SIZE||!Number.isSafeInteger(v.total)||v.total<0||typeof v.canSubmit!=='boolean'||!Array.isArray(v.families)||v.families.length>FAMILY_REQUEST_MAX_ROWS)invalid();familyRequestScope(v.scope,scope);
 const page=v.page;if(!familyRequestExact(page,['size','offset','returned','nextCursor','snapshotVersion','contextVersion'])||page.size!==FAMILY_REQUEST_PAGE_SIZE||!Number.isSafeInteger(page.offset)||page.offset<0||page.returned!==v.requests.length||page.offset>0&&page.returned===0||page.offset+page.returned>v.total||v.complete!==(v.total===page.returned)||!familyRequestHash(page.snapshotVersion)||!familyRequestHash(page.contextVersion))invalid();
 try{familyRequestPageCursor(cursor);familyRequestPageCursor(page.nextCursor);}catch{invalid();}
 if(cursor?(page.offset!==cursor.offset||page.contextVersion!==cursor.contextVersion||page.snapshotVersion!==cursor.snapshotVersion):page.offset!==0)invalid();
 if(page.offset+page.returned<v.total){const next=page.nextCursor;if(page.returned!==50||!next||next.offset!==page.offset+page.returned||next.contextVersion!==page.contextVersion||next.snapshotVersion!==page.snapshotVersion||next.after.id!==v.requests.at(-1)?.id||next.after.receivedAt!==v.requests.at(-1)?.recordedAt)invalid();}else if(page.nextCursor!==null)invalid();
 if(view==='self'){
  if(!['native','unlinked','reference'].includes(v.state))invalid();
  if(v.state==='native'){const s=v.subject;if(!familyRequestExact(s,['legajo','employeeName','subjectVersion'])||!text(s.legajo,1,64)||!(s.employeeName===null||text(s.employeeName,1,300))||!familyRequestHash(s.subjectVersion))invalid();}
  else if(v.subject!==null||v.canSubmit||v.requests.length||v.families.length)invalid();
 }else if(v.state!=='ready'||v.subject!==null||v.canSubmit||v.families.length)invalid();
 const familyIds=new Set();for(const f of v.families){if(!familyRequestExact(f,['familyRef','identityToken','familyName','birthDate','dni','validFrom','validTo','latestCertificateId','canPresent'])||!familyRef(f.familyRef)||familyIds.has(f.familyRef.id)||!familyRequestHash(f.identityToken)||!text(f.familyName,1,180)||![f.birthDate,f.validFrom,f.validTo].every(nullableDate)||!(f.dni===null||typeof f.dni==='string'&&/^[0-9]{5,12}$/.test(f.dni))||!(f.latestCertificateId===null||familyRequestUuid(f.latestCertificateId))||typeof f.canPresent!=='boolean')invalid();familyIds.add(f.familyRef.id);}
 const ids=new Set();for(const r of v.requests){if(!familyRequestExact(r,['id','kind','state','requestVersion','recordedAt','updatedAt','legajo','employeeName','canResubmit','canReview','documentAvailable'])||!familyRequestUuid(r.id)||ids.has(r.id)||!['child','schooling'].includes(r.kind)||!FAMILY_REQUEST_STATES.includes(r.state)||!Number.isInteger(r.requestVersion)||r.requestVersion<1||r.requestVersion>1000||!stamp(r.recordedAt)||!stamp(r.updatedAt)||!text(r.legajo,1,64)||!(r.employeeName===null||text(r.employeeName,1,300))||['canResubmit','canReview','documentAvailable'].some(k=>typeof r[k]!=='boolean')||r.canResubmit&&(view!=='self'||r.state!=='correction_requested'||r.requestVersion>=999)||r.canReview&&(view!=='review'||!['submitted','correction_requested'].includes(r.state)||r.requestVersion>=1000))invalid();ids.add(r.id);}
 return v;
}
export function familyRequestPublicPayload(v){
 if(!familyRequestExact(v,['kind','definition','document']))familyRequestFail('CONTRACT_INVALID',503,'No se verificaron los datos de la solicitud.');
 const document=v.document;
 if(document!==null&&(!familyRequestExact(document,['filename','sha256','byteLength','pages'])||!filename(document.filename)||!familyRequestHash(document.sha256)||!Number.isInteger(document.byteLength)||document.byteLength<10||document.byteLength>FAMILY_DOCUMENT_MAX_BYTES||!Number.isInteger(document.pages)||document.pages<1||document.pages>30))familyRequestFail('CONTRACT_INVALID',503,'No se verificó el documento privado de la solicitud.');
 let definition;try{definition=v.kind==='child'?child(v.definition,new Date()):v.kind==='schooling'?schooling(v.definition):null;}catch{familyRequestFail('CONTRACT_INVALID',503,'No se verificaron los datos conservados de la solicitud.');}
 if(!definition||v.kind==='schooling'&&(definition.evidenceMode==='pdf')!==!!document)familyRequestFail('CONTRACT_INVALID',503,'El documento no corresponde al modo declarado.');return v;
}
function publicDocument(document){return document===null||familyRequestExact(document,['filename','sha256','byteLength','pages'])&&filename(document.filename)&&familyRequestHash(document.sha256)&&Number.isInteger(document.byteLength)&&document.byteLength>=10&&document.byteLength<=FAMILY_DOCUMENT_MAX_BYTES&&Number.isInteger(document.pages)&&document.pages>=1&&document.pages<=30;}
export function familyRequestDetail(v,{scope,view,id}={}){
 const invalid=()=>familyRequestFail('CONTRACT_INVALID',503,'No se pudo verificar la revisión completa de esta solicitud.');
 if(!familyRequestExact(v,['version','view','scope','id','kind','state','requestVersion','subject','subjectVersion','payload','events','canResubmit','canReview'])||v.version!=='native-family-request-detail.v1'||v.view!==view||!['self','review'].includes(view)||v.id!==id||!familyRequestUuid(v.id)||!familyRequestHash(v.subjectVersion)||!familyRequestExact(v.subject,['legajo','employeeName'])||!text(v.subject.legajo,1,64)||!(v.subject.employeeName===null||text(v.subject.employeeName,1,300))||!FAMILY_REQUEST_STATES.includes(v.state)||!Number.isInteger(v.requestVersion)||v.requestVersion<1||v.requestVersion>1000||!Array.isArray(v.events)||v.events.length!==v.requestVersion||typeof v.canResubmit!=='boolean'||typeof v.canReview!=='boolean'||v.canResubmit&&(view!=='self'||v.state!=='correction_requested'||v.requestVersion>=999)||v.canReview&&(view!=='review'||!['submitted','correction_requested'].includes(v.state)||v.requestVersion>=1000))invalid();
 familyRequestScope(v.scope,scope);familyRequestPublicPayload(v.payload);if(v.kind!==v.payload.kind)invalid();
 const states={submit:'submitted',resubmit:'submitted',request_correction:'correction_requested',accept:'accepted',reject:'rejected'},ids=new Set();for(const [index,e]of v.events.entries()){if(!familyRequestExact(e,['id','requestVersion','command','state','reason','actorLabel','recordedAt','document'])||!familyRequestUuid(e.id)||ids.has(e.id)||e.requestVersion!==index+1||!Object.hasOwn(states,e.command)||e.state!==states[e.command]||!text(e.reason,10,500)||!text(e.actorLabel,1,160)||!stamp(e.recordedAt)||!publicDocument(e.document))invalid();ids.add(e.id);}
 for(const [index,event]of v.events.entries()){
  const previous=index?v.events[index-1].state:null;
  if(index===0?event.command!=='submit':event.command==='submit'||event.command==='resubmit'&&(previous!=='correction_requested'||index>998)||event.command==='request_correction'&&(previous!=='submitted'||index>997)||event.command==='accept'&&previous!=='submitted'||event.command==='reject'&&!['submitted','correction_requested'].includes(previous))invalid();
 }
 if(v.events.at(-1)?.state!==v.state||familyRequestSerialized(v.events.at(-1)?.document)!==familyRequestSerialized(v.payload.document))invalid();return v;
}
