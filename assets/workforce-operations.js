/** An operational roster is a dated source view, never a hardcoded or payment-approved headcount. */
const labels={administrative_active:'Activos del padrón',liquidable:'Incluidos en la corrida informada',gap:'Activos fuera de la corrida',multiple_active:'Personas con más de un legajo activo',last_closed:'Liquidados del último mes cerrado',inactive:'Histórico · legajos inactivos',state_error:'Estados a revisar',unknown:'Sin clasificación',all:'Archivo completo'};
const number = value => Number.isSafeInteger(value) && value>=0 ? new Intl.NumberFormat('es-AR').format(value) : '—';
function sourceDate(value){if(!value)return 'no informada';const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeZone:'America/Argentina/Mendoza'}).format(d):'no informada'}
let latest=null;
function render(meta){
 latest=meta||{}; const root=document.getElementById('workforceWorkspace');if(!root)return;
 root.querySelectorAll('[data-workforce-count]').forEach(el=>{el.textContent=number(latest[el.dataset.workforceCount])});
 const from=sourceDate(latest.sourceCutoffFrom),to=sourceDate(latest.sourceCutoffTo);
 const cutoff=from===to?from:from+' a '+to;
 const snapshotFrom=sourceDate(latest.snapshotFrom ? latest.snapshotFrom+'T12:00:00Z':null),snapshotTo=sourceDate(latest.snapshotTo ? latest.snapshotTo+'T12:00:00Z':null);
 const closed=latest.lastClosedMonth ? sourceDate(latest.lastClosedMonth+'T12:00:00Z') : 'no informado';
 document.getElementById('workforceSource').textContent='Corte de la fuente: '+cutoff+'. Estado laboral informado: '+(snapshotFrom===snapshotTo?snapshotTo:snapshotFrom+' a '+snapshotTo)+'. No certifica altas o bajas posteriores. Activo no significa autorizado a cobrar.';
 document.getElementById('workforceClosedLabel').textContent=number(latest.lastClosedContracts)+' legajos · mes cerrado de referencia '+closed+'. Se cuentan una vez aunque tengan varias liquidaciones.';
 const multiple=document.getElementById('workforceMultipleLabel');multiple.textContent=number(latest.activePeople)+' personas distintas; '+number(latest.multipleActivePeople)+' con varios legajos activos.';
 selected();
}
function selected(){
 const select=document.getElementById('statusFilter'),root=document.getElementById('workforceWorkspace');if(!select||!root)return;
 root.querySelectorAll('[data-workforce-status]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.workforceStatus===select.value)));
 document.getElementById('workforceSelection').textContent='Vista: '+(labels[select.value]||'Situación seleccionada')+'. Los indicadores corresponden al padrón completo; la búsqueda y los filtros acotan la tabla.';
}
function init(){
 const root=document.getElementById('workforceWorkspace');if(!root)return;
 root.addEventListener('click',event=>{const button=event.target.closest('[data-workforce-status]');if(!button)return;const select=document.getElementById('statusFilter');select.value=button.dataset.workforceStatus;select.dispatchEvent(new Event('change',{bubbles:true}));selected()});
 document.getElementById('statusFilter').addEventListener('change',selected);
 document.getElementById('clearFilters').addEventListener('click',()=>queueMicrotask(selected));
 selected();
}
window.addEventListener('municontrol:workforce-scope',event=>render(event.detail));
window.addEventListener('municontrol:workforce-reset',()=>render({}));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
