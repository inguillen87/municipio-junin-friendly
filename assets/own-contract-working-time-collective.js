// Collective client workspace; every write remains one canonical contract command.
// No aggregate approval, SQL, hidden truncation, localStorage or automatic retry.
import {salaryExact,salaryHash,salaryUuid,salaryKey,salarySerialized,salaryJsonbBytes,SalaryInputError} from './native-salary-catalog-model.js';
import {workingTimePeriod,workingTimeDefinition,workingTimeBootstrap,workingTimeDetail,workingTimeReceipt,workingTimeHash,workingTimeCommand,prepareWorkingTime,decideWorkingTime,WORKING_TIME_READ} from './own-contract-working-time-model.js';
import {nativeRoster,nativeRosterFilters,nativeRosterScope} from './native-roster-model.js';
import {ownRunWorkspaceAccess} from './own-payroll-run-workspace-model.js';

export const COLLECTIVE_WORKING_TIME_VERSION='own-contract-working-time-collective.v1';
export const COLLECTIVE_WORKING_TIME_MAX_ROWS=10000;
export const COLLECTIVE_WORKING_TIME_MAX_BYTES=4*1024*1024;
const fail=(condition,message,code='INVALID')=>{if(!condition)throw new SalaryInputError('WORKING_TIME_COLLECTIVE_'+code,message);};
const exact=(v,keys)=>salaryExact(v,keys)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>d.enumerable&&Object.hasOwn(d,'value'));
const dense=v=>Array.isArray(v)&&v.length<=COLLECTIVE_WORKING_TIME_MAX_ROWS&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d?.enumerable&&Object.hasOwn(d,'value'));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const required=command=>command===null?[...WORKING_TIME_READ]:[...WORKING_TIME_READ,command==='propose'?'payroll.parameter.prepare':'payroll.parameter.approve'];
const lower=v=>v.toLowerCase();
const noPending=boot=>fail(!boot.proposals.some(p=>p.status==='pending'),'Hay propuestas pendientes para un contrato. Revisalas antes de preparar otra declaración.','PENDING');

export function collectiveWorkingTimeFile(raw){
 fail(exact(raw,['version','period','scope','total','records'])&&raw.version===COLLECTIVE_WORKING_TIME_VERSION&&workingTimePeriod(raw.period)&&raw.scope==='all_active','El archivo debe declarar versión, período y alcance propio activo completos.');
 fail(dense(raw.records)&&raw.records.length>0&&raw.total===raw.records.length,'El conjunto está incompleto o supera su capacidad. No se recortaron contratos.','INCOMPLETE');
 const ids=new Set(),registrations=new Set();
 for(const r of raw.records){
  fail(exact(r,['contractId','registrationId','legajo','definition','proposalId'])&&salaryUuid(r.contractId)&&salaryUuid(r.registrationId)&&typeof r.legajo==='string'&&r.legajo.length>0&&r.legajo.length<=64&&!/[\u0000-\u001f\u007f]/.test(r.legajo)&&(r.proposalId===null||salaryUuid(r.proposalId)),'Hay un contrato, registro o propuesta sin identificar.');
  fail(!ids.has(lower(r.contractId))&&!registrations.has(lower(r.registrationId)),'Hay contratos o registros repetidos.','DUPLICATE');ids.add(lower(r.contractId));registrations.add(lower(r.registrationId));
  fail(exact(r.definition,['dailyHours','monthlyHours','asOfDate','documentReference']),'La declaración contiene campos no admitidos.');workingTimeDefinition(r.definition,raw.period);
 }
 fail(salaryJsonbBytes(raw)<=COLLECTIVE_WORKING_TIME_MAX_BYTES,'El archivo completo supera4MiB. No se divide ni se recorta.','LIMIT');
 return freeze(structuredClone(raw));
}

export function collectiveWorkingTimeRoster(file,payload){
 const f=collectiveWorkingTimeFile(file),roster=nativeRoster(payload,nativeRosterFilters({status:'all'}));
 fail(roster.version==='native-roster.v2','Se necesita el padrón propio completo vigente.','ROSTER');
 const active=roster.rows.filter(r=>r.status==='active'),source=new Map(active.map(r=>[lower(r.contractId),r]));
 fail(active.length===f.total&&f.records.every(r=>{const s=source.get(lower(r.contractId));return s&&lower(s.registrationId)===lower(r.registrationId)&&s.legajo===r.legajo;}),'El archivo no coincide con todos los contratos activos del padrón propio. No se omitió ningún contrato.','POPULATION_CHANGED');
 return freeze({scope:nativeRosterScope(roster.scope),snapshot:roster.snapshot,today:roster.today,total:roster.total,active:f.total});
}

function subject(boot,row,period){
 workingTimeBootstrap(boot);
 fail(lower(boot.contractId)===lower(row.contractId)&&boot.period===period&&lower(boot.source.subject.registrationId)===lower(row.registrationId)&&boot.source.subject.legajo===row.legajo,'Cambió el contrato, su registro o el período.','SOURCE_CHANGED');
}

async function entry(row,boot,detail,period,command,reason){
 subject(boot,row,period);
 if(command==='propose'){
  fail(row.proposalId===null,'Un archivo de propuestas conservadas no crea nuevas declaraciones.');noPending(boot);
  if(salarySerialized(boot.configuration.definition)===salarySerialized(row.definition))return {row,body:null,before:boot.configuration.definition,after:row.definition};
  return {row,body:prepareWorkingTime(boot,row.definition,reason),before:boot.configuration.definition,after:row.definition};
 }
 fail(['approve','reject'].includes(command),'Elegí preparación, aprobación o rechazo explícitos.');
 if(row.proposalId===null){
  fail(salarySerialized(boot.configuration.definition)===salarySerialized(row.definition),'El contrato sin propuesta no conserva la declaración aprobada del archivo.','SOURCE_CHANGED');
  noPending(boot);return {row,body:null,before:boot.configuration.definition,after:row.definition};
 }
 const d=await workingTimeDetail(detail);
 fail(d.proposal.id===row.proposalId&&d.body.period===period&&lower(d.body.contractId)===lower(row.contractId)&&d.scopeVersion===boot.scopeVersion&&salarySerialized(d.body.definition)===salarySerialized(row.definition),'La propuesta no coincide con la declaración completa del archivo.','PROPOSAL_CHANGED');
 fail(boot.proposals.filter(p=>p.status==='pending').every(p=>p.id===row.proposalId),'Hay otra propuesta pendiente para el mismo contrato.','PENDING');
 return {row,body:decideWorkingTime(boot,d,command,reason),before:d.baseDefinition,after:d.body.definition};
}

export function createCollectiveWorkingTimeWorkspace(io){
 for(const key of ['authorize','readRoster','readBootstrap','readDetail','sendCommand','readAttempt','isVisible'])fail(typeof io?.[key]==='function','Falta un transporte canónico del workspace.');
 const newKey=io.newKey??(()=>crypto.randomUUID()),notify=io.changed??(()=>{});
 let generation=0,running=false,controller=null,accessKey=null,file=null,fileHash=null,mode=null,reason=null,rosterPin=null,plan=null,reviewHash=null,attempt=null,notFound=false,phase='empty';
 const confirmed=new Map();let context=null,preparedCount=0;
 const live=()=>io.isVisible()===true;
 const view=()=>freeze({phase,working:running,masked:!live()||phase==='suspended',total:plan?.length??(phase==='preparing'?file?.total??0:0),preparedCount,changed:plan?.filter(r=>r.body!==null).length??0,unchanged:plan?.filter(r=>r.body===null).length??0,confirmed:confirmed.size,pending:!!attempt,canRetry:!!attempt&&notFound,reviewHash:plan?reviewHash:null,complete:phase==='complete',hasProgress:confirmed.size>0||!!attempt});
 const publish=()=>notify(view());
 function ensure(epoch){fail(live()&&epoch===generation,'Se retiró la vista o cambió la preparación.','SUSPENDED');}
 async function auth(command,epoch){ensure(epoch);const a=ownRunWorkspaceAccess(await io.authorize({signal:controller.signal}));ensure(epoch);fail(required(command).every(c=>a.caps.has(c)),'Tu cuenta no permite esta operación.','FORBIDDEN');fail((accessKey===null||a.key===accessKey)&&(!context||context.accessKey===a.key),'Cambió la cuenta o el ámbito; el intento conserva su contenido.','SCOPE_CHANGED');accessKey=a.key;return a;}
 async function roster(f,epoch){ensure(epoch);const pin=collectiveWorkingTimeRoster(f,await io.readRoster({signal:controller.signal}));ensure(epoch);return pin;}
 async function readEntry(row,epoch){const boot=await io.readBootstrap(row.contractId,file.period,{signal:controller.signal});ensure(epoch);const detail=mode!=='propose'&&row.proposalId!==null?await io.readDetail(row.proposalId,{signal:controller.signal}):null;ensure(epoch);await auth(mode,epoch);return entry(row,boot,detail,file.period,mode,reason);}
 async function receipt(raw,expected){const r=workingTimeReceipt(raw,expected);fail(r.requestSha256===await workingTimeHash(r.body),'No se verificó el comprobante original.','RECEIPT_INVALID');return r;}
 function mark(r){confirmed.set(lower(r.body.contractId),freeze({key:r.requestKey,bodySha256:r.requestSha256,proposalId:r.proposalId,command:r.body.command}));attempt=null;notFound=false;publish();}
 async function run(work){fail(!running&&live(),'La vista está ocupada o no está disponible.','BUSY');const epoch=++generation;controller=new AbortController();running=true;publish();try{return await work(epoch);}catch(e){if(epoch===generation){if([401,403].includes(e.status)||/FORBIDDEN|SCOPE_CHANGED|SESSION_INVALID/.test(e.code??''))suspend();else{phase=attempt?'uncertain':'blocked';publish();}}throw e;}finally{if(epoch===generation){running=false;controller=null;publish();}}}
 async function prepare(raw,command,why){return run(async epoch=>{
  fail(!attempt||notFound,'Consultá primero el mismo intento pendiente.','PENDING');const f=collectiveWorkingTimeFile(raw),h=await workingTimeHash(f);
  fail(['propose','approve','reject'].includes(command)&&typeof why==='string'&&why===why.trim()&&why===why.normalize('NFC')&&why.length>=10&&why.length<=1000&&!/[<>\u0000-\u001f\u007f]/.test(why),'Elegí una operación y fundamento explícitos.');
  if(context&&(confirmed.size||attempt))fail(context.fileHash===h&&context.mode===command&&context.reasonHash===await workingTimeHash(why),'El avance parcial pertenece al mismo conjunto y fundamento. No se reasignó.','PROGRESS_CHANGED');
  file=f;fileHash=h;mode=command;reason=why;plan=null;reviewHash=null;preparedCount=0;phase='preparing';await auth(mode,epoch);const before=await roster(file,epoch),next=[];
  for(const row of file.records){
   const saved=confirmed.get(lower(row.contractId));
   if(saved){const r=await receipt(await io.readAttempt(saved.key,{signal:controller.signal}));ensure(epoch);await auth(mode,epoch);fail(r.requestKey===saved.key&&r.proposalId===saved.proposalId&&r.requestSha256===saved.bodySha256&&r.body.command===mode&&r.body.period===file.period&&r.body.contractId===row.contractId&&(mode!=='propose'||salarySerialized(r.body.definition)===salarySerialized(row.definition)),'El avance no coincide con el mismo comprobante original.','PROGRESS_CHANGED');const d=await workingTimeDetail(await io.readDetail(saved.proposalId,{signal:controller.signal}));ensure(epoch);await auth(mode,epoch);fail(d.proposal.id===saved.proposalId&&d.body.contractId===row.contractId&&d.body.period===file.period&&salarySerialized(d.body.definition)===salarySerialized(row.definition),'El detalle original no coincide con la declaración del avance.','PROGRESS_CHANGED');next.push({row,body:r.body,before:d.baseDefinition,after:d.body.definition,alreadyConfirmed:true});}
   else next.push(await readEntry(row,epoch));
   preparedCount=next.length;publish();
  }
  const after=await roster(file,epoch);await auth(mode,epoch);fail(salarySerialized(before)===salarySerialized(after),'Cambió el padrón durante la revisión completa.','POPULATION_CHANGED');
  ensure(epoch);rosterPin=before;plan=freeze(structuredClone(next));reviewHash=await workingTimeHash({fileHash,mode,reason,rosterPin,plan});phase=attempt?'uncertain':'prepared';context={fileHash,mode,period:file.period,reasonHash:await workingTimeHash(reason),accessKey};publish();return view();
 });}
 async function send(confirmation){return run(async epoch=>{
  fail(phase==='prepared'&&plan&&!attempt&&exact(confirmation,['confirmed','reviewHash'])&&confirmation.confirmed===true&&salaryHash(confirmation.reviewHash)&&confirmation.reviewHash===reviewHash,'Revisá y confirmá el conjunto completo vigente antes de registrar.','REVIEW_REQUIRED');await auth(mode,epoch);fail(salarySerialized(await roster(file,epoch))===salarySerialized(rosterPin),'Cambió el padrón desde la comparación.','POPULATION_CHANGED');phase='sending';
  for(const item of plan){
   if(item.body===null||confirmed.has(lower(item.row.contractId)))continue;
   const fresh=await readEntry(item.row,epoch);fail(salarySerialized(fresh.body)===salarySerialized(item.body),'Cambió una revisión, fuente o propuesta. Se conservó el avance anterior.','BASE_CHANGED');
   await auth(mode,epoch);const key=newKey();fail(salaryKey(key),'No se identificó el intento.');attempt=freeze({key,body:structuredClone(item.body),accessKey});notFound=false;publish();
   const r=await receipt(await io.sendCommand(attempt,{signal:controller.signal}),attempt);ensure(epoch);await auth(mode,epoch);mark(r);
  }
  fail(salarySerialized(await roster(file,epoch))===salarySerialized(rosterPin),'Cambió el padrón al finalizar. Los comprobantes individuales se conservan.','POPULATION_CHANGED');await auth(mode,epoch);phase='complete';publish();return view();
 });}
 async function recover(){return run(async epoch=>{
  fail(attempt,'No hay un intento incierto.');await auth(attempt.body.command,epoch);notFound=false;
  try{const r=await receipt(await io.readAttempt(attempt.key,{signal:controller.signal}),attempt);ensure(epoch);await auth(attempt.body.command,epoch);mark(r);phase=plan?'prepared':'suspended';return r;}
  catch(e){if(e.status===404&&e.code==='WORKING_TIME_NOT_FOUND'){ensure(epoch);await auth(attempt.body.command,epoch);notFound=true;phase='uncertain';publish();return null;}throw e;}
 });}
 async function retry(confirmation){return run(async epoch=>{
  fail(attempt&&notFound&&file&&plan&&exact(confirmation,['confirmed','reviewHash'])&&confirmation.confirmed===true&&confirmation.reviewHash===reviewHash,'Sólo se reintenta el mismo envío después de revisar el conjunto vigente y confirmar que aún no fue registrado.','REVIEW_REQUIRED');await auth(attempt.body.command,epoch);
  fail(salarySerialized(await roster(file,epoch))===salarySerialized(rosterPin),'Cambió el padrón desde la comparación; no se reintentó el envío.','POPULATION_CHANGED');const row=file.records.find(r=>r.contractId===attempt.body.contractId);const fresh=await readEntry(row,epoch);fail(salarySerialized(fresh.body)===salarySerialized(attempt.body),'Cambió la revisión del envío pendiente.','BASE_CHANGED');
  const r=await receipt(await io.sendCommand(attempt,{signal:controller.signal}),attempt);ensure(epoch);await auth(attempt.body.command,epoch);mark(r);phase='prepared';return r;
 });}
 function suspend(){generation++;controller?.abort();controller=null;running=false;file=null;plan=null;reviewHash=null;preparedCount=0;rosterPin=null;accessKey=null;if(!attempt&&!confirmed.size)context=null;phase='suspended';publish();}
 function comparisons(){fail(live()&&plan&&['prepared','sending','complete','uncertain','blocked'].includes(phase),'No hay comparación visible vigente.');return freeze(structuredClone(plan.map(r=>({contractId:r.row.contractId,legajo:r.row.legajo,before:r.before,after:r.after,action:r.body?.command??'unchanged',confirmed:confirmed.has(lower(r.row.contractId))}))));}
 function reviewFile(){fail(live()&&phase==='complete'&&mode==='propose'&&file,'Completá todas las propuestas antes de descargar su revisión.');return collectiveWorkingTimeFile({...file,records:file.records.map(r=>({...r,proposalId:confirmed.get(lower(r.contractId))?.proposalId??null}))});}
 async function resumeHint(){return run(async epoch=>{fail(context,'No hay un conjunto anterior para continuar.');await auth(context.mode,epoch);return freeze({command:context.mode,reason,period:context.period});});}
 async function revalidate(){return run(async epoch=>{try{await auth(mode??context?.mode??null,epoch);return view();}catch(e){if(epoch===generation)suspend();throw e;}});}
 async function progressFile(){return run(async epoch=>{fail(context,'No hay avance para conservar.');await auth(context.mode,epoch);return freeze({version:'own-contract-working-time-progress.v1',period:context.period,fileHash:context.fileHash,command:context.mode,reason,accessHash:await workingTimeHash(context.accessKey),confirmed:[...confirmed].map(([contractId,r])=>({contractId,...r})),attempt:attempt?{key:attempt.key,body:structuredClone(attempt.body),bodySha256:await workingTimeHash(attempt.body)}:null});});}
 async function restore(raw){return run(async epoch=>{
  fail(!attempt&&!confirmed.size&&!plan,'Iniciá explícitamente otro conjunto antes de cargar un avance.','PENDING');
  fail(exact(raw,['version','period','fileHash','command','reason','accessHash','confirmed','attempt'])&&raw.version==='own-contract-working-time-progress.v1'&&workingTimePeriod(raw.period)&&salaryHash(raw.fileHash)&&salaryHash(raw.accessHash)&&['propose','approve','reject'].includes(raw.command)&&typeof raw.reason==='string'&&raw.reason.length>=10&&raw.reason.length<=1000&&dense(raw.confirmed),'El avance no tiene un formato completo válido.');
  const seen=new Set(),keys=new Set();for(const r of raw.confirmed){fail(exact(r,['contractId','key','bodySha256','proposalId','command'])&&salaryUuid(r.contractId)&&salaryKey(r.key)&&salaryHash(r.bodySha256)&&salaryUuid(r.proposalId)&&r.command===raw.command&&!seen.has(lower(r.contractId))&&!keys.has(r.key),'El avance repite un contrato o no conserva su comprobante.');seen.add(lower(r.contractId));keys.add(r.key);}
  if(raw.attempt!==null){fail(exact(raw.attempt,['key','body','bodySha256'])&&salaryKey(raw.attempt.key)&&salaryHash(raw.attempt.bodySha256)&&exact(raw.attempt.body,['command','contractId','period','scopeVersion','baseVersion','sourceVersion','proposalId','proposalSha256','definition','reason','reviewConfirmed']),'El intento pendiente no conserva su referencia.');if(raw.attempt.body.definition!==null)fail(exact(raw.attempt.body.definition,['dailyHours','monthlyHours','asOfDate','documentReference']),'La declaración del intento contiene campos no admitidos.');workingTimeCommand(raw.attempt.body);fail(await workingTimeHash(raw.attempt.body)===raw.attempt.bodySha256&&raw.attempt.body.command===raw.command&&raw.attempt.body.period===raw.period&&raw.attempt.body.reason===raw.reason&&!keys.has(raw.attempt.key)&&!seen.has(lower(raw.attempt.body.contractId)),'El intento pendiente corresponde a otro conjunto.');}
  await auth(raw.command,epoch);fail(await workingTimeHash(accessKey)===raw.accessHash,'El avance pertenece a la misma cuenta y ámbito originales.','SCOPE_CHANGED');
  const verified=[];for(const saved of raw.confirmed){const r=await receipt(await io.readAttempt(saved.key,{signal:controller.signal}));ensure(epoch);await auth(raw.command,epoch);fail(r.requestKey===saved.key&&r.proposalId===saved.proposalId&&r.requestSha256===saved.bodySha256&&lower(r.body.contractId)===lower(saved.contractId)&&r.body.command===raw.command&&r.body.period===raw.period&&r.body.reason===raw.reason,'El avance no coincide con los comprobantes originales.','PROGRESS_CHANGED');verified.push([lower(saved.contractId),saved]);}
  context={fileHash:raw.fileHash,mode:raw.command,period:raw.period,reasonHash:await workingTimeHash(raw.reason),accessKey};mode=raw.command;reason=raw.reason;fileHash=raw.fileHash;for(const[key,value]of verified){const{contractId,...saved}=value;confirmed.set(key,freeze(saved));}attempt=raw.attempt?freeze({key:raw.attempt.key,body:structuredClone(raw.attempt.body),accessKey}):null;notFound=false;file=null;plan=null;reviewHash=null;phase='suspended';publish();return view();
 });}
 function startNew(){fail(!running&&!attempt&&(!confirmed.size||phase==='complete'),'Conservá y terminá el avance pendiente antes de iniciar otro conjunto.','PENDING');confirmed.clear();context=null;fileHash=null;mode=null;reason=null;suspend();phase='empty';publish();}
 return {prepare,send,recover,retry,suspend,view,comparisons,reviewFile,resumeHint,revalidate,startNew,progressFile,restore};
}
