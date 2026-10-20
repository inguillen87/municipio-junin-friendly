// Complete multi-period report for one already-authorized employee. No writes or new access.
import {normalizeDocumentLibrary} from './payroll-document-library-model.js';
import {documentPeriodRangePage} from './payroll-document-range.js';
import {capturePayrollDetailSelection,verifyPayrollDetailSelection} from './payroll-detail-selection.js';
import {createPayrollDetailModel,cents,decimal} from './payroll-detail-model.js';
export const PERIOD_REPORT_LIMITS=Object.freeze({documents:240,concepts:50000,bytes:32*1024*1024,deadlineMs:300000,concurrency:3});
const trusted=new WeakSet(),UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const periodReportFail=code=>{throw Object.assign(Error(code),{code});};
const stable=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export function periodReportSelection(raw,range){
 const library=normalizeDocumentLibrary(raw),first=documentPeriodRangePage(library,range),items=[];
 if(library.truncated)periodReportFail('PERIOD_CATALOG_LIMITED');
 if(!first.total)periodReportFail('PERIOD_EMPTY');if(first.total>PERIOD_REPORT_LIMITS.documents)periodReportFail('PERIOD_LIMIT');
 for(let p=1;p<=first.pages;p++)items.push(...documentPeriodRangePage(library,range,p).items);
 if(items.reduce((n,r)=>n+r.conceptCount,0)>PERIOD_REPORT_LIMITS.concepts)periodReportFail('PERIOD_LIMIT');
 return freeze({library,range:{from:first.periodFrom,to:first.periodTo,type:first.type},items});
}
export function verifiedPeriodReport(value){if(!trusted.has(value))periodReportFail('PERIOD_NOT_VERIFIED');return value;}
export function periodSourceTotals(models){return Object.fromEntries(['993','994','995','996','990','999'].map(code=>[code,models.some(m=>m.totals[code]===null||m.totals[code]===undefined)?null:decimal(models.reduce((n,m)=>n+cents(m.totals[code]),0n))]));}
export async function collectPayrollPeriods({library,range,employee,request,signal,progress=()=>{}}={}){
 const base=periodReportSelection(library,range),subject={contractId:employee?.contractId,name:employee?.name??employee?.fullName,legajo:String(employee?.legajo??'')};
 if(!UUID.test(subject.contractId??'')||typeof subject.name!=='string'||!subject.name.trim()||subject.name.length>150||/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(subject.name)||!/^\d{1,12}$/.test(subject.legajo)||typeof request!=='function'||typeof progress!=='function'||!signal?.throwIfAborted)periodReportFail('PERIOD_INPUT_INVALID');
 signal.throwIfAborted();const internal=new AbortController(),scope=AbortSignal.any([signal,internal.signal,AbortSignal.timeout(PERIOD_REPORT_LIMITS.deadlineMs)]),models=[],identities=new Set();let totalBytes=0,concepts=0,rejectAbort;
 const interrupted=new Promise((_,reject)=>{rejectAbort=()=>reject(scope.reason);scope.addEventListener('abort',rejectAbort,{once:true});});
 const indexUrl='/api/internal-data?'+new URLSearchParams({resource:'employeepayrolldocuments',contractId:subject.contractId});
 async function read(url){scope.throwIfAborted();const p=await Promise.race([Promise.resolve().then(()=>request(url,{signal:scope})),interrupted]);scope.throwIfAborted();if(p?.ok!==true)periodReportFail('PERIOD_READ_FAILED');return p.data;}
 async function index(){if(stable(normalizeDocumentLibrary(await read(indexUrl)))!==stable(base.library))periodReportFail('PERIOD_LIBRARY_CHANGED');}
 async function detail(item){
  const selected=capturePayrollDetailSelection(item),q=new URLSearchParams({resource:'employeepayrolldetail',contractId:subject.contractId,date:selected.date,type:selected.type,period:String(selected.period),month:String(selected.month)}),raw=await read('/api/internal-data?'+q);
  if(raw?.found!==true||raw.available!==true)periodReportFail('PERIOD_DETAIL_MISSING');verifyPayrollDetailSelection(raw,selected);
  if(!UUID.test(raw.statementId??'')||raw.closureStatus!==item.closureStatus||raw.sourceLabel!==item.sourceLabel||raw.lines?.length!==item.conceptCount)periodReportFail('PERIOD_DETAIL_CHANGED');
  const model=createPayrollDetailModel(raw,subject);return model;
 }
 async function all(phase,visit){let cursor=0,done=0;progress({phase,done,total:base.items.length});
  const worker=async()=>{while(cursor<base.items.length){scope.throwIfAborted();const i=cursor++;await visit(base.items[i],i);scope.throwIfAborted();progress({phase,done:++done,total:base.items.length});}};
  await Promise.race([Promise.all(Array.from({length:Math.min(PERIOD_REPORT_LIMITS.concurrency,base.items.length)},worker)),interrupted]);
 }
 try{
  progress({phase:'catalog',done:0,total:1});await index();
  await all('detail',async(item,i)=>{const model=await detail(item);if(identities.has(model.statementId))periodReportFail('PERIOD_DETAIL_CHANGED');identities.add(model.statementId);concepts+=model.rows.length;totalBytes+=new TextEncoder().encode(stable(model)).length;if(concepts>PERIOD_REPORT_LIMITS.concepts||totalBytes>PERIOD_REPORT_LIMITS.bytes)periodReportFail('PERIOD_LIMIT');models[i]=model;});
  await all('recheck',async(item,i)=>{if(stable(await detail(item))!==stable(models[i]))periodReportFail('PERIOD_DETAIL_CHANGED');});await index();scope.throwIfAborted();
  const signature=stable({subject,range:base.range,items:base.items,models}),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature)))).map(n=>n.toString(16).padStart(2,'0')).join('');scope.throwIfAborted();
  const result=freeze({version:'payroll-period-report.v1',...base,subject,models,concepts,hash,totals:periodSourceTotals(models),officialReceipt:false,signatureApplied:false,payrollCalculated:false});trusted.add(result);return result;
 }catch(error){models.length=0;throw error;}finally{scope.removeEventListener('abort',rejectAbort);internal.abort();}
}
export async function revalidatePayrollPeriods(value,{request,signal}={}){
 const r=verifiedPeriodReport(value);signal.throwIfAborted();const p=await request('/api/internal-data?'+new URLSearchParams({resource:'employeepayrolldocuments',contractId:r.subject.contractId}),{signal});signal.throwIfAborted();
 if(p?.ok!==true)periodReportFail('PERIOD_READ_FAILED');if(stable(normalizeDocumentLibrary(p.data))!==stable(r.library))periodReportFail('PERIOD_LIBRARY_CHANGED');return true;
}
export function periodReportError(e){if([401,403].includes(e?.status))return 'El acceso ya no autoriza esta descarga. Se retiró el conjunto.';if(['AbortError','TimeoutError'].includes(e?.name))return 'Preparación interrumpida. No se descargó un informe parcial.';return({PERIOD_CATALOG_LIMITED:'El catálogo está limitado. No puede certificarse un informe completo desde esta consulta.',PERIOD_EMPTY:'No hay liquidaciones detalladas en este rango.',PERIOD_LIMIT:'El informe supera el límite de preparación. Acotá el rango de períodos.',PERIOD_LIBRARY_CHANGED:'Cambió la biblioteca o una versión de origen. Actualizá la consulta y volvé a preparar.',PERIOD_DETAIL_CHANGED:'Cambió el detalle o su fuente. No se descargó el conjunto.',PERIOD_DETAIL_MISSING:'Falta el detalle de una liquidación. No se omitió para completar el informe.',PERIOD_TEXT_UNSUPPORTED:'El PDF no puede representar fielmente un texto de origen. Usá Excel para conservarlo.'})[e?.code]??'No se pudo verificar el informe completo. No se descargó ningún archivo parcial.';}
