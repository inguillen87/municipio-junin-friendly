import {CONTRACT_AGENDA_CATEGORIES,contractAgendaCategory,contractAgendaCounts,filterContractAgenda,verifyContractAgendaResponse} from './legal-contract-agenda-model.js';
const root=document.getElementById('contractAgendaRoot'),API='/api/internal-legal-contract-agenda';if(root)void start(root);
async function start(host){
 let data=null,busy=false,blocked=false,message='Verificando agenda contractual…',error=false,category='all',query='',page=1;const PAGE=25;
 const add=(p,t,x,c)=>{const n=document.createElement(t);if(x!==undefined)n.textContent=String(x);if(c)n.className=c;p.append(n);return n;},button=(p,x,fn,disabled=false)=>{const n=add(p,'button',x,'button');n.type='button';n.disabled=busy||disabled;n.onclick=fn;return n;};
 async function request(){const r=await fetch(API+'?resource=agenda',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});let v;try{v=await r.json();}catch{throw Object.assign(Error('No llegó una agenda verificable.'),{status:r.status});}if(!r.ok||v?.ok!==true)throw Object.assign(Error(v?.error||'No se pudo cargar la agenda contractual.'),{status:r.status});return verifyContractAgendaResponse(v.data);}
 async function load(){busy=true;render();try{data=await request();message='Agenda actualizada con fechas registradas y revisadas.';error=false;}catch(e){if([401,403].includes(e.status)){data=null;blocked=true;message='El acceso cambió. La agenda contractual se ocultó.';error=true;}else{message=e.message;error=true;}}finally{busy=false;render();}}
 function render(){
  host.replaceChildren();host.className='lga-shell';host.setAttribute('aria-busy',String(busy));add(host,'p','JURÍDICA · AGENDA CONTRACTUAL','lr-eyebrow');add(host,'h1','Agenda contractual');
  const a=add(host,'p',message,'lga-alert'+(error?' lga-error':''));a.setAttribute('role','status');a.setAttribute('aria-live','polite');
  add(host,'p','Las categorías se basan sólo en fechas registradas. “Fecha pasada” no significa incumplimiento jurídico; los estados observados requieren decisión humana.','lga-note');
  const nav=add(host,'div','','lga-tools');const back=add(nav,'a','Contratos','button');back.href='/internal-legal-contracts.html';const matters=add(nav,'a','Asuntos','button');matters.href='/internal-legal-matters.html';
  if(blocked)return;
  if(!data){if(!busy)button(host,'Reintentar',load);return;}
  const counts=contractAgendaCounts(data.rows,data.today),cats=add(host,'div','','lga-categories');
  for(const [key,label] of Object.entries(CONTRACT_AGENDA_CATEGORIES)){const b=button(cats,label+' · '+counts[key],()=>{category=key;page=1;render();});b.classList.add('lga-category');b.setAttribute('aria-pressed',String(category===key));}
  const form=add(host,'form','','lga-search'),l=add(form,'label','Buscar contrato, obligación, cláusula o responsable'),input=add(l,'input');input.type='search';input.maxLength=120;input.value=query;input.oninput=()=>query=input.value;const apply=button(form,'Aplicar búsqueda',()=>{});apply.type='submit';form.onsubmit=e=>{e.preventDefault();query=input.value;page=1;render();};button(form,'Limpiar',()=>{query='';page=1;render();});
  const rows=filterContractAgenda(data.rows,data.today,category,query),pages=Math.max(1,Math.ceil(rows.length/PAGE));if(page>pages)page=pages;const visible=rows.slice((page-1)*PAGE,page*PAGE);
  add(host,'p',rows.length+' resultados · página '+page+' de '+pages,'lga-note');
  const cards=add(host,'div','','lga-cards');
  if(!visible.length){const e=add(cards,'section','','lga-card');add(e,'h2','Sin resultados');add(e,'p',data.population===0?'Todavía no hay obligaciones contractuales registradas. No se muestran ejemplos ficticios.':'Probá otra categoría o búsqueda.');}
  for(const r of visible){const c=add(cards,'article','','lga-card');const cat=contractAgendaCategory(r,data.today);add(c,'span',CONTRACT_AGENDA_CATEGORIES[cat],'lga-tag');add(c,'h2',r.title);add(c,'p','Contrato '+r.contractNumber+'/'+r.contractYear+' · '+r.contractTitle);add(c,'p','Cláusula: '+r.clauseLocator+(r.sourcePage?' · pág. '+r.sourcePage:''),'lga-note');add(c,'p','Fecha registrada: '+(r.dueDate||'Sin fecha')+' · Responsable: '+r.responsibleLabel,'lga-note');if(r.currency!=='NONE'&&r.amountMinor!==null)add(c,'p',r.currency+' '+(r.amountMinor/100).toFixed(2)+(r.unit?' · '+r.unit:''),'lga-note');const tools=add(c,'div','','lga-tools');const open=add(tools,'a','Abrir contrato','button');open.href='/internal-legal-contracts.html?'+new URLSearchParams({contrato:r.contractId});const obligations=add(tools,'a','Obligaciones e hitos','button');obligations.href='/internal-legal-contract-obligations.html?'+new URLSearchParams({contrato:r.contractId});}
  const pager=add(host,'div','','lga-tools');button(pager,'Anterior',()=>{page--;render();},page<=1);button(pager,'Siguiente',()=>{page++;render();},page>=pages);
 }
 if(new URLSearchParams(location.search).size){blocked=true;message='La Agenda Contractual no acepta contexto de tenant, usuario ni filtros por URL.';error=true;render();return;}
 const gateResult=await globalThis.MuniControlCapabilityGate?.ready;if(!gateResult?.tenantCapabilities?.has('legal.norm.read')){blocked=true;message='No tenés acceso a la agenda contractual.';error=true;render();return;}await load();
}
