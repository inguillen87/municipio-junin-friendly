import {ownRunBootstrap,ownRunCommand,OWN_RUN_MAX_RESPONSE} from './own-payroll-run-model.js';
import {validateCatalogBootstrap} from './native-employment-catalog-model.js';
import {createEmployeePicker} from './employee-picker.js';
import {mountPositionCapture} from './position-capture-panel.js';
import {salaryUuid} from './native-salary-catalog-model.js';
import {verifiedOwnLiquidationDetail,verifiedOwnLiquidationReceipt,ownLiquidationIndividual,ownLiquidationNextPreparation} from './own-payroll-liquidation-model.js';
import {verifiedOwnAnnulReceipt,verifiedOwnAnnulDetail,ownAnnulNextPreparation} from './own-payroll-annulment-model.js';
import {mountOwnPayrollIndividual} from './own-payroll-individual-panel.js';
import {OWN_RUN_READ,OWN_RUN_NOMINAL,OWN_RUN_PREPARE,OWN_RUN_TYPES,OWN_RUN_NATURES,hasOwnRunAccess,ownRunWorkspaceAccess,ownRunWorkspaceAttempt,verifiedWorkspaceCapture,ownRunWorkspaceResult,ownRunWorkspaceRows,ownRunWorkspaceCsv,formatOwnRunDecimal} from './own-payroll-run-workspace-model.js';

import {ownRunDate,ownRunDateLabel,ownRunPeriodEnd} from './own-payroll-run-date.js';
import {OWN_RUN_COMMAND_VERSION} from './own-payroll-run-model.js';
const endpoint='/api/internal-own-payroll-run';
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const labelDate=value=>new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));
const errors={
  OWN_RUN_PROGRAM_REQUIRED:'Falta aprobar un programa propio compatible con las definiciones salariales. El cálculo no se completó.',
  OWN_RUN_PROGRAM_CHANGED:'Cambió el programa aprobado. Consultá el intento antes de revisar otra preparación.',
  OWN_RUN_PRORATION_REQUIRED:'Hay una vigencia laboral parcial. Se necesita una regla de prorrateo aprobada; no se supusieron días ni horas.',
  OWN_RUN_HISTORY_REQUIRED:'Falta verificar el encuadre histórico propio de este período.',
  OWN_RUN_SOURCE_VIGENCY_INVALID:'Hay un registro sin vigencia laboral verificada para todo el período. Revisá sus fechas y consultá este intento antes de preparar otro cálculo.',
  OWN_RUN_SOURCE_IDENTITY_CHANGED:'Cambió la identidad de un registro del alcance. Revisá su vínculo y consultá este intento antes de otra captura.',
  OWN_RUN_SOURCE_UNUSED:'El programa aprobado no contempla todas las novedades capturadas. Revisá sus conceptos; no se omitieron novedades ni se completó el cálculo.',
  OWN_RUN_SOURCE_VALUE_MISSING:'Falta un valor requerido en las novedades capturadas. Revisá importe y unidades; un dato ausente no se tomó como cero.',
  OWN_RUN_SELECTION_INVALID:'No se pudo verificar todo el alcance. Revisá los legajos y su vigencia.',
  OWN_RUN_LIMIT:'El conjunto completo supera la capacidad. No se omitieron ni dividieron filas.',
  OWN_RUN_BUSY:'Otra operación está en curso. Consultá o reintentá este mismo cálculo.',
  OWN_RUN_ENGINE_CHANGED:'Cambió la versión del motor. La captura anterior se conserva y no se recalcula con otra versión.',
  OWN_RUN_FORBIDDEN:'Tu cuenta ya no permite consultar o calcular esta nómina.',
  OWN_RUN_SESSION_INVALID:'La sesión venció. Volvé a ingresar con la cuenta original.',
  OWN_RUN_NOT_FOUND:'Este intento todavía no está registrado. Podés reintentarlo con el mismo contenido.',
};
export function mountOwnPayrollRun(host,{onReview}={}) {
  for(const file of ['own-payroll-run-panel.css','employee-picker.css']){
    const href=new URL(file,import.meta.url).href;
    if(![...document.querySelectorAll('link[rel=stylesheet]')].some(l=>l.href===href)){const link=node('link');link.rel='stylesheet';link.href=href;document.head.append(link);}
  }
  host.className='own-run';
  host.innerHTML=`<header class="own-run-head"><div><p class="own-run-eyebrow">LIQUIDACIÓN · MOTOR PROPIO</p><h2>Calcular nómina</h2><p>Elegí el período y el alcance. Se conservan el programa aprobado, las novedades y el resultado de cada cálculo.</p></div><button class="button" type="button" data-own-refresh>Actualizar acceso y corridas</button></header>
  <p class="own-run-status" role="status" aria-live="polite" data-own-status>Abrí Calcular para consultar.</p><button class="button" type="button" data-own-login hidden>Ingresar con la cuenta original</button>
  <form data-own-form><fieldset data-own-fields disabled><legend>1 · Preparar el cálculo</legend><div class="own-run-grid">
    <label for="ownRunPeriod">Período<input id="ownRunPeriod" data-own-period type="month" required></label>
    <div class="own-run-date"><label for="ownRunDate">Fecha de liquidación<input id="ownRunDate" data-own-date type="date" min="1900-01-01" max="2099-12-31" required aria-describedby="ownRunDateHelp"></label><small id="ownRunDateHelp">Fecha declarada de este cálculo. Las reglas aprobadas se aplican al período; esta fecha no es una fecha de pago.</small><button class="button" type="button" data-own-period-end>Usar último día del período</button></div>
    <label for="ownRunType">Tipo de liquidación<select id="ownRunType" data-own-type required><option value="">Elegí el tipo</option></select></label>
    <label for="ownRunKind">Alcance<select id="ownRunKind" data-own-kind required><option value="">Elegí el alcance</option><option value="contracts">Legajos seleccionados</option><option value="departments">Reparticiones</option><option value="agreements">Convenios</option><option value="all">Todos los legajos propios elegibles</option></select></label></div>
    <div data-own-contracts hidden><button class="button" type="button" data-own-picker>Buscar y agregar legajos</button><div class="own-run-chips" data-own-chips></div></div>
    <label data-own-codes-box hidden for="ownRunCodes">Opciones del encuadre municipal<select id="ownRunCodes" data-own-codes multiple size="5" aria-describedby="ownRunCodesHelp"></select><small id="ownRunCodesHelp">Podés elegir varias opciones. El cálculo vuelve a verificar el conjunto completo.</small></label>
    <p data-own-scope>Elegí expresamente el alcance.</p>
    <label class="own-run-confirm"><input type="checkbox" data-own-confirm>Revisé el período, la fecha, el tipo y todo el alcance. El resultado quedará pendiente de confirmación y cierre.</label>
  </fieldset><div class="own-run-actions"><button class="button primary" type="submit" data-own-send disabled>Calcular y guardar resultado</button><button class="button" type="button" data-own-recover hidden disabled>Consultar este intento</button><button class="button" type="button" data-own-new hidden disabled>Preparar otro cálculo</button><button class="button" type="button" data-own-revise hidden disabled>Revisar preparación no registrada</button></div></form>
  <section data-own-result hidden aria-labelledby="ownRunResultTitle"><header class="own-run-head"><div><h3 id="ownRunResultTitle" tabindex="-1">2 · Resultado calculado</h3><p data-own-result-summary></p></div><button class="button" type="button" data-own-download disabled>Descargar detalle completo CSV</button></header>
    <p class="own-run-notice">Importes del cálculo guardado. Consultá el resumen individual para verificar su estado actual. Este cálculo no es un recibo ni una orden de pago.</p>
    <button class="button" type="button" data-own-review disabled>Revisar confirmación y anulación</button>
    <div class="own-run-scroll" tabindex="0" role="region" aria-label="Totales por legajo, tabla desplazable"><table><caption>Totales por legajo de la corrida guardada</caption><thead><tr><th>Legajo</th><th>Bruto</th><th>Retenciones</th><th>Neto calculado</th><th>Aportes patronales</th><th>Resumen</th></tr></thead><tbody data-own-totals></tbody></table></div><section data-own-individual hidden></section>
    <label for="ownRunSearch">Buscar legajo o concepto en el resultado<input id="ownRunSearch" data-own-search type="search" maxlength="100" autocomplete="off"></label>
    <p data-own-range></p><div class="own-run-scroll" tabindex="0" role="region" aria-label="Detalle por concepto, tabla desplazable"><table><caption>Detalle por concepto · la búsqueda no limita la descarga</caption><thead><tr><th>Legajo</th><th>Concepto</th><th>Naturaleza</th><th>Valor calculado</th><th>Respaldo</th></tr></thead><tbody data-own-rows></tbody></table></div>
    <nav class="own-run-actions" aria-label="Páginas del detalle"><button class="button" type="button" data-own-prev>Anterior</button><span data-own-page></span><button class="button" type="button" data-own-next>Siguiente</button></nav>
    <details><summary>Ver versiones y trazabilidad</summary><dl data-own-trace></dl></details><div data-own-position-capture></div>
  </section>
  <section aria-labelledby="ownRunHistoryTitle"><h3 id="ownRunHistoryTitle">Cálculos propios guardados</h3><p>Consultá un resultado o recuperá una captura pendiente. Abrir una corrida no ejecuta otro cálculo.</p><div data-own-history></div></section>`;
  const $=s=>host.querySelector('[data-own-'+s+']');
  const positionCapture=mountPositionCapture($('position-capture'));
  for(const [value,text]of Object.entries(OWN_RUN_TYPES)){const option=node('option',text);option.value=value;$('type').append(option);}
  let active=false,stopped=false,busy=false,seq=0,controller=null,access=null,boot=null,catalog=null,chosen=[],attempt=null,current=null,notFound=false,page=1,knownSavedKey=null,queuedPreparation=null;
  const live=()=>active&&!stopped&&!document.hidden&&host.isConnected;
  const can=required=>live()&&hasOwnRunAccess(access?.caps,required);
  const canPrepare=()=>can(OWN_RUN_PREPARE)&&boot?.canCalculate===true;
  const individual=mountOwnPayrollIndividual($('individual'),{id:'ownRunIndividual',canUse:()=>can(OWN_RUN_NOMINAL),returnFocus:()=>$('result').querySelector('h3')});
  const picker=createEmployeePicker({instanceId:'ownRunPicker',canUse:()=>canPrepare()&&!busy&&!attempt,selectionIssue:item=>item.recordOrigin==='MUNICONTROL'?null:'Este cálculo admite registros propios de MuniControl. El legajo seleccionado pertenece a la fuente histórica.',onDirectoryInvalidated:()=>{chosen=[];$('confirm').checked=false;renderChosen();}});
  const status=(text,state='neutral')=>{$('status').textContent=text;$('status').dataset.state=state;};
  function controls(){
    positionCapture.setAvailable(can(['workforce.employee.read','workforce.structure.read','payroll.calculation.read']));
    $('fields').disabled=busy||!canPrepare()||!!attempt;$('refresh').disabled=busy||!live();
    $('send').disabled=busy||!canPrepare()||!!current?.saved||!attempt&&!$('confirm').checked||!!attempt&&!attempt.body;
    $('send').textContent=attempt?'Reintentar el mismo cálculo':'Calcular y guardar resultado';
    $('send').hidden=!!current?.saved;
    $('recover').hidden=!attempt;$('recover').disabled=busy||!can(OWN_RUN_NOMINAL);
    $('recover').textContent=current?.saved?'Actualizar este resultado':'Consultar este intento';
    $('new').hidden=!current?.saved;$('new').disabled=busy||!canPrepare();
    $('revise').hidden=!attempt||!notFound;$('revise').disabled=busy||!canPrepare();
    $('download').disabled=busy||!current?.saved||!can(OWN_RUN_NOMINAL);
    $('review').disabled=busy||!current?.saved||!can(OWN_RUN_NOMINAL)||typeof onReview!=='function';
    for(const button of $('totals').querySelectorAll('[data-own-individual-open]'))button.disabled=busy||!can(OWN_RUN_NOMINAL);
    for(const button of $('history').querySelectorAll('button'))button.disabled=busy||!can(OWN_RUN_NOMINAL)||!!attempt&&!current?.saved;
    host.setAttribute('aria-busy',String(busy));
  }
  function clearViews(){
    individual.clear();
    positionCapture.clear();
    picker.close();chosen=[];current=null;boot=null;catalog=null;page=1;notFound=false;
    $('result').hidden=true;for(const key of ['totals','rows','trace','history','chips','codes'])$(key).replaceChildren();
    $('result-summary').textContent='';$('range').textContent='';$('page').textContent='';$('search').value='';$('date').value='';$('confirm').checked=false;
  }
  function suspend(message){
    queuedPreparation=null;
    seq++;controller?.abort();controller=null;busy=false;access=null;clearViews();status(message,'warning');controls();
  }
  async function request(url,options={}){
    if(!live())throw Object.assign(Error('Pantalla no visible.'),{name:'AbortError'});
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...options.headers},signal:controller?.signal});
    const text=await response.text();if(new TextEncoder().encode(text).byteLength>OWN_RUN_MAX_RESPONSE)throw Error('La respuesta completa supera la capacidad. No se mostraron filas parciales.');
    let payload;try{payload=JSON.parse(text);}catch{throw Error('La respuesta no pudo verificarse. Consultá el mismo intento.');}
    if(!response.ok||payload?.ok!==true){const error=Error(errors[payload?.code]??(response.status===401?'La sesión venció. Volvé a ingresar.':response.status===403?'Tu cuenta no permite esta operación.':'No se confirmó la operación. Consultá el mismo intento antes de continuar.'));error.status=response.status;error.code=payload?.code;throw error;}
    return payload;
  }
  async function session(required){
    const next=ownRunWorkspaceAccess(await request('/api/internal-auth'));
    if(!hasOwnRunAccess(next.caps,required))throw Object.assign(Error('Tu cuenta no permite esta operación sobre la nómina.'),{status:403});
    if(attempt&&attempt.accessKey!==next.key||access&&access.key!==next.key)throw Object.assign(Error('Cambió la sesión. Recuperá el intento desde su cuenta original.'),{status:403});
    access=next;$('login').hidden=true;
  }
  async function perform(work){
    if(!live()||busy)return;
    const version=++seq;busy=true;const operationController=new AbortController();controller=operationController;controls();
    const timeout=setTimeout(()=>operationController.abort(),45000);
    try{await work(()=>version===seq&&live());}
    catch(error){if(version===seq&&live()){
      if([401,403].includes(error.status)){access=null;clearViews();$('login').hidden=error.status!==401;}
      status(error.name==='AbortError'?'No se confirmó la respuesta. Consultá este mismo intento; no se inició otro.':error.message,'warning');
    }}
    finally{clearTimeout(timeout);if(version===seq){busy=false;controller=null;controls();}}
  }
  function renderChosen(){
    $('chips').replaceChildren(...chosen.map(item=>{const chip=node('span');chip.append(node('span','Legajo '+item.legajo+' · '+(item.nombre??'Nombre no informado')));const remove=node('button','Quitar');remove.type='button';remove.className='button';remove.setAttribute('aria-label','Quitar legajo '+item.legajo);remove.addEventListener('click',()=>{if(attempt||busy)return;chosen=chosen.filter(e=>e.contractId!==item.contractId);$('confirm').checked=false;renderChosen();controls();});chip.append(remove);return chip;}));
    $('scope').textContent=$('kind').value==='all'?'Se incluirán todos los legajos propios elegibles del período. No se limita a una búsqueda o página.':$('kind').value==='contracts'?chosen.length+' legajos propios elegidos.':'Se incluirá el conjunto completo de las opciones elegidas.';
  }
  function renderKind(){
    const kind=$('kind').value;$('contracts').hidden=kind!=='contracts';$('codes-box').hidden=!['departments','agreements'].includes(kind);$('codes').replaceChildren();
    for(const item of catalog?.catalog.items??[]){if(item.kind!==(kind==='departments'?'sectors':'agreements'))continue;const option=node('option',item.code+' · '+item.label);option.value=item.code;$('codes').append(option);}
    renderChosen();
  }
  function renderHistory(){
    $('history').replaceChildren();
    if(!boot?.runs.length){$('history').append(node('p','No hay cálculos propios guardados para esta cuenta.'));return;}
    for(const r of boot.runs){const row=node('article'),description=node('div'),button=node('button','Consultar '+r.period+' · '+OWN_RUN_TYPES[r.liquidationType]);description.append(node('p',r.state==='calculated'?'Resultado calculado · consultar decisiones':'Captura pendiente de cálculo'),node('p',({all:'Todos los legajos propios',contracts:r.selectionValueCount+' legajos seleccionados',departments:r.selectionValueCount+' reparticiones',agreements:r.selectionValueCount+' convenios'})[r.selectionKind]+' · '+labelDate(r.createdAt)));button.type='button';button.className='button';button.dataset.ownOpen=r.key;button.addEventListener('click',()=>recover(r.key));description.append(node('p',ownRunDateLabel(r.liquidationDate)));row.append(description,button);$('history').append(row);}
  }
  function renderRows(){
    if(!current?.saved)return;const view=ownRunWorkspaceRows(current,$('search').value,page);page=view.page;
    $('rows').replaceChildren(...view.rows.map(r=>{const tr=node('tr');for(const text of [r.employeeNumber,r.conceptCode,OWN_RUN_NATURES[r.nature],formatOwnRunDecimal(r.amount,r.unit==='money')+(r.unit==='money'?'':' · '+r.unit),r.ruleReference])tr.append(node('td',text));return tr;}));
    $('range').textContent=view.filtered+' conceptos de la búsqueda · '+view.total+' en el resultado completo. La descarga incluye todos.';
    $('page').textContent='Página '+view.page+' de '+view.pages;$('prev').disabled=view.page<=1;$('next').disabled=view.page>=view.pages;
  }
  function showCapture(value){
    positionCapture.setCapture(value.saved?value:null);
    current=value;notFound=false;
    if(!attempt||attempt.key!==value.key)attempt=ownRunWorkspaceAttempt(value.key,value.body,access.key);
    $('date').value=value.body.liquidationDate??'';$('period').value=value.body.period;$('type').value=value.body.liquidationType;$('kind').value=value.body.selection.kind;
    chosen=value.body.selection.kind==='contracts'?value.payload.population.employees.filter(p=>value.body.selection.values.includes(p.contractId)).map(p=>({contractId:p.contractId,legajo:p.employeeNumber,nombre:null,recordOrigin:'MUNICONTROL'})):[];
    renderKind();for(const option of $('codes').options)option.selected=value.body.selection.values.includes(option.value);
    if(!value.saved){$('result').hidden=true;status('Captura recuperada. Reintentá el mismo cálculo para completar su resultado.','warning');controls();return;}
    const {input,result,people}=ownRunWorkspaceResult(value);$('result').hidden=false;
    knownSavedKey=value.key;individual.clear();
    $('result-summary').textContent=result.period+' · '+OWN_RUN_TYPES[result.liquidationType]+' · '+ownRunDateLabel(value.body.liquidationDate)+' · '+result.employeeCount+' legajos · '+result.rowCount+' conceptos · guardado '+labelDate(value.saved.recordedAt);
    $('totals').replaceChildren(...result.employeeTotals.map(t=>{const tr=node('tr');for(const text of [people.get(t.contractId).employeeNumber,...['gross','deduction','net','employer_contribution'].map(k=>formatOwnRunDecimal(t[k]))])tr.append(node('td',text));const cell=node('td'),button=node('button','Ver resumen');button.type='button';button.className='button';button.dataset.ownIndividualOpen=t.contractId;button.setAttribute('aria-label','Ver resumen del legajo '+people.get(t.contractId).employeeNumber);button.addEventListener('click',()=>openIndividual(t.contractId,button));cell.append(button);tr.append(cell);return tr;}));
    $('trace').replaceChildren();for(const [name,version]of Object.entries(input.sourceVersions))$('trace').append(node('dt',({population:'Padrón y encuadre',rules:'Programa y definiciones',novelties:'Novedades aprobadas'})[name]),node('dd',version));
    $('trace').append(node('dt','Integridad del resultado'),node('dd',value.saved.resultSha256));page=1;renderRows();
    status('Resultado guardado y recuperable. Consultá su estado actual antes de confirmar o anular.','success');controls();
  }
  async function refresh(){return perform(async valid=>{
    individual.clear();
    await session(OWN_RUN_READ);
    if(!valid())return;
    if(!hasOwnRunAccess(access.caps,OWN_RUN_NOMINAL))clearViews();
    const next=ownRunBootstrap((await request(endpoint+'?resource=bootstrap&contractVersion=2')).data);
    if(!valid())return;
    const nextCatalog=validateCatalogBootstrap((await request('/api/internal-employment-catalog?resource=bootstrap')).data);
    if(!valid())return;
    if(boot&&(boot.scopeVersion!==next.scopeVersion||boot.programVersion!==next.programVersion))$('confirm').checked=false;
    boot=next;catalog=nextCatalog;
    if(queuedPreparation){const context=queuedPreparation;queuedPreparation=null;await acceptPreparation(context,valid);if(!valid())return;renderHistory();controls();return;}
    renderKind();renderHistory();controls();
    status(attempt?'Se conserva el intento original. Consultalo o reintentá sin cambiar su contenido.':canPrepare()?'Elegí el período, el tipo y todo el alcance antes de calcular.':'Consulta disponible. Calcular requiere permisos nominales y un vínculo municipal vigente.');
  });}
  function openIndividual(contractId,trigger){if(!current?.saved||!can(OWN_RUN_NOMINAL))return;const original=current;individual.clear();return perform(async valid=>{
    await session(OWN_RUN_NOMINAL);if(!valid())return;
    const detail=await verifiedOwnLiquidationDetail((await request('/api/internal-own-payroll-liquidation?resource=detail&id='+encodeURIComponent(original.id))).data);
    if(!valid())return;if(detail.id!==original.id||detail.capture.saved.resultSha256!==original.saved.resultSha256)throw Error('Cambió el resultado consultado. Actualizá esta corrida.');
    individual.show(ownLiquidationIndividual(detail,contractId),trigger);
  });}
  async function acceptPreparation(context,valid){
    await session(OWN_RUN_PREPARE);if(!valid())return;
    if(access.key!==context.accessKey||!boot.canCalculate||attempt&&attempt.key!==knownSavedKey)throw Error('Hay un intento pendiente o cambió el acceso. Recuperalo antes de preparar otro cálculo.');
    let preparation;
    if(context.kind==='consolidated'){
      const receipt=await verifiedOwnAnnulReceipt((await request('/api/internal-own-payroll-annulment?resource=attempt&key='+encodeURIComponent(context.key))).data);
      const detail=await verifiedOwnAnnulDetail((await request('/api/internal-own-payroll-annulment?resource=detail&period='+encodeURIComponent(receipt.body.period)+'&liquidationType='+encodeURIComponent(receipt.body.liquidationType))).data);
      if(!valid())return;if(receipt.key!==context.key)throw Error('El comprobante pertenece a otro intento.');preparation=ownAnnulNextPreparation(detail,receipt,context.liquidationDate);
    }else{
      const receipt=await verifiedOwnLiquidationReceipt((await request('/api/internal-own-payroll-liquidation?resource=attempt&key='+encodeURIComponent(context.key))).data);
      const detail=await verifiedOwnLiquidationDetail((await request('/api/internal-own-payroll-liquidation?resource=detail&id='+encodeURIComponent(context.runId))).data);
      if(!valid())return;preparation=ownLiquidationNextPreparation(detail,receipt);
      if(preparation.runId!==context.runId||preparation.receiptKey!==context.key)throw Error('El comprobante no corresponde a la anulación elegida.');
    }
    if(['departments','agreements'].includes(preparation.selection.kind)&&preparation.selection.values.some(code=>!catalog.catalog.items.some(item=>item.kind===(preparation.selection.kind==='departments'?'sectors':'agreements')&&item.code===code)))throw Error('El encuadre cambió. Revisá el alcance antes de otra preparación.');
    attempt=null;knownSavedKey=null;current=null;notFound=false;individual.clear();$('result').hidden=true;for(const key of ['totals','rows','trace'])$(key).replaceChildren();
    $('date').value=preparation.liquidationDate??'';$('period').value=preparation.period;$('type').value=preparation.liquidationType;$('kind').value=preparation.selection.kind;
    chosen=preparation.selection.kind==='contracts'?preparation.affected.map(e=>({contractId:e.contractId,legajo:e.employeeNumber,nombre:null,recordOrigin:'MUNICONTROL'})):[];
    renderKind();for(const option of $('codes').options)option.selected=preparation.selection.values.includes(option.value);
    $('confirm').checked=false;status('Se prepararon los '+preparation.affected.length+' legajos exactos de la anulación. Revisá el período, la fecha, el tipo y el alcance antes de calcular. El próximo cálculo volverá a consultar el programa y las novedades aprobadas; todavía no se guardó otro resultado.');
  }
  async function recover(key=attempt?.key){if(!key||attempt&&!current?.saved&&key!==attempt.key)return;return perform(async valid=>{
    await session(OWN_RUN_NOMINAL);
    if(!valid())return;
    try{const value=await verifiedWorkspaceCapture((await request(endpoint+'?resource=attempt&key='+encodeURIComponent(key))).data,attempt?.key===key?attempt:null);if(valid())showCapture(value);}
    catch(error){if(valid()&&error.status===404&&attempt?.key===key)notFound=true;throw error;}
  });}
  async function send(){if(!canPrepare()||busy||current?.saved)return;return perform(async valid=>{
    await session(OWN_RUN_PREPARE);if(!valid())return;
    if(!attempt){
      if(!$('confirm').checked)throw Error('Revisá y confirmá todo el alcance antes de calcular.');
      const kind=$('kind').value,values=kind==='all'?[]:kind==='contracts'?chosen.map(e=>e.contractId):[...$('codes').selectedOptions].map(o=>o.value);
      const body=ownRunCommand({version:OWN_RUN_COMMAND_VERSION,liquidationDate:$('date').value,period:$('period').value,liquidationType:$('type').value,selection:{kind,values},scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,populationDomain:'native_registered'});
      attempt=ownRunWorkspaceAttempt(crypto.randomUUID(),body,access.key);
    }
    controls();
    const value=await verifiedWorkspaceCapture((await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.key},body:JSON.stringify({operation:'calculate',payload:attempt.body})})).data,attempt);
    if(valid())showCapture(value);
  });}
  async function download(){if(!current?.saved||!can(OWN_RUN_NOMINAL))return;const original=current;return perform(async valid=>{
    await session(OWN_RUN_NOMINAL);
    if(!valid())return;
    const value=await verifiedWorkspaceCapture((await request(endpoint+'?resource=attempt&key='+encodeURIComponent(original.key))).data,{key:original.key,body:original.body});
    if(!valid()||!value.saved)return;
    const blob=new Blob([ownRunWorkspaceCsv(value)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=node('a');
    a.href=url;a.download='calculo-propio-'+value.body.period+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
    status('Se descargó el detalle completo del cálculo guardado. La búsqueda y la página no lo recortaron.','success');
  });}
  $('form').addEventListener('submit',event=>{event.preventDefault();send();});
  $('login').addEventListener('click',()=>location.assign('/acceso?next=%2Fnomina%23calculo'));
  $('refresh').addEventListener('click',refresh);$('recover').addEventListener('click',()=>recover());$('download').addEventListener('click',download);
  $('review').addEventListener('click',()=>{if(busy||!current?.saved||!can(OWN_RUN_NOMINAL))return;if(onReview?.({runId:current.id,resultSha256:current.saved.resultSha256,accessKey:access.key,contractId:individual.selected})!==true)status('Hay una decisión pendiente en Confirmar y anular. Consultala antes de cambiar de corrida.','warning');});
  $('picker').addEventListener('click',()=>picker.open({multiple:true,maximum:500,excluded:chosen.map(e=>e.legajo),onUse:items=>{chosen.push(...items);$('confirm').checked=false;renderChosen();controls();}}));
  $('new').addEventListener('click',()=>{if(!canPrepare()||busy||!current?.saved)return;attempt=null;clearViews();refresh();});
  $('revise').addEventListener('click',()=>{if(!notFound||busy||!canPrepare())return;attempt=null;notFound=false;$('confirm').checked=false;controls();status('El intento consultado no estaba registrado. Revisá la preparación antes de otro envío.');});
  $('period-end').addEventListener('click',()=>{if(attempt||busy||!canPrepare())return;try{$('date').value=ownRunPeriodEnd($('period').value);$('confirm').checked=false;$('date').focus();controls();}catch(error){status(error.message,'warning');}});
  for(const field of ['period','date','type','kind','codes'])$(field).addEventListener('change',()=>{if(attempt)return;$('confirm').checked=false;if(field==='kind')renderKind();controls();});
  $('confirm').addEventListener('change',controls);$('search').addEventListener('input',()=>{page=1;renderRows();});$('prev').addEventListener('click',()=>{page--;renderRows();});$('next').addEventListener('click',()=>{page++;renderRows();});
  const task=event=>{active=event.detail?.id==='calculo';if(active)refresh();else suspend('Se retiraron los datos al cambiar de tarea. Abrí Calcular para verificar el acceso otra vez.');};
  const visibility=()=>{if(document.hidden)suspend('Se retiraron los datos al ocultar la página. Actualizá para verificar el acceso y recuperar el intento.');else controls();};
  const capability=event=>{const caps=new Set(event.detail?.tenantCapabilities??[]);if(!access)return;
    if(!hasOwnRunAccess(caps,OWN_RUN_READ)||hasOwnRunAccess(access.caps,OWN_RUN_NOMINAL)&&!hasOwnRunAccess(caps,OWN_RUN_NOMINAL))suspend('Se retiraron los datos por un cambio de permisos. Actualizá el acceso antes de continuar.');
    else{queuedPreparation=null;access.caps=new Set([...access.caps].filter(c=>caps.has(c)));$('confirm').checked=false;controls();}
  };
  document.addEventListener('taskchange',task);document.addEventListener('visibilitychange',visibility);document.addEventListener('municontrol:capabilities-ready',capability);
  document.getElementById('logoutButton')?.addEventListener('click',()=>suspend('Sesión cerrada. Se retiraron los datos.'));
  const poll=setInterval(()=>{if(live()&&!busy&&access)perform(async valid=>{await session(current||attempt?OWN_RUN_NOMINAL:OWN_RUN_READ);if(valid())controls();});},60000);
  window.addEventListener('pagehide',()=>{stopped=true;active=false;suspend('Página cerrada.');clearInterval(poll);document.removeEventListener('taskchange',task);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('municontrol:capabilities-ready',capability);},{once:true});
  controls();return {refresh,queuePreparation(context){if(busy||attempt&&attempt.key!==knownSavedKey||!(context?.kind==='consolidated'?(context.liquidationDate===null||ownRunDate(context.liquidationDate)):salaryUuid(context?.runId))||!salaryUuid(context?.key)||typeof context?.accessKey!=='string'||!context.accessKey)return false;queuedPreparation=Object.freeze({...context});return true;}};
}
