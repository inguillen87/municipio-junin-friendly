// A role filter selects a published QA case. It never selects the acting identity.
import { mountManualNovelty } from './developer-homologation-manual.js';
const endpoint = '/api/internal-developer-homologation';
const tokenRE = /^[a-f0-9]{64}$/i;
const monthRE = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const idRE = /^[a-z][a-z0-9-]{0,79}$/;
const roles = {preparation:'Preparación',review:'Revisión',control:'Control'};
const functionsById = { 'alta-preparar':'Altas','legajo-modificar':'Modificaciones','baja-revisar':'Bajas','novedad-preparar':'Novedades','novedad-revisar':'Novedades','calculo-verificar':'Cálculo','liquidacion-revisar':'Confirmación y anulación','cierre-verificar':'Cierre','reportes-validar':'Reportes' };
const groupFor = id => functionsById[id] || 'Otros controles';
const statuses = {passed:'Verificado',blocked:'Bloqueado',failed:'Falló el control'};
const metrics = [
  ['registered','Legajos registrados'],['masterItems','Filas del maestro'],['activeScales','Escalas vigentes'],
  ['activeConcepts','Conceptos vigentes'],['activeAuxiliaries','Auxiliares vigentes'],['monthlyRules','Reglas mensuales'],
  ['programRevision','Revisión del programa'],['masterRevision','Revisión del maestro'],['captures','Capturas del mes'],
  ['results','Resultados del mes'],['registeredAfterPeriod','Altas posteriores al mes']
];
const clean = (s,n=600) => typeof s === 'string' ? s.trim().slice(0,n) : '';
const count = n => Number.isSafeInteger(n) && n >= 0 ? n : null;
export function visitCoverage(cases,latest) {
  const groups=new Map();let run=0;
  for(const c of cases){
    const group=groupFor(c.id);if(!groups.has(group))groups.set(group,{group,pending:0,passed:0,blocked:0,failed:0});
    const status=latest.get(c.id);
    if(status && Object.hasOwn(statuses,status)){groups.get(group)[status]++;run++;}
    else groups.get(group).pending++;
  }
  return {run,total:cases.length,groups:[...groups.values()]};
}
export function publicReadiness(r) {
  if (!r || !monthRE.test(r.period) || !Array.isArray(r.diagnosis)) return null;
  return {period:r.period,...Object.fromEntries(metrics.map(([k])=>[k,count(r[k])])),diagnosis:r.diagnosis.slice(0,30).map(v=>clean(v)).filter(Boolean)};
}
export function publicResult(raw, id) {
  if (!raw || raw.id!==id || !Object.hasOwn(statuses,raw.status) || !Array.isArray(raw.checks) || raw.checks.length>80 ||
      raw.checks.some(x=>typeof x?.passed!=='boolean'||!clean(x.label)) ||
      (raw.status==='passed' && (!raw.checks.length || raw.checks.some(x=>!x.passed)))) throw new Error('invalid_result');
  return {id,status:raw.status,detail:clean(raw.detail),checks:raw.checks.map(c=>({label:clean(c.label,240),passed:c.passed}))};
}
export function publicCases(values) {
  if (!Array.isArray(values) || values.length>80) throw new Error('invalid_cases');
  const seen=new Set();
  return values.map(v=>{
    if (!v || !idRE.test(v.id) || seen.has(v.id) || !clean(v.label) || !Object.hasOwn(roles,v.role)) throw new Error('invalid_cases');
    seen.add(v.id); return {id:v.id,role:v.role,label:clean(v.label,160),description:clean(v.description,480)};
  });
}
class AccessError extends Error { constructor(status){super('access');this.status=status;} }
export async function apiRequest(fetcher, op, body, token, period) {
  const get=['status','workspace'].includes(op) || (op==='practice' && body===undefined);
  if (!get && (!['start','trial','stop','practice'].includes(op) || !tokenRE.test(token))) throw new AccessError(409);
  if (period && (op!=='workspace' || !monthRE.test(period))) throw new Error('invalid_period');
  const params=new URLSearchParams({op}); if (period) params.set('period',period);
  const headers={Accept:'application/json'};
  const init={method:get?'GET':'POST',credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',headers};
  if (!get) {headers['Content-Type']='application/json';headers['X-Homologation-Scope']=token;init.body=JSON.stringify(body);}
  const resp=await fetcher(endpoint+'?'+params,init);
  if (!resp.ok) throw new AccessError(resp.status);
  const p=await resp.json();
  if (p?.ok!==true || typeof p.active!=='boolean' || !tokenRE.test(p.scopeToken)) throw new Error('invalid_response');
  return p;
}
export function mountHomologation(doc, win, fetcher) {
  const $=id=>doc.getElementById('qa-'+id);
  const el=(tag,text,cls)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  let manual=null, chart=null, chartDraw=0; const latest=new Map(); let epoch=0, busy=false, active=false, token='', end=0, caseList=[], read=null, history=[], totalTrials=0;
  const prettyDate=t=>new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Argentina/Buenos_Aires'}).format(t)+' ART';
  const notice=(s,problem=false)=>{const n=$('notice');n.dataset.error=String(problem);n.textContent=s;};
  const disable=()=>{for(const name of ['start','read','export','stop','stop-yes','stop-no','role','function','month','reviewed']) $(name).disabled=busy || (name==='start'&&!$('reviewed').checked) || (name==='export'&&!history.length);for(const button of $('list').querySelectorAll('button'))button.disabled=busy;};
  function clear() {
    ++epoch;++chartDraw;chart?.dispose?.();chart=null;latest.clear();$('chart-wrap').hidden=true;manual?.destroy?.();manual=null;$('manual-novelty').replaceChildren();$('manual-novelty').hidden=true;active=false;busy=false;token='';end=0;caseList=[];read=null;history=[];totalTrials=0;
    for(const name of ['intro','workspace','confirm-stop','recovery','login','tenant']) $(name).hidden=true;
    $('role').value='all';$('function').value='all';$('month').value='';$('reviewed').checked=false;
    for(const name of ['operator','end','readiness','list','history','next','stats','progress-copy']) $(name).replaceChildren();
    $('state').textContent='Acceso sin verificar';disable();
  }
  function recover(msg,code) {
    clear();$('recovery').hidden=false;$('login').hidden=code!==401;$('tenant').hidden=code!==403;
    notice(msg,true);
  }
  function onError(e) {
    const code=e?.status;
    const msg= code===401?'Tu sesión terminó. Ingresá con tu propia cuenta y volvé a consultar.':
      code===403?'Esta cuenta o este ámbito no tiene acceso. Usá la cuenta propietaria habilitada en la operación municipal.':
      code===409?'Cambió el ámbito o la jornada. Volvé a consultar y revisá la acción antes de confirmarla.':
      code===410?'La jornada venció. Volvé a consultar para iniciar otra.':
      code===429?'Hay demasiadas solicitudes. Esperá un momento y volvé a consultar.':
      code===503?'Homologación no está disponible. No se pudo confirmar el estado de la jornada.':
      'No pudimos confirmar esta operación. Volvé a consultar el estado antes de intentar otra vez.';
    recover(msg,code);
  }
  function accept(p) {
    const deadline=p.active?Date.parse(p.expiresAt):0;
    if(p.active && (!Number.isFinite(deadline)||deadline<=Date.now()))throw new AccessError(410);
    token=p.scopeToken;active=p.active;end=deadline;
    $('state').textContent=active?'Jornada activa':'Jornada sin iniciar';
    $('operator').textContent=clean(p.operatorLabel,140)?'Operador: '+clean(p.operatorLabel,140):'Operador: tu cuenta autenticada';
    $('end').textContent=active?'Vence: '+prettyDate(deadline):'';
    $('intro').hidden=active;$('workspace').hidden=!active;$('recovery').hidden=true;
  }
  const showRead=()=>{
    const box=$('readiness');box.replaceChildren();
    if(!read){box.append(el('p','Sin lectura disponible para este ámbito.'));return;}
    const title=el('h3','Datos registrados · '+read.period);box.append(title);
    const dl=el('dl',undefined,'metrics');for(const [k,label] of metrics){const g=el('div');g.append(el('dt',label),el('dd',read[k]===null?'No disponible':String(read[k])));dl.append(g);}box.append(dl);
    const ul=el('ul');for(const m of read.diagnosis)ul.append(el('li',m));if(ul.childNodes.length)box.append(ul);
  };
  function showHistory() {
    const box=$('history');box.replaceChildren();
    if(!history.length){box.append(el('p','Todavía no ejecutaste un control en esta visita.'));return;}
    if(totalTrials>history.length)box.append(el('p','Se muestran los últimos '+history.length+' de '+totalTrials+' controles.'));
    for(const h of history.slice().reverse()) {
      const sec=el('article',undefined,'result'), head=el('h3',h.label);
      const badge=el('span',statuses[h.result.status],'outcome');badge.dataset.status=h.result.status;
      sec.append(head,badge,el('small',roles[h.role]+' · '+prettyDate(new Date(h.at))));
      if(h.result.detail)sec.append(el('p',h.result.detail));
      if(h.result.checks.length){const ul=el('ul');for(const c of h.result.checks)ul.append(el('li',(c.passed?'Verificado: ':'No verificado: ')+c.label));sec.append(ul);}
      box.append(sec);
    }
  }
  function progress() {
    const {run,total,groups}=visitCoverage(caseList,latest);const bar=$('progress');
    bar.max=total||1;bar.value=run;$('progress-copy').textContent=run+' de '+total+' controles ejecutados · '+[...latest.values()].filter(v=>v==='passed').length+' verificados';
    const out=$('stats');out.replaceChildren();
    for(const g of groups)out.append(el('p',g.group+': '+g.passed+' verificados, '+g.pending+' sin probar, '+g.blocked+' bloqueados, '+g.failed+' fallidos.'));
    const next=$('next');next.replaceChildren();
    const todo=caseList.find(c=>!latest.has(c.id));
    if(todo){
      const a=el('a',(run?'Siguiente control: ':'Empezá con: ')+todo.label);a.href='#qa-cases-title';
      a.addEventListener('click',()=>{$('role').value=todo.role;$('function').value=groupFor(todo.id);renderCases();});
      next.append(a);
    }else if(total){const a=el('a','Revisar resultados');a.href='#qa-history-title';next.append(a);}
    const render=++chartDraw;
    if(!run||!total){$('chart-wrap').hidden=true;return;}
    // ECharts is lazy, same-origin and optional: the accessible counts above are always available.
    if(!doc.defaultView || !win.ResizeObserver)return;
    import('/assets/mc-charts.js').then(({mountChart})=>{
      if(render!==chartDraw||!active||doc.hidden)return;
      const host=$('chart');$('chart-wrap').hidden=false;
      host.style.height=Math.max(groups.length*40+30,175)+'px';
      const colors={passed:'#087369',pending:'#a5b4bc',blocked:'#a56619',failed:'#ac4040'};
      const option={animation:!win.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
        legend:{show:false}, grid:{left:10,right:16,top:12,bottom:10,containLabel:true},
        xAxis:{type:'value',minInterval:1},yAxis:{type:'category',inverse:true,data:groups.map(g=>g.group==='Confirmación y anulación'?'Conf. y anulación':g.group)},
        series:['passed','pending','blocked','failed'].map(k=>({name:statuses[k]||'Sin probar',type:'bar',stack:'tests',barMaxWidth:16,itemStyle:{color:colors[k]},data:groups.map(g=>g[k])}))};
      if(chart){chart.update(option);}else{chart=mountChart(host,option,{ariaLabel:'Estado de los controles por función. Cantidades en el detalle contiguo.'});}
    }).catch(()=>{if(render===chartDraw)$('chart-wrap').hidden=true;});
  }
  function renderFunctions() {
    const options=$('function'),current=options.value;options.replaceChildren();
    for(const [value,label] of [['all','Todas las funciones'],...[...new Set(caseList.map(c=>groupFor(c.id)))].map(g=>[g,g])]){
      const item=el('option',label);item.value=value;options.append(item);}
    options.value=[...caseList.map(c=>groupFor(c.id)),'all'].includes(current)?current:'all';
  }
  function renderCases() {
    const box=$('list');box.replaceChildren();const filter=$('role').value;
    const cases=caseList.filter(c=>(filter==='all'||c.role===filter)&&($('function').value==='all'||$('function').value===groupFor(c.id)));
    if(!cases.length){box.append(el('p','Esta combinación de perfil y función no tiene controles. Elegí otra opción.'));return;}
    for(const c of cases){
      const card=el('article',undefined,'case'), btn=el('button','Ejecutar control');btn.setAttribute('aria-label','Ejecutar control: '+c.label);
      btn.type='button';btn.className='primary';btn.disabled=busy;
      btn.addEventListener('click',()=>act('trial',c.id));card.append(el('small',groupFor(c.id)+' · '+roles[c.role]),el('h3',c.label),el('p',c.description),btn);box.append(card);
    }
  }
  async function workspace(stamp,period,baseline) {
    const p=await apiRequest(fetcher,'workspace',undefined,undefined,period);if(epoch!==stamp)return false;
    if(!p.active || p.scopeToken!==baseline) throw new AccessError(409);
    accept(p);caseList=publicCases(p.cases);read=publicReadiness(p.readiness);
    if(period && read && period!==read.period)throw new Error('wrong_period');
    $('month').value=read?.period || period || '';renderFunctions();renderCases();progress();showRead();showHistory();
    if(!manual) {
      const container=el('div');$('manual-novelty').replaceChildren(container);$('manual-novelty').hidden=false;
      const current=token;
      const invalidate=()=>{if(epoch===stamp)onError(new AccessError(409));};
      const request=async(op,body)=>{
        if(op!=='practice'||stamp!==epoch||!active||current!==token) throw new AccessError(409);
        if(Date.now()>=end){onError(new AccessError(410));throw new AccessError(410);}
        try {
          const answer=await apiRequest(fetcher,'practice',body,current);
          if(stamp!==epoch) throw new AccessError(409);
          if(!answer.active||answer.scopeToken!==current) throw new AccessError(409);
          accept(answer);return answer;
        } catch(e){if(stamp===epoch && [401,403,409,410].includes(e.status))onError(e);throw e;}
      };
      manual=mountManualNovelty(container,{request,invalidate})||{};
    }
    return true;
  }
  async function act(op,caseId) {
    if(busy)return;
    if(active && Date.now()>=end){onError(new AccessError(410));return;}
    if(op==='start'&&(!$('reviewed').checked||!token||active))return;
    if(['trial','read','stop'].includes(op)&&(!active||!token))return;
    const selected=caseList.find(c=>c.id===caseId);
    if(op==='trial'&&!selected)return;
    if(op==='stop'&&$('confirm-stop').hidden)return;
    const period=op==='read'?$('month').value:'';
    if(op==='read'&&!monthRE.test(period)){notice('Elegí un mes y un año válidos.',true);return;}
    const stamp=epoch; const baseline=token;busy=true;disable();notice('Consultando…');
    try{
      if(op==='status'||op==='start') {
        const p=await apiRequest(fetcher,op,op==='start'?{reviewed:true}:undefined,baseline);if(stamp!==epoch)return;
        if(op==='start' && !p.active)throw new AccessError(409);
        accept(p);
        if(p.active){if(!await workspace(stamp,'',p.scopeToken))return;notice('Jornada verificada. Elegí un perfil y un control.');if(op==='start')$('cases-title').focus();}
        else {notice('Podés abrir una jornada con tu identidad actual.');}
      } else if(op==='read') {
        if(await workspace(stamp,period,baseline))notice(read?'Datos actualizados para '+read.period+'.':'Sin lectura disponible para el período.');
      } else if(op==='trial') {
        const p=await apiRequest(fetcher,'trial',{caseId},baseline);if(stamp!==epoch)return;
        if(!p.active || p.scopeToken!==baseline)throw new AccessError(409);
        accept(p);const result=publicResult(p.result,caseId);totalTrials++;history.push({at:new Date().toISOString(),label:selected.label,role:selected.role,result});
        if(history.length>100)history.shift();latest.set(caseId,result.status);progress();showHistory();notice(selected.label+': '+statuses[result.status]+'. Ver el detalle en Resultados de esta visita.');
        $('history-title').focus();
      } else if(op==='stop') {
        const p=await apiRequest(fetcher,'stop',{},baseline);if(stamp!==epoch)return;
        if(p.active)throw new Error('stop_not_confirmed');
        clear();accept(p);notice('La jornada terminó. El informe se retiró de esta pantalla.');$('intro-title').focus();
      }
    } catch(e){if(stamp===epoch)onError(e);}
    finally{if(stamp===epoch){busy=false;disable();}}
  }
  const restart=()=>{clear();void act('status');};
  $('refresh').addEventListener('click',restart);$('reviewed').addEventListener('change',disable);
  $('start').addEventListener('click',()=>act('start'));$('role').addEventListener('change',renderCases);$('function').addEventListener('change',renderCases);
  $('period-form').addEventListener('submit',e=>{e.preventDefault();void act('read');});
  $('month').addEventListener('input',()=>{if(read && $('month').value!==read.period){read=null;$('readiness').replaceChildren(el('p','Consultá el período elegido para ver sus datos.'));}});
  $('stop').addEventListener('click',()=>{$('confirm-stop').hidden=false;$('stop-no').focus();});
  $('stop-no').addEventListener('click',()=>{$('confirm-stop').hidden=true;$('stop').focus();});
  $('stop-yes').addEventListener('click',()=>act('stop'));
  $('export').addEventListener('click',()=>{
    if(!active||busy||!history.length)return;
    if(Date.now()>=end){onError(new AccessError(410));return;}
    const report={version:'municontrol.homologacion.informe.v1',tipo:'ENSAYO DE DESARROLLO',emitido:new Date().toISOString(),
      alcance:'Controles técnicos con datos de ensayo. El resumen del mes contiene sólo cantidades agregadas. Sin efecto municipal.',
      periodoConsultado:read?.period??null,datosDePeriodo:read,controlesEjecutadosEnLaVisita:totalTrials,controlesEnInforme:history.length,historialCompleto:history.length===totalTrials,ultimosResultadosDeEstaVisita:history};
    const blob=new win.Blob([JSON.stringify(report,null,2)],{type:'application/json'}), url=win.URL.createObjectURL(blob);
    const a=el('a');a.href=url;a.download='MuniControl-homologacion-'+report.emitido.slice(0,10)+'.json';
    doc.body.append(a);a.click();a.remove();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);
  });
  const tick=()=>{if(active && Date.now()>=end)onError(new AccessError(410));};
  const timer=win.setInterval(tick,1000);
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden){clear();notice('La vista se despejó. Verificaremos tu sesión al regresar.');}else restart();});
  win.addEventListener('pagehide',()=>{clear();notice('Verificando acceso…');});win.addEventListener('pageshow',e=>{if(e.persisted)restart();});
  restart();return {destroy:()=>{clear();win.clearInterval(timer);}};
}
if(typeof document!=='undefined' && document.getElementById('qa-start')) mountHomologation(document,window,window.fetch.bind(window));
