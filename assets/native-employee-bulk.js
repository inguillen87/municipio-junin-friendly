// Altas por archivo: una sola revisión y un solo botón para crear varios legajos con la cuenta de quien tiene el permiso.
// Cada legajo se crea con el mismo servicio y el mismo contrato que el alta individual, uno por vez y con su propia clave.
import {employeeCreationBootstrap,employeeScopeKey,employeeReceipt} from './native-employee-confirmation-model.js';
import {employeeBulkRows} from './native-employee-bulk-model.js';
const URL_API='/api/internal-native-employees';
const node=(tag,text,cls)=>{const element=document.createElement(tag);if(text!=null)element.textContent=text;if(cls)element.className=cls;return element;};
async function call(resource,body,key,scopeKey){
 const options={method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json'}};
 if(scopeKey)options.headers['X-MuniControl-Employee-Scope']=scopeKey;
 if(body){options.headers['Content-Type']='application/json';options.headers['Idempotency-Key']=key;options.body=JSON.stringify(body);}
 const response=await fetch(URL_API+(resource?'?'+new URLSearchParams(resource):''),options);let result=null;
 try{result=await response.json();}catch{}
 if(!response.ok||!result?.ok)throw Object.assign(Error(result?.error||'No se recibió una confirmación válida.'),{status:response.status,definite:response.status>=400&&response.status<500&&response.status!==408&&response.status!==429});
 return result.data;
}
export function mountEmployeeBulk(anchor){
 if(!anchor||anchor.dataset.employeeBulkMounted)return;anchor.dataset.employeeBulkMounted='true';
 const open=node('button','Altas desde archivo','button');open.type='button';open.hidden=anchor.hidden;anchor.after(' ',open);
 new MutationObserver(()=>{open.hidden=anchor.hidden;}).observe(anchor,{attributes:true,attributeFilter:['hidden']});
 const dialog=node('dialog',null,'native-employee-dialog native-employee-bulk');dialog.setAttribute('aria-labelledby','neb-title');
 const heading=node('header',null,'ne-heading'),title=node('h2','Altas desde archivo');title.id='neb-title';
 heading.append(node('p','Personas · varias altas'),title,node('span','Elegí el archivo de altas preparado para MuniControl. Vas a ver cada legajo antes de crear nada; después se crean todos con un solo botón.'));
 const feedback=node('div','Elegí el archivo.','ne-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 const picker=node('input');picker.type='file';picker.accept='.json,application/json';picker.setAttribute('aria-label','Archivo de altas');
 const table=node('table',null,'neb-table'),actions=node('div',null,'ne-actions'),confirm=node('button','Dar de alta','button primary'),close=node('button','Cerrar','button'),x=node('button','×','ne-close');
 confirm.type=close.type=x.type='button';confirm.hidden=true;x.setAttribute('aria-label','Cerrar altas desde archivo');actions.append(confirm,close);
 dialog.append(heading,feedback,picker,table,actions,x);document.body.append(dialog);
 let context=null,rows=[],busy=false,created=0;
 const say=(text,error=false)=>{feedback.textContent=text;feedback.dataset.error=String(error);};
 const draw=()=>{
  table.replaceChildren();if(!rows.length)return;
  const head=node('tr');for(const label of ['Legajo','Apellido y nombres','DNI','Ingreso','Convenio y categoría','Sector y repartición','Estado'])head.append(node('th',label));
  table.append(node('thead')).append(head);const body=table.appendChild(node('tbody'));
  for(const row of rows){const tr=node('tr');const d=row.draft;
   for(const text of d?[d.legajo||'Automático',d.fullName,d.dni,d.startDate.split('-').reverse().join('/'),row.labels.agreement+' · '+row.labels.category,row.labels.organization+' · '+row.labels.sector]:[row.legajo||'—',row.name||'Fila '+(row.index+1),'—','—','—','—'])tr.append(node('td',text));
   const state=node('td',row.state||(row.error?'No se puede crear: '+row.error:'Listo para crear'));state.dataset.state=row.result||(row.error?'error':'ready');tr.append(state);body.append(tr);}
 };
 const ready=()=>rows.filter(row=>row.draft&&!row.result);
 const refresh=()=>{const count=ready().length;confirm.hidden=!count;confirm.disabled=busy;picker.disabled=busy;confirm.textContent=count===1?'Dar de alta 1 legajo':'Dar de alta '+count+' legajos';};
 async function load(){
  rows=[];draw();refresh();const file=picker.files?.[0];if(!file)return;
  try{context=employeeCreationBootstrap(await call({resource:'bootstrap'}));
   if(context.canCreate!==true){say('Tu cuenta no tiene permiso para dar de alta legajos.',true);return;}
   rows=employeeBulkRows(await file.text(),context);draw();refresh();
   const bad=rows.filter(row=>row.error).length;say(bad?rows.length-bad+' de '+rows.length+' legajos listos. Los que tienen error no se crean; corregí el archivo o cargalos con «Nuevo legajo».':'Revisá los '+rows.length+' legajos. Al confirmar se crean la persona y el contrato de cada uno.',bad>0);
  }catch(error){rows=[];draw();refresh();say(error?.message||'No se pudo leer el archivo.',true);}
 }
 async function createAll(){
  if(busy||!context)return;busy=true;refresh();const scopeKey=employeeScopeKey(context.scope);
  for(const row of ready()){
   const key=crypto.randomUUID(),body={draft:{...row.draft},catalogVersion:context.catalog.version};row.state='Creando…';draw();say('Creando '+row.draft.fullName+'…');
   try{let receipt;
    try{receipt=await call(null,body,key,scopeKey);}
    catch(error){if(error.definite)throw error;await new Promise(done=>setTimeout(done,2500));receipt=await call({resource:'attempt',key},null,null,scopeKey);}
    try{receipt=employeeReceipt(receipt,row.draft);}catch{throw Object.assign(Error('La confirmación no coincide con el alta revisada.'),{definite:false});}
    row.result='done';row.state='Creado · legajo '+receipt.legajo;created++;
   }catch(error){
    if(error.definite){row.result='error';row.state='No se creó: '+error.message;}
    else{row.state='Sin confirmación. Referencia del intento: '+key;draw();say('No se pudo confirmar un alta. No se envió ninguna más: verificá ese legajo en Personas antes de continuar.',true);busy=false;refresh();confirm.hidden=true;return;}
   }
   draw();
  }
  busy=false;refresh();const failed=rows.filter(row=>row.result==='error').length;
  say(created+(created===1?' legajo creado.':' legajos creados.')+(failed?' '+failed+' no se crearon: mirá el motivo en cada fila.':' Ya figuran en Personas; el alta no genera haberes ni novedades.'),failed>0);
  if(created)document.dispatchEvent(new CustomEvent('mc:native-employee-created',{detail:{bulk:true,count:created}}));
 }
 open.addEventListener('click',()=>{rows=[];created=0;picker.value='';draw();refresh();say('Elegí el archivo.');dialog.showModal();});
 picker.addEventListener('change',load);confirm.addEventListener('click',createAll);
 for(const button of [close,x])button.addEventListener('click',()=>{if(!busy)dialog.close();});
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
}
if(typeof document!=='undefined')mountEmployeeBulk(document.querySelector('[data-employee-create]'));
