// Internal work tracking. A date/status here does not decide a legal deadline or act.
export const WORK_STATES=Object.freeze({pending:'Pendiente',in_progress:'En trabajo',waiting:'En espera',closed:'Cerrado'});
export const WORK_LIMITS=Object.freeze({title:160,reference:100,nextStep:300,note:1500,history:100,body:12000});
export const workUuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export const exactKeys=(x,keys)=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const fail=message=>{throw Error(message);};
export function workDay(v){if(v==='')return true;if(typeof v!=='string'||!/^20\d\d-\d\d-\d\d$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v;}
function text(v,min,max,label){if(typeof v!=='string')fail('Revisá '+label+'.');const x=v.normalize('NFC').trim();if(x.length<min||x.length>max||/[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(x))fail('Revisá '+label+': entre '+min+' y '+max+' caracteres.');return x;}
export function cleanWorkMetadata(x){
 if(!exactKeys(x,['title','reference','responsibleId','targetDate','nextStep','status']))fail('La ficha tiene campos no admitidos.');
 if(!workUuid(x.responsibleId))fail('Seleccioná un responsable habilitado.');if(!workDay(x.targetDate))fail('Revisá la fecha de seguimiento.');
 if(!Object.hasOwn(WORK_STATES,x.status))fail('Seleccioná un estado válido.');
 return{title:text(x.title,5,160,'el asunto'),reference:text(x.reference,0,100,'la referencia'),responsibleId:x.responsibleId,targetDate:x.targetDate,nextStep:text(x.nextStep,x.status==='closed'?0:5,300,'el próximo paso'),status:x.status};
}
export function cleanWorkSave(x){
 if(!exactKeys(x,['id','expectedVersion','metadata','note']))fail('Solicitud de trabajo no válida.');
 if(x.id!==null&&!workUuid(x.id)||!Number.isInteger(x.expectedVersion)||x.expectedVersion<0||x.expectedVersion>=WORK_LIMITS.history||(x.id===null)!==(x.expectedVersion===0))fail('La versión no corresponde al asunto.');
 const metadata=cleanWorkMetadata(x.metadata);if(x.id===null&&metadata.status!=='pending')fail('El asunto nuevo comienza pendiente.');
 return{id:x.id,expectedVersion:x.expectedVersion,metadata,note:text(x.note,5,1500,'la actuación o fundamento')};
}
export function workQuery(x){if(!exactKeys(x,['q','status','mine','page'])||typeof x.q!=='string'||x.q.length>100||/[\x00-\x1f\x7f]/.test(x.q)||x.status!==''&&!Object.hasOwn(WORK_STATES,x.status)||typeof x.mine!=='boolean'||!Number.isInteger(x.page)||x.page<1||x.page>1000)fail('Revisá los filtros de la bandeja.');return {...x,q:x.q.trim()};}
export function blankWork(responsibleId){return{id:null,expectedVersion:0,metadata:{title:'',reference:'',responsibleId,targetDate:'',nextStep:'',status:'pending'},note:''};}
export function workReceipt(x){if(!exactKeys(x,['version','id','code','recordVersion','replayed'])||x.version!=='legal-work.v1'||!workUuid(x.id)||!/^AJ-20\d{2}-\d{5}$/.test(x.code)||!Number.isInteger(x.recordVersion)||x.recordVersion<1||x.recordVersion>100||typeof x.replayed!=='boolean')fail('No se pudo comprobar la confirmación. Consultá el mismo intento.');return x;}
// Duplicate JSON keys are rejected before canonicalization/idempotency hashing.
export function strictWorkJson(source){const stack=[];for(let i=0;i<source.length;i++){
 const c=source[i];if(c==='{'||c==='['){stack.push(c==='{'?new Set():null);if(stack.length>12)throw Error('Solicitud demasiado anidada.');}
 else if(c==='}'||c===']')stack.pop();else if(c==='"'){const start=i++;for(;i<source.length&&source[i]!=='"';i++)if(source[i]==='\\')i++;let n=i+1;while(n<source.length&&/\s/.test(source[n]))n++;if(source[n]===':'){const key=JSON.parse(source.slice(start,i+1)),keys=stack.at(-1);if(!keys||keys.has(key))throw Error('Campo JSON repetido.');keys.add(key);}}
 }return JSON.parse(source);}
