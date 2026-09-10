/* Authenticated snapshot workspace. No clock network access or nominal data in static assets. */
(function () {
  'use strict';
  var root = document.getElementById('clockOperations');
  if (!root) return;
  var state = { site:'pm-10', page:1, size:50, from:'', to:'', busy:false, data:null, timer:null, started:false, generation:0 };
  var $ = function (key) { return document.getElementById('clock'+key); };
  var text = function (key,value) { $(key).textContent = String(value == null ? '—' : value); };
  var number = function (v) { return new Intl.NumberFormat('es-AR').format(Number(v) || 0); };
  function instant(value, timeOnly) {
    if (!value || !Number.isFinite(Date.parse(value))) return 'Sin registro';
    return new Intl.DateTimeFormat('es-AR', Object.assign({timeZone:state.data?.timezone || 'America/Argentina/Mendoza'}, timeOnly ? {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false} : {dateStyle:'short',timeStyle:'short'})).format(new Date(value));
  }
  function element(tag,content,className) { var node=document.createElement(tag); if(content!=null)node.textContent=content; if(className)node.className=className; return node; }
  function badge(value,tone) { return element('span',value,'clock-badge '+(tone || '')); }
  function columns(row,values) { values.forEach(function(v){var cell=element('td'); if(v instanceof Node)cell.appendChild(v);else cell.textContent=String(v==null?'—':v);row.appendChild(cell)}); }
  function renderCharts(data) {
    var hourly=$('Hourly');hourly.replaceChildren();
    var values=Array.from({length:24},function(_,hour){return {hour:hour,marks:Number((data.hourly||[]).find(function(x){return x.hour===hour})?.marks)||0}});
    var max=Math.max(1,...values.map(function(x){return x.marks}));
    values.forEach(function(item){var col=element('div',null,'clock-hour');col.title=String(item.hour).padStart(2,'0')+':00 · '+number(item.marks)+' marcaciones';col.setAttribute('aria-label',col.title);var bar=element('span',null,'clock-bar');bar.style.height=(item.marks/max*100)+'%';col.append(bar,element('small',item.hour%3===0?String(item.hour).padStart(2,'0'):''));hourly.appendChild(col)});
    var days=$('Days');days.replaceChildren();
    (data.daily||[]).forEach(function(day){var row=element('tr');columns(row,[day.day,number(day.marks),number(day.people)]);days.appendChild(row)});
    if(!data.daily?.length){var empty=element('tr');var td=element('td','Sin registros en este período');td.colSpan=3;empty.appendChild(td);days.appendChild(empty)}
  }
  function render(data) {
    state.data=data;
    var sum=data.summary||{},col=data.collection||{},page=data.pagination||{};
    text('Title',data.site?data.site.key.toUpperCase()+' · '+data.site.label:state.site.toUpperCase()+' · sin captura disponible');
    text('Marks',number(sum.marks));text('People',number(sum.people));text('Linked',number(sum.mappedMarks));text('Unlinked',number(sum.unmappedMarks));text('Observed',number(sum.observedRows));text('SourceRows',number(sum.sourceRows));
    text('Captured',instant(col.capturedAt));text('Received',instant(col.receivedAt));text('Latest',instant(sum.latestMarkAt));text('Checked',instant(data.generatedAt));
    text('Mode',col.status==='operator_snapshot'?'Descarga verificada · sin colector automático':col.status==='import_incomplete'?'Importación incompleta':'Sin descarga recibida');
    text('Scope',data.filters?(data.filters.from+' → '+data.filters.to+(data.filters.anchoredToLatest?' · último día con datos':'')):'No hay datos para seleccionar un período');
    if(data.filters){$('From').value=data.filters.from;$('To').value=data.filters.to}
    var select=$('Site'),existing=new Set();select.replaceChildren();
    (data.sites||[]).forEach(function(s){select.appendChild(new Option(s.key.toUpperCase()+' · '+s.label,s.key));existing.add(s.key)});
    if(!existing.has(state.site))select.appendChild(new Option(state.site.toUpperCase()+' · sin captura',state.site));select.value=state.site;
    var body=$('Rows');body.replaceChildren();
    (data.records||[]).forEach(function(mark){var row=element('tr');columns(row,[instant(mark.occurredAt),mark.personLabel,mark.legajo,badge(mark.identityState==='mapped'?'Vinculada':'Por vincular',mark.identityState==='mapped'?'linked':'pending'),badge(mark.reviewState==='pending'?'Pendiente de revisión':mark.reviewState,'pending'),element('span',String(mark.punchCode)+' / '+String(mark.verificationCode),'clock-code')]);body.appendChild(row)});
    if(!data.records?.length){var empty=element('tr');var cell=element('td','Sin fichadas recibidas para este período. Esto no constituye una ausencia.','clock-empty');cell.colSpan=6;empty.appendChild(cell);body.appendChild(empty)}
    text('Page','Página '+page.page+' de '+Math.max(1,page.pages||0)+' · '+number(page.total)+' marcaciones');
    $('Previous').disabled=state.page<=1;$('Next').disabled=!page.pages||state.page>=page.pages;
    $('Export').disabled=!data.records?.length;
    var observations=$('Issues');observations.replaceChildren();
    (data.observations||[]).forEach(function(issue){var names={year_context_review:'Año inconsistente con su contexto',future_timestamp:'Fecha posterior a la captura',identity_format_review:'Identificador pendiente de revisión'};var row=element('tr');columns(row,[String(issue.ordinal),issue.localTimestamp,(issue.issues||[]).map(function(code){return names[code]||code}).join(' · ')]);observations.appendChild(row)});
    $('IssuesWrap').hidden=!data.observations?.length;
    text('Privacy',data.nominalReadAllowed?'Nombres y legajos visibles según tu permiso municipal. No se muestran DNI ni plantillas biométricas.':'Vista seudonimizada: tu perfil no habilita nombres ni legajos.');
    renderCharts(data);
    root.dataset.state='ready';
  }
  function clearNominal() { state.data=null;$('Rows').replaceChildren();$('Days').replaceChildren();$('Issues').replaceChildren();$('Hourly').replaceChildren();$('Export').disabled=true;['Marks','People','Linked','Unlinked','Observed','SourceRows','Page'].forEach(function(key){text(key,'—')}); }
  async function load(reset) {
    if(state.busy)return;
    if(reset)state.page=1;
    state.busy=true;var generation=++state.generation;
    root.setAttribute('aria-busy','true');$('Error').hidden=true;$('Refresh').disabled=true;$('Apply').disabled=true;$('Export').disabled=true;
    var params=new URLSearchParams({resource:'clock-operations',site:state.site,page:String(state.page),pageSize:String(state.size)});
    if(state.from&&state.to){params.set('from',state.from);params.set('to',state.to)}
    var controller=new AbortController(),timeout=setTimeout(function(){controller.abort()},25000);
    try {
      var response=await fetch('/api/internal-attendance?'+params,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
      var data=await response.json();
      if(generation!==state.generation)return;
      if(response.status===401){clearNominal();clearInterval(state.timer);location.replace('login.html?next='+encodeURIComponent('relojes-marcaciones.html'));return}
      if(!response.ok||data.ok!==true)throw new Error(data.error||'No se pudo consultar la captura');
      if(data.version!=='clock-operations.v1')throw new Error('La respuesta del servicio no cumple el contrato operativo');
      render(data);
    } catch(error) {
      clearNominal();root.dataset.state='error';text('Error',error.name==='AbortError'?'El servidor demoró demasiado. Reintentá la consulta.':error.message||'Error de conexión');$('Error').hidden=false;
    } finally { clearTimeout(timeout);state.busy=false;root.setAttribute('aria-busy','false');$('Refresh').disabled=false;$('Apply').disabled=false; }
  }
  function csvCell(value) { var s=String(value??''); if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'; }
  function exportPage() {
    if(!state.data?.records?.length)return;
    var data=state.data;var rows=[['Punto','Fecha y hora local','Persona','Legajo','Vinculación','Revisión','Código dirección sin homologar','Código verificación sin homologar','Captura UTC','Alcance']];
    data.records.forEach(function(r){rows.push([data.site.key,instant(r.occurredAt),r.personLabel,r.legajo,r.identityState,r.reviewState,r.punchCode,r.verificationCode,data.collection.capturedAt,'Página '+state.page+'; no es liquidación ni cobertura de asistencia'])});
    var blob=new Blob(['\ufeff'+rows.map(function(r){return r.map(csvCell).join(';')}).join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'});var url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download='marcaciones-'+state.site+'-'+data.filters.from+'-pagina-'+state.page+'.csv';a.click();setTimeout(function(){URL.revokeObjectURL(url)},1000);
  }
  function start() { if(state.started)return;state.started=true;root.hidden=false;load(false);state.timer=setInterval(function(){if(!document.hidden&&state.started)load(false)},60000); }
  $('Filter').addEventListener('submit',function(event){event.preventDefault();if(state.busy)return;state.site=$('Site').value;state.from=$('From').value;state.to=$('To').value;load(true)});
  $('Refresh').addEventListener('click',function(){load(false)});
  $('LatestDay').addEventListener('click',function(){if(state.busy)return;state.from='';state.to='';load(true)});
  $('Previous').addEventListener('click',function(){if(!state.busy&&state.page>1){state.page--;load(false)}});
  $('Next').addEventListener('click',function(){if(!state.busy&&state.page<(state.data?.pagination?.pages||0)){state.page++;load(false)}});
  $('Export').addEventListener('click',exportPage);
  document.addEventListener('mc:attendance-ready',start);
  document.addEventListener('mc:attendance-site',function(event){var key=String(event.detail?.site||'').toLowerCase();if(!/^[a-z0-9][a-z0-9._-]{1,95}$/.test(key)||state.busy)return;state.site=key;state.from='';state.to='';start();load(true);root.scrollIntoView({behavior:'smooth',block:'start'})});
  document.getElementById('logoutButton')?.addEventListener('click',function(){state.generation++;state.started=false;clearInterval(state.timer);clearNominal();root.hidden=true});
  if(document.getElementById('appShell')?.hidden===false)start();
})();
