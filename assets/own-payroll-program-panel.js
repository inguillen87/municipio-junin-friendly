import {ownProgramBootstrap,ownProgramRuleKey,OWN_PROGRAM_MAX_BYTES} from './own-payroll-program-model.js';
import {salarySerialized} from './native-salary-catalog-model.js';
import {prepareProgramCopy,prepareProgramCopies,applyProgramCopy} from './own-payroll-program-copy-model.js';
import {OWN_RUN_TYPES,OWN_RUN_NATURES} from './own-payroll-run-workspace-model.js';
import {PROGRAM_READ,PROGRAM_UNITS,PROGRAM_SOURCES,PROGRAM_ROUNDING,PROGRAM_OPERATIONS,PROGRAM_COMPARE,programWorkspaceAccess,programWorkspaceGuidance,programWorkspaceAttempt,verifiedProgramWorkspaceReceipt,prepareProgramWorkspace,decideProgramWorkspace,expressionChildren,expressionSize,changeExpressionOperation,describeProgramExpression,programWorkspaceChanges} from './own-payroll-program-workspace-model.js';

const endpoint='/api/internal-own-payroll-program',node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const capsFor=command=>[...PROGRAM_READ,command==='propose'?'payroll.parameter.prepare':'payroll.parameter.approve'];
const stateLabels={pending:'Pendiente de revisión',approved:'Aprobada',rejected:'Rechazada'};
const date=v=>Number.isFinite(Date.parse(v))?new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'Fecha sin verificar';
const clone=v=>structuredClone(v);
export function mountOwnPayrollProgram(container){
 if(!container||container.dataset.programMounted)return;container.dataset.programMounted='true';
 const css=new URL('./own-payroll-program-panel.css',import.meta.url).href;
 if(!document.querySelector('link[data-own-program-style]')){const link=node('link');link.rel='stylesheet';link.href=css;link.dataset.ownProgramStyle='true';document.head.append(link);}
 const host=node('section');host.className='own-program';host.setAttribute('aria-label','Reglas propias de cálculo');
 host.innerHTML=`<header><p class="own-program-eyebrow">PARÁMETROS · CÁLCULO PROPIO</p><h2>Reglas de cálculo</h2><p>Prepará las reglas por concepto y sus fuentes. Otra persona revisa el conjunto antes de aprobarlo.</p></header>
 <div class="own-program-actions"><button type="button" data-program-refresh>Actualizar consulta</button><button type="button" data-program-login hidden>Ingresar de nuevo</button></div>
 <p data-program-status role="status" aria-live="polite">Abrí Reglas de cálculo para verificar el acceso.</p>
 <div data-program-content hidden><section class="own-program-guidance" data-program-guidance aria-label="Próximo paso para las reglas"><h3 data-program-guidance-title></h3><p data-program-guidance-description></p><p data-program-preparation-access></p><p data-program-pending-summary></p><div class="own-program-actions"><a data-program-catalog-link href="/nomina#parametros">Abrir maestro salarial propio</a><button type="button" data-program-pending-link hidden>Consultar propuestas pendientes</button></div><p>Esta consulta no certifica los importes ni la aptitud para liquidar. Las decisiones requieren revisión independiente.</p></section><p data-program-current></p><details><summary>Consultar conceptos y valores aprobados</summary><div data-program-catalog></div></details><div class="own-program-tabs" role="group" aria-label="Tarea de reglas"><button type="button" data-program-edit-tab>Preparar reglas</button><button type="button" data-program-review-tab>Revisar propuestas</button></div>
 <form data-program-form><fieldset data-program-fields><legend>1. Preparar el programa completo</legend><p>Las reglas anteriores se conservan. Cada cambio requiere vigencia, fuentes, redondeo y respaldo expresos.</p>
 <label>Decimales de los totales<select data-program-precision><option value="">Elegir precisión</option>${Array.from({length:9},(_,i)=>`<option value="${i}">${i}</option>`).join('')}</select></label>
 <details data-program-copy><summary>Copiar fórmulas a varios convenios</summary><p>Elegí reglas propias y destinos. La copia conserva fórmula, unidades, tipos y redondeo; cada destino necesita sus definiciones y dependencias compatibles.</p>
 <label class="own-program-check"><input type="checkbox" data-program-copy-multiple>Seleccionar varias fórmulas para una actualización conjunta</label>
 <label data-program-copy-single>Regla de origen<select data-program-copy-source></select></label>
 <section data-program-copy-sources-panel hidden><label>Buscar concepto, convenio o vigencia<input type="search" data-program-copy-search></label><p data-program-copy-selection role="status" aria-live="polite"></p><div class="own-program-actions"><button type="button" data-program-copy-select-filtered>Seleccionar todas las coincidencias</button><button type="button" data-program-copy-clear-selection>Limpiar selección</button></div><fieldset data-program-copy-sources><legend>Fórmulas de origen</legend></fieldset><nav class="own-program-actions" aria-label="Páginas de fórmulas de origen"><button type="button" data-program-copy-prev>Anterior</button><span data-program-copy-page></span><button type="button" data-program-copy-next>Siguiente</button></nav></section>
 <fieldset data-program-copy-targets><legend>Convenios de destino</legend></fieldset>
 <div class="own-program-grid"><label>Desde el período<input type="month" data-program-copy-from></label><label>Hasta el período (vacío: sin término)<input type="month" data-program-copy-until></label></div>
 <label>Tratamiento de las reglas anteriores<select data-program-copy-mode><option value="">Elegir…</option><option value="add">Agregar donde no hay una regla superpuesta</option><option value="replace">Cerrar la regla anterior y crear una nueva vigencia</option></select></label>
 <label>Respaldo explícito para los destinos<input type="text" maxlength="180" data-program-copy-reference></label><button type="button" data-program-copy-preview>Revisar copia completa</button>
 <section data-program-copy-review hidden><h3>Comparación completa de la copia</h3><p data-program-copy-summary></p><div data-program-copy-comparison></div><label class="own-program-check"><input type="checkbox" data-program-copy-confirm>Revisé todas las fórmulas, destinos, fuentes y cierres de vigencia.</label><button type="button" data-program-copy-apply>Aplicar al borrador completo</button></section><p>Aplicar conserva el trabajo en esta pantalla. Después revisá y registrá la propuesta completa para que otra persona la decida.</p></details>
 <div class="own-program-actions"><button type="button" data-program-add-rule>Agregar regla</button><button type="button" data-program-add-binding>Agregar entrada</button></div>
 <label>Regla para editar<select data-program-rule-select></select></label><div data-program-rule-editor></div>
 <label>Entrada para editar<select data-program-binding-select></select></label><div data-program-binding-editor></div>
 <label>Fundamento del conjunto<textarea data-program-reason minlength="10" maxlength="1000" rows="3" placeholder="Describí el cambio y su respaldo municipal"></textarea></label>
 <button type="button" data-program-prepare>Revisar el programa completo</button></fieldset>
 <section data-program-impact hidden><h3>2. Revisar antes de registrar</h3><p data-program-impact-summary></p><div data-program-impact-table></div></section>
 </form>
 <section data-program-proposals hidden><h3>Propuestas y decisiones</h3><label>Propuesta<select data-program-proposal-select></select></label><div data-program-proposal-detail></div><fieldset data-program-decision-fields><legend>Decisión independiente</legend><label>Decisión<select data-program-decision><option value="">Elegir decisión</option><option value="approve">Aprobar el programa</option><option value="reject">Rechazar la propuesta</option></select></label><label>Fundamento de la decisión<textarea data-program-decision-reason minlength="10" maxlength="1000" rows="3"></textarea></label><button type="button" data-program-review-decision>Revisar esta decisión</button></fieldset></section>
 <section data-program-send-box hidden><h3>Confirmar la operación revisada</h3><p data-program-operation></p><label class="own-program-check"><input type="checkbox" data-program-confirm>Revisé el conjunto completo, sus fuentes, vigencias y el fundamento.</label></section></div>
 <div class="own-program-actions"><button type="button" data-program-send hidden>Registrar propuesta</button><button type="button" data-program-recover hidden>Consultar el mismo intento</button><button type="button" data-program-new hidden>Nueva preparación</button><button type="button" data-program-revise hidden>Revisar intento no registrado</button></div><p data-program-receipt hidden></p>`;
 container.append(host);const $=key=>host.querySelector('[data-program-'+key+']');
 let active=false,stopped=false,busy=false,seq=0,controller=null,access=null,boot=null,draft=null,prepared=null,attempt=null,receipt=null,notFound=false,tab='edit',ruleIndex=0,bindingIndex=0,historicalRules=new WeakSet(),copyPlan=null;
 const copySelection=new Set();let copySourcePage=1;
 const live=()=>active&&!stopped&&!document.hidden&&host.isConnected;
 const can=required=>live()&&required.every(c=>access?.caps.has(c));
 const status=(message,state='neutral')=>{$('status').textContent=message;$('status').dataset.state=state;};
 function controls(){
  $('refresh').disabled=busy||!live();$('fields').disabled=busy||!!attempt||!can(capsFor('propose'))||!boot?.permissions.canPropose||!(boot?.salaryCatalog.revision>0);
  const proposal=boot?.proposals.find(p=>p.id===$('proposal-select').value);
  $('decision-fields').disabled=busy||!!attempt||!can(capsFor('approve'))||!proposal?.canReview||proposal.status!=='pending';
  $('edit-tab').disabled=busy||!!attempt||!can(PROGRAM_READ);$('review-tab').disabled=busy||!!attempt||!can(PROGRAM_READ);
  $('proposal-select').disabled=busy||!!attempt||!can(PROGRAM_READ);
  $('pending-link').disabled=busy||!!attempt||!can(PROGRAM_READ);
  $('catalog-link').hidden=busy||!!attempt;
  $('confirm').disabled=busy||!!attempt||!prepared;$('send').hidden=!prepared&&!attempt||!!receipt;
  $('send').disabled=busy||!can(capsFor(attempt?.body.command??prepared?.command))||!attempt&&!$('confirm').checked;
  $('send').textContent=attempt?'Reintentar el mismo envío':prepared?.command==='approve'?'Aprobar programa':prepared?.command==='reject'?'Rechazar propuesta':'Registrar propuesta';
  $('recover').hidden=!attempt;$('recover').disabled=busy||!can(capsFor(attempt?.body.command));
  $('new').hidden=!receipt;$('new').disabled=busy||!can(PROGRAM_READ);
  $('revise').hidden=!notFound||!attempt;$('revise').disabled=busy||!can(PROGRAM_READ);
  $('copy-apply').disabled=busy||!!attempt||!copyPlan||!$('copy-confirm').checked||!can(capsFor('propose'))||!boot?.permissions.canPropose;
  host.setAttribute('aria-busy',String(busy));
 }
 function clearCopy(){copyPlan=null;$('copy-confirm').checked=false;$('copy-review').hidden=true;$('copy-summary').textContent='';$('copy-comparison').replaceChildren();}
 function invalidate(){if(attempt)return;clearCopy();prepared=null;$('confirm').checked=false;$('impact').hidden=true;$('impact-table').replaceChildren();$('send-box').hidden=true;controls();}
 function clearViews(){
  clearCopy();$('copy').open=false;for(const key of ['copy-from','copy-until','copy-mode','copy-reference'])$(key).value='';$('copy-source').replaceChildren();$('copy-targets').replaceChildren(node('legend','Convenios de destino'));
  copySelection.clear();copySourcePage=1;$('copy-multiple').checked=false;$('copy-search').value='';$('copy-single').hidden=false;$('copy-sources-panel').hidden=true;$('copy-sources').replaceChildren();$('copy-selection').textContent='';$('copy-page').textContent='';
  boot=null;draft=null;historicalRules=new WeakSet();prepared=null;receipt=null;notFound=false;$('content').hidden=true;$('receipt').hidden=true;$('receipt').textContent='';$('current').textContent='';
  for(const key of ['rule-editor','binding-editor','impact-table','proposal-detail','rule-select','binding-select','proposal-select','catalog','guidance-title','guidance-description','preparation-access','pending-summary'])$(key).replaceChildren();
  for(const key of ['reason','decision-reason','decision','precision'])$(key).value='';$('confirm').checked=false;$('impact').hidden=true;$('send-box').hidden=true;
 }
 function suspend(message){seq++;controller?.abort();controller=null;busy=false;access=null;clearViews();status(message,'warning');controls();}
 async function request(url,options={}){
  if(!live())throw Object.assign(Error('La pantalla no está visible.'),{name:'AbortError'});
  const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...options.headers},signal:controller?.signal}),text=await res.text();
  if(new TextEncoder().encode(text).byteLength>32*1024*1024)throw Error('La consulta completa supera la capacidad. No se mostraron propuestas parciales.');
  let payload;try{payload=JSON.parse(text);}catch{throw Error('No se pudo verificar la respuesta. Consultá el mismo intento.');}
  if(!res.ok||payload?.ok!==true){const error=Error(res.status===401?'La sesión venció. Volvé a ingresar.':res.status===403?'Tu cuenta no permite esta operación.':payload?.code==='OWN_PROGRAM_NOT_FOUND'?'El intento no está registrado.':res.status===409?'Cambió la propuesta o sus fuentes. Consultá el mismo intento y revisá el conjunto.':res.status===422?'Revisá fuentes, unidades, vigencias y respaldo del conjunto completo.':'No se confirmó la operación. Consultá el mismo intento.');error.status=res.status;error.code=payload?.code;throw error;}return payload;
 }
 async function session(required){
  const next=programWorkspaceAccess(await request('/api/internal-auth'));
  if(!required.every(c=>next.caps.has(c)))throw Object.assign(Error('Tu cuenta no permite esta operación de reglas.'),{status:403});
  if(access&&access.key!==next.key||attempt&&attempt.accessKey!==next.key)throw Object.assign(Error('Cambió la sesión. Recuperá el intento desde su cuenta original.'),{status:403});
  access=next;$('login').hidden=true;
 }
 async function perform(work){
  if(!live()||busy)return;const version=++seq;busy=true;const owned=new AbortController();controller=owned;controls();const timer=setTimeout(()=>owned.abort(),45000);
  try{await work(()=>version===seq&&live());}catch(error){if(version===seq&&live()){
   clearCopy();
   if([401,403].includes(error.status)){access=null;clearViews();$('login').hidden=error.status!==401;}
   status(error.name==='AbortError'?'No se confirmó la respuesta. Consultá el mismo intento antes de iniciar otro.':error.message,'warning');
  }}finally{clearTimeout(timer);if(version===seq){busy=false;controller=null;controls();}}
 }
 function field(parent,label,value,options,onChange,{type='text',key='',max=180}={}){
  const wrap=node('label',label),input=node(options?'select':type==='textarea'?'textarea':'input');input.setAttribute('aria-label',label);if(!options&&type!=='textarea')input.type=type;
  if(options){input.append(new Option('Elegir…',''),...Object.entries(options).map(([v,t])=>new Option(t,v)));}else{input.maxLength=max;if(type==='textarea')input.rows=3;}
  if(type==='decimal'){input.type='text';input.inputMode='decimal';}if(key)input.dataset.programField=key;
  input.value=value??'';input.addEventListener(options||type==='month'?'change':'input',()=>{if(attempt)return;onChange(input.value);invalidate();});wrap.append(input);parent.append(wrap);return input;
 }
 function rounding(parent,value,key){
  const group=node('div');group.className='own-program-grid';
  field(group,'Decimales',value.precision,Object.fromEntries(Array.from({length:9},(_,i)=>[String(i),String(i)])),v=>value.precision=v===''?null:Number(v),{key:key+'-precision'});
  const options={exact:PROGRAM_ROUNDING.exact};
  if(value.mode&&value.mode!=='exact')options[value.mode]=`Criterio histórico: ${PROGRAM_ROUNDING[value.mode]}`;
  const control=field(group,'Tratamiento de la precisión',value.mode,options,v=>value.mode=v,{key:key+'-rounding'});
  for(const option of control.options)if(option.value&&option.value!=='exact')option.disabled=true;
  parent.append(group);parent.append(node('p','Las reglas nuevas conservan el valor exacto. Si la precisión elegida no alcanza, el cálculo se detiene sin redondear ni truncar.'));
 }
 function renderExpression(rule){
  const area=node('div');area.className='own-program-expression';const size=expressionSize(rule.expression);area.append(node('p',`Fórmula: ${size.nodes} operaciones. Las unidades y conversiones se declaran expresamente.`));
  const labels={left:'Primer valor',right:'Segundo valor',value:'Valor',condition:'Condición',then:'Si se cumple',else:'Si no se cumple'};
  function walk(value,path,level){
   const card=node('fieldset');card.className='own-program-expression-node';card.style.setProperty('--program-depth',String(Math.min(level,6)));card.append(node('legend',path.length?path.map(p=>labels[p]).join(' · '):'Resultado de la fórmula'));
   const op=node('select');op.setAttribute('aria-label','Operación '+(path.join(' ')||'principal'));op.dataset.programExpressionPath=path.join('.');op.append(...Object.entries(PROGRAM_OPERATIONS).map(([v,t])=>new Option(t,v)));op.value=value.op;
   op.addEventListener('change',()=>{if(attempt)return;const replacement=changeExpressionOperation(value,op.value),candidate=clone(rule.expression);let target=candidate;
    if(!path.length){try{expressionSize(replacement);rule.expression=replacement;}catch(e){status(e.message,'warning');op.value=value.op;return;}}
    else{for(const p of path.slice(0,-1))target=target[p];target[path.at(-1)]=replacement;try{expressionSize(candidate);rule.expression=candidate;}catch(e){status(e.message,'warning');op.value=value.op;return;}}
    invalidate();renderRule();
   });const wrap=node('label','Operación');wrap.append(op);card.append(wrap);
   const group=node('div');group.className='own-program-grid';const key='expression-'+(path.join('-')||'root');
   if(['input','literal','convert'].includes(value.op))field(group,'Unidad',value.unit,PROGRAM_UNITS,v=>value.unit=v,{key:key+'-unit'});
   if(value.op==='input')field(group,'Identificador de la entrada',value.key,null,v=>value.key=v,{key:key+'-key',max:64});
   if(value.op==='literal')field(group,'Valor explícito',value.value,null,v=>value.value=v.replace(',','.'),{key:key+'-value',type:'decimal',max:106});
   if(value.op==='concept'){field(group,'Código del concepto',value.code,null,v=>value.code=v,{key:key+'-code',max:9});const stages={exact:'Resultado exacto, antes del redondeo'};if(value.stage==='rounded')stages.rounded='Etapa histórica: después del redondeo';const control=field(group,'Etapa del valor',value.stage,stages,v=>value.stage=v,{key:key+'-stage'});for(const option of control.options)if(option.value==='rounded')option.disabled=true;}
   if(value.op==='compare')field(group,'Comparación',value.operator,PROGRAM_COMPARE,v=>value.operator=v,{key:key+'-operator'});
   if(value.op==='convert'){field(group,'Factor exacto',value.factor,null,v=>value.factor=v.replace(',','.'),{key:key+'-factor',type:'decimal',max:106});field(group,'Respaldo de la conversión',value.conversionReference,null,v=>value.conversionReference=v,{key:key+'-reference'});}
   card.append(group);if(value.op==='round')rounding(card,value.rounding,key);area.append(card);
   for(const child of expressionChildren(value))walk(value[child],[...path,child],level+1);
  }walk(rule.expression,[],0);return area;
 }
 function selectors(){
  renderCopyChoices();
  $('rule-select').replaceChildren(...draft.rules.map((r,i)=>new Option(`${i+1}. Concepto ${r.code||'por definir'} · convenio ${r.agreementCode||'por definir'} · ${r.validFrom||'vigencia pendiente'}`,String(i))));
  $('binding-select').replaceChildren(...draft.bindings.map((b,i)=>new Option(`${i+1}. ${b.key||'Entrada por definir'} · convenio ${b.agreementCode||'por definir'}`,String(i))));
  ruleIndex=Math.max(0,Math.min(ruleIndex,draft.rules.length-1));bindingIndex=Math.max(0,Math.min(bindingIndex,draft.bindings.length-1));$('rule-select').value=String(ruleIndex);$('binding-select').value=String(bindingIndex);
 }
 function renderCopyChoices(){
  const selected=$('copy-source').value;
  $('copy-source').replaceChildren(new Option('Elegir regla…',''),...draft.rules.map(r=>new Option(`Concepto ${r.code||'por definir'} · convenio ${r.agreementCode||'por definir'} · ${r.validFrom||'vigencia pendiente'} · ${r.liquidationTypes.map(t=>OWN_RUN_TYPES[t]).join(', ')}`,ownProgramRuleKey(r))));
  if(draft.rules.some(r=>ownProgramRuleKey(r)===selected))$('copy-source').value=selected;
  renderCopySources();
  renderCopyTargets();
 }
 function copyFilteredSources(){const query=$('copy-search').value.trim().toLocaleLowerCase('es');return (draft?.rules??[]).filter(r=>`Concepto ${r.code} convenio ${r.agreementCode} ${r.validFrom} ${r.liquidationTypes.map(t=>OWN_RUN_TYPES[t]).join(' ')}`.toLocaleLowerCase('es').includes(query));}
 function copySelectionStatus(rows=copyFilteredSources()){
  const keys=new Set((draft?.rules??[]).map(ownProgramRuleKey)),missing=[...copySelection].filter(key=>!keys.has(key)).length;
  $('copy-selection').textContent=`${copySelection.size} fórmulas seleccionadas en todo el programa · ${rows.length} coincidencias${missing?` · ${missing} cambiaron: limpiá y revisá la selección`:''}. La búsqueda y la página no reducen la copia.`;
 }
 function renderCopySources(){
  const multiple=$('copy-multiple').checked;$('copy-single').hidden=multiple;$('copy-sources-panel').hidden=!multiple;
  const rows=copyFilteredSources(),pages=Math.max(1,Math.ceil(rows.length/25));copySourcePage=Math.max(1,Math.min(copySourcePage,pages));
  copySelectionStatus(rows);
  $('copy-page').textContent=`Página ${copySourcePage} de ${pages}`;$('copy-prev').disabled=copySourcePage<=1;$('copy-next').disabled=copySourcePage>=pages;
  $('copy-sources').replaceChildren(node('legend','Fórmulas de origen'));
  for(const r of rows.slice((copySourcePage-1)*25,copySourcePage*25)){
   const key=ownProgramRuleKey(r),label=node('label',`Concepto ${r.code||'por definir'} · convenio ${r.agreementCode||'por definir'} · ${r.validFrom||'vigencia pendiente'} · ${r.liquidationTypes.map(t=>OWN_RUN_TYPES[t]).join(', ')}`),input=node('input');input.type='checkbox';input.value=key;input.dataset.programCopyRule=key;input.checked=copySelection.has(key);label.className='own-program-check';label.prepend(input);
   input.addEventListener('change',()=>{if(attempt||busy)return;if(input.checked)copySelection.add(key);else copySelection.delete(key);invalidate();copySelectionStatus();renderCopyTargets();});$('copy-sources').append(label);
  }
 }
 function renderCopyTargets(){
  const selected=new Set([...$('copy-targets').querySelectorAll('input:checked')].map(i=>i.value));
  const sources=draft?.rules.filter(r=>$('copy-multiple').checked?copySelection.has(ownProgramRuleKey(r)):ownProgramRuleKey(r)===$('copy-source').value)??[],origins=new Set(sources.map(r=>r.agreementCode));
  $('copy-targets').replaceChildren(node('legend','Convenios de destino'));
  for(const agreement of [...new Set(boot?.salaryCatalog.items.filter(i=>i.active&&i.kind==='concept').map(i=>i.agreementCode)??[])].sort()){
   if(origins.has(agreement)&&!selected.has(agreement))continue;
   const label=node('label',`Convenio ${agreement}${origins.has(agreement)?' · también es origen: retiralo de los destinos o revisá las fórmulas elegidas':''}`),input=node('input');input.type='checkbox';input.value=agreement;input.dataset.programCopyTarget=agreement;input.checked=selected.has(agreement);input.addEventListener('change',invalidate);label.className='own-program-check';label.prepend(input);$('copy-targets').append(label);
  }
 }
 function renderRule(){
  $('rule-editor').replaceChildren();const r=draft?.rules[ruleIndex];if(!r)return;
  const group=node('div');group.className='own-program-grid';
  for(const [key,label] of [['agreementCode','Código de convenio'],['code','Código del concepto']])field(group,label,r[key],null,v=>{r[key]=v;selectors();},{key:key,max:9});
  field(group,'Naturaleza del resultado',r.nature,OWN_RUN_NATURES,v=>r.nature=v,{key:'nature'});field(group,'Unidad del resultado',r.unit,PROGRAM_UNITS,v=>r.unit=v,{key:'unit'});
  field(group,'Desde el período',r.validFrom,null,v=>r.validFrom=v,{key:'validFrom',type:'month'});field(group,'Hasta el período (vacío: sin término)',r.validUntil,null,v=>r.validUntil=v||null,{key:'validUntil',type:'month'});
  $('rule-editor').append(group);const types=node('fieldset');types.append(node('legend','Tipos de liquidación donde se aplica'));
  for(const [code,label] of Object.entries(OWN_RUN_TYPES)){const wrap=node('label',label),input=node('input');input.type='checkbox';input.checked=r.liquidationTypes.includes(code);input.dataset.programType=code;input.addEventListener('change',()=>{if(attempt)return;r.liquidationTypes=input.checked?[...r.liquidationTypes,code]:r.liquidationTypes.filter(t=>t!==code);invalidate();});wrap.prepend(input);wrap.className='own-program-check';types.append(wrap);}
  $('rule-editor').append(types);field($('rule-editor'),'Respaldo de la regla',r.ruleReference,null,v=>r.ruleReference=v,{key:'ruleReference'});rounding($('rule-editor'),r.rounding,'result');$('rule-editor').append(renderExpression(r));
  const historical=historicalRules.has(r),remove=node('button','Retirar esta regla de la preparación');remove.type='button';remove.disabled=historical;remove.addEventListener('click',()=>{if(attempt||historical)return;draft.rules.splice(ruleIndex,1);invalidate();selectors();renderRule();});$('rule-editor').append(remove);
  if(historical)$('rule-editor').append(node('p','Esta regla ya tiene historial. Conservá su código, convenio, inicio y tipos de liquidación; cerrá su vigencia para reemplazarla por una regla nueva.'));
 }
 function renderBinding(){
  $('binding-editor').replaceChildren();const b=draft?.bindings[bindingIndex];if(!b)return;const group=node('div');group.className='own-program-grid';
  field(group,'Código de convenio',b.agreementCode,null,v=>{b.agreementCode=v;selectors();},{key:'binding-agreement',max:9});field(group,'Identificador utilizado en la fórmula',b.key,null,v=>{b.key=v;selectors();},{key:'binding-key',max:64});
  field(group,'Fuente del valor',b.sourceKind,PROGRAM_SOURCES,v=>{b.sourceKind=v;if(v==='scale_reference'){b.sourceAgreementCode='';b.sourceCategoryCode='';b.sourceCode='';}else{delete b.sourceAgreementCode;delete b.sourceCategoryCode;}renderBinding();},{key:'binding-source'});
  if(b.sourceKind==='scale_reference'){
   const scales=boot.salaryCatalog.items.filter(i=>i.active&&i.kind==='scale');
   const choices=(rows,key,current,label)=>{const out=Object.fromEntries(rows.map(i=>[i[key],label(i)]));if(current&&!out[current])out[current]=current+' · sin escala aprobada en esta consulta';return out;};
   field(group,'Convenio de la escala de referencia',b.sourceAgreementCode,choices(scales,'agreementCode',b.sourceAgreementCode,i=>'Convenio '+i.agreementCode),v=>{b.sourceAgreementCode=v;b.sourceCode='';b.sourceCategoryCode='';renderBinding();},{key:'binding-source-agreement'});
   const agreementRows=scales.filter(i=>i.agreementCode===b.sourceAgreementCode);
   field(group,'Código de la escala aprobada',b.sourceCode,choices(agreementRows,'code',b.sourceCode,i=>'Escala '+i.code),v=>{b.sourceCode=v;b.sourceCategoryCode='';renderBinding();},{key:'binding-code'});
   const sourceRows=agreementRows.filter(i=>i.code===b.sourceCode);
   const categories=[...new Set(sourceRows.map(i=>i.categoryCode))].map(categoryCode=>({categoryCode,label:[...new Set(sourceRows.filter(i=>i.categoryCode===categoryCode).map(i=>i.label))].join(' / ')}));
   field(group,'Clase de referencia aprobada',b.sourceCategoryCode,choices(categories,'categoryCode',b.sourceCategoryCode,i=>'Clase '+i.categoryCode+' · '+i.label),v=>b.sourceCategoryCode=v,{key:'binding-source-category'});
  }else field(group,'Código de la fuente aprobada',b.sourceCode,null,v=>b.sourceCode=v,{key:'binding-code',max:9});
  field(group,'Unidad de la entrada',b.unit,PROGRAM_UNITS,v=>b.unit=v,{key:'binding-unit'});field(group,'Si no hay filas en la fuente completa',b.onMissing,{error:'Bloquear y revisar',zero:'Cero expresamente autorizado'},v=>b.onMissing=v,{key:'binding-missing'});
  field(group,'Si hay más de una fila',b.combine,{single:'Exigir un único valor',sum:'Sumar expresamente'},v=>b.combine=v,{key:'binding-combine'});$('binding-editor').append(group);
  field($('binding-editor'),'Respaldo de la entrada',b.ruleReference,null,v=>b.ruleReference=v,{key:'binding-reference'});$('binding-editor').append(node('p','Un parámetro o escala ausente bloquea. El cero sólo puede corresponder a ausencia de filas en una fuente completa cuando la regla lo autoriza.'));
  if(b.sourceKind==='scale_reference')$('binding-editor').append(node('p','Esta entrada usa el convenio y la clase elegidos, aunque el empleado pertenezca a otra clase. La escala debe estar aprobada y cubrir toda la vigencia de la regla. Un coeficiente se declara en la fórmula con su respaldo.'));
  const remove=node('button','Retirar esta entrada de la preparación');remove.type='button';remove.addEventListener('click',()=>{if(attempt)return;draft.bindings.splice(bindingIndex,1);invalidate();selectors();renderBinding();});$('binding-editor').append(remove);
 }
 function describe(row,kind){if(!row)return 'No existe';if(kind==='bindings')return `Convenio ${row.agreementCode}; entrada ${row.key}; ${PROGRAM_SOURCES[row.sourceKind]} ${row.sourceCode}${row.sourceKind==='scale_reference'?'; convenio de referencia '+row.sourceAgreementCode+'; clase de referencia '+row.sourceCategoryCode:''}; ${PROGRAM_UNITS[row.unit]}; ausencia ${row.onMissing==='error'?'bloquea':'cero expresamente autorizado'}; ${row.combine==='single'?'único valor':'suma expresa'}; respaldo: ${row.ruleReference}`;
  return `Convenio ${row.agreementCode}; concepto ${row.code}; ${OWN_RUN_NATURES[row.nature]}; ${PROGRAM_UNITS[row.unit]}; desde ${row.validFrom} hasta ${row.validUntil??'sin término'}; ${row.liquidationTypes.map(t=>OWN_RUN_TYPES[t]).join(', ')}; ${row.rounding.precision} decimales (${PROGRAM_ROUNDING[row.rounding.mode]}); respaldo: ${row.ruleReference}\n${describeProgramExpression(row.expression)}`;
 }
 function comparison(parent,before,after){
  const diff=programWorkspaceChanges(before,after);parent.replaceChildren();parent.append(node('p',`Conjunto completo: ${after.rules.length} reglas, ${after.bindings.length} entradas; ${diff.changed} cambios. Precisión de totales: ${diff.totalsPrecision.before??'sin programa'} → ${diff.totalsPrecision.after}.`));
  const scroll=node('div');scroll.className='own-program-table';scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Programa completo antes y después');const table=node('table');table.append(node('caption','Todas las reglas y entradas; la decisión abarca el conjunto completo'));
  const head=node('thead'),hr=node('tr');for(const label of ['Elemento','Cambio','Antes','Después']){const th=node('th',label);th.scope='col';hr.append(th);}head.append(hr);table.append(head);const body=node('tbody');
  const labels={added:'Nuevo',removed:'Retirado',modified:'Modificado',unchanged:'Conservado'};
  for(const row of diff.rows){const tr=node('tr');tr.append(node('td',row.kind==='rules'?'Regla':'Entrada'),node('td',labels[row.status]),node('td',describe(row.before,row.kind)),node('td',describe(row.after,row.kind)));body.append(tr);}table.append(body);scroll.append(table);parent.append(scroll);return diff;
 }
 function showPrepared(body){prepared=body;$('confirm').checked=false;$('send-box').hidden=false;$('operation').textContent=body.command==='propose'?'Se registrará una propuesta para revisión independiente.':body.command==='approve'?'Se aprobará exactamente el programa revisado. No calcula ni paga haberes.':'Se rechazará exactamente esta propuesta, conservando sus antecedentes.';controls();$('send-box').scrollIntoView({block:'nearest',behavior:'smooth'});}
 function renderProposal(){
  $('proposal-detail').replaceChildren();const p=boot?.proposals.find(p=>p.id===$('proposal-select').value);if(!p){$('proposal-detail').textContent='No hay propuestas en esta consulta.';controls();return;}
  $('proposal-detail').append(node('p',`${stateLabels[p.status]} · ${p.authorLabel} · ${date(p.createdAt)}`),node('p','Fundamento: '+p.reason));
  const detail=node('div');comparison(detail,p.baseDefinition,p.definition);$('proposal-detail').append(detail);
  if(p.decision)$('proposal-detail').append(node('p',`${stateLabels[p.status]} por ${p.decision.actorLabel} · ${date(p.decision.recordedAt)} · ${p.decision.reason}`));
  if(p.status==='pending'&&!p.canReview)$('proposal-detail').append(node('p','Esta propuesta necesita la decisión de otra persona habilitada.'));
  if(p.status==='pending'&&(p.baseVersion!==boot.program.version||p.salaryVersion!==boot.salaryCatalog.version))$('proposal-detail').append(node('p','Cambió la base o el catálogo. No puede aprobarse esta versión; puede rechazarse conservando el historial.'));controls();
 }
 function renderBoot(value){
  boot=ownProgramBootstrap(value);$('content').hidden=false;$('current').textContent=`Programa aprobado: revisión ${boot.program.revision}. Catálogo salarial: revisión ${boot.salaryCatalog.revision}.`;
  const guidance=programWorkspaceGuidance(boot),messages={
   catalog_required:['Primero: aprobar el maestro salarial propio','Todavía no hay una revisión aprobada de conceptos y escalas. Prepará el maestro con sus vigencias y respaldo; otra persona debe revisarlo antes de preparar reglas.'],
   program_required:['Siguiente paso: preparar y revisar las reglas','El maestro salarial tiene una revisión aprobada. Todavía no hay un programa propio aprobado. Prepará las fórmulas, entradas, unidades y vigencias para su revisión independiente.'],
   catalog_changed:['Revisar las reglas con el maestro actualizado','El programa aprobado utiliza otra revisión del maestro salarial. Revisá todas las reglas y fuentes con el maestro actual y enviá una nueva propuesta. El programa anterior conserva su historial.'],
   linked:['Programa y maestro vinculados','El programa aprobado conserva la misma revisión del maestro consultado. Los cálculos requieren además su población, novedades, fuentes y decisiones verificadas.'],
  };
  [$('guidance-title').textContent,$('guidance-description').textContent]=messages[guidance.state];
  $('guidance').dataset.state=guidance.state;
  $('preparation-access').textContent=guidance.preparationAllowed?'Tu cuenta tiene habilitada la preparación; las propuestas no aprueban las reglas.':'Esta cuenta puede consultar. La preparación requiere permiso y un vínculo municipal verificado. No se habilita desde esta pantalla.';
  $('pending-summary').textContent=guidance.pendingCount?`${guidance.pendingCount} propuestas pendientes en la consulta completa · ${guidance.reviewableCount} compatibles y habilitadas para tu revisión. Las demás pueden necesitar otra persona o fuentes actualizadas.`:'No hay propuestas de reglas pendientes en la consulta completa.';
  $('pending-link').hidden=guidance.pendingCount===0;
  $('catalog').replaceChildren();const catalog=node('div');catalog.className='own-program-table';catalog.tabIndex=0;catalog.setAttribute('role','region');catalog.setAttribute('aria-label','Catálogo aprobado completo');const table=node('table');table.append(node('caption',`Catálogo completo: ${boot.salaryCatalog.items.length} definiciones. Los valores ausentes no equivalen a cero.`));
  const head=node('thead'),row=node('tr');for(const title of ['Convenio','Código y definición','Unidad y valor','Vigencia','Respaldo']){const th=node('th',title);th.scope='col';row.append(th);}head.append(row);table.append(head);const body=node('tbody');
  for(const item of boot.salaryCatalog.items){const tr=node('tr');tr.append(node('td',item.agreementCode),node('td',`${item.code} · ${item.label}${item.categoryCode===null?'':' · clase '+item.categoryCode}\n${item.kind==='scale'?'Escala':'Concepto'} · ${item.active?'Activo':'Inactivo'}`),node('td',`${PROGRAM_UNITS[item.unit]} · ${item.value===null?'Sin valor':item.value}`),node('td',`${item.validFrom} a ${item.validUntil??'sin término'}`),node('td',item.ruleReference));body.append(tr);}table.append(body);catalog.append(table);$('catalog').append(catalog);
  if(!draft){draft=clone(boot.program.definition??{rules:[],bindings:[],totalsPrecision:null});historicalRules=new WeakSet(boot.program.definition?draft.rules:[]);}
  const priorKeys=new Set(boot.program.definition?.rules.map(ownProgramRuleKey)??[]);for(const rule of draft.rules)if(priorKeys.has(ownProgramRuleKey(rule)))historicalRules.add(rule);
  $('precision').value=draft.totalsPrecision===null?'':String(draft.totalsPrecision);selectors();renderRule();renderBinding();
  const selected=$('proposal-select').value;$('proposal-select').replaceChildren(...boot.proposals.map((p,i)=>new Option(`${i+1}. ${stateLabels[p.status]} · ${date(p.createdAt)} · ${p.authorLabel}`,p.id)));if(boot.proposals.some(p=>p.id===selected))$('proposal-select').value=selected;
  $('form').hidden=tab!=='edit';$('proposals').hidden=tab!=='review';renderProposal();controls();
 }
 function showReceipt(value){receipt=value;notFound=false;$('receipt').hidden=false;$('receipt').textContent=`${value.status==='pending'?'Propuesta registrada para revisión independiente':value.status==='approved'?'Programa aprobado':'Propuesta rechazada'} · revisión ${value.revision}. Conservá este intento para consultar su comprobante.`;status('Operación confirmada. Actualizar o consultar no calcula haberes.','success');controls();}
 function refresh(){return perform(async valid=>{await session(PROGRAM_READ);if(!valid())return;const value=ownProgramBootstrap((await request(endpoint+'?resource=bootstrap')).data);if(!valid())return;invalidate();renderBoot(value);status(attempt?'Acceso verificado. Consultá o reintentá exactamente el mismo envío.':'Consulta completa y acceso verificados.');});}
 function recover(){if(!attempt)return;return perform(async valid=>{await session(capsFor(attempt.body.command));if(!valid())return;try{const value=await verifiedProgramWorkspaceReceipt((await request(endpoint+'?resource=attempt&key='+encodeURIComponent(attempt.key))).data,attempt);if(valid())showReceipt(value);}catch(e){if(e.status===404&&e.code==='OWN_PROGRAM_NOT_FOUND'&&valid()){notFound=true;status('El intento consultado no está registrado. Podés revisar la preparación.','warning');controls();}else throw e;}});}
 function send(){if(!attempt&&!prepared)return;return perform(async valid=>{
  const command=attempt?.body.command??prepared.command;await session(capsFor(command));if(!valid())return;
  if(!attempt){
   if(!$('confirm').checked)throw Error('Confirmá que revisaste todo el programa antes de registrar.');
   const latest=ownProgramBootstrap((await request(endpoint+'?resource=bootstrap')).data);if(!valid())return;
   const checked=command==='propose'?prepareProgramWorkspace(latest,draft,$('reason').value):decideProgramWorkspace(latest,prepared.proposalId,command,$('decision-reason').value,true);
   if(salarySerialized(checked)!==salarySerialized(prepared)){invalidate();boot=latest;throw Error('Cambió el programa, catálogo o fundamento. Revisá de nuevo el conjunto completo.');}
   attempt=programWorkspaceAttempt(crypto.randomUUID(),prepared,access.key);
  }
  controls();const body=JSON.stringify({operation:'command',payload:attempt.body});if(new TextEncoder().encode(body).byteLength>OWN_PROGRAM_MAX_BYTES)throw Error('El programa completo supera la capacidad. No se recortaron reglas.');
  const value=await verifiedProgramWorkspaceReceipt((await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.key},body})).data,attempt);if(valid())showReceipt(value);
 });}
 $('prepare').addEventListener('click',()=>{if(!draft||attempt||busy)return;try{const body=prepareProgramWorkspace(boot,draft,$('reason').value);comparison($('impact-table'),boot.program.definition,body.program);$('impact-summary').textContent='Revisá todas las reglas, entradas y vigencias antes de registrar la propuesta.';$('impact').hidden=false;showPrepared(body);}catch(e){invalidate();status(e.message,'warning');}});
 $('copy-source').addEventListener('change',()=>{invalidate();renderCopyTargets();});
 $('copy-multiple').addEventListener('change',()=>{invalidate();renderCopySources();renderCopyTargets();});
 $('copy-search').addEventListener('input',()=>{copySourcePage=1;renderCopySources();});
 for(const [key,step] of [['copy-prev',-1],['copy-next',1]])$(key).addEventListener('click',()=>{copySourcePage+=step;renderCopySources();});
 $('copy-select-filtered').addEventListener('click',()=>{if(attempt||busy)return;for(const r of copyFilteredSources())copySelection.add(ownProgramRuleKey(r));invalidate();renderCopySources();renderCopyTargets();});
 $('copy-clear-selection').addEventListener('click',()=>{if(attempt||busy)return;copySelection.clear();invalidate();renderCopySources();renderCopyTargets();});
 for(const key of ['copy-from','copy-until','copy-mode','copy-reference'])$(key).addEventListener(key==='copy-reference'?'input':'change',invalidate);
 $('copy-confirm').addEventListener('change',controls);
 $('copy-preview').addEventListener('click',()=>{
  if(!draft||attempt||busy||!can(capsFor('propose')))return;
  perform(async valid=>{invalidate();await session(capsFor('propose'));if(!valid())return;
   const latest=ownProgramBootstrap((await request(endpoint+'?resource=bootstrap')).data);if(!valid())return;
   if(latest.scopeVersion!==boot.scopeVersion||latest.program.version!==boot.program.version||latest.salaryCatalog.version!==boot.salaryCatalog.version)throw Error('Cambió el programa o el catálogo. Actualizá y revisá todas las fuentes.');
   const multiple=$('copy-multiple').checked,intent={...(multiple?{sourceKeys:[...copySelection]}:{sourceKey:$('copy-source').value}),targets:[...$('copy-targets').querySelectorAll('input:checked')].map(i=>i.value),validFrom:$('copy-from').value,validUntil:$('copy-until').value||null,ruleReference:$('copy-reference').value,mode:$('copy-mode').value};
   copyPlan=multiple?prepareProgramCopies(latest,draft,intent):prepareProgramCopy(latest,draft,intent);
   const sourceCount=multiple?intent.sourceKeys.length:1;$('copy-summary').textContent=`${sourceCount} fórmulas de origen × ${intent.targets.length} convenios de destino: ${sourceCount*intent.targets.length} reglas nuevas. Se revisan también todas las reglas y fuentes anteriores.`;
   comparison($('copy-comparison'),draft,copyPlan.program);$('copy-review').hidden=false;status('Copia completa revisada contra las fuentes consultadas. Confirmá antes de aplicarla al borrador.');controls();
  });
 });
 $('copy-apply').addEventListener('click',()=>{
  if(!copyPlan||attempt||busy||!$('copy-confirm').checked||!can(capsFor('propose')))return;
  const reviewed=copyPlan;perform(async valid=>{await session(capsFor('propose'));if(!valid())return;
   const latest=ownProgramBootstrap((await request(endpoint+'?resource=bootstrap')).data);if(!valid())return;
   const next=applyProgramCopy(latest,draft,reviewed);invalidate();draft=next;boot=latest;
   const priorKeys=new Set(boot.program.definition?.rules.map(ownProgramRuleKey)??[]);historicalRules=new WeakSet(draft.rules.filter(r=>priorKeys.has(ownProgramRuleKey(r))));selectors();renderRule();renderBinding();
   status('Copia aplicada al borrador completo. Revisá el programa y su fundamento antes de registrar una propuesta.','success');
  });
 });
 $('review-decision').addEventListener('click',()=>{if(attempt||busy)return;try{showPrepared(decideProgramWorkspace(boot,$('proposal-select').value,$('decision').value,$('decision-reason').value,true));}catch(e){invalidate();status(e.message,'warning');}});
 $('add-rule').addEventListener('click',()=>{if(!draft||attempt)return;if(draft.rules.length>=1000){status('El programa alcanzó su capacidad. No se omitieron reglas.','warning');return;}draft.rules.push({agreementCode:'',code:'',nature:'',unit:'',validFrom:'',validUntil:null,liquidationTypes:[],ruleReference:'',rounding:{precision:null,mode:'exact'},expression:{op:'literal',unit:'',value:''}});ruleIndex=draft.rules.length-1;invalidate();selectors();renderRule();});
 $('add-binding').addEventListener('click',()=>{if(!draft||attempt)return;if(draft.bindings.length>=1000){status('El programa alcanzó su capacidad. No se omitieron entradas.','warning');return;}draft.bindings.push({agreementCode:'',key:'',unit:'',sourceKind:'',sourceCode:'',onMissing:'',combine:'',ruleReference:''});bindingIndex=draft.bindings.length-1;invalidate();selectors();renderBinding();});
 $('rule-select').addEventListener('change',()=>{ruleIndex=Number($('rule-select').value);renderRule();});$('binding-select').addEventListener('change',()=>{bindingIndex=Number($('binding-select').value);renderBinding();});
 for(const [key,value] of [['edit-tab','edit'],['review-tab','review']])$(key).addEventListener('click',()=>{if(attempt)return;tab=value;invalidate();$('form').hidden=tab!=='edit';$('proposals').hidden=tab!=='review';controls();});
 $('precision').addEventListener('change',()=>{if(draft&&!attempt){draft.totalsPrecision=$('precision').value===''?null:Number($('precision').value);invalidate();}});
 for(const key of ['reason','decision-reason','decision'])$(key).addEventListener(key==='decision'?'change':'input',invalidate);
 $('proposal-select').addEventListener('change',()=>{invalidate();$('decision').value='';$('decision-reason').value='';renderProposal();});$('confirm').addEventListener('change',controls);
 $('pending-link').addEventListener('click',()=>{if(busy||attempt||!can(PROGRAM_READ))return;tab='review';$('form').hidden=true;$('proposals').hidden=false;const selected=boot.proposals.find(p=>p.id===$('proposal-select').value);if(selected?.status!=='pending')$('proposal-select').value=boot.proposals.find(p=>p.status==='pending')?.id??'';renderProposal();$('proposal-select').focus();});
 $('form').addEventListener('submit',e=>e.preventDefault());$('refresh').addEventListener('click',refresh);$('send').addEventListener('click',send);$('recover').addEventListener('click',recover);
 $('new').addEventListener('click',()=>{if(!receipt||busy)return;attempt=null;clearViews();refresh();});
 $('revise').addEventListener('click',()=>{if(!notFound||busy)return;const previous=attempt.body;attempt=null;clearViews();if(previous.command==='propose'){draft=clone(previous.program);$('reason').value=previous.reason;}refresh();});
 $('login').addEventListener('click',()=>location.assign('/acceso?next=%2Fnomina%23reglas'));
 const task=e=>{active=e.detail?.id==='reglas';if(active)refresh();else suspend('Se retiró la vista al cambiar de tarea. Abrí Reglas para verificar el acceso.');};
 const visibility=()=>{if(document.hidden)suspend('Se retiró la vista al ocultar la página. Actualizá el acceso para consultar el intento.');else controls();};
 const capabilities=e=>{if(!access)return;const next=new Set(e.detail?.tenantCapabilities??[]);if([...access.caps].some(c=>(PROGRAM_READ.includes(c)||['payroll.parameter.prepare','payroll.parameter.approve'].includes(c))&&!next.has(c)))suspend('Se retiró la vista por un cambio de permisos.');else{access.caps=new Set([...access.caps].filter(c=>next.has(c)));invalidate();controls();}};
 document.addEventListener('taskchange',task);document.addEventListener('visibilitychange',visibility);document.addEventListener('municontrol:capabilities-ready',capabilities);
 document.getElementById('logoutButton')?.addEventListener('click',()=>suspend('Sesión cerrada. Se retiró la vista.'));
 const poll=setInterval(()=>{if(live()&&!busy&&access)perform(async valid=>{await session(attempt?capsFor(attempt.body.command):PROGRAM_READ);if(valid())controls();});},60000);
 window.addEventListener('pagehide',()=>{stopped=true;active=false;suspend('Página cerrada.');clearInterval(poll);document.removeEventListener('taskchange',task);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('municontrol:capabilities-ready',capabilities);},{once:true});controls();return {refresh};
}
