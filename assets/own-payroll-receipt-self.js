import {salarySerialized} from './native-salary-catalog-model.js';
import {ownRunWorkspaceAccess,hasOwnRunAccess,formatOwnRunDecimal} from './own-payroll-run-workspace-model.js';
import {OWN_RECEIPT_SELF,OWN_RECEIPT_MAX_BYTES,ownReceiptSelf,ownReceiptType} from './own-payroll-receipt-model.js';
import {createOwnReceiptPdf,saveOwnReceiptPdf} from './own-payroll-receipt-pdf.js';
import {receiptStyles} from './own-payroll-receipt-panel.js';
import {countWords} from './count-words.js';
export async function readOwnReceiptJson(response,maxBytes=OWN_RECEIPT_MAX_BYTES){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error('El límite de lectura de recibos no es válido.');
 if(!response?.body||typeof response.body.getReader!=='function')throw Error('No se verificó la respuesta.');
 const reader=response.body.getReader(),parts=[];let total=0,combined=null;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   if(!(value instanceof Uint8Array))throw Error('No se verificó la respuesta.');
   total+=value.byteLength;
   parts.push(value);
   if(total>maxBytes)throw Error('El conjunto completo supera la capacidad.');
  }
  combined=new Uint8Array(total);let offset=0;
  for(const part of parts){combined.set(part,offset);offset+=part.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(combined));}
  catch{throw Error('No se verificó la respuesta.');}
 }finally{
  combined?.fill(0);
  for(const part of parts)part.fill(0);
  try{await reader.cancel();}catch{}
  reader.releaseLock();
 }
}

export function mountOwnReceiptSelf(host,{auth}={}){
 const initial=ownRunWorkspaceAccess(auth);if(!hasOwnRunAccess(initial.caps,OWN_RECEIPT_SELF))return null;receiptStyles();host.hidden=false;host.className='own-receipt';
 host.innerHTML='<header><p>AUTOGESTIÓN · MUNIControl</p><h2>Mis recibos propios</h2><p>Recibos revisados del contrato vinculado a tu cuenta. Firma digital pendiente; la fecha declarada no acredita pago.</p></header><p data-self-receipt-status role="status" aria-live="polite">Presioná Consultar para verificar tu vínculo y los documentos disponibles.</p><button class="button primary" type="button" data-self-receipt-consult>Consultar mis recibos</button><ul data-self-receipt-list></ul>';
 const $=k=>host.querySelector('[data-self-receipt-'+k+']');let seq=0,busy=false,closed=false,controller,view;const live=()=>!closed&&!document.hidden&&host.isConnected;
 function clear(message){seq++;controller?.abort();busy=false;view=null;$('list').replaceChildren();$('status').textContent=message;$('consult').disabled=!live();host.setAttribute('aria-busy','false');}
 async function request(url){
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
  const value=await readOwnReceiptJson(r,OWN_RECEIPT_MAX_BYTES);
  if(!r.ok)throw Error(value?.error??'Tu sesión o vínculo no permite esta consulta.');
  return value;
 }
 async function session(){const access=ownRunWorkspaceAccess(await request('/api/internal-auth'));if(access.key!==initial.key||!hasOwnRunAccess(access.caps,OWN_RECEIPT_SELF))throw Error('Cambió la cuenta o sus permisos. Volvé a abrir el Centro de acciones.');}
 async function load(){const response=await request('/api/internal-own-payroll-receipts?resource=self');if(response.ok!==true)throw Error('No se verificaron tus documentos.');return ownReceiptSelf(response.data);}
 async function perform(work){if(!live()||busy)return;const version=++seq;busy=true;controller=new AbortController();const timer=setTimeout(()=>controller?.abort(),60000);$('consult').disabled=true;host.setAttribute('aria-busy','true');try{await session();await work(()=>version===seq&&live());}catch(error){if(version===seq&&live())clear(error.message);}finally{clearTimeout(timer);if(version===seq){busy=false;controller=null;$('consult').disabled=!live();host.setAttribute('aria-busy','false');}}}
 function render(){ $('list').replaceChildren();for(const [index,item]of view.items.entries()){const li=document.createElement('li'),description=document.createElement('p'),button=document.createElement('button');description.textContent=`${item.source.period} · ${ownReceiptType(item.source.type)} · Legajo ${item.record.employeeNumber} · Neto ${formatOwnRunDecimal(item.record.totals.net)} · Fecha declarada: ${item.params.paymentDate??'No informada'}.`;button.type='button';button.className='button';button.textContent='Descargar mi copia para revisión';button.dataset.selfReceiptDownload=String(index);button.addEventListener('click',()=>perform(async valid=>{const original=item,fresh=await load(),selected=fresh.items.findIndex(v=>v.batchId===original.batchId&&v.source.id===original.source.id);if(selected<0||salarySerialized(fresh.items[selected])!==salarySerialized(original))throw Error('La disponibilidad cambió. Volvé a consultar.');const pdf=await createOwnReceiptPdf(fresh,{self:true,index:selected,signal:controller.signal}),final=await load();await session();if(!valid()||!final.items.some(v=>salarySerialized(v)===salarySerialized(original))){pdf.bytes.fill(0);throw Error('La disponibilidad cambió durante la descarga. Se retiró el PDF.');}saveOwnReceiptPdf(pdf,'mi-recibo-propio-'+original.source.period+'-revision.pdf');}));li.append(description,button);$('list').append(li);}$('status').textContent=view.items.length?`${countWords(view.items.length,'recibo propio revisado','recibos propios revisados')}. Firma digital pendiente.`:'No hay recibos propios revisados disponibles para tu contrato. No se presume una liquidación en cero.';}
 $('consult').addEventListener('click',()=>perform(async valid=>{const value=await load();await session();if(valid()){view=value;render();}}));const hidden=()=>{if(document.hidden)clear('Se retiraron tus recibos al ocultar la pantalla. Volvé a consultar.');else $('consult').disabled=!live();},revoke=e=>{if(!hasOwnRunAccess(new Set(e.detail?.tenantCapabilities??[]),OWN_RECEIPT_SELF))clear('Se retiraron los recibos por un cambio de permisos.');};
 function close(){closed=true;clear('Se retiraron tus recibos. Volvé a abrir el Centro de acciones.');document.removeEventListener('visibilitychange',hidden);document.removeEventListener('municontrol:capabilities-ready',revoke);window.removeEventListener('pagehide',close);document.getElementById('logoutButton')?.removeEventListener('click',close);}
 document.addEventListener('visibilitychange',hidden);document.addEventListener('municontrol:capabilities-ready',revoke);window.addEventListener('pagehide',close);document.getElementById('logoutButton')?.addEventListener('click',close);return {close,ownOnly:!initial.caps.has('workforce.employee.read')};
}
