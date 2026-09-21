import {LEGAL_ALERT_CATEGORIES,LEGAL_ALERT_SOURCES,filterLegalAlerts,legalAlertCategory,legalAlertCounts,legalAlertStatusLabel,verifyLegalAlertCenterResponse} from './legal-alert-center-model.js';
const root=document.getElementById('legalAlertRoot'),API='/api/internal-legal-alert-center';if(root)void start(root);
async function start(host){
 let data=null,busy=false,blocked=false,message='Verificando alertas jurídicas…',error=false,category='all',source='all',query='',page=1;const PAGE=25;
 const add=(p,t,x,c)=>{const n=document.createElement(t);if(x!==undefined)n.textContent=String(x);if(c)n.className=c;p.append(n);return n;},button=(p,x,fn,disabled=false)=>{const n=add(p,'button',x,'button');n.type='button';n.disabled=busy||disabled;n.onclick=fn;return n;};
 async function request(){const r=await fetch(API+'?resource=alerts',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});let v;try{v=await r.json();}catch{throw Object.assign(Error('No llegó una respuesta verificable.'),{status:r.status});}if(!r.ok||v?.ok!==true)throw Object.assign(Error(v?.error||'No se pudieron cargar las alertas.'),{status:r.status});return verifyLegalAlertCenterResponse(v.data);}
 async function load(){if(busy||blocked)return;busy=true;data=null;message='Actualizando alertas jurídicas…';error=false;render();try{const next=await request();if(!blocked){data=next;message='Alertas actualizadas con fechas revisadas por el municipio.';error=false;}}catch(e){data=null;if([401,403].includes(e.status)){blocked=true;message='El acceso cambió. Las alertas jurídicas se ocultaron.';}else{message='No se pudieron verificar las alertas. Reintentá para consultar información actualizada.';}error=true;}finally{busy=false;render();}}
 function resourceLabel(r){return r.sourceType==='followup'?'Seguimiento normativo':'Obligación contractual';}
 function resourceHref(r){if(r.sourceType==='followup')return'/internal-legal-followups.html?'+new URLSearchParams({norma:r.sourceId,version:String(r.sourceVersion),seguimiento:r.itemId});return'/internal-legal-contract-obligations.html?'+new URLSearchParams({contrato:r.sourceId});}
 function render(){
  host.replaceChildren();host.className='lac-shell';host.setAttribute('aria-busy',String(busy));add(host,'p','JURÍDICA · CENTRO DE ALERTAS','lr-eyebrow');add(host,'h1','Alertas jurídicas');
  const alert=add(host,'p',message,'lac-alert'+(error?' lac-error':''));alert.setAttribute('role','status');alert.setAttribute('aria-live','polite');
  add(host,'p','“Fecha pasada” describe una fecha registrada anterior a hoy. No significa automáticamente vencimiento legal, incumplimiento, mora ni pérdida de vigencia.','lac-note');
  const nav=add(host,'div','','lac-tools');for(const [label,href] of [['Asuntos','/internal-legal-matters.html'],['Seguimientos','/internal-legal-followups.html'],['Contratos','/internal-legal-contracts.html'],['Agenda contractual','/internal-legal-contract-agenda.html']]){const a=add(nav,'a',label,'button');a.href=href;}
  if(blocked)return;button(host,'Actualizar alertas',load);if(!data){if(!busy)button(host,'Reintentar',load);return;}
  add(host,'p','Fecha de referencia: '+data.today+' · Hora de Mendoza. Sólo se incluyen seguimientos normativos y obligaciones contractuales.','lac-note');
  const counts=legalAlertCounts(filterLegalAlerts(data.rows,data.today,{source,query}),data.today),cats=add(host,'div','','lac-categories');
  for(const [k,label] of Object.entries(LEGAL_ALERT_CATEGORIES)){const b=button(cats,label+' · '+counts[k],()=>{category=k;page=1;render();});b.setAttribute('aria-pressed',String(category===k));}
  const form=add(host,'form','','lac-search');
  const ql=add(form,'label','Buscar título, fuente, número o responsable'),qi=add(ql,'input');qi.type='search';qi.maxLength=120;qi.value=query;qi.oninput=()=>query=qi.value;
  const sl=add(form,'label','Fuente'),ss=add(sl,'select');for(const [k,label]of Object.entries(LEGAL_ALERT_SOURCES)){const o=add(ss,'option',label);o.value=k;}ss.value=source;ss.onchange=()=>{source=ss.value;page=1;render();};
  const apply=button(form,'Aplicar',()=>{});apply.type='submit';form.onsubmit=e=>{e.preventDefault();query=qi.value;page=1;render();};button(form,'Limpiar',()=>{query='';source='all';category='all';page=1;render();});
  const rows=filterLegalAlerts(data.rows,data.today,{category,source,query}),pages=Math.max(1,Math.ceil(rows.length/PAGE));if(page>pages)page=pages;const visible=rows.slice((page-1)*PAGE,page*PAGE);
  add(host,'p',rows.length+' resultados · página '+page+' de '+pages,'lac-note');const cards=add(host,'div','','lac-cards');
  if(!visible.length){const e=add(cards,'section','','lac-card');add(e,'h2','Sin resultados');add(e,'p',data.population===0?'Todavía no hay seguimientos ni obligaciones contractuales con alertas. No se muestran ejemplos ficticios.':'Probá otra fuente, categoría o búsqueda.');}
  for(const r of visible){const c=add(cards,'article','','lac-card');add(c,'span',LEGAL_ALERT_CATEGORIES[legalAlertCategory(r,data.today)],'lac-tag');add(c,'h2',r.title);add(c,'p',resourceLabel(r)+' · '+r.sourceKind+' '+r.sourceNumber+'/'+r.sourceYear+' · '+r.sourceTitle+' · Versión de fuente '+r.sourceVersion);add(c,'p','Fecha registrada: '+(r.dueDate||'Sin fecha')+(r.responsibleLabel?' · Responsable: '+r.responsibleLabel:''),'lac-note');add(c,'p','Estado registrado: '+legalAlertStatusLabel(r),'lac-note');const t=add(c,'div','','lac-tools');const a=add(t,'a','Abrir recurso','button');a.href=resourceHref(r);}
  const pager=add(host,'div','','lac-tools');button(pager,'Anterior',()=>{page--;render();},page<=1);button(pager,'Siguiente',()=>{page++;render();},page>=pages);
 }
 if(new URLSearchParams(location.search).size){blocked=true;message='El Centro de Alertas no acepta tenant, usuario ni filtros por URL.';error=true;render();return;}
 const access=await globalThis.MuniControlCapabilityGate?.ready;if(!access?.tenantCapabilities?.has('legal.norm.read')){blocked=true;message='No tenés acceso a alertas jurídicas.';error=true;render();return;}
 globalThis.addEventListener('focus',()=>{if(document.visibilityState==='visible')void load();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void load();});
 document.addEventListener('municontrol:capabilities-ready',event=>{if(!event.detail?.tenantCapabilities?.has('legal.norm.read')){blocked=true;data=null;message='El acceso cambió. Las alertas jurídicas se ocultaron.';error=true;render();}});
 await load();
}
