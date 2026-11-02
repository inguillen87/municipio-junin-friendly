// PROPOSED by Claude (source only; not run by Claude). Target: tests/vertical-payroll-menu.test.js
// The real sidebar modules (work-area-menu.js, liquidaciones-menu.js) and the real task workspace run against an
// in-memory DOM: the payroll workspace registers before or after the sidebar mounts, the 29 tabs end inside the
// Liquidaciones accordion with the same authority, panels never move, search/active/revocation/logout stay coherent.
// No network, no gate script, no HTML files: the capability gate and the routes are minimal synthetic stubs.
import test from 'node:test';import assert from 'node:assert/strict';
const ORIGIN='https://areas.test';
const dataName=key=>'data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
let root=null,activeElement=null;
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.attributes=new Map();this.listeners=new Map();this.hidden=false;this.disabled=false;this.open=false;this._text='';this.tabIndex=-1;this.value='';
  this.dataset=new Proxy({},{get:(t,k)=>typeof k==='string'?this.attributes.get(dataName(k)):undefined,set:(t,k,v)=>{this.attributes.set(dataName(k),String(v));return true;},has:(t,k)=>this.attributes.has(dataName(k))});
  this.classList={add:(...names)=>{const set=new Set(this.className.split(/\s+/).filter(Boolean));for(const name of names)set.add(name);this.className=[...set].join(' ');},contains:name=>this.className.split(/\s+/).includes(name)};}
 get className(){return this.attributes.get('class')||'';}set className(v){this.attributes.set('class',String(v));}
 get id(){return this.attributes.get('id')||'';}set id(v){this.attributes.set('id',String(v));}
 get type(){return this.attributes.get('type')||'';}set type(v){this.attributes.set('type',String(v));}
 get href(){const h=this.attributes.get('href');return h==null?'':new URL(h,location.href).href;}set href(v){this.attributes.set('href',String(v));}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}set textContent(v){this._text=String(v);this.children=[];}
 get parentNode(){return this.parentElement;}get nextSibling(){const p=this.parentElement;return p?p.children[p.children.indexOf(this)+1]??null:null;}
 get isConnected(){let n=this;while(n.parentElement)n=n.parentElement;return n===root;}
 remove(){const p=this.parentElement;if(p){p.children.splice(p.children.indexOf(this),1);this.parentElement=null;}}
 append(...nodes){for(const n of nodes){n.remove();n.parentElement=this;this.children.push(n);}}
 prepend(...nodes){for(const n of [...nodes].reverse()){n.remove();n.parentElement=this;this.children.unshift(n);}}
 insertBefore(n,ref){if(!ref)return this.append(n);n.remove();n.parentElement=this;this.children.splice(this.children.indexOf(ref),0,n);}
 before(n){const p=this.parentElement;n.remove();n.parentElement=p;p.children.splice(p.children.indexOf(this),0,n);}
 after(n){const p=this.parentElement;n.remove();n.parentElement=p;p.children.splice(p.children.indexOf(this)+1,0,n);}
 contains(n){for(let x=n;x;x=x.parentElement)if(x===this)return true;return false;}
 setAttribute(k,v){this.attributes.set(k,String(v));}getAttribute(k){return this.attributes.has(k)?this.attributes.get(k):null;}hasAttribute(k){return this.attributes.has(k);}removeAttribute(k){this.attributes.delete(k);}
 matches(selector){return selector.split(',').some(part=>matchPath(this,parsePath(part.trim()),this));}
 closest(selector){for(let n=this;n;n=n.parentElement)if(n.matches(selector))return n;return null;}
 querySelectorAll(selector){const paths=selector.split(',').map(part=>parsePath(part.trim())),out=[];const walk=n=>{for(const c of n.children){if(paths.some(path=>matchPath(c,path,this)))out.push(c);walk(c);}};walk(this);return out;}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(f=>f!==fn));}
 dispatchEvent(event){if(!event.target)Object.defineProperty(event,'target',{value:this,configurable:true});for(let n=this;n;n=n.parentElement){for(const fn of [...(n.listeners.get(event.type)??[])])fn(event);if(!event.bubbles)return true;}for(const fn of [...(document.listeners.get(event.type)??[])])fn(event);return true;}
 focus(){activeElement=this;}scrollIntoView(){}
}
// Selector subset used by the modules: tag, .class, #id, [attr], [attr=value], :scope, descendant and child combinators.
function parseCompound(text){const out={tag:null,tests:[]};const re=/([a-z][a-z0-9-]*)|\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:="?([^"\]]*)"?)?\]|(:scope)/gy;let m,pos=0;while((m=re.exec(text))){pos=re.lastIndex;if(m[1])out.tag=m[1].toUpperCase();else if(m[2]){const name=m[2];out.tests.push(n=>n.classList.contains(name));}else if(m[3]){const id=m[3];out.tests.push(n=>n.id===id);}else if(m[4]){const key=m[4],value=m[5];out.tests.push(n=>n.hasAttribute(key)&&(value===undefined||n.getAttribute(key)===value));}else if(m[6])out.tests.push((n,scope)=>n===scope);}if(pos!==text.length)throw Error('selector not supported by the test DOM: '+text);return out;}
function parsePath(text){const tokens=text.split(/\s+/).filter(Boolean),path=[];let combinator=' ';for(const token of tokens){if(token==='>'){combinator='>';continue;}path.push({compound:parseCompound(token),combinator});combinator=' ';}return path;}
const matchCompound=(n,c,scope)=>(!c.tag||n.tagName===c.tag)&&c.tests.every(test=>test(n,scope));
function matchPath(node,path,scope){let i=path.length-1;if(!matchCompound(node,path[i].compound,scope))return false;let n=node;while(--i>=0){const step=path[i+1].combinator,target=path[i].compound;if(step==='>'){n=n.parentElement;if(!n||!matchCompound(n,target,scope))return false;}else{n=n.parentElement;while(n&&!matchCompound(n,target,scope))n=n.parentElement;if(!n)return false;}}return true;}
const words=v=>String(v||'').trim().split(/\s+/).filter(Boolean);
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
const SECTIONS=[{label:null,tasks:['resumen']},{label:'Liquidar el período',tasks:['calculo','anulacion','decisiones','cierre']},{label:'Documentos',tasks:['reportes','recibos','comparar']},{label:'Seguimiento',tasks:['correcciones','historial']},{label:'Reglas y parámetros',tasks:['parametros','reglas','antiguedad','jornada','horas-convenio','encuadre','condiciones']},{label:'Datos del período',tasks:['participacion','dias-art','art','datos-fiscales','f931']},{label:'Contabilidad y banco',tasks:['contabilidad','imputacion','asientos','conciliacion','cuentas','banco']},{label:null,tasks:['migracion']}];
const LABELS={resumen:'Resumen',calculo:'Calcular',decisiones:'Confirmar y anular',anulacion:'Anular período',cierre:'Cerrar liquidación',reportes:'Reportes',recibos:'Recibos propios',comparar:'Comparar liquidaciones',correcciones:'Correcciones',historial:'Historial',parametros:'Parámetros',reglas:'Reglas de cálculo',antiguedad:'Antigüedad salarial',jornada:'Jornada contractual','horas-convenio':'Horas por convenio',encuadre:'Encuadre por período',condiciones:'Condiciones salariales',participacion:'Períodos parciales','dias-art':'Días trabajados ART',art:'ART Provincia','datos-fiscales':'Datos fiscales',f931:'Preparación F.931',contabilidad:'Asociaciones contables',imputacion:'Imputación propia',asientos:'Asientos de nómina',conciliacion:'Conciliar documentos',cuentas:'Cuentas bancarias',banco:'Salida bancaria',migracion:'Migración y controles'};
let caseNumber=0;
function environment({caps,mobile=false,pathname='/nomina',hash=''}){
 const html=new Element('html'),body=new Element('body'),head=new Element('head');root=html;html.append(head,body);
 const location={pathname,search:'',hash,get href(){return ORIGIN+this.pathname+this.search+this.hash;}};
 const listeners=new Map(),windowListeners=new Map();
 const add=map=>(type,fn)=>{if(!map.has(type))map.set(type,[]);map.get(type).push(fn);};
 const document={readyState:'complete',documentElement:html,head,body,listeners,addEventListener:add(listeners),removeEventListener(type,fn){listeners.set(type,(listeners.get(type)??[]).filter(f=>f!==fn));},dispatchEvent(event){for(const fn of [...(listeners.get(event.type)??[])])fn(event);return true;},createElement:tag=>new Element(tag),querySelector:s=>html.querySelector(s),querySelectorAll:s=>html.querySelectorAll(s),getElementById:id=>html.querySelector('#'+id),get activeElement(){return activeElement;}};
 let release;const ready=new Promise(resolve=>{release=resolve;});
 const gate={ready,requirements:{},normalizedRoute:(href,base)=>new URL(href,base).pathname,allowed:()=>true,
  apply(scope,access){const tenant=new Set(access.tenantCapabilities);for(const node of scope.querySelectorAll('[data-requires-any-capability],[data-requires-all-capability]')){const any=words(node.getAttribute('data-requires-any-capability')),all=words(node.getAttribute('data-requires-all-capability'));const ok=(!any.length||any.some(c=>tenant.has(c)))&&(!all.length||all.every(c=>tenant.has(c)));node.hidden=!ok;if(ok)node.removeAttribute('data-mc-capability-denied');else node.setAttribute('data-mc-capability-denied','true');}}};
 const FILES={'/nomina':'nomina-control.html','/nomina-control.html':'nomina-control.html','/internal-dashboard.html':'internal-dashboard.html','/novedades':'novedades-nomina.html','/novedades-nomina.html':'novedades-nomina.html','/centro-acciones.html':'centro-acciones.html'};
 const routes={resolve(href,base){let u;try{u=new URL(href,base);}catch{return null;}const file=FILES[u.pathname];return file?{file,hash:u.hash,search:u.search}:null;}};
 const states=[location.hash];let cursor=0;const window={addEventListener:add(windowListeners),dispatch(type){for(const fn of [...(windowListeners.get(type)??[])])fn({type});},history:{pushState(_s,_t,url){location.hash=url;states.splice(++cursor);states.push(url);},back(){if(cursor>0){location.hash=states[--cursor];window.dispatch('popstate');}},forward(){if(cursor<states.length-1){location.hash=states[++cursor];window.dispatch('popstate');}}},MuniControlCapabilityGate:gate,MuniControlRoutes:routes};
 Object.assign(globalThis,{document,window,location,matchMedia:()=>({matches:mobile,addEventListener(){}}),MutationObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>fn()});
 // Shell: brand, legacy navigation with the current page marked, the payroll main with its own gate attribute.
 const sidebar=new Element('aside');sidebar.className='sidebar';const brand=new Element('a');brand.className='brand';brand.href='internal-dashboard.html';brand.textContent='MuniControl';sidebar.append(brand);
 const label=new Element('div');label.className='nav-label';label.textContent='Operación interna';sidebar.append(label);
 const legacy=new Element('nav');legacy.className='nav';sidebar.append(legacy);
 for(const [href,code,text,current]of [['internal-dashboard.html','IN','Inicio',false],['internal-dashboard.html#legajos','PE','Personas',false],['centro-acciones.html','AC','Centro de acciones',false],['nomina-control.html','NO','Nómina',pathname==='/nomina'],['novedades-nomina.html','NV','Novedades',false]]){const a=new Element('a');a.href=href;const c=new Element('span');c.className='nav-code';c.textContent=code;const t=new Element('span');t.textContent=text;a.append(c,t);if(current)a.setAttribute('aria-current','page');legacy.append(a);}
 const note=new Element('div');note.className='side-note';note.textContent='Regla de publicación';sidebar.append(note);
 const workspace=new Element('div');workspace.className='workspace';const logout=new Element('button');logout.id='logoutButton';workspace.append(logout);
 const main=new Element('main');main.id='mainContent';main.setAttribute('data-requires-any-capability','payroll.read');const host=new Element('div');host.id='payrollTaskWorkspace';main.append(host);workspace.append(main);
 body.append(sidebar,workspace);
 return{html,sidebar,host,main,logout,location,window,document,gate,release:(access=caps===null?null:{tenantCapabilities:caps,platformCapabilities:[],platformRoles:[]})=>release(access)};
}
async function mountWorkspace(env,initial='resumen'){
 const {taskWorkspace}=await import('../assets/task-workspace.js');
 const groups=Object.keys(LABELS).map(id=>{const node=new Element('p');node.className='panel-'+id;node.textContent='Panel '+LABELS[id];return{id,label:LABELS[id],nodes:[node]};});
 return taskWorkspace({host:env.host,initial,groups,sections:SECTIONS,menu:'liquidaciones'});
}
async function scenario({order,caps=['payroll.read','payroll.calculation.read','payroll.novelty.read'],mobile=false,hash=''}){
 const env=environment({caps,mobile,hash});let workspace;
 // work-area-menu.js auto-mounts at import (fresh instance per case); it imports and mounts liquidaciones-menu.js itself.
 const menu=await import('../assets/work-area-menu.js?vertical-case='+(++caseNumber));
 if(order==='workspace-first'){workspace=await mountWorkspace(env);env.release();await settle();}
 else{env.release();await settle();assert.ok(env.sidebar.querySelector('[data-liquidaciones-menu]'),'sidebar mounted before the workspace registers');workspace=await mountWorkspace(env);await settle();}
 return{...env,workspace,menu,group:env.sidebar.querySelector('[data-liquidaciones-menu]'),nav:env.sidebar.querySelector('.mc-liquidaciones-tasks'),workNav:env.sidebar.querySelector('[data-work-area-nav]')};
}
const click=node=>node.dispatchEvent(new CustomEvent('click',{bubbles:true}));
const search=(s,value)=>{const input=s.workNav.querySelector('#mcWorkAreaSearch');input.value=value;input.dispatchEvent(new CustomEvent('input'));};

for(const order of ['workspace-first','sidebar-first'])test('orden de montaje '+order+': las 29 tareas quedan en Liquidaciones del sidebar, sin barra en el cuerpo y con los paneles intactos',async()=>{
 const s=await scenario({order});
 assert.ok(s.group&&s.nav&&s.workNav,'group, adopted navigation and work-area navigation exist');
 assert.equal(s.nav.parentElement,s.group);assert.equal(s.host.children.some(child=>child===s.nav),false,'no horizontal bar left in the page');
 assert.equal(s.nav.getAttribute('aria-label'),'Tareas de nómina');
 const tabs=s.nav.querySelectorAll('[role=tab]');assert.equal(tabs.length,29);assert.equal(new Set(tabs.map(b=>b.dataset.task)).size,29);
 const ids=tabs.map(b=>b.dataset.task);assert.ok(ids.indexOf('anulacion')<ids.indexOf('decisiones'),'Anular período precedes Confirmar y anular');
 assert.deepEqual(ids.slice(0,5),['resumen','calculo','anulacion','decisiones','cierre']);
 assert.equal(s.nav.querySelectorAll('details.task-section').length,6);assert.equal(s.nav.querySelectorAll('[role=tablist]').length,8);
 for(const panel of s.workspace.panels.values()){assert.equal(panel.parentElement,s.host,'panels never move');assert.equal(panel.children.length,1);}
 assert.equal(s.host.dataset.activeTask,'resumen');assert.equal(s.workspace.panels.get('resumen').hidden,false);assert.equal(s.workspace.panels.get('calculo').hidden,true);
 // same authority: sidebar capability of the known tasks, page gate attribute for the rest; nothing new is granted
 assert.equal(s.nav.querySelector('[data-task="calculo"]').getAttribute('data-requires-any-capability'),'payroll.read');
 assert.equal(s.nav.querySelector('[data-task="resumen"]').getAttribute('data-requires-any-capability'),'payroll.read');
 assert.equal(s.nav.querySelector('[data-task="antiguedad"]').getAttribute('data-requires-any-capability'),'payroll.read');
 assert.equal(s.nav.querySelector('[data-task="antiguedad"]').hasAttribute('data-requires-all-capability'),false);
 // the six /nomina links of the original seven-task menu are hidden duplicates; Novedades stays; nothing is cloned
 const links=s.group.querySelectorAll('a[href]');assert.equal(links.filter(a=>a.hasAttribute('data-liquidaciones-duplicate')).length,6);
 for(const a of links)assert.equal(a.hasAttribute('data-liquidaciones-duplicate'),a.getAttribute('href').startsWith('/nomina#'),a.getAttribute('href'));
 assert.equal(s.group.querySelector('a[href="/novedades"]').hidden,false);assert.equal(s.group.querySelector('a[href="/novedades"]').hasAttribute('data-liquidaciones-duplicate'),false);
 assert.equal(s.group.dataset.active,'true');assert.equal(s.group.open,true);
 // work-area search indexes the adopted tabs, not the hidden duplicates
 for(const b of tabs)assert.equal(b.dataset.workAreaItem,'');
 search(s,'antig');assert.equal(s.nav.querySelector('[data-task="antiguedad"]').getAttribute('data-work-filtered'),'false');assert.equal(s.nav.querySelector('[data-task="calculo"]').getAttribute('data-work-filtered'),'true');
 assert.equal(s.workNav.querySelector('.mc-work-status').textContent,'1 accesos encontrados');
 search(s,'');assert.equal(s.nav.querySelector('[data-task="calculo"]').getAttribute('data-work-filtered'),'false');
 // the hidden duplicate link "Calcular" is not an entry any more: only the adopted tab counts
 search(s,'calcular');assert.equal(s.workNav.querySelector('.mc-work-status').textContent,'1 accesos encontrados');search(s,'');
});

test('un cambio de destino activa el workspace existente sin recargar ni recrear nodos, y el deep link por hash sigue vigente',async()=>{
 const s=await scenario({order:'sidebar-first'});const before=s.workspace.panels.get('banco'),node=before.children[0];
 click(s.nav.querySelector('[data-task="banco"]'));await settle();
 assert.equal(s.location.hash,'#banco');assert.equal(s.host.dataset.activeTask,'banco');assert.equal(s.workspace.panels.get('banco'),before);assert.equal(before.children[0],node);assert.equal(before.hidden,false);assert.equal(s.workspace.panels.get('resumen').hidden,true);
 assert.equal(s.nav.querySelector('[data-task="banco"]').getAttribute('aria-selected'),'true');assert.equal(s.nav.querySelector('[data-task="resumen"]').getAttribute('aria-selected'),'false');
 assert.equal(s.group.open,true);assert.equal(s.group.dataset.active,'true');
 s.location.hash='#f931';s.window.dispatch('hashchange');await settle();
 assert.equal(s.host.dataset.activeTask,'f931');assert.equal(s.nav.querySelector('[data-task="f931"]').getAttribute('aria-selected'),'true');assert.equal(s.nav.querySelector('[data-task="f931"]').closest('details.task-section').open,true);
 assert.equal(s.nav.querySelector('[data-task="f931"]').tabIndex,0);assert.equal(s.nav.querySelector('[data-task="banco"]').tabIndex,-1);
});

test('la búsqueda abre la sección cerrada que contiene la coincidencia y la devuelve a su estado al limpiar',async()=>{
 const s=await scenario({order:'workspace-first'});const section=s.nav.querySelector('[data-task="asientos"]').closest('details.task-section');section.open=false;
 search(s,'asientos');assert.equal(section.open,true);assert.equal(s.nav.querySelector('[data-task="asientos"]').getAttribute('data-work-filtered'),'false');
 search(s,'');assert.equal(section.open,false);
});

test('retiro de capacidades y cierre de sesión: las tareas quedan ocultas con la misma autoridad del gate',async()=>{
 const s=await scenario({order:'workspace-first'});
 s.document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(['payroll.read']),platformCapabilities:new Set(),platformRoles:new Set()}}));await settle();
 assert.equal(s.nav.querySelector('[data-task="calculo"]').hidden,false);assert.equal(s.nav.querySelector('[data-task="calculo"]').hasAttribute('data-mc-capability-denied'),false);
 assert.equal(s.nav.querySelector('[data-task="anulacion"]').hidden,false);assert.equal(s.nav.querySelector('[data-task="resumen"]').hidden,false);assert.equal(s.nav.querySelector('[data-task="antiguedad"]').hidden,false);
 assert.equal(s.nav.querySelector('[data-task="calculo"]').getAttribute('data-work-permission-denied'),'false');assert.equal(s.nav.querySelector('[data-task="resumen"]').getAttribute('data-work-permission-denied'),'false');
 s.document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(),platformCapabilities:new Set(),platformRoles:new Set()}}));await settle();for(const tab of s.nav.querySelectorAll('[role=tab]'))assert.equal(tab.hidden,true);
 click(s.logout);assert.equal(s.group.hidden,true);assert.equal(s.workNav.hidden,true);
});

test('móvil: sólo la sección de la tarea activa queda abierta y activar otra tarea la abre',async()=>{
 const s=await scenario({order:'sidebar-first',mobile:true});
 for(const section of s.nav.querySelectorAll('details.task-section'))assert.equal(section.open,false,section.querySelector('summary').textContent);
 s.workspace.activate('cierre');const liquidar=s.nav.querySelector('[data-task="cierre"]').closest('details.task-section');assert.equal(liquidar.open,true);
 assert.equal(s.nav.querySelector('[data-task="reportes"]').closest('details.task-section').open,false);
});

test('sin acceso no hay menú lateral y la navegación permanece en la página; el panel no espera a nadie',async()=>{
 const env=environment({caps:null});await import('../assets/work-area-menu.js?vertical-case='+(++caseNumber));
 const workspace=await mountWorkspace(env);assert.equal(env.host.dataset.activeTask,'resumen','workspace is usable while authentication remains pending');env.release();await settle();
 assert.equal(env.sidebar.querySelector('[data-liquidaciones-menu]'),null);assert.equal(env.host.children[0].className,'task-tabs');assert.equal(env.host.dataset.activeTask,'resumen');
 assert.equal(workspace.activate('cierre'),true);assert.equal(env.host.dataset.activeTask,'cierre');
});

test('un segundo registro no se adopta dos veces y la adopción ignora navegaciones de otro menú',async()=>{
 const s=await scenario({order:'workspace-first'});const other=new Element('nav');other.className='task-tabs';other.dataset.taskMenu='otro';s.host.append(other);
 s.document.dispatchEvent(new CustomEvent('municontrol:task-workspace',{detail:{menu:'otro',nav:other,host:s.host}}));await settle();
 assert.equal(other.parentElement,s.host);assert.equal(s.group.querySelectorAll('.task-tabs').length,1);
});

for(const cap of ['payroll.read'])for(const order of ['workspace-first','sidebar-first'])test('barra original conserva29tareas con solo '+cap+' y '+order,async()=>{const s=await scenario({order,caps:[cap]});const tabs=s.nav.querySelectorAll('[role=tab]');assert.equal(tabs.length,29);for(const tab of tabs)assert.equal(tab.hidden,false,tab.dataset.task);for(const tab of tabs){assert.equal(tab.getAttribute('data-requires-any-capability'),'payroll.read');assert.equal(tab.hasAttribute('data-requires-all-capability'),false);assert.equal(tab.getAttribute('data-work-permission-denied'),'false');}for(const a of s.group.querySelectorAll('a[href]').filter(a=>(a.getAttribute('href')||'').startsWith('/nomina#')))assert.equal(a.getAttribute('data-requires-all-capability'),cap,'legacy payroll links retain the original single capability');});
for(const order of ['workspace-first','sidebar-first'])test('sólo payroll.calculation.read no adopta tareas ni supera la autoridad payroll.read del padre '+order,async()=>{
 const caps=['payroll.calculation.read'],env=environment({caps});let workspace;
 await import('../assets/work-area-menu.js?vertical-case='+(++caseNumber));
 if(order==='workspace-first'){workspace=await mountWorkspace(env);env.release();await settle();}
 else{env.release();await settle();workspace=await mountWorkspace(env);await settle();}
 assert.equal(env.sidebar.querySelector('[data-liquidaciones-menu]'),null,'the original seven links admit read or novelty, not calculation-only');
 assert.equal(env.sidebar.querySelector('.mc-liquidaciones-tasks'),null);
 assert.equal(env.sidebar.querySelectorAll('[role=tab]').length,0,'no adopted payroll task is exposed by the sidebar');
 assert.equal(env.host.children[0].className,'task-tabs','unadopted navigation remains under its page authority');
 assert.equal(env.host.querySelectorAll('[role=tab]').length,29,'no task or panel was removed to simulate denial');
 assert.equal(workspace.panels.size,29);
 assert.equal(env.main.getAttribute('data-requires-any-capability'),'payroll.read');
 env.gate.apply(env.html,{tenantCapabilities:caps,platformCapabilities:[],platformRoles:[]});
 assert.equal(env.main.hidden,true,'the original page gate denies calculation-only access');
});
test('móvil mantiene sólo la sección activa después de pasar por dos procesos y volver a Resumen',async()=>{const s=await scenario({order:'sidebar-first',mobile:true});s.workspace.activate('cierre');s.workspace.activate('reportes');assert.equal(s.nav.querySelector('[data-task="cierre"]').closest('details.task-section').open,false);assert.equal(s.nav.querySelector('[data-task="reportes"]').closest('details.task-section').open,true);s.workspace.activate('resumen');assert.ok(s.nav.querySelectorAll('details.task-section').every(d=>!d.open));});
test('retiro de capacidad anterior al registro tardío no restaura el snapshot inicial de autoridad',async()=>{const env=environment({caps:['payroll.read']});await import('../assets/work-area-menu.js?vertical-case='+(++caseNumber));env.release();await settle();env.document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(),platformCapabilities:new Set(),platformRoles:new Set()}}));await settle();await mountWorkspace(env);await settle();const tabs=env.sidebar.querySelectorAll('[role=tab]');assert.equal(tabs.length,29);for(const tab of tabs){assert.equal(tab.hidden,true,tab.dataset.task);assert.equal(tab.getAttribute('data-mc-capability-denied'),'true');assert.equal(tab.getAttribute('data-work-permission-denied'),'true');}});

test('29destinos conservan nodos, formulario, intento y clave; Atrás y Adelante restauran el mismo panel',async()=>{const s=await scenario({order:'workspace-first'}),before=new Map();for(const[id,panel]of s.workspace.panels){const node=panel.children[0],input=new Element('input');input.value='valor original '+id;node.append(input);node.pendingAttempt={key:'clave '+id,body:{task:id}};before.set(id,{panel,node,input,attempt:node.pendingAttempt});}for(const id of Object.keys(LABELS)){click(s.nav.querySelector('[data-task="'+id+'"]'));assert.equal(s.host.dataset.activeTask,id);assert.equal(s.location.hash,'#'+id);const b=before.get(id);assert.equal(s.workspace.panels.get(id),b.panel);assert.equal(b.panel.children[0],b.node);assert.equal(b.node.children[0],b.input);assert.equal(b.input.value,'valor original '+id);assert.equal(b.node.pendingAttempt,b.attempt);assert.equal(b.node.pendingAttempt.key,'clave '+id);assert.equal([...s.workspace.panels.values()].filter(p=>!p.hidden).length,1);}s.window.history.back();assert.equal(s.host.dataset.activeTask,'banco');s.window.history.forward();assert.equal(s.host.dataset.activeTask,'migracion');await settle();});
test('logout antes del registro tardío no permite adoptar ni reabrir tareas con un evento posterior',async()=>{const env=environment({caps:['payroll.read']});await import('../assets/work-area-menu.js?vertical-case='+(++caseNumber));env.release();await settle();click(env.logout);await mountWorkspace(env);env.document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(['payroll.read']),platformCapabilities:new Set(),platformRoles:new Set()}}));await settle();assert.equal(env.sidebar.querySelector('.mc-liquidaciones-tasks'),null);assert.equal(env.sidebar.querySelector('[data-liquidaciones-menu]').hidden,true);});
