import { emptySheetRow, appendSheetGroup, sheetPage } from './payroll-novelty-sheet-model.js';
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const button = (text, id, cls = '') => { const n = el('button', text, 'button ' + cls); n.type = 'button'; if (id) n.id = id; return n; };
const fields = [[2,'Centro de costo',20],[3,'Mes de ajuste',7],[6,'Movimiento',32],[7,'Instrumento legal',160],[8,'Observación / fundamento',500]];
export function mountNoveltySheet(host, { onChange = () => {} } = {}) {
  host.classList.add('novelty-sheet'); host.dataset.reviewOnly = 'true';
  let rows = [], page = 1, size = 10, locked = false, undo = null;
  const header = el('div',undefined,'sheet-heading');
  header.innerHTML='<div><p class="sheet-eyebrow">SIN ARCHIVOS · EDICIÓN DIRECTA</p><h3>Una planilla, varias novedades</h3><p>Agregá legajos y editá concepto y unidades en cada fila. El período y el tipo se toman de arriba.</p></div>';
  const toolbar=el('div',undefined,'sheet-toolbar'), add=button('Agregar fila','sheetAdd','primary'), group=button('Agregar varios legajos','sheetGroup'), restore=button('Deshacer eliminación','sheetUndo'), clear=button('Vaciar planilla','sheetClear','danger');
  toolbar.append(add,group,restore,clear); const state=el('p','','sheet-state');state.id='sheetState';state.setAttribute('role','status');state.setAttribute('aria-live','polite');
  const note=el('p','No hace falta informar un importe para cada empleado. Usá unidades; los importes manuales y el modo forzado quedan en “Más campos”. No se calcula un sueldo al editar.','sheet-note');
  const wrap=el('div',undefined,'table-wrap sheet-table'),table=el('table');
  table.innerHTML='<thead><tr><th scope="col">Fila</th><th scope="col">Legajo</th><th scope="col">Concepto</th><th scope="col">Unidades</th><th scope="col">Importe manual</th><th scope="col">Acciones</th></tr></thead>';
  const body=el('tbody');body.id='sheetRows';table.append(body);wrap.append(table);
  const empty=el('div','Empezá con “Agregar fila” o agregá varios legajos con un concepto común. Podés cambiar después las unidades de cada persona.','sheet-empty');empty.id='sheetEmpty';
  const nav=el('nav',undefined,'sheet-pager');nav.setAttribute('aria-label','Páginas de la planilla de novedades');
  const previous=button('Anterior','sheetPrevious'),next=button('Siguiente','sheetNext'),range=el('span');range.id='sheetRange';
  const pageSize=el('select');pageSize.id='sheetPageSize';for(const n of [10,25,50]){const o=el('option',String(n));o.value=String(n);pageSize.append(o);}
  const label=el('label','Filas por página');label.append(pageSize);nav.append(label,previous,range,next);
  const dialog=el('dialog',undefined,'sheet-dialog');dialog.id='sheetGroupDialog';dialog.setAttribute('aria-labelledby','sheetGroupTitle');
  dialog.innerHTML='<form method="dialog"><header><p class="sheet-eyebrow">MISMO CONCEPTO · VARIOS LEGAJOS</p><h3 id="sheetGroupTitle">Agregar un grupo a la planilla</h3><p>Ingresá los legajos, uno por línea. No pegues DNI ni una tabla completa.</p></header><label>Legajos<textarea id="sheetGroupLegajos" rows="6" maxlength="12000" placeholder="1001&#10;1002&#10;1003" spellcheck="false" required></textarea></label><div class="sheet-group-fields"><label>Concepto<input id="sheetGroupConcept" inputmode="numeric" maxlength="20" required></label><label>Unidades iniciales (opcional)<input id="sheetGroupQuantity" inputmode="decimal" maxlength="24" placeholder="Ej.: 1"></label></div><p>Se agregan sin importe manual y sin modo forzado. Podés editar cada fila antes de validar.</p><p id="sheetGroupError" role="alert" hidden></p><footer><button type="button" id="sheetGroupCancel" class="button">Cancelar</button><button type="submit" id="sheetGroupApply" class="button primary">Agregar a la planilla</button></footer></form>';
  host.append(header,toolbar,state,note,empty,wrap,nav,dialog);
  const $=id=>host.querySelector('#'+id);
  const notify=message=>{onChange();state.textContent=message+' Todavía sin guardar.';};
  function update(index, column, value) { if(locked||!rows[index])return;rows[index][column]=value;undo=null;restore.disabled=true;notify('Fila '+(index+1)+' modificada. Volvé a validar antes de guardar.'); }
  function input(index,column,label,maxLength,type='text'){
    const n=el(column===8?'textarea':'input');if(n.tagName==='INPUT')n.type=type;
    n.value=rows[index][column];n.maxLength=maxLength;n.disabled=locked;n.dataset.sheetField=String(column);n.dataset.sheetIndex=String(index);n.setAttribute('aria-label',label+' · fila '+(index+1));
    if([0,1,2,4,5].includes(column))n.inputMode=[4,5].includes(column)?'decimal':'numeric';
    n.addEventListener('input',()=>update(index,column,n.value));return n;
  }
  function render(focusIndex=null){
    const view=sheetPage(rows,page,size);page=view.page;body.replaceChildren();
    for(let i=0;i<view.rows.length;i++){
      const index=view.offset+i,row=rows[index],tr=el('tr');tr.dataset.sheetRow=String(index+1);
      const ordinal=el('td',String(index+1));ordinal.dataset.label='Fila';tr.append(ordinal);
      for(const [column,name,max]of [[0,'Legajo',20],[1,'Concepto',20],[4,'Unidades',24]]){const td=el('td');td.dataset.label=name;td.append(input(index,column,name,max));tr.append(td);}
      const value=el('td',row[5].trim()?'Informado: $ '+row[5]:'No informado');value.dataset.label='Importe manual';value.className='sheet-amount';tr.append(value);
      const actions=el('td');actions.dataset.label='Acciones';const more=button('Más campos',null,'compact'),remove=button('Quitar',null,'compact danger');
      more.setAttribute('aria-expanded','false');more.setAttribute('aria-controls','sheetDetails'+index);more.setAttribute('aria-label','Más campos de la fila '+(index+1));remove.setAttribute('aria-label','Quitar fila '+(index+1));
      more.disabled=remove.disabled=locked;actions.append(more,remove);tr.append(actions);body.append(tr);
      const extra=el('tr');extra.id='sheetDetails'+index;extra.className='sheet-details-row';extra.hidden=true;const cell=el('td');cell.colSpan=6;const form=el('div',undefined,'sheet-fields');
      for(const [column,name,max]of fields){const label=el('label',name);label.append(input(index,column,name,max,column===3?'month':'text'));if(column===8)label.className='sheet-wide';form.append(label);}
      const amountLabel=el('label','Importe manual · ARS (opcional)'),money=input(index,5,'Importe manual ARS',20);money.placeholder='Vacío = no informado';
      money.addEventListener('input',()=>{value.textContent=money.value.trim()?'Informado: $ '+money.value:'No informado';});amountLabel.append(money);form.append(amountLabel);
      const forcedLabel=el('label',undefined,'sheet-forced'),forced=el('input');forced.type='checkbox';forced.checked=row[9]==='SI';forced.disabled=locked;forced.setAttribute('aria-label','Modo forzado · fila '+(index+1));forced.addEventListener('change',()=>update(index,9,forced.checked?'SI':'NO'));
      forcedLabel.append(forced,el('span','Modo forzado: requiere importe, fundamento y segunda aprobación.'));form.append(forcedLabel);
      cell.append(form);extra.append(cell);body.append(extra);
      more.addEventListener('click',()=>{extra.hidden=!extra.hidden;more.setAttribute('aria-expanded',String(!extra.hidden));});
      remove.addEventListener('click',()=>{if(locked)return;undo={index,row:[...rows[index]]};rows.splice(index,1);notify('Fila retirada de la planilla.');render(Math.min(index,rows.length-1));});
    }
    empty.hidden=rows.length>0;wrap.hidden=nav.hidden=!rows.length;
    range.textContent=rows.length?`${view.offset+1}–${Math.min(view.offset+size,rows.length)} de ${rows.length} · Página ${page} de ${view.pages}`:'Sin filas';
    add.disabled=group.disabled=locked||rows.length>=500;clear.disabled=locked||!rows.length;restore.disabled=locked||!undo;
    previous.disabled=locked||page<=1;next.disabled=locked||page>=view.pages;pageSize.disabled=locked;
    if(focusIndex!==null)host.querySelector(`[data-sheet-index="${focusIndex}"][data-sheet-field="0"]`)?.focus();
  }
  add.addEventListener('click',()=>{if(locked||rows.length>=500)return;rows.push(emptySheetRow());undo=null;page=Math.ceil(rows.length/size);notify('Fila agregada. Completá legajo, concepto y unidades o importe.');render(rows.length-1);});
  group.addEventListener('click',()=>{if(locked)return;$('sheetGroupError').hidden=true;dialog.showModal();$('sheetGroupLegajos').focus();});
  const resetDialog=()=>{dialog.querySelector('form').reset();$('sheetGroupError').textContent='';$('sheetGroupError').hidden=true;};
  dialog.addEventListener('cancel',resetDialog);
  dialog.addEventListener('close',resetDialog);
  $('sheetGroupCancel').addEventListener('click',()=>dialog.close());
  dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();if(locked)return;try{const first=rows.length;const updated=appendSheetGroup(rows,{legajos:$('sheetGroupLegajos').value,concepto:$('sheetGroupConcept').value,unidades:$('sheetGroupQuantity').value});rows=updated;undo=null;page=Math.floor(first/size)+1;dialog.close();notify(`${rows.length-first} legajos agregados. Revisá las unidades de cada fila.`);render(first);}catch(error){$('sheetGroupError').textContent=error.message;$('sheetGroupError').hidden=false;}});
  clear.addEventListener('click',()=>{if(locked||!rows.length||!window.confirm('¿Vaciar las '+rows.length+' filas de esta planilla sin guardar? Los lotes del servidor no se modifican.'))return;rows=[];undo=null;page=1;notify('Planilla vaciada.');render();add.focus();});
  restore.addEventListener('click',()=>{if(locked||!undo||rows.length>=500)return;const item=undo;undo=null;rows.splice(item.index,0,item.row);page=Math.floor(item.index/size)+1;notify('Fila restaurada.');render(item.index);});
  previous.addEventListener('click',()=>{page--;render();});next.addEventListener('click',()=>{page++;render();});pageSize.addEventListener('change',()=>{size=Number(pageSize.value);page=1;render();});
  render();state.textContent='Sin filas. La planilla se conserva sólo en esta pestaña hasta crear el lote.';
  return {
    values:()=>rows.map(r=>[...r]),
    count:()=>rows.length,
    clear(){rows=[];undo=null;page=1;if(dialog.open)dialog.close();resetDialog();render();state.textContent='Planilla vacía. No se conservan filas en este editor.';},
    setDisabled(value){locked=Boolean(value);host.querySelectorAll('input,textarea,select,button').forEach(n=>n.disabled=locked);if(!locked)render();},
    render,
  };
}
