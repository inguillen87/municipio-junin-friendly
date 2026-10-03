import {schoolingReview,schoolingReviewSelection,schoolingReviewEnd,SCHOOLING_REVIEW_FILTERS} from './family-schooling-review-model.js';
import {schoolingReviewXlsx} from './family-schooling-review-export.js';
import {currentCivilDay,schoolingDate,schoolingRevision} from './family-schooling-model.js';
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const button=text=>{const e=node('button',text,'fs-button');e.type='button';return e;};
const PAGE=25;
export function mountSchoolingReview(host,{data,queriedAt,available,fresh,save,onInvalidated}){
 const details=node('details');details.dataset.fsReviewPanel='';details.className='fs-review';
 const summary=node('summary','Revisar ciclo lectivo y próximos vencimientos'),help=node('p','Revisá todos los registros consultados, aunque el listado principal tenga otra búsqueda. Las fechas históricas quedan por revisar; los avisos no aprueban escolaridad ni generan descuentos.','fs-note');
 const criteria=node('form',undefined,'fs-review-criteria'),fields={};
 for(const [key,label,type]of [['asOf','Comparar fechas al día','date'],['through','Avisos hasta (inclusive)','date'],['schoolYear','Ciclo lectivo a revisar','number']]){
  const l=node('label',label),input=node('input');input.type=type;input.required=true;input.dataset.fsReviewCriteria=key;
  if(type==='date'){input.min='1900-01-01';input.max='2100-12-31';}else{input.min='1900';input.max='2100';input.step='1';input.inputMode='numeric';}
  l.append(input);criteria.append(l);fields[key]=input;
 }
 fields.asOf.value=currentCivilDay();fields.through.value=schoolingReviewEnd(fields.asOf.value);fields.schoolYear.value=fields.asOf.value.slice(0,4);
 const run=button('Revisar escolaridad');run.type='submit';run.classList.add('primary');run.dataset.fsReviewRun='';criteria.append(run);
 const note=node('p','El día elegido sólo compara fechas de los registros consultados. No reconstruye un padrón histórico ni establece nuevos vencimientos. La ventana inicial de 30 días es un criterio de consulta que podés cambiar.','fs-note');
 const status=node('p','Elegí el ciclo y las fechas; después presioná Revisar escolaridad.','fs-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.dataset.fsReviewStatus='';
 const output=node('section');output.hidden=true;output.dataset.fsReviewOutput='';
 const counts=node('p',undefined,'fs-source'),filters=node('div',undefined,'fs-filters'),search=node('input'),filter=node('select');
 search.type='search';search.maxLength=100;search.autocomplete='off';search.dataset.fsReviewSearch='';
 filter.dataset.fsReviewFilter='';for(const [value,label]of Object.entries(SCHOOLING_REVIEW_FILTERS)){const option=node('option',label);option.value=value;filter.append(option);}
 for(const [label,input]of [['Buscar en la revisión',search],['Avisos de la revisión',filter]]){const l=node('label',label);l.append(input);filters.append(l);}
 const download=button('Descargar planilla de revisión');download.classList.add('primary');download.dataset.fsReviewExport='';filters.append(download);
 const list=node('div',undefined,'fs-review-list');list.dataset.fsReviewRows='';
 const nav=node('nav',undefined,'fs-pagination');nav.setAttribute('aria-label','Páginas de revisión escolar');const previous=button('Anterior'),next=button('Siguiente'),range=node('span');previous.dataset.fsReviewPrevious='';next.dataset.fsReviewNext='';nav.append(previous,range,next);
 output.append(counts,filters,list,nav);details.append(summary,help,criteria,note,status,output);host.replaceChildren(details);
 let review=null,selection=null,page=1,seq=0,controller=null,closed=false,busy=false,parentBusy=false;
 const valid=token=>!closed&&token===seq&&host.isConnected&&!document.hidden&&available();
 function controls(){
  for(const input of details.querySelectorAll('input,select,button'))input.disabled=closed||busy||parentBusy;
  download.disabled=closed||busy||parentBusy||!selection?.rows.length;
  previous.disabled=closed||busy||parentBusy||page<=1;next.disabled=closed||busy||parentBusy||!selection||page*PAGE>=selection.rows.length;
  details.setAttribute('aria-busy',String(busy));
 }
 function withdraw(message){seq++;controller?.abort();controller=null;busy=false;review=null;selection=null;list.replaceChildren();counts.textContent='';range.textContent='';output.hidden=true;status.textContent=message;controls();}
 function render(){
  selection=schoolingReviewSelection(review,{search:search.value,status:filter.value});const c=selection.counts,pages=Math.max(1,Math.ceil(c.records/PAGE));page=Math.min(page,pages);
  counts.textContent=c.records+' registros del filtro completo · '+c.contracts+' contratos · '+c.needsReview+' registros con avisos por revisar · '+c.observations+' avisos. '+(c.identityReview?c.identityReview+' coincidencias familiares se muestran sin contarlas como hijos distintos.':'Sin coincidencias familiares informadas.');
  range.textContent='Página '+page+' de '+pages+' · la planilla incluye '+c.records+' registros';
  list.replaceChildren(...selection.rows.slice((page-1)*PAGE,page*PAGE).map(item=>{
   const r=item.row,card=node('article',undefined,'fs-child');card.dataset.fsReviewRow='';
   card.append(node('h4',(r.employeeName??'Nombre no informado')+' · legajo '+r.legajo),node('p',r.familyName??'Hijo/a sin nombre informado'));
   card.append(node('p','Presentación: '+schoolingDate(item.dates.presentedOn)+' · Vencimiento: '+schoolingDate(item.dates.expiresOn,'Sin vencimiento informado')+' · Ciclo registrado: '+(r.certificate?.schoolYear??'Sin informar'),'fs-note'));
   card.append(node('p',item.dates.origin==='manual'?'Registro manual municipal'+(r.certificate.evidenceMode==='paper_declared'?' · presentación en papel declarada':' · PDF registrado'):item.dates.origin==='grh_source'?'Fechas históricas GRH · por revisar':'Sin fechas registradas aquí','fs-origin'));
   const notes=node('ul');for(const observation of item.observations){const li=node('li');li.append(node('strong',observation.label),node('p',observation.action));notes.append(li);}card.append(notes);
   const link=node('a',r.identityReviewRequired?'Abrir ficha para revisar el vínculo':'Abrir hijo y certificados','fs-link');
   link.href='internal-dashboard.html?contractId='+encodeURIComponent(r.contractId)+'&section=family&familyKind='+r.familyRef.kind+'&familyId='+encodeURIComponent(r.familyRef.id)+'#legajos';link.referrerPolicy='no-referrer';link.setAttribute('aria-label','Abrir certificados de '+(r.familyName??'hijo/a sin nombre informado')+', legajo '+r.legajo);card.append(link);return card;
  }));
  if(!selection.rows.length)list.append(node('p','No hay registros para estos criterios. Podés cambiar la búsqueda o el filtro.'));
  output.hidden=false;controls();
 }
 criteria.addEventListener('submit',event=>{
  event.preventDefault();if(closed||busy||parentBusy||!available())return;
  withdraw('Revisando los registros consultados…');
  try{review=schoolingReview(data,{asOf:fields.asOf.value,through:fields.through.value,schoolYear:Number(fields.schoolYear.value)});search.value='';filter.value='all';page=1;render();status.textContent='Revisión lista: ciclo '+review.criteria.schoolYear+', comparación al '+schoolingDate(review.criteria.asOf)+' y avisos hasta '+schoolingDate(review.criteria.through)+'. Revisá cada aviso en la ficha.';}
  catch(error){withdraw(error.message);}
 });
 for(const input of Object.values(fields))input.addEventListener('input',()=>withdraw('Los criterios cambiaron. Presioná Revisar escolaridad nuevamente antes de descargar.'));
 for(const input of [search,filter])input.addEventListener('input',()=>{if(review&&!busy&&!parentBusy){page=1;render();status.textContent='Filtro aplicado a toda la revisión. La planilla incluye todas sus páginas.';}});
 previous.addEventListener('click',()=>{if(review&&!busy&&!parentBusy){page--;render();}});next.addEventListener('click',()=>{if(review&&!busy&&!parentBusy){page++;render();}});
 download.addEventListener('click',async()=>{
  if(!review||!selection?.rows.length||busy||parentBusy||!available())return;
  const expected=review,chosen=selection,token=++seq;controller?.abort();controller=new AbortController();busy=true;controls();status.textContent='Comprobando acceso y versión antes de descargar…';
  try{
   const latest=await fresh(controller);if(!valid(token))return;
   if(schoolingRevision(latest)!==expected.sourceRevision)throw Error('El registro escolar cambió. Consultá el reporte y revisá nuevamente antes de descargar.');
   const bytes=schoolingReviewXlsx(expected,chosen,queriedAt);if(!valid(token))return;
   save(bytes,'municontrol_revision-escolar_'+expected.criteria.schoolYear+'_'+expected.criteria.asOf+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');status.textContent='Planilla descargada con '+chosen.rows.length+' registros del filtro completo. No se envió ningún aviso ni se modificó escolaridad.';
  }catch(error){if(!valid(token))return;withdraw(error.status===401||error.status===403?'Cambió el acceso. Se retiró la revisión escolar.':error.message||'No se pudo comprobar el registro. Consultá nuevamente.');onInvalidated(status.textContent);}
  finally{if(valid(token)){busy=false;controls();}}
 });
 function hidden(){if(document.hidden)withdraw('Se retiró la revisión al ocultar la página. Consultá el reporte nuevamente para continuar.');}
 document.addEventListener('visibilitychange',hidden);
 return {setBusy(value){parentBusy=Boolean(value);if(value&&busy)withdraw('Hay otra consulta en curso. Revisá nuevamente antes de descargar.');controls();},close(){if(closed)return;withdraw('');closed=true;data=null;queriedAt=null;document.removeEventListener('visibilitychange',hidden);host.replaceChildren();}};
}
