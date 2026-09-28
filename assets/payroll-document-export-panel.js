// Explicit, read-only download of the complete selected population; no receipt issuance.
import {mountDocumentPaymentField} from './payroll-document-payment-field.js';
import {documentPaymentDateLines} from './payroll-document-payment-date.js';
import {verifyBatchPreview} from './payroll-document-batch-model.js';
import {collectPayrollDocuments,revalidateDocumentCollection,COLLECTION_LIMITS,collectionErrorMessage} from './payroll-document-collection.js';
import {createPayrollDocumentSetPdfAsync} from './payroll-document-set-pdf.js';
export function mountPayrollDocumentExport(host,{preview,request,canRead}={}){
 const baseline=structuredClone(verifyBatchPreview(preview)),doc=host.ownerDocument;
 const element=(tag,text,cls)=>{const e=doc.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const box=element('section',null,'pdb-package');box.dataset.documentPackage='';
 const heading=element('h3','PDF de toda la selección'),note=element('p',baseline.counts.selected+' documentos del rango, no sólo los de esta página. Cada documento conserva todos sus conceptos y su referencia de origen.','pdb-hint');
 const actions=element('div',null,'pdb-tools'),start=element('button','Preparar y descargar PDF conjunto','pdb-primary'),cancel=element('button','Cancelar preparación');
 start.type=cancel.type='button';cancel.hidden=true;actions.append(start,cancel);
 const status=element('p','Se verificará nuevamente la selección antes de descargar.','pdb-package-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const progress=element('progress');progress.hidden=true;progress.max=100;progress.setAttribute('aria-label','Preparación del PDF conjunto');
 const reason=!baseline.counts.selected?'No hay documentos en estos rangos.':baseline.counts.review?'Hay '+baseline.counts.review+' vínculos por revisar. Corregí la identificación o acotá los rangos; no se omitirán personas para producir un archivo parcial.':null;
 if(reason)status.textContent=reason;
 box.append(heading,note,actions,progress,status,element('p','PDF informativo · No acredita pago ni emisión oficial. Este circuito no aplica ni modifica firmas digitales.','pdb-hint'));host.append(box);
 let active=true,job=null;const current=()=>active&&box.isConnected&&canRead()&&!box.closest('[hidden]');
 function controls(){start.disabled=Boolean(reason)||!current()||Boolean(job);cancel.hidden=!job;box.setAttribute('aria-busy',String(Boolean(job)));}
 function report(p){if(!current()||!job)return;const labels={population:'Verificando la población completa',details:'Leyendo documentos',recheck:'Revisando nuevamente cada documento',pdf:'Construyendo el PDF'};
  status.textContent=(labels[p.phase]??'Verificando')+' · '+p.done+' de '+p.total+'. No se descargan archivos parciales.';progress.value=p.total?Math.round(p.done/p.total*100):0;}
 function cancelJob(){const old=job;job=null;old?.abort();progress.hidden=true;controls();}
 const dateField=mountDocumentPaymentField(box,{selectionHash:baseline.selectionHash,onChange:()=>{cancelJob();status.textContent=reason??'Fecha declarada modificada. Se retiró la preparación anterior; volvé a generar el PDF con estos datos.';}});box.insertBefore(box.querySelector('[data-document-payment-date]'),actions);
 cancel.onclick=()=>{cancelJob();status.textContent='Preparación cancelada. No se descargó un PDF parcial. Los rangos permanecen disponibles para reintentar.';start.focus({preventScroll:true});};
 start.onclick=async()=>{
  if(job||reason||!current())return;
  let paymentDeclaration;try{paymentDeclaration=dateField.capture();}catch(error){status.textContent=error.message;return;}
  const controller=new AbortController();job=controller;const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(COLLECTION_LIMITS.deadlineMs)]);
  const valid=()=>{signal.throwIfAborted();if(!current()||job!==controller||!dateField.matches(paymentDeclaration))throw new DOMException('Selection no longer active','AbortError');};
  const read=async(url,options)=>{valid();const result=await request(url,options);valid();return result;};
  const scopedProgress=p=>{valid();report(p);};
  progress.hidden=false;progress.value=0;status.textContent='Comprobando todos los documentos del rango…';controls();let artifact=null;
  try{
   const collection=await collectPayrollDocuments({preview:baseline,request:read,signal,progress:scopedProgress});valid();
   artifact=await createPayrollDocumentSetPdfAsync(collection,{signal,progress:scopedProgress,paymentDeclaration});valid();
   status.textContent='PDF completo. Comprobando el acceso y la selección antes de descargar…';
   await revalidateDocumentCollection(collection,{request:read,signal});valid();
   const blob=new Blob([artifact.bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),link=element('a');
   link.href=url;link.download=artifact.filename;doc.body.append(link);
   try{valid();link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
   status.textContent='PDF conjunto descargado · '+artifact.documents+' documentos · '+artifact.concepts+' conceptos · '+artifact.pages+' páginas. Incluye todo el rango revisado.'+(paymentDeclaration.date?' '+documentPaymentDateLines(paymentDeclaration)[0]+'.':'');
  }catch(error){if(active&&job===controller&&box.isConnected){status.textContent=collectionErrorMessage(error);}}
  finally{artifact?.bytes.fill(0);artifact=null;if(job===controller){job=null;controller.abort();progress.hidden=true;controls();}}
 };
 controls();return{destroy(){if(!active)return;active=false;cancelJob();dateField.destroy();start.onclick=cancel.onclick=null;box.remove();}};
}
