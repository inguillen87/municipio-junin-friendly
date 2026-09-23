import {createLegalReadController} from './legal-read-controller.js';
import {LEGAL_ALERT_CATEGORIES,LEGAL_ALERT_SOURCES,filterLegalAlerts,legalAlertCategory,legalAlertCounts,legalAlertStatusLabel,legalAlertCoordinationNeedsReview,verifyLegalAlertCenterResponseV2} from './legal-alert-center-model.js';
const root=document.getElementById('legalAlertRoot'),API='/api/internal-legal-alert-center';if(root)void start(root);
async function start(host){
 let data=null,busy=false,blocked=false,message='Verificando alertas jurídicas…',error=false,category='all',source='all',query='',page=1;const PAGE=25;
 const add=(p,t,x,c)=>{const n=document.createElement(t);if(x!==undefined)n.textContent=String(x);if(c)n.className=c;p.append(n);return n;},button=(p,x,fn,disabled=false)=>{const n=add(p,'button',x,'button');n.type='button';n.disabled=busy||disabled;n.onclick=fn;return n;};
 function clear(){data=null;query='';category='all';source='all';page=1;}
 async function request(signal){const r=await fetch(API+'?resource=alerts&version=2',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal});let v;try{v=await r.json();}catch{throw Object.assign(Error('LEGAL_RESPONSE_INVALID'),{status:r.status});}if(!r.ok||v?.ok!==true)throw Object.assign(Error('LEGAL_READ_FAILED'),{status:r.status});return verifyLegalAlertCenterResponseV2(v.data);}
 let authorized=false;
 const reader=createLegalReadController({read:request,canRead:()=>authorized&&!blocked&&host.isConnected,onChange:state=>{
  busy=state.phase==='loading';data=state.data;error=['error','blocked'].includes(state.phase);
  if(state.phase==='loading')message='Actualizando alertas jurídicas…';
  if(state.phase==='ready')message='Lectura actualizada con los registros autorizados del municipio.';
  if(state.phase==='error')message=state.reason==='timeout'?'La consulta demoró demasiado. Reintentá; no se muestran resultados anteriores como actuales.':'No se pudo verificar la información. Reintentá; tus filtros se conservaron.';
  if(state.phase==='blocked'){blocked=true;query='';category='all';source='all';page=1;message='El acceso cambió o el contexto fue actualizado. Los datos se ocultaron; volvé a abrir esta pantalla.';}
  if(state.phase==='disposed')return;
  render();
 }});
 function load(){return reader.load();}

 function resourceLabel(r){return r.sourceType==='matter'?'Asunto jurídico':r.sourceType==='followup'?'Seguimiento normativo':'Obligación contractual';}
 function resourceHref(r){if(r.sourceType==='matter')return'/internal-legal-matters.html?'+new URLSearchParams({asunto:r.itemId});if(r.sourceType==='followup')return'/internal-legal-followups.html?'+new URLSearchParams({norma:r.sourceId,version:String(r.sourceVersion),seguimiento:r.itemId});return'/internal-legal-contract-obligations.html?'+new URLSearchParams({contrato:r.sourceId});}
 function render(){
  host.replaceChildren();host.className='lac-shell';host.setAttribute('aria-busy',String(busy));add(host,'p','JURÍDICA · CENTRO DE ALERTAS','lr-eyebrow');add(host,'h1','Alertas jurídicas');
  const alert=add(host,'p',message,'lac-alert'+(error?' lac-error':''));alert.setAttribute('role','status');alert.setAttribute('aria-live','polite');
  add(host,'p','“Fecha pasada” describe una fecha registrada anterior a hoy. No significa automáticamente vencimiento legal, incumplimiento, mora ni pérdida de vigencia.','lac-note');
  const nav=add(host,'div','','lac-tools');for(const [label,href] of [['Asuntos','/internal-legal-matters.html'],['Seguimientos','/internal-legal-followups.html'],['Contratos','/internal-legal-contracts.html'],['Agenda contractual','/internal-legal-contract-agenda.html']]){const a=add(nav,'a',label,'button');a.href=href;}
  if(blocked)return;button(host,'Actualizar alertas',load);if(!data){if(!busy)button(host,'Reintentar',load);return;}
  add(host,'p','Fecha de referencia: '+data.today+' · Hora de Mendoza. Incluye asuntos jurídicos, seguimientos normativos y obligaciones contractuales.','lac-note');
  const counts=legalAlertCounts(filterLegalAlerts(data.rows,data.today,{source,query}),data.today),cats=add(host,'div','','lac-categories');
  for(const [k,label] of Object.entries(LEGAL_ALERT_CATEGORIES)){const b=button(cats,label+' · '+counts[k],()=>{category=k;page=1;render();});b.setAttribute('aria-pressed',String(category===k));}
  const form=add(host,'form','','lac-search');
  const ql=add(form,'label','Buscar título, fuente, responsable, área o siguiente acción'),qi=add(ql,'input');qi.type='search';qi.maxLength=120;qi.value=query;qi.oninput=()=>query=qi.value;
  const sl=add(form,'label','Fuente'),ss=add(sl,'select');for(const [k,label]of Object.entries(LEGAL_ALERT_SOURCES)){const o=add(ss,'option',label);o.value=k;}ss.value=source;ss.onchange=()=>{source=ss.value;page=1;render();};
  const apply=button(form,'Aplicar',()=>{});apply.type='submit';form.onsubmit=e=>{e.preventDefault();query=qi.value;page=1;render();};button(form,'Limpiar',()=>{query='';source='all';category='all';page=1;render();});
  const rows=filterLegalAlerts(data.rows,data.today,{category,source,query}),pages=Math.max(1,Math.ceil(rows.length/PAGE));if(page>pages)page=pages;const visible=rows.slice((page-1)*PAGE,page*PAGE);
  add(host,'p',rows.length+' resultados · página '+page+' de '+pages,'lac-note');const cards=add(host,'div','','lac-cards');
  if(!visible.length){const e=add(cards,'section','','lac-card');add(e,'h2','Sin resultados');add(e,'p',data.population===0?'Todavía no hay asuntos, seguimientos ni obligaciones contractuales con alertas. No se muestran ejemplos ficticios.':'Probá otra fuente, categoría o búsqueda.');}
  for(const r of visible){const c=add(cards,'article','','lac-card');add(c,'span',LEGAL_ALERT_CATEGORIES[legalAlertCategory(r,data.today)],'lac-tag');add(c,'h2',r.title);add(c,'p',resourceLabel(r)+' · '+r.sourceKind+' '+r.sourceNumber+'/'+r.sourceYear+' · '+r.sourceTitle+' · Versión de fuente '+r.sourceVersion);add(c,'p','Fecha registrada: '+(r.dueDate||'Sin fecha'),'lac-note');add(c,'p','Estado registrado: '+legalAlertStatusLabel(r),'lac-note');
   if(r.sourceType!=='contract_obligation'||r.responsibleLabel){const details=add(c,'dl','','lac-details');if(r.owningArea){add(details,'dt','Área');add(details,'dd',r.owningArea);}add(details,'dt','Responsable');add(details,'dd',r.responsibleLabel||'Sin asignar');if(r.sourceType!=='contract_obligation'){add(details,'dt','Siguiente acción');add(details,'dd',r.nextAction||'Sin registrar');}}
   if(r.responsibleEligible===false)add(c,'p','La persona asignada no está habilitada actualmente para atender este recurso.','lac-coordination');
   if(legalAlertCoordinationNeedsReview(r)){const warning=add(c,'div','','lac-coordination');add(warning,'strong','Coordinación pendiente de revisión');add(warning,'p','El seguimiento cambió desde la última revisión de su responsable y siguiente acción.');}
   const t=add(c,'div','','lac-tools');const a=add(t,'a','Abrir recurso','button');a.href=resourceHref(r);}
  const pager=add(host,'div','','lac-tools');button(pager,'Anterior',()=>{page--;render();},page<=1);button(pager,'Siguiente',()=>{page++;render();},page>=pages);
 }
 if(new URLSearchParams(location.search).size){blocked=true;message='El Centro de Alertas no acepta tenant, usuario ni filtros por URL.';error=true;render();return;}
 const access=await globalThis.MuniControlCapabilityGate?.ready;
 if(!access?.tenantCapabilities?.has('legal.norm.read')){reader.revoke();return;}
 authorized=true;
 const onFocus=()=>{if(document.visibilityState==='visible'&&host.isConnected)void load()};
 const onAccess=()=>{authorized=false;reader.revoke()};
 const dispose=()=>{reader.dispose();globalThis.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);document.removeEventListener('municontrol:capabilities-ready',onAccess);globalThis.removeEventListener('pagehide',onHide);observer.disconnect();host.replaceChildren()};
 const onHide=()=>{authorized=false;dispose()};
 const observer=new MutationObserver(()=>{if(!host.isConnected)dispose()});observer.observe(document.body,{childList:true,subtree:true});
 globalThis.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);
 document.addEventListener('municontrol:capabilities-ready',onAccess);globalThis.addEventListener('pagehide',onHide,{once:true});
 globalThis.addEventListener('pageshow',event=>{if(event.persisted)location.reload()});
 await load();
}
