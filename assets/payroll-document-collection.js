// Prepare one complete informational PDF through the existing authorized readers.
// No issuance, signature, publication, payment or database mutation.
import {verifyBatchPreview,stableBatchValue,batchUuid} from './payroll-document-batch-model.js';
import {capturePayrollDetailSelection,verifyPayrollDetailSelection} from './payroll-detail-selection.js';
import {createPayrollDetailModel} from './payroll-detail-model.js';
export const COLLECTION_LIMITS=Object.freeze({people:2000,concepts:50000,bytes:32*1024*1024,deadlineMs:300000,concurrency:3});
const completed=new WeakSet();
const fail=code=>{throw Object.assign(Error(code),{code});};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableBatchValue(value))))).map(b=>b.toString(16).padStart(2,'0')).join('');
const scopeOf=p=>stableBatchValue(Object.fromEntries(Object.entries(p).filter(([k])=>!['rows','pagination'].includes(k))));
export function verifiedDocumentCollection(value){if(!completed.has(value))fail('COLLECTION_NOT_VERIFIED');return value;}
export async function collectPayrollDocuments({preview,request,signal,progress=()=>{}}={}){
 const baseline=structuredClone(verifyBatchPreview(preview));
 if(typeof request!=='function'||typeof progress!=='function'||!signal?.throwIfAborted)fail('COLLECTION_INPUT_INVALID');
 signal.throwIfAborted();
 if(!baseline.counts.selected)fail('COLLECTION_EMPTY');
 if(baseline.counts.review||baseline.counts.eligible!==baseline.counts.selected)fail('COLLECTION_IDENTITY_REVIEW');
 if(baseline.counts.selected>COLLECTION_LIMITS.people)fail('COLLECTION_LIMIT');
 const internal=new AbortController(),scope=AbortSignal.any([signal,internal.signal,AbortSignal.timeout(COLLECTION_LIMITS.deadlineMs)]);
 let rejectAbort;const interrupted=new Promise((_,reject)=>{rejectAbort=()=>reject(scope.reason??Error('COLLECTION_CANCELLED'));scope.addEventListener('abort',rejectAbort,{once:true});});
 // Every wait races cancellation; an injected or delayed reader cannot resurrect the result.
 async function read(url){scope.throwIfAborted();const result=await Promise.race([Promise.resolve().then(()=>request(url,{signal:scope})),interrupted]);scope.throwIfAborted();if(result?.ok!==true)fail('COLLECTION_READ_FAILED');return result.data;}
 const expected=scopeOf(baseline),pageSize=50,pages=Math.ceil(baseline.counts.selected/pageSize);
 const selectionUrl=page=>'/api/internal-data?'+new URLSearchParams({resource:'payrolldocumentbatch',datasetId:baseline.dataset.id,...baseline.filters,page:String(page),limit:String(pageSize),selectionHash:baseline.selectionHash});
 async function population(){
  const rows=[],numbers=new Set(),contracts=new Set();
  for(let page=1;page<=pages;page++){
   scope.throwIfAborted();progress({phase:'population',done:page-1,total:pages});const p=verifyBatchPreview(await read(selectionUrl(page)));
   if(scopeOf(p)!==expected||p.pagination.page!==page||p.pagination.limit!==pageSize)fail('COLLECTION_SELECTION_CHANGED');
   for(const row of p.rows){
    if(row.state!=='ready'||numbers.has(row.number)||contracts.has(row.contractId))fail('COLLECTION_IDENTITY_REVIEW');
    numbers.add(row.number);contracts.add(row.contractId);rows.push(row);
   }
  }
  if(rows.length!==baseline.counts.selected)fail('COLLECTION_SELECTION_CHANGED');
  const calculated=await digest({tenantId:baseline.tenantId,dataset:baseline.dataset,directory:baseline.directory,filters:baseline.filters,rows});
  scope.throwIfAborted();if(calculated!==baseline.selectionHash)fail('COLLECTION_SELECTION_CHANGED');return rows;
 }
 const selected=capturePayrollDetailSelection({datasetId:baseline.dataset.id,payrollDate:baseline.dataset.date,payrollType:baseline.dataset.type,sourcePeriod:baseline.dataset.period,sourceMonth:baseline.dataset.month});
 const details=[],identities=new Set();let totalConcepts=0,totalBytes=0;
 async function detail(person){
  const query=new URLSearchParams({resource:'employeepayrolldetail',contractId:person.contractId,date:selected.date,type:selected.type,period:String(selected.period),month:String(selected.month)});
  const raw=await read('/api/internal-data?'+query);
  if(raw?.found!==true||raw.available!==true)fail('COLLECTION_DETAIL_MISSING');verifyPayrollDetailSelection(raw,selected);
  if(raw.sourceHash!==baseline.dataset.sourceHash||raw.closureStatus!==baseline.dataset.closureStatus||!batchUuid(raw.statementId))fail('COLLECTION_DETAIL_CHANGED');
  // Preserve every original concept; only the verified directory supplies the display name.
  return createPayrollDetailModel(raw,{contractId:person.contractId,name:person.name,legajo:person.number});
 }
 async function eachPerson(people,phase,visit){
  let cursor=0,done=0;
  const work=async()=>{while(cursor<people.length){scope.throwIfAborted();const index=cursor++;await visit(people[index],index);scope.throwIfAborted();progress({phase,done:++done,total:people.length});}};
  await Promise.race([Promise.all(Array.from({length:Math.min(COLLECTION_LIMITS.concurrency,people.length)},work)),interrupted]);
 }
 try{
  const people=await population();progress({phase:'details',done:0,total:people.length});
  await eachPerson(people,'details',async(person,index)=>{
   const model=await detail(person);if(identities.has(model.statementId))fail('COLLECTION_DETAIL_CHANGED');identities.add(model.statementId);
   totalConcepts+=model.rows.length;totalBytes+=new TextEncoder().encode(stableBatchValue(model)).length;
   if(totalConcepts>COLLECTION_LIMITS.concepts||totalBytes>COLLECTION_LIMITS.bytes)fail('COLLECTION_LIMIT');details[index]=model;
  });
  // Re-read every document: matching totals or an unchanged display filter are insufficient.
  await eachPerson(people,'recheck',async(person,index)=>{
   if(stableBatchValue(await detail(person))!==stableBatchValue(details[index]))fail('COLLECTION_DETAIL_CHANGED');
  });
  const finalPeople=await population();if(stableBatchValue(finalPeople)!==stableBatchValue(people))fail('COLLECTION_SELECTION_CHANGED');
  scope.throwIfAborted();const value=freeze({version:'payroll-document-collection.v1',preview:baseline,people,models:details,concepts:totalConcepts,officialReceipt:false,signatureApplied:false,paymentDate:null});
  completed.add(value);return value;
 }catch(error){details.length=0;throw error;}finally{scope.removeEventListener('abort',rejectAbort);internal.abort();}
}
// Last access check after PDF construction, immediately before handing bytes to the download.
export async function revalidateDocumentCollection(value,{request,signal}={}){
 const c=verifiedDocumentCollection(value);signal.throwIfAborted();
 const q=new URLSearchParams({resource:'payrolldocumentbatch',datasetId:c.preview.dataset.id,...c.preview.filters,page:'1',limit:'50',selectionHash:c.preview.selectionHash});
 const response=await request('/api/internal-data?'+q,{signal});signal.throwIfAborted();
 if(response?.ok!==true)fail('COLLECTION_READ_FAILED');const p=verifyBatchPreview(response.data);
 if(scopeOf(p)!==scopeOf(c.preview)||p.pagination.page!==1||p.pagination.limit!==50||stableBatchValue(p.rows)!==stableBatchValue(c.people.slice(0,50)))fail('COLLECTION_SELECTION_CHANGED');return true;
}
export function collectionErrorMessage(error){
 if([401,403].includes(error?.status))return 'La sesión ya no autoriza la descarga. Se retiró el paquete completo.';
 if(['AbortError','TimeoutError'].includes(error?.name))return 'Preparación interrumpida. No se descargaron documentos parciales; podés reintentar la selección.';
 const messages={COLLECTION_EMPTY:'No hay legajos en la selección.',COLLECTION_IDENTITY_REVIEW:'Hay vínculos sin resolver. Revisalos o acotá el rango; no se omitirán agentes para generar un PDF parcial.',COLLECTION_LIMIT:'El conjunto supera el límite de esta preparación. Acotá el rango de legajos y reintentá.',COLLECTION_DETAIL_MISSING:'Un documento no tiene detalle disponible. No se generó un paquete parcial.',COLLECTION_SELECTION_CHANGED:'Cambió la selección o el padrón. Aplicá nuevamente los rangos antes de generar.',COLLECTION_DETAIL_CHANGED:'Cambió un documento o su fuente durante la revisión. No se descargó el paquete.',COLLECTION_TEXT_UNSUPPORTED:'Un texto del origen no se puede representar fielmente en este PDF. No se reemplazó ni omitió.'};
 return messages[error?.code]??'No se pudo preparar el conjunto completo. No se descargaron archivos parciales.';
}
