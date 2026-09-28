// Client-only catalogue filtering. No new requests, signatures, payment dates or downloads.
import {documentPeriodOptions,documentPeriodStatus,documentPeriodLabel} from './payroll-document-periods.js';
import {sourceReportTypeLabel} from './payroll-source-report-model.js';
export function mountDocumentCatalogFilters({host,select}){
 const doc=host.ownerDocument,make=(tag,text)=>{const e=doc.createElement(tag);if(text)e.textContent=text;return e;};
 const tools=make('div');tools.className='pdb-periods';
 const monthLabel=make('label','Mes de liquidación (según fecha)'),month=make('select');month.setAttribute('aria-label','Mes de liquidación');month.append(new Option('Todos los meses disponibles','all'));monthLabel.append(month);
 const typeLabel=make('label','Tipo de liquidación'),type=make('select');type.setAttribute('aria-label','Tipo de liquidación');type.append(new Option('Todos los tipos disponibles','all'));typeLabel.append(type);
 const reset=make('button','Limpiar mes y tipo');reset.type='button';tools.append(monthLabel,typeLabel,reset);
 const status=make('p','Consultá las liquidaciones para habilitar los filtros.');status.className='pdb-hint';status.dataset.batchCatalogStatus='';status.setAttribute('role','status');
 const help=make('p','El mes filtra la fecha de liquidación. El período de origen se confirma al aplicar la corrida; no se infiere ni se cambia.');help.className='pdb-hint';
 host.insertBefore(tools,select.parentElement);host.insertBefore(status,select.parentElement);host.insertBefore(help,select.parentElement);
 const reference=make('p');reference.className='pdb-run-reference';reference.hidden=true;reference.dataset.batchRunReference='';reference.setAttribute('role','status');host.append(reference);
 select.addEventListener('change',()=>{const item=catalogue?.items.find(row=>row.datasetId===select.value);reference.hidden=!item;reference.textContent=item?'Versión seleccionada: '+item.datasetId+' · '+item.sourceLabel:'';});
 let catalogue=null,enabled=false;
 function state(){month.disabled=type.disabled=reset.disabled=!enabled||!catalogue;}
 function draw(){reference.hidden=true;reference.textContent='';
  const m=month.value,t=type.value,view=documentPeriodOptions(catalogue,{month:m,type:t});
  month.replaceChildren(new Option('Todos los meses disponibles','all'));for(const item of view.months)month.append(new Option(item.label,item.value));
  if(view.missingMonth)month.append(new Option(documentPeriodLabel(m)+' · no disponible',m));month.value=m;
  type.replaceChildren(new Option('Todos los tipos disponibles','all'));for(const item of view.types)type.append(new Option(item.label,item.value));
  if(view.missingType)type.append(new Option(sourceReportTypeLabel(t)+' ('+t+') · no disponible',t));type.value=t;
  select.replaceChildren(new Option(view.matching?'Elegí la corrida exacta':'Sin liquidaciones para este mes y tipo',''));
  for(const item of view.items)select.append(new Option(item.label,item.datasetId));
  status.textContent=documentPeriodStatus(view);state();
 }
 function change(){if(!enabled||!catalogue)return;draw();select.dispatchEvent(new Event('change',{bubbles:true}));}
 month.addEventListener('change',change);type.addEventListener('change',change);
 reset.addEventListener('click',()=>{month.value=type.value='all';change();month.focus({preventScroll:true});});
 state();
 return{setCatalogue(value){catalogue=value;draw();},setEnabled(value){enabled=value===true;state();},clear(){catalogue=null;reference.hidden=true;reference.textContent='';month.replaceChildren(new Option('Todos los meses disponibles','all'));type.replaceChildren(new Option('Todos los tipos disponibles','all'));status.textContent='Consultá las liquidaciones con el acceso vigente.';state();}};
}
