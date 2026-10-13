import {salaryRowKey} from './native-salary-catalog-model.js';
import {ownProgramParticipation} from './own-period-participation-program.js';
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const types={monthly:'Mensual',first_fortnight:'Primera quincena',sac:'SAC',vacation:'Vacaciones',supplementary:'Complementaria',final:'Final',other:'Otras'};
const natural=new Intl.Collator('es',{numeric:true});

export function mountProgramScaleReference(container,{onEdit,onPreview,onApply,onConfirm}){
 container.innerHTML=`<details class="own-program-scale-reference"><summary>Preparar auxiliares desde una clase de referencia</summary><p>Elegí una escala aprobada y un factor expreso. La regla usa esa clase, conserva el resultado exacto y requiere revisión del programa completo. Primero activá la separación de códigos y declará los decimales de los totales.</p>
 <fieldset data-program-scale-fields><legend>Base y alcance del auxiliar</legend>
 <label>Clase de referencia aprobada<select data-program-scale-source><option value="">Elegir escala…</option></select></label>
 <label>Auxiliar que utiliza la base<select data-program-scale-auxiliary><option value="">Elegir auxiliar…</option></select></label>
 <div class="own-program-grid"><label>Factor de la escala<input inputmode="decimal" maxlength="27" data-program-scale-factor></label><label>Decimales del resultado exacto<select data-program-scale-precision><option value="">Elegir precisión…</option>${Array.from({length:9},(_,i)=>`<option value="${i}">${i}</option>`).join('')}</select></label></div>
 <div class="own-program-grid"><label>Inicio de la regla auxiliar<input type="month" data-program-scale-from></label><label>Fin de la regla auxiliar<input type="month" data-program-scale-until></label></div>
 <fieldset data-program-scale-types><legend>Tipos de liquidación alcanzados</legend></fieldset>
 <label>Tratamiento del historial del auxiliar<select data-program-scale-mode><option value="">Elegir…</option><option value="add">Agregar sin superposición</option><option value="replace">Cerrar la anterior y crear una nueva</option></select></label>
 <label>Documento de la regla auxiliar<input maxlength="180" data-program-scale-reference></label>
 <section data-program-scale-period hidden><label>Tratamiento del auxiliar en períodos parciales<select data-program-scale-treatment><option value="">Elegir…</option><option value="declared_formula">Conservar la fórmula declarada</option><option value="fraction">Aplicar la fracción documentada</option></select></label><label>Respaldo del tratamiento parcial<input maxlength="180" data-program-scale-period-reference></label></section>
 <label>Buscar convenios del auxiliar<input type="search" data-program-scale-search></label><p role="status" data-program-scale-selection></p>
 <div class="own-program-actions"><button type="button" data-program-scale-select-filtered>Seleccionar convenios del filtro completo</button><button type="button" data-program-scale-clear-selection>Retirar todos los convenios</button></div>
 <fieldset data-program-scale-targets><legend>Convenios alcanzados</legend></fieldset><nav class="own-program-actions" aria-label="Páginas de convenios del auxiliar"><button type="button" data-program-scale-prev>Anterior</button><span data-program-scale-page></span><button type="button" data-program-scale-next>Siguiente</button></nav>
 <button type="button" data-program-scale-preview>Revisar referencia completa</button>
 <section data-program-scale-review hidden><h3>Referencia y programa completo</h3><p data-program-scale-summary></p><p data-program-scale-value></p><div data-program-scale-comparison></div><label class="own-program-check"><input type="checkbox" data-program-scale-confirm>Revisé la clase, el factor, todos los convenios, tipos y vigencias.</label><button type="button" data-program-scale-apply>Incorporar auxiliares al borrador</button></section>
 </fieldset><p>Incorporar al borrador no guarda, aprueba ni liquida. Las fuentes ausentes o incompatibles detienen todo el conjunto.</p></details>`;
 const $=key=>container.querySelector('[data-program-scale-'+key+']'),selected=new Set();
 let catalog=[],page=0,participating=false,enabled=false,reviewReady=false;
 for(const [value,title] of Object.entries(types)){const label=node('label',title),input=node('input');label.className='own-program-check';input.type='checkbox';input.value=value;input.dataset.programScaleType=value;label.prepend(input);$('types').append(label);input.addEventListener('change',onEdit);}
 const available=()=>[...new Set(catalog.filter(r=>r.active&&r.kind==='auxiliary'&&r.unit==='money'&&r.code===$('auxiliary').value).map(r=>r.agreementCode))];
 const filtered=()=>[...new Set([...available(),...selected])].sort(natural.compare).filter(v=>v.includes($('search').value.trim()));
 function renderTargets(){
  const focused=document.activeElement?.dataset?.programScaleTarget;
  const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/25));page=Math.min(page,pages-1);const supported=new Set(available());
  $('targets').replaceChildren(node('legend','Convenios alcanzados'));
  for(const value of rows.slice(page*25,(page+1)*25)){const label=node('label','Convenio '+value+(supported.has(value)?'':' · fuera de las opciones actuales: revisar')),input=node('input');label.className='own-program-check';input.type='checkbox';input.value=value;input.dataset.programScaleTarget=value;input.checked=selected.has(value);label.prepend(input);input.addEventListener('change',()=>{input.checked?selected.add(value):selected.delete(value);onEdit();renderTargets();});$('targets').append(label);}
  $('selection').textContent=`${selected.size} convenios seleccionados en todas las páginas · ${rows.length} coincidencias completas.`;
  $('page').textContent=`Página ${page+1} de ${pages}`;$('prev').disabled=!enabled||page===0;$('next').disabled=!enabled||page>=pages-1;
  if(focused)[...$('targets').querySelectorAll('input')].find(i=>i.value===focused)?.focus();
 }
 const clearReview=()=>{$('review').hidden=true;$('confirm').checked=false;$('summary').textContent='';$('value').textContent='';$('comparison').replaceChildren();reviewReady=false;$('apply').disabled=true;};
 function renderChoices(boot,draft){
  catalog=boot?.salaryCatalog.items??[];const source=$('source').value,auxiliary=$('auxiliary').value;
  $('source').replaceChildren(new Option('Elegir escala…',''),...catalog.filter(r=>r.active&&r.kind==='scale').map(r=>new Option(`${r.label} · convenio ${r.agreementCode} · clase ${r.categoryCode} · código ${r.code} · ${r.validFrom} a ${r.validUntil??'sin término'}`,salaryRowKey(r))));
  if(catalog.some(r=>salaryRowKey(r)===source))$('source').value=source;
  $('auxiliary').replaceChildren(new Option('Elegir auxiliar…',''),...[...new Set(catalog.filter(r=>r.active&&r.kind==='auxiliary'&&r.unit==='money').map(r=>r.code))].sort((a,b)=>Number(a)-Number(b)).map(c=>new Option('Auxiliar '+c,c)));
  if([...$('auxiliary').options].some(o=>o.value===auxiliary))$('auxiliary').value=auxiliary;
  participating=ownProgramParticipation(draft);$('period').hidden=!participating;renderTargets();
 }
 for(const key of ['source','factor','precision','from','until','mode','reference','treatment','period-reference'])$(key).addEventListener(['factor','reference','period-reference'].includes(key)?'input':'change',onEdit);
 $('auxiliary').addEventListener('change',()=>{selected.clear();page=0;onEdit();renderTargets();});
 $('search').addEventListener('input',()=>{page=0;renderTargets();});
 for(const [key,delta] of [['prev',-1],['next',1]])$(key).addEventListener('click',()=>{page+=delta;renderTargets();});
 $('select-filtered').addEventListener('click',()=>{for(const value of filtered())selected.add(value);onEdit();renderTargets();});
 $('clear-selection').addEventListener('click',()=>{selected.clear();onEdit();renderTargets();});
 $('preview').addEventListener('click',onPreview);$('apply').addEventListener('click',onApply);$('confirm').addEventListener('change',onConfirm);
 function intent(){return {sourceKey:$('source').value,auxiliaryCode:$('auxiliary').value,targets:[...selected],validFrom:$('from').value,validUntil:$('until').value,liquidationTypes:[...$('types').querySelectorAll('input:checked')].map(i=>i.value),factor:$('factor').value.replace(',','.'),precision:$('precision').value===''?null:Number($('precision').value),ruleReference:$('reference').value.trim().normalize('NFC'),mode:$('mode').value,periodTreatment:participating?{treatment:$('treatment').value,reference:$('period-reference').value.trim().normalize('NFC')}:null};}
 function show(plan){reviewReady=true;$('summary').textContent=`Auxiliar ${plan.intent.auxiliaryCode} · ${plan.intent.targets.length} convenios completos · ${plan.intent.validFrom} a ${plan.intent.validUntil} · ${plan.program.rules.length} reglas en el programa.`;$('value').textContent=`Escala de referencia: convenio ${plan.source.agreementCode}, clase ${plan.source.categoryCode}, código ${plan.source.code}. Importe base ${plan.preview.base} × factor ${plan.preview.factor} = ${plan.preview.amount}. Resultado exacto con ${plan.preview.precision} decimales; no se usa la clase de cada empleado.`;$('review').hidden=false;}
 function setEnabled(value,hasPlan){enabled=value;$('fields').disabled=!value;$('apply').disabled=!value||!hasPlan||!reviewReady||!$('confirm').checked;$('prev').disabled=!value||page===0;$('next').disabled=!value||page>=Math.max(1,Math.ceil(filtered().length/25))-1;}
 function clear(){clearReview();catalog=[];selected.clear();page=0;participating=false;container.querySelector('details').open=false;for(const input of container.querySelectorAll('input,select')){if(input.type==='checkbox')input.checked=false;else input.value='';}$('source').replaceChildren(new Option('Elegir escala…',''));$('auxiliary').replaceChildren(new Option('Elegir auxiliar…',''));$('period').hidden=true;renderTargets();}
 return {renderChoices,clearReview,clear,show,intent,setEnabled,confirmed:()=>$('confirm').checked,comparison:()=>$('comparison')};
}
