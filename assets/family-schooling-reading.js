import {openReadingSource} from './document-reader-source.js';
import {readRasterPage} from './document-ocr-client.js';
import {certificateInputFile} from './family-schooling-photo.js';
import {schoolingReading,schoolingReadingSelection,SCHOOL_READING_FIELDS} from './family-schooling-reading-model.js';
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const button=text=>{const e=node('button',text);e.type='button';e.className='fs-button';return e;};
export function mountSchoolingReading({host,input,fields,context,raster,onApplied,openSource=openReadingSource,recognize=readRasterPage}){
 const details=node('details');details.className='fs-reading';details.dataset.fsReading='';const summary=node('summary','Leer datos del archivo y revisar');
 const note=node('p','La lectura ocurre en este dispositivo. Revisá cada dato junto al original antes de usarlo. No identifica al hijo ni completa la presentación municipal. PDF estático de hasta 30 páginas; si no puede leerse, la carga manual sigue disponible.');note.className='fs-note';
 const start=button('Leer archivo seleccionado'),cancel=button('Cancelar lectura'),ocr=button('Leer imagen de esta página'),apply=button('Usar campos revisados');
 start.dataset.fsReadingStart='';cancel.dataset.fsReadingCancel='';ocr.dataset.fsReadingOcr='';apply.dataset.fsReadingApply='';apply.classList.add('primary');
 const status=node('p','Elegí una foto o PDF. Después podés leerlo y revisar sus campos.');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.dataset.fsReadingStatus='';
 const output=node('div'),pageLabel=node('label','Página a revisar'),page=node('select'),view=node('div'),proposals=node('div'),textDetails=node('details'),textTitle=node('summary','Texto leído de la página'),text=node('pre');
 output.dataset.fsReadingOutput='';output.hidden=true;page.dataset.fsReadingPage='';pageLabel.append(page);view.className='fs-reading-source';proposals.className='fs-reading-proposals';text.dataset.fsReadingText='';textDetails.append(textTitle,text);
 pageLabel.className='fs-reading-page';textDetails.className='fs-reading-transcript';output.append(pageLabel,view,ocr,textDetails,proposals,apply);details.append(summary,note,start,cancel,status,output);host.append(details);
 let source=null,selected=null,reading=null,baseline=null,seq=0,abort=null,busy=false,dead=false,target=null,file=null,canvas=null,choices=[];
 const state=()=>context(),allowed=()=>!dead&&host.isConnected&&!document.hidden&&state()?.allowed===true;
 const values=()=>Object.fromEntries(Object.keys(SCHOOL_READING_FIELDS).map(k=>[k,fields[k].value]));
 const valid=token=>allowed()&&token===seq&&target===state().key&&file===input.files[0];
 function controls(){start.disabled=!allowed()||busy;cancel.hidden=!source&&!busy;cancel.disabled=dead;page.disabled=!allowed()||busy;ocr.hidden=!selected||selected.method==='native';ocr.disabled=!allowed()||busy||!canvas;apply.disabled=!allowed()||busy||!reading||!choices.some(c=>c.input.checked);}
 function clear(message='Elegí una foto o PDF. Después podés leerlo y revisar sus campos.'){
  seq++;abort?.abort();abort=null;const old=source;source=null;if(old)Promise.resolve(old.destroy()).catch(()=>{});if(canvas)canvas.width=canvas.height=0;canvas=null;selected=null;reading=null;baseline=null;file=null;target=null;busy=false;choices=[];view.replaceChildren();proposals.replaceChildren();text.textContent='';page.replaceChildren();output.hidden=true;status.textContent=message;controls();
 }
 function proposalsFor(data){
  reading=schoolingReading(data);baseline=values();choices=[];proposals.replaceChildren();text.textContent=data.text;
  for(const field of reading.fields){const card=node('div');card.className='fs-reading-field';card.dataset.fsReadingField=field.key;card.append(node('h5',field.label));
   if(field.state==='suggested'){
    const label=node('label'),choice=node('input');choice.type='checkbox';choice.dataset.fsReadingConfirm=field.key;label.append(choice,node('span','Revisé este dato contra el original: '+field.value));card.append(label);choices.push({input:choice,key:field.key});choice.addEventListener('change',controls);
   }else card.append(node('p',field.state==='missing'?'No se encontró un valor explícito. Completalo manualmente si consta.':field.state==='conflict'?'Se leyeron valores distintos. Elegí el dato correcto manualmente.':'El texto no permite completar este campo. Verificalo en el original.'));
   for(const evidence of field.evidence){const quote=node('blockquote',evidence.quote);quote.append(node('small','Página '+data.page+' · '+(data.method==='ocr'?'lectura de imagen por revisar':'texto del PDF')));card.append(quote);}
   proposals.append(card);
  }
  controls();
 }
 async function render(token){
  const n=Number(page.value);reading=null;choices=[];proposals.replaceChildren();text.textContent='';if(canvas)canvas.width=canvas.height=0;view.replaceChildren();canvas=null;
  selected=source.pages[n-1];const picture=source.kind==='image'&&raster?raster():await source.render(n);if(!valid(token)){picture.width=picture.height=0;return;}canvas=picture;canvas.setAttribute('aria-label','Original seleccionado · página '+n);view.append(canvas);output.hidden=false;
  if(selected.method==='native')proposalsFor({sha256:source.sha256,page:n,text:selected.text,method:'native'});
  status.textContent=selected.method==='native'?'Texto del PDF disponible. Revisá los campos con su página antes de usarlos.':'Esta página necesita lectura de imagen. Presioná Leer imagen de esta página; luego revisá el resultado.';
 }
 start.addEventListener('click',async()=>{
  if(!allowed()||busy)return;clear();file=input.files[0];target=state().key;const token=++seq;abort=new AbortController();busy=true;controls();status.textContent='Abriendo el archivo en este dispositivo…';let opened;
  const operation=abort,timer=setTimeout(()=>operation.abort(),30000);
  try{certificateInputFile(file);opened=await openSource(file,{signal:operation.signal,onProgress:message=>{if(valid(token))status.textContent=message;}});if(!valid(token)){await opened.destroy();return;}source=opened;opened=null;for(const p of source.pages){const option=node('option','Página '+p.number);option.value=String(p.number);page.append(option);}page.value='1';await render(token);}
  catch(error){void opened?.destroy();if(valid(token))clear(error.name==='AbortError'?'La lectura se canceló. Podés completar los datos manualmente.':error.message||'No se pudo leer el archivo. Completá los datos manualmente.');}
  finally{clearTimeout(timer);if(valid(token)){busy=false;controls();}}
 });
 page.addEventListener('change',async()=>{if(!allowed()||busy||!source)return;const token=++seq;busy=true;controls();try{await render(token);}catch(error){if(valid(token))clear(error.message);}finally{if(valid(token)){busy=false;controls();}}});
 ocr.addEventListener('click',async()=>{
  if(!allowed()||busy||!canvas||!source||selected.method==='native')return;const token=++seq;busy=true;reading=null;choices=[];proposals.replaceChildren();text.textContent='';controls();status.textContent='Leyendo imagen en este dispositivo…';
  try{const result=await recognize(canvas,{sha256:source.sha256,page:Number(page.value),signal:abort.signal,onProgress:v=>{if(valid(token))status.textContent='Leyendo imagen · '+v+' %';}});if(!valid(token))return;proposalsFor({sha256:source.sha256,page:Number(page.value),text:result.text,method:'ocr',confidence:result.confidence});status.textContent='Lectura lista. Puede contener errores: compará los campos con la imagen antes de seleccionarlos.';}
  catch(error){if(valid(token)){status.textContent=error.name==='AbortError'?'Lectura cancelada. Los campos manuales se conservan.':error.message;}}
  finally{if(valid(token)){busy=false;controls();}}
 });
 apply.addEventListener('click',()=>{
  if(!allowed()||busy||!reading||!valid(seq))return;
  try{const chosen=schoolingReadingSelection(reading,choices.filter(c=>c.input.checked).map(c=>c.key),{currentHash:source.sha256,currentValues:values(),baseline});for(const [key,value]of Object.entries(chosen))fields[key].value=value;onApplied();baseline=values();for(const c of choices)c.input.checked=false;status.textContent='Se completaron '+Object.keys(chosen).length+' campos revisados. Verificá la presentación municipal y el resto del formulario antes de Guardar certificado.';controls();}
  catch(error){status.textContent=error.message;}
 });
 const changed=()=>clear('El archivo o su vista cambiaron. Leelo nuevamente antes de usar campos.');input.addEventListener('change',changed);cancel.addEventListener('click',()=>clear('Lectura cancelada. El archivo y los campos manuales se conservan.'));
 const hidden=()=>{if(document.hidden)clear('Se retiró la lectura al ocultar la página. Leé el archivo nuevamente para continuar.');};document.addEventListener('visibilitychange',hidden);
 controls();return{clear,update(){if(source||busy){if(!allowed()||target!==state().key||file!==input.files[0])clear('La carga o el permiso cambiaron. Se retiró la lectura; los datos manuales se conservan.');}controls();},destroy(){if(dead)return;clear('');dead=true;input.removeEventListener('change',changed);document.removeEventListener('visibilitychange',hidden);details.remove();}};
}
