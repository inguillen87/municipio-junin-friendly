import {ownRunBootstrap,ownRunCommand,OWN_RUN_MAX_RESPONSE} from './own-payroll-run-model.js';
import {OWN_RUN_FULL_JSON,OWN_RUN_FULL_MAX_BYTES,readOwnPayrollResponse} from './own-payroll-response.js';
import {fetchOwnLiquidationDetail} from './own-payroll-liquidation-read.js';
import {validateCatalogBootstrap} from './native-employment-catalog-model.js';
import {createEmployeePicker} from './employee-picker.js';
import {nativeRoster,nativeRosterScope} from './native-roster-model.js';
import {mountPositionCapture} from './position-capture-panel.js';
import {salaryUuid,SALARY_UNITS} from './native-salary-catalog-model.js';
import {verifiedOwnLiquidationDetail,verifiedOwnLiquidationReceipt,ownLiquidationIndividual,ownLiquidationNextPreparation} from './own-payroll-liquidation-model.js';
import {verifiedOwnAnnulReceipt,verifiedOwnAnnulDetail,ownAnnulNextPreparation} from './own-payroll-annulment-model.js';
import {mountOwnPayrollIndividual} from './own-payroll-individual-panel.js';
import {OWN_RUN_READ,OWN_RUN_NOMINAL,OWN_RUN_PREPARE,OWN_RUN_TYPES,OWN_RUN_NATURES,hasOwnRunAccess,ownRunEventCapabilities,ownRunWorkspaceAccess,ownRunWorkspaceAttempt,formatOwnRunDecimal} from './own-payroll-run-workspace-model.js';
import {ownRunResult,verifiedRunCapture,ownRunRows,ownRunCsv,ownRunOfficialSummary,ownRunOfficialText} from './own-payroll-run-reader.js';

import {ownRunDate,ownRunDateLabel,ownRunPeriodEnd} from './own-payroll-run-date.js';
import {ownRunDepartmentsForAll,ownRunUnsectoredText} from './own-run-departments.js';
import {ownRunScopeAgreements,ownRunProgramCoverage,ownRunUnsectoredInAgreements,ownRunCoveredContracts,ownRunPeriodReadiness,ownRunReadinessSteps,ownRunReadinessTitle,ownRunRegistrationHistory,ownRunMonthLabel} from './own-run-coverage.js';
import {OWN_RUN_COMMAND_VERSION} from './own-payroll-run-model.js';
import {ownRunSourceReview,ownSourceReviewRows,ownSourceReviewCsv,OWN_SOURCE_ISSUES} from './own-payroll-source-review.js';
import {OWN_PAYROLL_READINESS_FILTERS,OWN_PAYROLL_READINESS_ROSTER_URL,ownPayrollReadiness,ownPayrollReadinessUnavailable,ownPayrollReadinessAllowsNew,ownPayrollReadinessAllowsPreparation,ownPayrollReadinessUnchanged} from './own-payroll-readiness-model.js';
import {countWords} from './count-words.js';
const endpoint='/api/internal-own-payroll-run';
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const labelDate=value=>new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));
const errors={
  OWN_RUN_PROGRAM_REQUIRED:'Falta registrar en el motor una configuración de cálculo compatible con las definiciones salariales. Completala en Reglas de cálculo. El cálculo no se completó.',
  OWN_RUN_PROGRAM_CHANGED:'Cambió el programa aprobado. Consultá el intento antes de revisar otra preparación.',
  OWN_RUN_PRORATION_REQUIRED:'Hay una vigencia laboral parcial. Se necesita una regla de prorrateo aprobada; no se supusieron días ni horas.',
  OWN_RUN_HISTORY_REQUIRED:'Para este mes no vale el encuadre actual de algún legajo: se registró o se rectificó en MuniControl después. Aprobá su encuadre del mes en Encuadre por período, o calculá desde el mes del alta.',
  OWN_RUN_SOURCE_VIGENCY_INVALID:'Hay un registro sin vigencia laboral verificada para todo el período. Revisá sus fechas y consultá este intento antes de preparar otro cálculo.',
  OWN_RUN_SOURCE_IDENTITY_CHANGED:'Cambió la identidad de un registro del alcance. Revisá su vínculo y consultá este intento antes de otra captura.',
  OWN_RUN_SOURCE_UNUSED:'El programa aprobado no contempla todas las novedades capturadas. Revisá sus conceptos; no se omitieron novedades ni se completó el cálculo.',
  OWN_RUN_SOURCE_VALUE_MISSING:'Falta un valor requerido en las novedades capturadas. Revisá importe y unidades; un dato ausente no se tomó como cero.',
  OWN_RUN_SELECTION_INVALID:'No se calculó: algún legajo elegido no está vigente en ese mes o le faltan datos del período (encuadre, antigüedad, jornada). Revisalos en «Datos del período» o elegí otro mes.',
  OWN_RUN_LIMIT:'El conjunto completo supera la capacidad. No se omitieron ni dividieron filas.',
  OWN_RUN_SINGLE_AGREEMENT_REQUIRED:'Con las reglas vigentes se calcula un convenio por vez. Elegí el alcance «Convenios», marcá uno solo y volvé a calcular. No se creó ningún cálculo.',
  OWN_RUN_OFFICIAL_POLICY_REQUIRED:'Las reglas aprobadas no definen los totales del recibo para ese convenio, mes y tipo de liquidación. Completalo en Reglas de cálculo. No se creó ningún cálculo.',
  OWN_RUN_OFFICIAL_NOT_INSTALLED:'El cálculo con totales oficiales todavía no está instalado. Avisá a sistemas. No se creó ningún cálculo.',
  OWN_RUN_OFFICIAL_NONPOSITIVE_NET_REVIEW_REQUIRED:'A algún legajo el neto le queda en cero o negativo. No se guardó el resultado: revisá sus descuentos y novedades y volvé a calcular.',
  OWN_RUN_OPTIONAL_SCALE_CAPTURE_INVALID:'No se verificó el maestro completo que respalda los adicionales. Recuperá el mismo intento; no se usó cero para suplir datos faltantes.',
  OWN_RUN_OPTIONAL_SCALE_INPUT_INVALID:'El adicional no coincide con el importe aprobado o con la ausencia de configuración demostrada. El resultado no se confirmó.',
  OWN_RUN_FAMILY_APPROVAL_REQUIRED:'Falta aprobar la declaración familiar de algún legajo para este mes. Un dato sin informar no se toma como cero. Aprobala y volvé a calcular.',
  OWN_RUN_FAMILY_TARIFF_FACT_SOURCE_REQUIRED:'Falta aprobar la declaración familiar de algún legajo para este mes. Un dato sin informar no se toma como cero. Aprobala y volvé a calcular.',
  OWN_RUN_FAMILY_TARIFF_FACT_MISSING:'A algún legajo le falta la región o el promedio semestral en su declaración familiar. Completala y volvé a calcular; no se supuso un valor.',
  OWN_RUN_FORCED_RULE_REQUIRED:'Hay una novedad con importe forzado y las reglas no dicen cómo aplicarla. No se calculó y el importe forzado no se descartó: completá la regla en Reglas de cálculo.',
  OWN_RUN_PAY_RULE_MISSING:'El programa de liquidación no tiene reglas de haberes vigentes para algún convenio del alcance en este período. Reintentar no lo resuelve: completá el programa en Reglas de cálculo o elegí sólo convenios cubiertos, y prepará otro cálculo.',
  OWN_RUN_RULE_MISSING:'Una regla del programa usa otro concepto que no está vigente para ese convenio y tipo. Revisá el programa en Reglas de cálculo y prepará otro cálculo.',
  OWN_RUN_RULE_OVERLAP:'El programa tiene reglas superpuestas para el mismo convenio, concepto y tipo. Corregilo en Reglas de cálculo y prepará otro cálculo.',
  OWN_RUN_RULE_CYCLE:'Las reglas del programa forman un ciclo. Corregilo en Reglas de cálculo y prepará otro cálculo.',
  OWN_RUN_INPUT_MISSING:'Falta un dato que el programa necesita (novedad, antigüedad, jornada…); no se supuso cero. Revisá las incidencias de la captura.',
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
  host.innerHTML=`<header class="own-run-head"><div><p class="own-run-eyebrow">LIQUIDACIÓN</p><h2>Calcular nómina</h2><p>Elegí el período, la fecha, el tipo y a quiénes liquidar.</p></div><button class="button" type="button" data-own-refresh>Actualizar</button></header>
  <p class="own-run-status" role="status" aria-live="polite" data-own-status>Abrí Calcular para consultar.</p><form data-own-form><fieldset data-own-fields disabled><legend>1 · Preparar el cálculo</legend><div class="own-run-grid">
    <label for="ownRunPeriod">Período<input id="ownRunPeriod" data-own-period type="month" required></label>
    <div class="own-run-date"><label for="ownRunDate">Fecha de liquidación<input id="ownRunDate" data-own-date type="date" min="1900-01-01" max="2099-12-31" required aria-describedby="ownRunDateHelp"></label><small id="ownRunDateHelp">No es la fecha de pago.</small><button class="button" type="button" data-own-period-end>Fin de mes</button></div>
    <label for="ownRunType">Tipo de liquidación<select id="ownRunType" data-own-type required><option value="">Elegí el tipo</option></select></label>
    <label for="ownRunKind">Alcance<select id="ownRunKind" data-own-kind required><option value="">Elegí el alcance</option><option value="contracts">Legajos seleccionados</option><option value="departments">Reparticiones</option><option value="agreements">Convenios</option><option value="all">Todos los legajos propios</option></select></label></div>
    <div data-own-contracts hidden><button class="button" type="button" data-own-picker>Buscar y agregar legajos</button><div class="own-run-chips" data-own-chips></div></div>
    <label data-own-codes-box hidden for="ownRunCodes">Opciones del alcance<select id="ownRunCodes" data-own-codes multiple size="5" aria-describedby="ownRunCodesHelp"></select><small id="ownRunCodesHelp">Podés elegir varias opciones.</small></label>
    <p data-own-scope>Elegí el alcance.</p>
    <label class="own-run-confirm"><input type="checkbox" data-own-confirm aria-describedby="ownRunActionHelp">Revisé período, fecha, tipo y alcance. Calcular guarda el resultado para su revisión.</label>
  </fieldset><div class="own-run-actions"><button class="button primary" type="submit" data-own-send aria-describedby="ownRunActionHelp" disabled>Calcular</button><button class="button" type="button" data-own-recover hidden disabled>Consultar este intento</button><button class="button" type="button" data-own-new hidden disabled>Preparar otro cálculo</button><button class="button" type="button" data-own-revise hidden disabled>Revisar preparación no registrada</button></div><p id="ownRunActionHelp" class="own-run-status" data-own-action-help role="status" aria-live="polite" hidden><span data-own-action-help-text></span> <a data-own-action-help-link hidden></a></p></form>
  <section class="own-run-notice own-run-coverage" data-own-coverage hidden aria-labelledby="ownRunCoverageTitle"><h3 id="ownRunCoverageTitle" data-own-coverage-title>Programa incompleto para el período</h3><p data-own-coverage-text></p><div class="own-run-progress" data-own-coverage-progress></div><ol class="own-run-steps" data-own-coverage-steps aria-label="Qué falta para calcular"></ol><details class="own-run-coverage-detail"><summary>Ver convenios del alcance</summary><ul class="own-run-coverage-list" data-own-coverage-list></ul></details><p class="own-run-coverage-note" data-own-coverage-note hidden></p><div class="own-run-actions"><button class="button primary" type="button" data-own-coverage-covered hidden>Calcular sólo los convenios cubiertos</button><button class="button primary" type="button" data-own-coverage-month hidden></button><a class="button" href="/nomina#reglas" data-own-coverage-rules>Ir a Reglas de cálculo</a></div></section><section class="own-run-notice own-run-unsectored" data-own-unsectored hidden aria-labelledby="ownRunUnsectoredTitle"><h3 id="ownRunUnsectoredTitle">Legajos sin repartición</h3><p data-own-unsectored-text></p><div class="own-run-actions"><button class="button primary" type="button" data-own-unsectored-all>Elegir las reparticiones con personal</button><a class="button" href="/personal#legajos">Corregir sus fichas en Personas</a></div></section><button class="button" type="button" data-own-login hidden>Ingresar con la cuenta original</button>
  <section class="own-run-status" data-own-readiness aria-labelledby="ownRunReadinessTitle"><h3 id="ownRunReadinessTitle" data-own-readiness-title>Preparación no verificada</h3><p data-own-readiness-description>Actualizá la consulta para verificar el padrón propio y las reglas antes de calcular.</p><div class="own-run-actions"><a class="button primary" data-own-readiness-link hidden></a><button class="button primary" type="button" data-own-readiness-check disabled>Volver a verificar preparación</button></div></section>
  <details class="own-run-notice own-run-howto" data-own-prerequisites><summary>Cómo se prepara un mes nuevo</summary><p data-own-readiness-facts></p><p>Lo hace quien administra, una vez por mes, antes de calcular:</p><ol><li><strong>Personas:</strong> que cada legajo esté en el padrón propio. Los que vienen de la fuente histórica se suman desde <a href="/personal?adopcion=pendientes#legajos">las altas pendientes en Personas</a>.</li><li><strong>Maestro salarial del mes</strong> (escalas y conceptos) en <a href="/nomina#parametros">Parámetros</a>.</li><li><strong>Reglas de cálculo vigentes para el mes</strong> en <a href="/nomina#reglas">Reglas de cálculo</a>, aprobadas por otra persona.</li></ol><p>Con eso listo, Calcular guarda el resultado para revisar, confirmar o anular. Leer esta ayuda no cambia nada.</p></details>
  <div class="own-run-actions"><button class="button" type="button" data-own-source-review-button hidden disabled>Revisar incidencias de la captura</button></div>
  <section data-own-source-report hidden aria-labelledby="ownSourceReportTitle"><h3 id="ownSourceReportTitle" tabindex="-1">Novedades que necesitan revisión</h3><p data-own-source-summary></p><p>Revisión de las novedades y sus fuentes declaradas en las reglas capturadas. No certifica los importes, las unidades ni la homologación salarial. Corregir una fuente no cambia esta captura: el intento conserva su contenido original.</p>
    <div class="own-run-actions"><button class="button" type="button" data-own-source-download disabled>Descargar incidencias sin datos personales CSV</button></div>
    <label for="ownSourceSearch">Buscar legajo, concepto o convenio en las incidencias<input id="ownSourceSearch" type="search" maxlength="100" autocomplete="off" data-own-source-search></label><p data-own-source-range></p>
    <div class="own-run-scroll" tabindex="0" role="region" aria-label="Incidencias completas de las novedades capturadas"><table><caption>Incidencias por registro · búsqueda y página no limitan la descarga</caption><thead><tr><th>Legajo</th><th>Convenio</th><th>Concepto</th><th>Origen y fila</th><th>Estado</th><th>Acción sugerida</th></tr></thead><tbody data-own-source-rows></tbody></table></div>
    <nav class="own-run-actions" aria-label="Páginas de incidencias"><button class="button" type="button" data-own-source-prev>Anterior</button><span data-own-source-page></span><button class="button" type="button" data-own-source-next>Siguiente</button></nav>
  </section>
  <section data-own-result hidden aria-labelledby="ownRunResultTitle"><header class="own-run-head"><div><h3 id="ownRunResultTitle" tabindex="-1">2 · Resultado calculado</h3><p data-own-result-summary></p><p data-own-result-official class="own-run-official" hidden></p></div><button class="button" type="button" data-own-download disabled>Descargar CSV completo</button></header>
    <p class="own-run-notice">Resultado calculado. Consultá el resumen individual para ver el estado de cada legajo.</p>
    <button class="button primary" type="button" data-own-review disabled>Revisar liquidación</button>
    <div class="own-run-scroll" tabindex="0" role="region" aria-label="Totales por legajo, tabla desplazable"><table><caption>Totales por legajo de la corrida guardada</caption><thead><tr><th>Legajo</th><th>Bruto</th><th>Retenciones</th><th>Neto calculado</th><th>Aportes patronales</th><th>Resumen</th></tr></thead><tbody data-own-totals></tbody></table></div><section data-own-individual hidden></section>
    <details data-own-concept-details><summary>Detalle por concepto</summary>
    <label for="ownRunSearch">Buscar legajo o concepto en el resultado<input id="ownRunSearch" data-own-search type="search" maxlength="100" autocomplete="off"></label>
    <p data-own-range></p><div class="own-run-scroll" tabindex="0" role="region" aria-label="Detalle por concepto, tabla desplazable"><table><caption>Detalle por concepto · la búsqueda no limita la descarga</caption><thead><tr><th>Legajo</th><th>Concepto</th><th>Naturaleza</th><th>Valor calculado</th><th>Respaldo</th></tr></thead><tbody data-own-rows></tbody></table></div>
    <nav class="own-run-actions" aria-label="Páginas del detalle"><button class="button" type="button" data-own-prev>Anterior</button><span data-own-page></span><button class="button" type="button" data-own-next>Siguiente</button></nav>
    </details>
    <details><summary>Ver versiones y trazabilidad</summary><dl data-own-trace></dl></details><div data-own-position-capture></div>
  </section>
  <section aria-labelledby="ownRunHistoryTitle"><h3 id="ownRunHistoryTitle">Historial de cálculos</h3><p>Consultá resultados y operaciones pendientes.</p><div data-own-history></div></section>`;
  const $=s=>host.querySelector('[data-own-'+s+']');
  const positionCapture=mountPositionCapture($('position-capture'));
  for(const [value,text]of Object.entries(OWN_RUN_TYPES)){const option=node('option',text);option.value=value;$('type').append(option);}
  let active=false,stopped=false,busy=false,seq=0,controller=null,access=null,accessTenantId=null,boot=null,catalog=null,chosen=[],attempt=null,current=null,notFound=false,page=1,knownSavedKey=null,queuedPreparation=null;
  let readiness=ownPayrollReadinessUnavailable(),readinessAccessKey=null,readinessRosterScope=null,suspendedPreparation=null,departmentPlan=null,programDefinition=null,programData=null,rosterRows=null,computeBlocked=null,coverageMemo=null,coveredPlan=null;
  let sourceReview=null,sourcePage=1;
  const live=()=>active&&!stopped&&!document.hidden&&host.isConnected;
  const can=required=>live()&&hasOwnRunAccess(access?.caps,required);
  const canPrepare=()=>can(OWN_RUN_PREPARE)&&boot?.canCalculate===true;
  const canSelect=()=>canPrepare()&&readinessAccessKey===access?.key&&ownPayrollReadinessAllowsPreparation(readiness);
  const canStart=()=>canPrepare()&&readinessAccessKey===access?.key&&ownPayrollReadinessAllowsNew(readiness);
  const individual=mountOwnPayrollIndividual($('individual'),{id:'ownRunIndividual',canUse:()=>can(OWN_RUN_NOMINAL),returnFocus:()=>$('result').querySelector('h3')});
  const picker=createEmployeePicker({instanceId:'ownRunPicker',readNativeRoster:readPickerRoster,canUse:()=>canSelect()&&!busy&&!attempt,selectionIssue:item=>item.recordOrigin==='MUNICONTROL'?null:'Este legajo sigue en la fuente histórica. Para seleccionarlo, primero debe incorporarse al padrón propio mediante la revisión de adopción en Personas.',onDirectoryInvalidated:()=>{chosen=[];$('confirm').checked=false;renderChosen();controls();}});
  const status=(text,state='neutral')=>{$('status').textContent=text;$('status').dataset.state=state;};
  function controls(){
    $('prerequisites').hidden=!!attempt&&attempt.key!==knownSavedKey;
    renderReadiness();
    positionCapture.setAvailable(can(['workforce.employee.read','workforce.structure.read','payroll.calculation.read']));
    $('fields').disabled=busy||!canSelect()||!!attempt;$('confirm').disabled=busy||!canStart()||!!attempt;$('refresh').disabled=busy||!live();
    $('send').disabled=busy||!canPrepare()||!!current?.saved||!attempt&&(!canStart()||!$('confirm').checked)||!!attempt&&!attempt.body;
    $('send').textContent=attempt?'Reintentar el mismo cálculo':'Calcular';
    $('send').hidden=!!current?.saved||!attempt&&!canSelect();
    renderActionGuidance();
    $('recover').hidden=!attempt;$('recover').disabled=busy||!can(OWN_RUN_NOMINAL);
    $('recover').textContent=current?.saved?'Actualizar este resultado':'Consultar este intento';
    $('revise').hidden=!attempt||!notFound;$('revise').disabled=busy||!canPrepare();
    $('download').disabled=busy||!current?.saved||!can(OWN_RUN_NOMINAL);
    $('source-review-button').hidden=!current;$('source-review-button').disabled=busy||!current||!can(OWN_RUN_NOMINAL);
    $('source-download').disabled=busy||!sourceReview||!can(OWN_RUN_NOMINAL);
    $('source-search').disabled=busy||!sourceReview||!can(OWN_RUN_NOMINAL);
    const sourceView=sourceReview?ownSourceReviewRows(sourceReview,$('source-search').value,sourcePage):null;
    $('source-prev').disabled=busy||!sourceView||!can(OWN_RUN_NOMINAL)||sourceView.page<=1;
    $('source-next').disabled=busy||!sourceView||!can(OWN_RUN_NOMINAL)||sourceView.page>=sourceView.pages;
    $('review').disabled=busy||!current?.saved||!can(OWN_RUN_NOMINAL)||typeof onReview!=='function';
    for(const button of $('totals').querySelectorAll('[data-own-individual-open]'))button.disabled=busy||!can(OWN_RUN_NOMINAL);
    for(const button of $('history').querySelectorAll('button'))button.disabled=busy||!can(OWN_RUN_NOMINAL)||!!attempt&&!current?.saved;
    renderUnsectored();renderCoverage();
    if(!attempt&&coverageBlocks()||attempt&&computeBlocked&&!current?.saved)$('send').disabled=true;
    $('new').hidden=!current?.saved&&!computeBlocked;$('new').disabled=busy||!canPrepare();
    host.setAttribute('aria-busy',String(busy));
  }
  // Pay-rule coverage of the approved programme for the scope on screen (the engine stops without a result otherwise).
  function currentCoverage(){
    if(!programDefinition||!Array.isArray(rosterRows)||!catalog)return null;
    const kind=$('kind').value,period=$('period').value,type=$('type').value;if(!kind||!period||!type)return null;
    const values=kind==='all'?[]:kind==='contracts'?chosen.map(c=>c.contractId):[...$('codes').selectedOptions].map(o=>o.value);
    if(kind!=='all'&&!values.length)return null;
    const memo=[kind,period,type,values.join(','),rosterRows.length].join('|');if(coverageMemo?.key===memo)return coverageMemo.value;
    const agreements=ownRunScopeAgreements(rosterRows,catalog.catalog.items,{kind,values}).agreements;
    const value=ownRunProgramCoverage(programDefinition,{period,liquidationType:type,agreements});
    let readinessValue=null;try{const history=ownRunRegistrationHistory(rosterRows,catalog.catalog.items,{kind,values,period});readinessValue=ownRunPeriodReadiness(programData,{period,liquidationType:type,agreements,history});}catch{readinessValue=null;}
    coverageMemo={key:memo,value,readiness:readinessValue};return value;
  }
  const currentReadiness=()=>{currentCoverage();return coverageMemo?.readiness??null;};
  const coverageBlocks=()=>{const c=currentCoverage();return !!c&&c.missing.length>0;};
  function renderCoverage(){
    const box=$('coverage'),c=currentCoverage(),before=!!currentReadiness()?.history,show=!!c&&(c.missing.length>0||before)&&live()&&(!attempt||computeBlocked==='OWN_RUN_PAY_RULE_MISSING'||computeBlocked==='coverage')&&!current?.saved;
    box.hidden=!show;if(!show)return;
    // What is missing, in the order the work happens, with the exact place to do it.
    const r=currentReadiness(),steps=ownRunReadinessSteps(r),title=ownRunReadinessTitle(r)||'Programa incompleto para el período';
    if($('coverage-title').textContent!==title)$('coverage-title').textContent=title;
    const text=before?(c.missing.length?'El cálculo de este mes se detendría sin resultado. Faltan estos pasos, en orden:':'Las reglas están listas, pero el cálculo de este mes se detendría sin resultado. Falta este paso:'):c.covered.length?'Podés calcular ya los convenios listos con el botón de abajo. Para el resto faltan estos pasos:':'Faltan las fórmulas de este mes: hasta que estén aprobadas, calcular no da resultado. Pasos, en orden:';
    if($('coverage-text').textContent!==text)$('coverage-text').textContent=text;
    // Progress meter: one segment per required step (informative steps do not count).
    const required=steps.filter(s=>s.state!=='info'),doneCount=required.filter(s=>s.state==='done').length,progressSig=required.map(s=>s.state).join('|');
    if($('coverage-progress').dataset.items!==progressSig){$('coverage-progress').dataset.items=progressSig;const label=node('span',doneCount+' de '+required.length+(required.length===1?' paso listo':' pasos listos'));label.className='pg-label';
      const bar=node('span');bar.className='pg-bar';bar.setAttribute('role','img');bar.setAttribute('aria-label',label.textContent);bar.append(...required.map((s,i)=>{const seg=node('span');seg.className='pg-seg is-'+s.state;seg.style.setProperty('--st-i',String(i));return seg;}));
      $('coverage-progress').replaceChildren(label,bar);}
    const stepSig=steps.map(s=>s.key+':'+s.state+':'+s.text).join('|');
    if($('coverage-steps').dataset.items!==stepSig){$('coverage-steps').dataset.items=stepSig;$('coverage-steps').replaceChildren(...steps.map((s,i)=>{
      const li=node('li');li.className='own-run-step is-'+s.state;li.style.setProperty('--st-i',String(i));
      const mark=node('span',s.state==='done'?'✓':s.state==='info'?'i':String(steps.slice(0,i+1).filter(x=>x.state!=='info').length));mark.className='st-mark';mark.setAttribute('aria-hidden','true');
      const body=node('div');body.className='st-body';
      const head=node('strong',s.title);const badge=node('span',s.state==='done'?'Listo':s.state==='wait'?'Esperando aprobación':s.state==='info'?'Para revisar':'Pendiente');badge.className='st-badge';
      const line=node('p',s.text);body.append(head,badge,line);
      if(s.href&&s.state!=='done'){const a=node('a',s.action);a.className='st-link';a.href=s.href;body.append(a);}
      li.append(mark,body);return li;}));}
    // One animated bar per convenio: missing in amber, covered in teal, width by people.
    const all=[...c.missing.map(a=>({...a,ok:false})),...c.covered.map(a=>({...a,ok:true}))],max=Math.max(1,...all.map(a=>a.people));
    const signature=all.map(a=>a.code+':'+a.people+':'+a.ok).join('|');
    if($('coverage-list').dataset.items!==signature){$('coverage-list').dataset.items=signature;$('coverage-list').replaceChildren(...all.map((a,i)=>{
      const li=node('li');li.className=a.ok?'is-covered':'is-missing';li.style.setProperty('--cv-i',String(i));li.style.setProperty('--cv-w',Math.max(3,Math.round(a.people/max*100))+'%');
      const label=node('span','Convenio '+a.code+' · '+a.label);label.className='cv-label';const bar=node('span');bar.className='cv-bar';bar.setAttribute('aria-hidden','true');
      const meta=node('span',a.people+(a.people===1?' persona':' personas')+' · '+(a.ok?'cubierto':a.validity.length?'reglas sólo '+a.validity.join(', '):'sin reglas'));meta.className='cv-meta';
      li.append(label,bar,meta);return li;}));}
    // Shortcut: the same period and type, only the convenios that already have pay rules in force.
    // «Convenios» when every legajo inside has a repartición; otherwise the exact legajos with repartición (up to 500).
    const people=c.covered.reduce((n,a)=>n+a.people,0),inside=ownRunUnsectoredInAgreements(rosterRows,catalog.catalog.items,c.covered.map(a=>a.code));
    const exact=inside.length?ownRunCoveredContracts(rosterRows,catalog.catalog.items,c.covered.map(a=>a.code)):[],mode=!c.covered.length?null:!inside.length?'agreements':exact.length>0&&exact.length<=500?'contracts':null;
    const offer=!attempt&&canSelect()&&!!mode&&!before;coveredPlan=offer?{mode,codes:c.covered.map(a=>String(a.code)),contracts:exact,inside,people}:null;
    $('coverage-covered').hidden=!offer;$('coverage-covered').disabled=busy;
    // A month before the legajos' registration: offer the first month the current encuadre applies to.
    const firstMonth=before?currentReadiness().history.firstPeriod:null,monthOffer=!attempt&&canSelect()&&!!firstMonth&&firstMonth>$('period').value;
    $('coverage-rules').hidden=before&&!c.missing.length;$('coverage-month').hidden=!monthOffer;$('coverage-month').disabled=busy;if(monthOffer){const t='Pasar a '+ownRunMonthLabel(firstMonth);if($('coverage-month').textContent!==t)$('coverage-month').textContent=t;}
    const who=inside.length===1?'el legajo '+inside[0]:'los legajos '+inside.slice(0,8).join(', ')+(inside.length>8?' y '+(inside.length-8)+' más':'');
    const note=!inside.length?'':mode==='contracts'?'Como '+who+(inside.length===1?' no tiene':' no tienen')+' repartición, se eligen uno por uno los '+exact.length+' legajos con repartición '+(c.covered.length===1?'de ese convenio.':'de esos convenios.'):'Para calcular sólo los convenios cubiertos, primero cargá la repartición de '+who+': están en esos convenios y el motor rechazaría la corrida.';
    if($('coverage-note').textContent!==note)$('coverage-note').textContent=note;$('coverage-note').hidden=!note;
    if(offer)$('coverage-covered').textContent=mode==='agreements'?'Calcular sólo los '+c.covered.length+(c.covered.length===1?' convenio cubierto':' convenios cubiertos')+' ('+people+(people===1?' persona)':' personas)'):'Calcular los '+exact.length+' legajos con repartición '+(c.covered.length===1?'del convenio cubierto':'de los convenios cubiertos');
  }
  function renderUnsectored(){
    const box=$('unsectored'),plan=departmentPlan,show=!!plan?.unsectored.length&&!attempt&&!current?.saved&&live()&&canSelect()&&['','all'].includes($('kind').value);
    box.hidden=!show;if(!show)return;
    const text=ownRunUnsectoredText(plan);if($('unsectored-text').textContent!==text)$('unsectored-text').textContent=text;
    $('unsectored-all').hidden=!plan.codes.length||plan.unmatched.length>0;$('unsectored-all').disabled=busy;
    $('unsectored-all').textContent=(plan.codes.length===1?'Calcular la repartición':'Calcular las '+plan.codes.length+' reparticiones')+' ('+plan.covered+(plan.covered===1?' legajo)':' legajos)');
  }
  function renderActionGuidance(){
    const help=$('action-help'),text=$('action-help-text'),link=$('action-help-link');let message='',href=null,label='';
    help.hidden=$('send').hidden||!live()||!can(OWN_RUN_PREPARE)||!busy&&!attempt&&(!canStart()&&!$('readiness').hidden||canStart()&&$('confirm').checked);
    if(!help.hidden){
      if(busy)message='Hay una consulta o un envío en curso. Esperá a que termine antes de volver a enviarlo.';
      else if(attempt)message='Consultá este intento si no conocés su estado. Reintentar conserva la misma referencia y el mismo contenido.';
      else if(!canStart()){message=readiness.state==='program_required'?'Falta guardar la configuración de cálculo en el motor. El borrador se conserva.':readiness.title+'. '+readiness.description;href=readiness.href;label=readiness.action??'';}
      else if(!$('confirm').checked)message='Marcá la revisión de los datos para calcular.';
      else message='Revisión marcada. Al calcular se volverán a verificar el padrón y las reglas aprobadas.';
    }
    if(text.textContent!==message)text.textContent=message;
    link.hidden=!href;if(href){link.href=href;if(link.textContent!==label)link.textContent=label;}else{link.removeAttribute('href');link.textContent='';}
  }
  function renderReadiness(){
    $('readiness').hidden=readiness.state==='linked'||!!attempt&&attempt.key!==knownSavedKey;
    // While the first verification is still running, say so calmly instead of showing «no verificada» as an error.
    const checking=busy&&readiness.state==='unverified'&&readinessAccessKey===null;
    $('readiness').dataset.state=readiness.state==='linked'?'success':checking?'info':'warning';
    $('readiness-title').textContent=checking?'Verificando padrón, maestro y programa…':readiness.title;$('readiness-description').textContent=checking?'Consultamos el padrón propio y las reglas aprobadas del período. Tarda unos segundos.':readiness.description;
    $('readiness-facts').textContent=readiness.rosterTotal===null?(busy?'Verificando el estado actual…':'Estado actual: todavía sin verificar.'):'Estado actual: '+readiness.rosterTotal+' legajos propios en el padrón · '+(readiness.catalogRevision?'maestro aprobado, revisión '+readiness.catalogRevision:'maestro sin aprobación')+' · '+(readiness.programRevision?'programa aprobado, revisión '+readiness.programRevision:'configuración de cálculo sin registrar')+'.';
    $('readiness-link').hidden=!readiness.href;
    if(readiness.href){$('readiness-link').href=readiness.href;$('readiness-link').textContent=readiness.action;}else $('readiness-link').removeAttribute('href');
    $('readiness-check').hidden=readiness.state!=='unverified';$('readiness-check').disabled=busy||!can(OWN_RUN_READ);
  }
  function invalidateReadiness(){readiness=ownPayrollReadinessUnavailable();readinessAccessKey=null;readinessRosterScope=null;$('confirm').checked=false;picker.close();}
  function clearViews(){
    clearSourceReview();
    individual.clear();
    positionCapture.clear();
    picker.close();chosen=[];current=null;boot=null;catalog=null;page=1;notFound=false;departmentPlan=null;programDefinition=null;programData=null;rosterRows=null;computeBlocked=null;coverageMemo=null;
    invalidateReadiness();
    $('result').hidden=true;for(const key of ['totals','rows','trace','history','chips','codes'])$(key).replaceChildren();
    $('result-summary').textContent='';$('result-official').textContent='';$('result-official').hidden=true;$('range').textContent='';$('page').textContent='';$('search').value='';$('date').value='';$('confirm').checked=false;
  }
  const preparationDraft=()=>Object.freeze({accessKey:access.key,period:$('period').value,date:$('date').value,type:$('type').value,kind:$('kind').value,codes:Object.freeze([...$('codes').selectedOptions].map(option=>option.value)),contracts:Object.freeze(chosen.map(item=>item.contractId))});
  function suspend(message,{preservePreparation=false}={}){
    if(!preservePreparation)suspendedPreparation=null;
    else if(!attempt&&access&&hasOwnRunAccess(access.caps,OWN_RUN_NOMINAL))suspendedPreparation=preparationDraft();
    queuedPreparation=null;
    seq++;controller?.abort();controller=null;busy=false;access=null;clearViews();status(message,'warning');controls();
  }
  async function request(url,options={}){
    if(!live())throw Object.assign(Error('Pantalla no visible.'),{name:'AbortError'});
    const full=url===endpoint||url.startsWith(endpoint+'?');
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:full?OWN_RUN_FULL_JSON:'application/json',...options.headers},signal:controller?.signal});
    let payload;try{payload=await readOwnPayrollResponse(response,{maxBytes:full?OWN_RUN_FULL_MAX_BYTES:OWN_RUN_MAX_RESPONSE,signal:controller?.signal});}catch(e){if(e.name==='AbortError')throw e;throw Error(e.message||'La respuesta no pudo verificarse. Consultá el mismo intento.');}
    if(!response.ok||payload?.ok!==true){const error=Error(errors[payload?.code]??(response.status===401?'La sesión venció. Volvé a ingresar.':response.status===403?'Tu cuenta no permite esta operación.':'No se confirmó la operación. Consultá el mismo intento antes de continuar.'));error.status=response.status;error.code=payload?.code;throw error;}
    return payload;
  }
  // Detalle de una liquidación guardada. Si no entra en el JSON común, la lectura compartida lo pide completo.
  async function requestLiquidationDetail(id){
    if(!live())throw Object.assign(Error('Pantalla no visible.'),{name:'AbortError'});
    let read;try{read=await fetchOwnLiquidationDetail(id,{signal:controller?.signal});}catch(e){if(e.name==='AbortError')throw e;throw Error(e.message||'La respuesta no pudo verificarse. Consultá el mismo intento.');}
    if(!read.ok||read.payload?.ok!==true){const error=Error(errors[read.payload?.code]??(read.status===401?'La sesión venció. Volvé a ingresar.':read.status===403?'Tu cuenta no permite esta operación.':'No se confirmó la operación. Consultá el mismo intento antes de continuar.'));error.status=read.status;error.code=read.payload?.code;throw error;}
    return read.payload;
  }
  async function session(required){
    const version=seq,payload=await request('/api/internal-auth'),next=ownRunWorkspaceAccess(payload);
    if(version!==seq||!live())throw Object.assign(Error('La consulta de acceso quedó desactualizada.'),{name:'AbortError'});
    if(!hasOwnRunAccess(next.caps,required))throw Object.assign(Error('Tu cuenta no permite esta operación sobre la nómina.'),{status:403});
    if(attempt&&attempt.accessKey!==next.key||access&&access.key!==next.key)throw Object.assign(Error('Cambió la sesión. Recuperá el intento desde su cuenta original.'),{status:403});
    if(suspendedPreparation&&suspendedPreparation.accessKey!==next.key)suspendedPreparation=null;
    access=next;accessTenantId=payload.access.tenant.id;$('login').hidden=true;
  }
  async function perform(work){
    if(!live()||busy)return;
    const version=++seq;busy=true;const operationController=new AbortController();controller=operationController;controls();
    const timeout=setTimeout(()=>operationController.abort(),45000);
    try{await work(()=>version===seq&&live());}
    catch(error){if(version===seq&&live()){
      if([401,403].includes(error.status)){access=null;suspendedPreparation=null;clearViews();$('login').hidden=error.status!==401;}
      status(error.name==='AbortError'?'No se confirmó la respuesta. Consultá este mismo intento; no se inició otro.':error.message,'warning');
    }}
    finally{clearTimeout(timeout);if(version===seq){busy=false;controller=null;controls();}}
  }
  function renderChosen(){
    const many=chosen.length>24;
    $('chips').replaceChildren(...(many?chosen.slice(0,12):chosen).map(item=>{const chip=node('span');chip.append(node('span','Legajo '+item.legajo+' · '+(item.nombre??'Nombre no informado')));const remove=node('button','Quitar');remove.type='button';remove.className='button';remove.setAttribute('aria-label','Quitar legajo '+item.legajo);remove.addEventListener('click',()=>{if(attempt||busy)return;chosen=chosen.filter(e=>e.contractId!==item.contractId);$('confirm').checked=false;renderChosen();controls();});chip.append(remove);return chip;}));
    if(many)$('chips').append(node('span','… y '+(chosen.length-12)+' legajos más: todos se incluyen en el cálculo.'));
    $('scope').textContent=$('kind').value==='all'?'Alcance elegido: todo el padrón propio. El cálculo verificará la elegibilidad para el período; una búsqueda o página no reduce este alcance.':$('kind').value==='contracts'?chosen.length+(chosen.length===1?' legajo propio elegido.':' legajos propios elegidos.'):'Se incluirá el conjunto completo de las opciones elegidas.';
  }
  function renderKind(){
    const kind=$('kind').value;$('contracts').hidden=kind!=='contracts';$('codes-box').hidden=!['departments','agreements'].includes(kind);$('codes').replaceChildren();
    for(const item of catalog?.catalog.items??[]){if(item.kind!==(kind==='departments'?'sectors':'agreements'))continue;const option=node('option',item.code+' · '+item.label);option.value=item.code;$('codes').append(option);}
    renderChosen();
  }
  function renderHistory(){
    $('history').replaceChildren();
    if(!boot?.runs.length){$('history').append(node('p','No hay cálculos propios guardados para esta cuenta.'));return;}
    for(const r of boot.runs){const row=node('article'),description=node('div'),button=node('button','Consultar '+r.period+' · '+OWN_RUN_TYPES[r.liquidationType]);description.append(node('p',r.state==='calculated'?'Resultado calculado · consultar decisiones':'Cálculo sin terminar: se preparó y no llegó a calcular'),node('p',({all:'Todos los legajos propios',contracts:countWords(r.selectionValueCount,'legajo seleccionado','legajos seleccionados'),departments:countWords(r.selectionValueCount,'repartición','reparticiones'),agreements:countWords(r.selectionValueCount,'convenio','convenios')})[r.selectionKind]+' · '+labelDate(r.createdAt)));button.type='button';button.className='button';button.dataset.ownOpen=r.key;button.addEventListener('click',()=>recover(r.key));description.append(node('p',ownRunDateLabel(r.liquidationDate)));row.append(description,button);$('history').append(row);}
  }
  function renderRows(){
    if(!current?.saved)return;const view=ownRunRows(current,$('search').value,page);page=view.page;
    $('rows').replaceChildren(...view.rows.map(r=>{const tr=node('tr');for(const text of [r.employeeNumber,r.conceptCode,OWN_RUN_NATURES[r.nature],formatOwnRunDecimal(r.amount,r.unit==='money')+(r.unit==='money'?'':' · '+(SALARY_UNITS[r.unit]??r.unit).toLowerCase()),r.ruleReference])tr.append(node('td',text));return tr;}));
    $('range').textContent=countWords(view.filtered,'concepto','conceptos')+' de la búsqueda · '+view.total+' en el resultado completo. La descarga incluye todos.';
    $('page').textContent='Página '+view.page+' de '+view.pages;$('prev').disabled=view.page<=1;$('next').disabled=view.page>=view.pages;
  }
  function showCapture(value){
    clearSourceReview();
    positionCapture.setCapture(value.saved?value:null);
    current=value;notFound=false;
    if(!attempt||attempt.key!==value.key)attempt=ownRunWorkspaceAttempt(value.key,value.body,access.key);
    $('date').value=value.body.liquidationDate??'';$('period').value=value.body.period;$('type').value=value.body.liquidationType;$('kind').value=value.body.selection.kind;
    chosen=value.body.selection.kind==='contracts'?value.payload.population.employees.filter(p=>value.body.selection.values.includes(p.contractId)).map(p=>({contractId:p.contractId,legajo:p.employeeNumber,nombre:null,recordOrigin:'MUNICONTROL'})):[];
    renderKind();for(const option of $('codes').options)option.selected=value.body.selection.values.includes(option.value);
    if(!value.saved){$('result').hidden=true;
      const c=currentCoverage();
      if(c&&c.missing.length){computeBlocked=computeBlocked??'coverage';status('Captura sin resultado: el programa no cubre todo su alcance, así que reintentarla no la completa. '+ownRunCoverageText(c)+' Cuando el programa esté completo, prepará otro cálculo.','warning');}
      else status('Captura recuperada. Reintentá el mismo cálculo para completar su resultado.','warning');
      controls();return;}
    const {input,result,people}=ownRunResult(value);$('result').hidden=false;
    knownSavedKey=value.key;individual.clear();
    $('result-summary').textContent=result.period+' · '+OWN_RUN_TYPES[result.liquidationType]+' · '+ownRunDateLabel(value.body.liquidationDate)+' · '+countWords(result.employeeCount,'legajo','legajos')+' · '+countWords(result.rowCount,'concepto','conceptos')+' · guardado '+labelDate(value.saved.recordedAt);
    const official=ownRunOfficialText(ownRunOfficialSummary(value));$('result-official').textContent=official;$('result-official').hidden=!official;
    $('totals').replaceChildren(...result.employeeTotals.map(t=>{const tr=node('tr');for(const text of [people.get(t.contractId).employeeNumber,...['gross','deduction','net','employer_contribution'].map(k=>formatOwnRunDecimal(t[k]))])tr.append(node('td',text));const cell=node('td'),button=node('button','Ver resumen');button.type='button';button.className='button';button.dataset.ownIndividualOpen=t.contractId;button.setAttribute('aria-label','Ver resumen del legajo '+people.get(t.contractId).employeeNumber);button.addEventListener('click',()=>openIndividual(t.contractId,button));cell.append(button);tr.append(cell);return tr;}));
    import('./own-run-charts.js').then(m=>{if(current===value)m.drawRunCharts($('result'),result);}).catch(()=>{});
    $('trace').replaceChildren();for(const [name,version]of Object.entries(input.sourceVersions))$('trace').append(node('dt',({population:'Padrón y encuadre',rules:'Programa y definiciones',novelties:'Novedades aprobadas'})[name]),node('dd',version));
    $('trace').append(node('dt','Integridad del resultado'),node('dd',value.saved.resultSha256));page=1;renderRows();
    status('Resultado guardado y recuperable. Consultá su estado actual antes de confirmar o anular.','success');controls();
  }
  async function refresh({metadataOnly=false}={}){return perform(async valid=>{
    if(!attempt&&!current?.saved)status('Verificando acceso, padrón propio y reglas del período…');
    if(!suspendedPreparation&&!attempt&&canSelect())suspendedPreparation=preparationDraft();
    invalidateReadiness();
    clearSourceReview();
    individual.clear();
    await session(OWN_RUN_READ);
    if(!valid())return;
    if(!hasOwnRunAccess(access.caps,OWN_RUN_NOMINAL)){suspendedPreparation=null;clearViews();}
    // The four reads are independent: ask for them together (about 5 s instead of 10–14 s one after another).
    const bootRead=request(endpoint+'?resource=bootstrap&contractVersion=2'),catalogRead=request('/api/internal-employment-catalog?resource=bootstrap');
    const prefetch={program:request('/api/internal-own-payroll-program?resource=bootstrap'),roster:request(OWN_PAYROLL_READINESS_ROSTER_URL)};
    for(const read of [catalogRead,prefetch.program,prefetch.roster])read.catch(()=>{});
    const next=ownRunBootstrap((await bootRead).data);
    if(!valid())return;
    const nextCatalog=validateCatalogBootstrap((await catalogRead).data);
    if(!valid())return;
    if(boot&&(boot.scopeVersion!==next.scopeVersion||boot.programVersion!==next.programVersion))$('confirm').checked=false;
    boot=next;catalog=nextCatalog;
    renderKind();renderHistory();controls();
    let preparationRoster;try{preparationRoster=await verifyPreparation(next,valid,OWN_RUN_READ,prefetch);}catch(error){if(!valid())return;invalidateReadiness();if([401,403].includes(error.status))throw error;status('No se pudo verificar la preparación. '+(error.name==='AbortError'?'La consulta no terminó.':error.message),'warning');controls();return;}
    if(!valid())return;
    if(!metadataOnly&&queuedPreparation&&canStart()){const context=queuedPreparation;queuedPreparation=null;await acceptPreparation(context,valid);if(!valid())return;suspendedPreparation=null;renderHistory();controls();return;}
    renderKind();const draftIssue=restoreSuspendedPreparation(preparationRoster);
    renderHistory();controls();
    if(draftIssue){status(draftIssue,'warning');return;}
    // With «Todos» the engine rejects the whole run when one active legajo lacks its repartición: say which, before
    // trying, and offer every repartición with active people (the «Reparticiones» scope skips the unassigned ones).
    departmentPlan=ownRunDepartmentsForAll(preparationRoster?.rows,catalog?.catalog.items);controls();
    if(!attempt&&canStart()&&departmentPlan.unsectored.length&&['','all'].includes($('kind').value)){
      status('Antes de calcular a todos, revisá los legajos sin repartición.','warning');
      // This runs inside the busy consultation: apply «Todos» without the unassigned ones as soon as it ends.
      let tries=0;const later=()=>{if(attempt||!['','all'].includes($('kind').value))return;if(busy&&tries++<20){setTimeout(later,250);return;}applyAllWithoutUnsectored(true);};setTimeout(later,0);return;}
    status(attempt?'Se conserva el intento original. Consultalo o reintentá sin cambiar su contenido.':!canPrepare()?'Consulta disponible. Calcular requiere permisos nominales y un vínculo municipal vigente.':canStart()?'Elegí el período, el tipo y todo el alcance antes de calcular.':canSelect()?'Podés preparar el borrador. Falta registrar la configuración del motor para calcular.':'Preparación pendiente. Continuá con el paso indicado antes de calcular.',canStart()||attempt?'neutral':'warning');
  });}
  async function verifyPreparation(run,valid,required=OWN_RUN_READ,prefetch=null){
    const program=await (prefetch?.program??request('/api/internal-own-payroll-program?resource=bootstrap'));
    if(!valid())return;
    const roster=await (prefetch?.roster??request(OWN_PAYROLL_READINESS_ROSTER_URL));
    if(!valid())return;
    const next=ownPayrollReadiness({run,program:program.data,roster:roster.data},accessTenantId);
    programDefinition=program.data?.program?.definition??null;programData=program.data??null;rosterRows=Array.isArray(roster.data?.rows)?roster.data.rows:null;coverageMemo=null;
    await session(required);if(!valid())return;
    readiness=next;readinessAccessKey=access.key;readinessRosterScope=nativeRosterScope(roster.data.scope);
    return roster.data;
  }
  async function readPickerRoster({signal}){
    const version=seq,key=access?.key,tenant=accessTenantId,snapshot=readiness.rosterSnapshot,binding=readinessRosterScope;
    const valid=()=>version===seq&&live()&&access?.key===key&&canSelect()&&!busy&&!attempt&&!signal.aborted;
    const current=()=>{if(!valid())throw Object.assign(Error('La búsqueda quedó desactualizada.'),{name:'AbortError'});};
    // Three bounded reads:10s auth +25s complete roster +10s fresh auth (45s total).
    // The modal signal also aborts each read on close, account or visibility change.
    const read=async url=>{current();const http=new AbortController(),timer=setTimeout(()=>http.abort(),url===OWN_PAYROLL_READINESS_ROSTER_URL?25000:10000),httpSignal=AbortSignal.any([signal,http.signal]);
      try{const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:httpSignal});const payload=await readOwnPayrollResponse(response,{maxBytes:OWN_RUN_MAX_RESPONSE,signal:httpSignal});current();if(!response.ok||payload?.ok!==true)throw Object.assign(Error(response.status===401?'La sesión venció. Ingresá nuevamente.':response.status===403?'Tu cuenta ya no permite consultar estos legajos.':'No se pudo consultar el padrón propio. No se inició ningún cálculo.'),{status:response.status});return payload;}finally{clearTimeout(timer);}
    };
    const check=async()=>{const fresh=ownRunWorkspaceAccess(await read('/api/internal-auth'));if(fresh.key!==key||!hasOwnRunAccess(fresh.caps,OWN_RUN_PREPARE))throw Object.assign(Error('Cambió la cuenta o el permiso para preparar esta selección.'),{status:403});};
    try{
      await check();current();const payload=await read(OWN_PAYROLL_READINESS_ROSTER_URL),roster=nativeRoster(payload.data,OWN_PAYROLL_READINESS_FILTERS);
      if(roster.version!=='native-roster.v2'||roster.scope.tenantId!==tenant||nativeRosterScope(roster.scope)!==binding||roster.snapshot!==snapshot||roster.total!==readiness.rosterTotal)throw Object.assign(Error('Cambió el padrón propio. Actualizá la preparación y elegí nuevamente el alcance completo.'),{code:'NATIVE_PICKER_CHANGED'});
      await check();current();return payload;
    }catch(error){
      if(version===seq&&live()&&access?.key===key){if([401,403].includes(error.status))suspend('Se retiró la selección por un cambio de cuenta o permisos. Actualizá el acceso antes de buscar nuevamente.');else if(error.code==='NATIVE_PICKER_CHANGED'){chosen=[];invalidateReadiness();renderChosen();controls();status(error.message,'warning');}}
      throw error;
    }
  }
  function restoreSuspendedPreparation(roster){
    const draft=suspendedPreparation;
    if(!draft||attempt||draft.accessKey!==access?.key||!can(OWN_RUN_NOMINAL))return null;
    suspendedPreparation=null;
    $('period').value=draft.period;$('date').value=draft.date;$('type').value=draft.type;$('kind').value=draft.kind;
    // Rebuild names only from this freshly validated complete own roster.
    // No stale nominal label is retained while the page is hidden.
    const selected=draft.contracts.map(id=>roster.rows.find(row=>row.contractId===id));
    const validCodes=draft.codes.every(code=>catalog.catalog.items.some(item=>item.kind===(draft.kind==='departments'?'sectors':'agreements')&&item.code===code));
    const complete=selected.every(Boolean)&&validCodes;
    chosen=complete?selected.map(row=>({contractId:row.contractId,legajo:row.legajo,nombre:row.name,recordOrigin:'MUNICONTROL'})):[];
    renderKind();for(const option of $('codes').options)option.selected=complete&&draft.codes.includes(option.value);
    $('confirm').checked=false;
    return complete?null:'Se conservó el período y la fecha. La selección anterior cambió: elegí nuevamente el alcance completo antes de calcular. No se seleccionó una parte.';
  }
  function openIndividual(contractId,trigger){if(!current?.saved||!can(OWN_RUN_NOMINAL))return;const original=current;individual.clear();return perform(async valid=>{
    await session(OWN_RUN_NOMINAL);if(!valid())return;
    const detail=await verifiedOwnLiquidationDetail((await requestLiquidationDetail(original.id)).data);
    if(!valid())return;if(detail.id!==original.id||detail.capture.saved.resultSha256!==original.saved.resultSha256)throw Error('Cambió el resultado consultado. Actualizá esta corrida.');
    individual.show(ownLiquidationIndividual(detail,contractId),trigger);
  });}
  async function acceptPreparation(context,valid){
    await session(OWN_RUN_PREPARE);if(!valid())return;
    if(access.key!==context.accessKey||!boot.canCalculate||attempt&&attempt.key!==knownSavedKey)throw Error('Hay un intento pendiente o cambió el acceso. Recuperalo antes de preparar otro cálculo.');
    if(!canStart())throw Error(readiness.title+'. '+readiness.description);
    let preparation;
    if(context.kind==='consolidated'){
      const receipt=await verifiedOwnAnnulReceipt((await request('/api/internal-own-payroll-annulment?resource=attempt&key='+encodeURIComponent(context.key))).data);
      const detail=await verifiedOwnAnnulDetail((await request('/api/internal-own-payroll-annulment?resource=detail&period='+encodeURIComponent(receipt.body.period)+'&liquidationType='+encodeURIComponent(receipt.body.liquidationType))).data);
      if(!valid())return;if(receipt.key!==context.key)throw Error('El comprobante pertenece a otro intento.');preparation=ownAnnulNextPreparation(detail,receipt,context.liquidationDate);
    }else{
      const receipt=await verifiedOwnLiquidationReceipt((await request('/api/internal-own-payroll-liquidation?resource=attempt&key='+encodeURIComponent(context.key))).data);
      const detail=await verifiedOwnLiquidationDetail((await requestLiquidationDetail(context.runId)).data);
      if(!valid())return;preparation=ownLiquidationNextPreparation(detail,receipt);
      if(preparation.runId!==context.runId||preparation.receiptKey!==context.key)throw Error('El comprobante no corresponde a la anulación elegida.');
    }
    if(['departments','agreements'].includes(preparation.selection.kind)&&preparation.selection.values.some(code=>!catalog.catalog.items.some(item=>item.kind===(preparation.selection.kind==='departments'?'sectors':'agreements')&&item.code===code)))throw Error('El encuadre cambió. Revisá el alcance antes de otra preparación.');
    attempt=null;knownSavedKey=null;current=null;notFound=false;individual.clear();$('result').hidden=true;for(const key of ['totals','rows','trace'])$(key).replaceChildren();
    $('date').value=preparation.liquidationDate??'';$('period').value=preparation.period;$('type').value=preparation.liquidationType;$('kind').value=preparation.selection.kind;
    chosen=preparation.selection.kind==='contracts'?preparation.affected.map(e=>({contractId:e.contractId,legajo:e.employeeNumber,nombre:null,recordOrigin:'MUNICONTROL'})):[];
    renderKind();for(const option of $('codes').options)option.selected=preparation.selection.values.includes(option.value);
    $('confirm').checked=false;status((preparation.affected.length===1?'Se preparó el legajo exacto':'Se prepararon los '+preparation.affected.length+' legajos exactos')+' de la anulación. Revisá el período, la fecha, el tipo y el alcance antes de calcular. El próximo cálculo volverá a consultar el programa y las novedades aprobadas; todavía no se guardó otro resultado.');
  }
  async function recover(key=attempt?.key){if(!key||attempt&&!current?.saved&&key!==attempt.key)return;return perform(async valid=>{
    await session(OWN_RUN_NOMINAL);
    if(!valid())return;
    try{const value=await verifiedRunCapture((await request(endpoint+'?resource=attempt&key='+encodeURIComponent(key))).data,attempt?.key===key?attempt:null);if(valid())showCapture(value);}
    catch(error){if(valid()&&error.status===404&&attempt?.key===key)notFound=true;throw error;}
  });}
  async function send(){if(!canPrepare()||!attempt&&!canStart()||busy||current?.saved)return;return perform(async valid=>{
    await session(OWN_RUN_PREPARE);if(!valid())return;
    if(!attempt){
      if(!$('confirm').checked)throw Error('Revisá y confirmá todo el alcance antes de calcular.');
      const previous=readiness;readiness=ownPayrollReadinessUnavailable();readinessAccessKey=null;controls();
      const latest=ownRunBootstrap((await request(endpoint+'?resource=bootstrap&contractVersion=2')).data);
      if(!valid())return;
      try{await verifyPreparation(latest,valid,OWN_RUN_PREPARE);}catch(error){if(!valid())return;invalidateReadiness();throw error;}
      if(!valid())return;boot=latest;
      if(!canStart()||!ownPayrollReadinessUnchanged(previous,readiness)){$('confirm').checked=false;throw Error(ownPayrollReadinessAllowsNew(readiness)?'Cambió el padrón o el programa consultado. Revisá nuevamente el alcance antes de calcular.':readiness.title+'. '+readiness.description);}
      const kind=$('kind').value,values=kind==='all'?[]:kind==='contracts'?chosen.map(e=>e.contractId):[...$('codes').selectedOptions].map(o=>o.value);
      const body=ownRunCommand({version:OWN_RUN_COMMAND_VERSION,liquidationDate:$('date').value,period:$('period').value,liquidationType:$('type').value,selection:{kind,values},scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,populationDomain:'native_registered'});
      attempt=ownRunWorkspaceAttempt(crypto.randomUUID(),body,access.key);
    }
    controls();
    // A failed response, including 422, can follow a committed capture or result.
    // Keep its original key and body until recovery verifies that attempt's state: a 422 consults the same key at
    // once; a registered capture is shown, and only a verified «not registered» frees the form (same values) to fix it.
    let response;
    try{response=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.key},body:JSON.stringify({operation:'calculate',payload:attempt.body})});}
    catch(error){
      if(error.status!==422||!valid()||!can(OWN_RUN_NOMINAL))throw error;
      const rejected=attempt;let registered=null,missing=false;
      try{registered=await verifiedRunCapture((await request(endpoint+'?resource=attempt&key='+encodeURIComponent(rejected.key))).data,rejected);}
      catch(check){if(check.status===404)missing=true;else if(check.name==='AbortError')throw check;}
      if(!valid())return;
      if(registered){if(!registered.saved&&/^OWN_RUN_(PAY_RULE_MISSING|RULE_MISSING|RULE_OVERLAP|RULE_CYCLE)$/.test(error.code??''))computeBlocked=error.code;showCapture(registered);if(computeBlocked===error.code){status(error.message+' La captura quedó registrada sin resultado.','warning');controls();}return;}
      if(!missing||attempt!==rejected)throw error;
      attempt=null;notFound=false;$('confirm').checked=false;
      const hint=rejected.body.selection.kind==='all'&&departmentPlan?.unsectored.length?' Hay legajos activos sin repartición ('+departmentPlan.unsectored.slice(0,8).join(', ')+'): calculá por reparticiones; su repartición la indica RR. HH. con la documentación del mes.':'';
      throw Object.assign(Error(error.message+' No quedó registrado ningún cálculo: corregí el alcance o el mes y calculá de nuevo.'+hint),{status:422,code:error.code});
    }
    const value=await verifiedRunCapture(response.data,attempt);
    if(valid())showCapture(value);
  });}
  async function download(){if(!current?.saved||!can(OWN_RUN_NOMINAL))return;const original=current;return perform(async valid=>{
    await session(OWN_RUN_NOMINAL);
    if(!valid())return;
    const value=await verifiedRunCapture((await request(endpoint+'?resource=attempt&key='+encodeURIComponent(original.key))).data,{key:original.key,body:original.body});
    if(!valid()||!value.saved)return;
    const blob=new Blob([ownRunCsv(value)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=node('a');
    a.href=url;a.download='calculo-propio-'+value.body.period+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
    status('Se descargó el detalle completo del cálculo guardado. La búsqueda y la página no lo recortaron.','success');
  });}
  function clearSourceReview(){sourceReview=null;sourcePage=1;$('source-report').hidden=true;for(const key of ['source-summary','source-range','source-page','source-rows'])$(key).replaceChildren();$('source-search').value='';}
  function renderSourceReview(){if(!sourceReview)return;const view=ownSourceReviewRows(sourceReview,$('source-search').value,sourcePage);sourcePage=view.page;
    $('source-summary').textContent=sourceReview.total+' novedades del alcance capturado · '+sourceReview.affected+' registros con incidencias. '+(sourceReview.affected?'Revisá cada acción sugerida.':'Sin observaciones en esta revisión de novedades; no equivale a un cálculo validado.');
    $('source-rows').replaceChildren(...view.rows.map(r=>{const tr=node('tr'),labels=['Legajo','Convenio','Concepto','Origen y fila','Estado','Acción sugerida'];[r.employeeNumber,r.agreementCode,r.conceptCode,(r.origin==='monthly'?'Mensual · lote '+r.group+' · fila '+r.rowOrdinal:'Fija · sin fila de archivo'),r.issues.map(i=>OWN_SOURCE_ISSUES[i][0]).join(' · '),r.issues.map(i=>OWN_SOURCE_ISSUES[i][1]).join(' ')].forEach((text,i)=>{const cell=node('td',text);cell.dataset.label=labels[i];tr.append(cell);});return tr;}));
    $('source-range').textContent=view.filtered+' registros de la búsqueda · '+view.total+' registros con incidencias en la captura completa. La descarga incluye todas las incidencias, sin legajos ni importes.';$('source-page').textContent='Página '+view.page+' de '+view.pages;controls();
  }
  async function reviewSources(downloadCsv=false){if(!current||!can(OWN_RUN_NOMINAL)||downloadCsv&&!sourceReview)return;const original=current;clearSourceReview();return perform(async valid=>{
    await session(OWN_RUN_NOMINAL);if(!valid())return;
    const value=await verifiedRunCapture((await request(endpoint+'?resource=attempt&key='+encodeURIComponent(original.key))).data,{key:original.key,body:original.body});
    const reviewed=await ownRunSourceReview(value,{key:original.key,body:original.body});if(!valid()||current!==original)return;
    if(downloadCsv){const csv=await ownSourceReviewCsv(value,{key:original.key,body:original.body});if(!valid()||current!==original)return;
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=node('a');a.href=url;a.download='incidencias-novedades-'+value.body.period+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
    }
    sourceReview=reviewed;$('source-report').hidden=false;renderSourceReview();$('source-report').querySelector('h3').focus();status(downloadCsv?'Se descargaron todas las incidencias sin datos personales. El intento de cálculo conserva su cuerpo y clave originales.':'Se revisaron todas las novedades de la captura. Consultar esta revisión no inicia otro cálculo.');
  });}
  $('form').addEventListener('submit',event=>{event.preventDefault();send();});
  $('login').addEventListener('click',()=>location.assign('/acceso?next=%2Fnomina%23calculo'));
  $('refresh').addEventListener('click',refresh);$('recover').addEventListener('click',()=>recover());$('download').addEventListener('click',download);
  $('readiness-check').addEventListener('click',refresh);
  $('coverage-month').addEventListener('click',()=>{
    const month=currentReadiness()?.history?.firstPeriod;if(!month||attempt||busy||!canSelect())return;
    $('period').value=month;$('confirm').checked=false;controls();
    status('Período cambiado a '+ownRunMonthLabel(month)+', el primer mes que se calcula con el encuadre actual de esos legajos. Revisá lo que falta y la fecha de liquidación.','neutral');$('period').focus();
  });
  $('coverage-covered').addEventListener('click',()=>{
    const c=currentCoverage(),plan=coveredPlan;if(!c?.covered.length||!plan||attempt||busy||!canSelect())return;
    const codes=plan.codes,left=c.missing.map(a=>'convenio '+a.code+' ('+a.people+')').join(', ');
    if(plan.mode==='contracts'){
      $('kind').value='contracts';renderKind();chosen=plan.contracts.map(e=>({...e}));$('confirm').checked=false;renderChosen();controls();
      status('Elegidos los '+chosen.length+' legajos con repartición de los convenios con reglas vigentes. Quedan fuera: '+left+(plan.inside.length?' y '+plan.inside.length+' sin repartición':'')+'. Revisá y marcá la confirmación para calcular.','neutral');
      $('confirm').focus();return;
    }
    $('kind').value='agreements';renderKind();
    for(const option of $('codes').options)option.selected=codes.includes(option.value);
    if([...$('codes').selectedOptions].length!==codes.length){status('Un convenio cubierto no está en el catálogo vigente. Actualizá la consulta.','warning');controls();return;}
    $('confirm').checked=false;controls();
    status('Elegidos los '+codes.length+' convenios con reglas de haberes vigentes ('+c.covered.reduce((n,a)=>n+a.people,0)+' personas). Quedan fuera: '+left+'. Revisá y marcá la confirmación para calcular.','neutral');
    $('confirm').focus();
  });
  // «Todos» with legajos lacking a repartición = every repartición with active people; the unassigned ones stay out, by number.
  function applyAllWithoutUnsectored(automatic){
    const plan=departmentPlan;if(!plan?.usable||!plan.unsectored.length||!plan.codes.length||plan.unmatched.length||attempt||busy||!canSelect())return false;
    $('kind').value='departments';renderKind();
    for(const option of $('codes').options)option.selected=plan.codes.includes(option.value);
    if([...$('codes').selectedOptions].length!==plan.codes.length){$('kind').value='all';renderKind();status('Una repartición del padrón no está en el catálogo vigente. Actualizá la consulta.','warning');controls();return false;}
    $('confirm').checked=false;controls();
    const out=plan.unsectored.length===1?'el legajo '+plan.unsectored[0]+', que no tiene repartición':'los legajos '+plan.unsectored.slice(0,8).join(', ')+(plan.unsectored.length>8?' y '+(plan.unsectored.length-8)+' más':'')+', que no tienen repartición';
    status((plan.codes.length===1?(automatic?'«Todos» quedó como la repartición':'Elegida la repartición'):(automatic?'«Todos» quedó como las ':'Elegidas las ')+plan.codes.length+' reparticiones')+' con personal activo ('+plan.covered+(plan.covered===1?' legajo). ':' legajos). ')+(plan.unsectored.length===1?'Queda fuera ':'Quedan fuera ')+out+' (RR. HH. tiene que indicar su repartición con la documentación del mes). Revisá y marcá la confirmación para calcular.','neutral');
    if(!automatic)$('confirm').focus();
    return true;
  }
  $('unsectored-all').addEventListener('click',()=>applyAllWithoutUnsectored(false));
  // After the generic field handler (which re-renders the options), so the automatic selection is not wiped.
  $('kind').addEventListener('change',()=>{if($('kind').value==='all')setTimeout(()=>{if($('kind').value==='all')applyAllWithoutUnsectored(true);},0);});
  $('source-review-button').addEventListener('click',()=>reviewSources());$('source-download').addEventListener('click',()=>reviewSources(true));
  $('source-search').addEventListener('input',()=>{sourcePage=1;renderSourceReview();});$('source-prev').addEventListener('click',()=>{sourcePage--;renderSourceReview();});$('source-next').addEventListener('click',()=>{sourcePage++;renderSourceReview();});
  $('review').addEventListener('click',()=>{if(busy||!current?.saved||!can(OWN_RUN_NOMINAL))return;if(onReview?.({runId:current.id,resultSha256:current.saved.resultSha256,accessKey:access.key,contractId:individual.selected})!==true)status('Hay una decisión pendiente en Confirmar y anular. Consultala antes de cambiar de corrida.','warning');});
  $('picker').addEventListener('click',()=>{
    if(!canSelect()||busy||attempt)return;
    if(chosen.length>=500){status('Alcanzaste el máximo de 500 legajos seleccionados. Podés quitar alguno o elegir otro alcance completo.','warning');return;}
    picker.open({multiple:true,maximum:500-chosen.length,excluded:chosen.map(e=>e.contractId),onUse:items=>{if(!canSelect()||busy||attempt||chosen.length+items.length>500||items.some(r=>chosen.some(e=>e.contractId===r.contractId)))throw Error('Cambió la capacidad o el acceso a la selección. No se agregó una parte.');chosen.push(...items);$('confirm').checked=false;renderChosen();controls();}});
  });
  $('new').addEventListener('click',()=>{if(!canPrepare()||busy||!current?.saved&&!computeBlocked)return;attempt=null;clearViews();refresh();});
  $('revise').addEventListener('click',()=>{if(!notFound||busy||!canPrepare())return;attempt=null;notFound=false;refresh();});
  $('period-end').addEventListener('click',()=>{if(attempt||busy||!canSelect())return;try{$('date').value=ownRunPeriodEnd($('period').value);$('confirm').checked=false;$('date').focus();controls();}catch(error){status(error.message,'warning');}});
  for(const field of ['period','date','type','kind','codes'])$(field).addEventListener('change',()=>{if(attempt)return;$('confirm').checked=false;if(field==='kind')renderKind();controls();});
  $('confirm').addEventListener('change',controls);$('search').addEventListener('input',()=>{page=1;renderRows();});$('prev').addEventListener('click',()=>{page--;renderRows();});$('next').addEventListener('click',()=>{page++;renderRows();});
  const task=event=>{active=event.detail?.id==='calculo';if(active)refresh();else suspend('Se retiraron los datos al cambiar de tarea. Abrí Calcular para verificar el acceso otra vez.');};
  const visibility=()=>{if(document.hidden)suspend('Se retiraron los datos al ocultar la página. Al volver se verificará el acceso antes de continuar.',{preservePreparation:true});else{if(!stopped&&host.isConnected&&typeof host.closest==='function'&&!host.closest('[hidden]'))active=true;if(live())refresh({metadataOnly:true});else controls();}};
  const capability=event=>{const caps=ownRunEventCapabilities(event.detail?.tenantCapabilities);if(!access)return;
    if(!hasOwnRunAccess(caps,OWN_RUN_READ)||hasOwnRunAccess(access.caps,OWN_RUN_NOMINAL)&&!hasOwnRunAccess(caps,OWN_RUN_NOMINAL))suspend('Se retiraron los datos por un cambio de permisos. Actualizá el acceso antes de continuar.');
    else{queuedPreparation=null;access.caps=new Set([...access.caps].filter(c=>caps.has(c)));if(!canPrepare())picker.close();$('confirm').checked=false;controls();}
  };
  document.addEventListener('taskchange',task);document.addEventListener('visibilitychange',visibility);document.addEventListener('municontrol:capabilities-ready',capability);
  document.getElementById('logoutButton')?.addEventListener('click',()=>suspend('Sesión cerrada. Se retiraron los datos.'));
  const poll=setInterval(()=>{if(live()&&!busy&&access)perform(async valid=>{await session(current||attempt?OWN_RUN_NOMINAL:OWN_RUN_READ);if(valid())controls();});},60000);
  window.addEventListener('pagehide',()=>{stopped=true;active=false;suspend('Página cerrada.');clearInterval(poll);document.removeEventListener('taskchange',task);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('municontrol:capabilities-ready',capability);},{once:true});
  controls();return {refresh,queuePreparation(context){if(busy||attempt&&attempt.key!==knownSavedKey||!(context?.kind==='consolidated'?(context.liquidationDate===null||ownRunDate(context.liquidationDate)):salaryUuid(context?.runId))||!salaryUuid(context?.key)||typeof context?.accessKey!=='string'||!context.accessKey)return false;queuedPreparation=Object.freeze({...context});return true;}};
}
