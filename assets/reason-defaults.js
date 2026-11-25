// Fundamentos con texto propuesto: quien aprueba no tiene que inventar una frase para que el sistema acepte la decisión.
// Decisión del propietario (24/11/2026). Al mostrarse un campo «Fundamento de la decisión» vacío se completa con un texto
// estándar editable; para rechazar se deja vacío, porque un rechazo sí necesita explicar el motivo. Los fundamentos de
// preparación reciben un texto neutro que la persona puede cambiar. Nunca pisa lo que la persona escribió.
const APPROVE='Revisado: los datos coinciden con la documentación del período. Se aprueba.';
const PREPARE='Carga del período según la documentación recibida por Recursos Humanos.';
const labelText=field=>{const l=field.closest('label')||(field.id&&document.querySelector('label[for="'+CSS.escape(field.id)+'"]'));return (l?.textContent||field.getAttribute('aria-label')||field.placeholder||'').toLowerCase();};
const decisionOf=field=>{const box=field.closest('fieldset,section,form,div');const select=box?.querySelector('select');const v=(select?.value||select?.selectedOptions?.[0]?.textContent||'').toLowerCase();return /reject|rechaz/.test(v)?'reject':'approve';};
function fill(field){
  if(field.dataset.mcReasonDefault==='off'||field.value.trim()||field.disabled||field.readOnly)return;
  const text=labelText(field);let value=null;
  if(/fundamento de la decisi|motivo de la decisi|fundamento de la aprobaci/.test(text))value=decisionOf(field)==='reject'?null:APPROVE;
  else if(/fundamento de la preparaci|fundamento de la carga/.test(text))value=PREPARE;
  if(!value)return;
  field.value=value;field.dataset.mcReasonDefault='filled';
  field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
}
function scan(root=document){for(const f of root.querySelectorAll?.('textarea,input[type="text"]')??[])fill(f);}
function watchDecision(event){
  const select=event.target;if(!(select instanceof HTMLSelectElement))return;
  const box=select.closest('fieldset,section,form,div');if(!box)return;
  for(const f of box.querySelectorAll('textarea,input[type="text"]')){
    if(f.dataset.mcReasonDefault==='filled'&&/reject|rechaz/.test(select.value.toLowerCase())){f.value='';f.dataset.mcReasonDefault='';f.dispatchEvent(new Event('input',{bubbles:true}));}
    else fill(f);
  }
}
export function mountReasonDefaults(){
  if(typeof document==='undefined'||document.documentElement.dataset.mcReasonDefaults)return;
  document.documentElement.dataset.mcReasonDefaults='on';
  scan();document.addEventListener('change',watchDecision,true);
  let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;scan();});}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','open']});
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountReasonDefaults,{once:true});else mountReasonDefaults();}
