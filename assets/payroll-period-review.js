// Explicit multi-period review, separate from receipt issuance and signature.
import {collectPayrollPeriods,periodReportSelection,periodReportError,PERIOD_REPORT_LIMITS} from './payroll-period-collection.js';
import {money} from './payroll-detail-model.js';
const titles={'993':'Remunerativos','994':'No remunerativos','995':'Asignaciones','996':'Descuentos','990':'Contribuciones patronales','999':'Neto informado',technical:'Totales y bases',unclassified:'Sin clasificación'};
function amount(v){if(v===null)return 'No informado';const n=BigInt(v.replace('.','')),a=n<0n?-n:n;return(n<0n?'− ':'')+'$ '+new Intl.NumberFormat('es-AR').format(a/100n)+','+String(a%100n).padStart(2,'0');}
export function mountPayrollPeriodReview(host,{library,range,employee,request,canRead}={}){
 const doc=host.ownerDocument,add=(tag,text,parent=host)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;parent.append(e);return e;};
 host.className='pdl-period-review';host.dataset.periodReview='';const title=add('h4','Informe completo de los períodos seleccionados');let reason='',selected;
 try{selected=periodReportSelection(library,range);}catch(e){reason=periodReportError(e);}
 add('p',selected?selected.items.length+' liquidaciones del legajo '+employee.legajo+'. Se consultan todas las páginas del rango; cada corrida conserva su fecha y fuente.':reason).className='pdl-help';
 const bar=add('div');bar.className='pdl-review-actions';const start=add('button','Consultar todos los conceptos del rango',bar),cancel=add('button','Cancelar preparación',bar);start.type=cancel.type='button';start.className=cancel.className='pdl-button';cancel.hidden=true;
 const status=add('p',reason||'La consulta no cambia haberes ni registra un pago.');status.setAttribute('role','status');status.dataset.periodStatus='';
 const progress=add('progress');progress.max=100;progress.hidden=true;progress.setAttribute('aria-label','Consulta de liquidaciones del rango');const result=add('div');result.dataset.periodResult='';
 let active=true,job=null,report=null,revision=0,page=1;
 const alive=()=>active&&host.isConnected&&canRead()&&!doc.hidden&&!host.closest('[hidden]');
 function controls(){start.disabled=Boolean(reason)||Boolean(job)||!alive();cancel.hidden=!job;host.setAttribute('aria-busy',String(Boolean(job)));}
 function clear(message){revision++;job?.abort();job=null;report=null;progress.hidden=true;result.replaceChildren();status.textContent=message;controls();}
 function table(parent,headers,label){const wrap=add('div',undefined,parent);wrap.className='pdl-review-table';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',label);const table=add('table',undefined,wrap),head=add('tr',undefined,add('thead',undefined,table));for(const name of headers)add('th',name,head).scope='col';return add('tbody',undefined,table);}
 function render(r){
  result.replaceChildren();add('p','Suma de totales informados, no un nuevo cálculo salarial. Un total faltante en una corrida impide informar su suma; no se convierte en cero.',result).className='pdl-help';
  const totals=add('dl',undefined,result);totals.className='pdl-review-totals';for(const code of ['993','994','995','996','990','999']){const box=add('div',undefined,totals);add('dt',titles[code],box);const value=add('dd',amount(r.totals[code]),box);value.dataset.periodTotal=code;}
  add('p','Contribuciones patronales separadas: no se restan otra vez del neto. Documentos informativos, sin firma aplicada.',result).className='pdl-help';
  const summary=table(result,['Período origen','Fecha liquidación','Tipo','Estado fuente','Conceptos','Remunerativos','No remunerativos','Asignaciones','Descuentos','Contribuciones','Neto'],'Totales por liquidación, tabla desplazable');
  for(const m of r.models){const tr=add('tr',undefined,summary);for(const v of [m.period,m.date,m.payrollType,{closed:'Cierre informado',open:'Abierta',unknown:'No informado'}[m.closureStatus],m.rows.length,...['993','994','995','996','990','999'].map(code=>amount(m.totals[code]??null))])add('td',String(v),tr);}
  const details=add('details',undefined,result);details.open=true;add('summary','Todos los conceptos del rango · '+r.concepts,details);
  const label=add('label','Buscar código o descripción',details),search=add('input',undefined,label);search.type='search';search.maxLength=120;search.setAttribute('aria-label','Buscar conceptos en todo el rango');
  const count=add('p','',details);count.setAttribute('role','status');const rowsHost=add('div',undefined,details),nav=add('nav',undefined,details);nav.setAttribute('aria-label','Páginas de conceptos del rango');nav.className='pdl-review-actions';
  const flat=r.models.flatMap((m,index)=>m.rows.map(line=>({model:m,index,line}))),fold=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function draw(){if(!alive()||report!==r)return;const q=fold(search.value.trim()),rows=flat.filter(x=>!q||fold(x.line.code+' '+x.line.description).includes(q)),pages=Math.max(1,Math.ceil(rows.length/50));page=Math.min(page,pages);rowsHost.replaceChildren();nav.replaceChildren();count.textContent=rows.length+' de '+r.concepts+' conceptos del rango. La búsqueda no cambia los totales informados.';
   const body=table(rowsHost,['Período','Fecha','Tipo','Código','Descripción original','Grupo','Cantidad','Importe','Fuente'], 'Conceptos de todos los períodos, tabla desplazable');
   for(const {model:m,line:l,index}of rows.slice((page-1)*50,page*50)){const tr=add('tr',undefined,body);for(const v of [m.period,m.date,m.payrollType,l.code,l.description,titles[l.group]??l.group,l.quantity??'No informada',money(l.amount),'Fuente '+(index+1)])add('td',v,tr);}
   if(!rows.length)add('td','Sin conceptos para esta búsqueda.',add('tr',undefined,body)).colSpan=9;
   const prev=add('button','Conceptos anteriores',nav),next=add('button','Conceptos siguientes',nav);prev.type=next.type='button';prev.className=next.className='pdl-button';prev.disabled=page===1;next.disabled=page===pages;prev.onclick=()=>{page--;draw();};next.onclick=()=>{page++;draw();};add('span','Página '+page+' de '+pages,nav);
  }
  search.oninput=()=>{page=1;draw();};page=1;draw();
  const sources=add('details',undefined,result);add('summary','Fuentes, versiones y alcance',sources);const sourceBody=table(sources,['Referencia','Período / tipo','Dataset','Documento','SHA-256 líneas','SHA-256 respaldo','Etiqueta de origen'],'Fuentes del informe completo, tabla desplazable');
  r.models.forEach((m,i)=>{const tr=add('tr',undefined,sourceBody);for(const v of ['Fuente '+(i+1),m.period+' / '+m.payrollType,r.items[i].datasetId,m.statementId,m.statementHash,m.sourceHash,m.sourceLabel])add('td',v,tr);});
  add('p','SHA-256 de la selección y valores revisados: '+r.hash,result).className='pdl-review-fingerprint';
 }
 start.onclick=async()=>{if(job||reason||!alive())return;clear('Consultando la biblioteca y las liquidaciones seleccionadas…');const n=revision,c=new AbortController();job=c;progress.value=0;progress.hidden=false;controls();const current=()=>alive()&&job===c&&revision===n&&!c.signal.aborted;
  try{const value=await collectPayrollPeriods({library,range,employee,signal:c.signal,request:async(url,options)=>{if(!current())throw new DOMException('Context changed','AbortError');const p=await request(url,options);if(!current())throw new DOMException('Context changed','AbortError');return p;},progress:p=>{if(current()){status.textContent=({catalog:'Verificando biblioteca',detail:'Leyendo conceptos',recheck:'Revisando nuevamente'})[p.phase]+' · '+p.done+' de '+p.total;progress.value=p.total?p.done/p.total*100:0;}}});
   if(!current())return;report=value;render(value);status.textContent='Informe completo verificado · '+value.models.length+' liquidaciones · '+value.concepts+' conceptos. No modifica haberes ni acredita pago.';
  }catch(e){if(job===c&&active&&host.isConnected){report=null;result.replaceChildren();status.textContent=periodReportError(e);}}
  finally{if(job===c){job=null;c.abort();progress.hidden=true;controls();}}
 };
 cancel.onclick=()=>{clear('Preparación cancelada. No se conservaron resultados parciales. El rango sigue seleccionado.');start.focus({preventScroll:true});};
 const visibility=()=>{if(doc.hidden)clear('La consulta fue retirada al ocultar la pantalla. Prepará nuevamente el rango.');else controls();},context=()=>{if(job||report)clear('Cambió el contexto de acceso. Se retiró el informe; actualizá la biblioteca.');};doc.addEventListener('visibilitychange',visibility);doc.addEventListener('municontrol:capabilities-ready',context);
 controls();return{destroy(){if(!active)return;active=false;clear('');doc.removeEventListener('visibilitychange',visibility);doc.removeEventListener('municontrol:capabilities-ready',context);start.onclick=cancel.onclick=null;host.replaceChildren();}};
}
