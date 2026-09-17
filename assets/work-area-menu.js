import { WORK_AREAS, classifyWorkItem, matchesMenuQuery } from './work-area-model.js';
import { mountLiquidacionesMenu } from './liquidaciones-menu.js';
const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const attr=(n,key,value)=>{if(n.getAttribute(key)!==String(value))n.setAttribute(key,String(value));};
const hidden=(n,value)=>{if(n.hidden!==value)n.hidden=value;};
const words=v=>String(v||'').trim().split(/\s+/).filter(Boolean);
const asSet=value=>value instanceof Set?value:new Set(Array.isArray(value)?value:[]);
let mounting=false;
export async function mountWorkAreaMenu(){
  const sidebar=document.querySelector('aside.sidebar'),gate=window.MuniControlCapabilityGate,routes=window.MuniControlRoutes;
  const currentFile=routes?.resolve(location.href,location.href)?.file;
  if(!sidebar||!gate?.ready||!routes||mounting||sidebar.querySelector('[data-work-area-nav]')||
    ['administracion-plataforma.html','friendly-dashboard.html'].includes(currentFile))return null;
  mounting=true;
  let access=await gate.ready;
  if(!access){mounting=false;return null;}
  await mountLiquidacionesMenu();
  const payroll=sidebar.querySelector('[data-liquidaciones-menu]');
  const legacyContainers=[...sidebar.querySelectorAll('nav,.nav-group')].filter(n=>!payroll?.contains(n));
  const entries=[],duplicates=[];
  const payrollDestinations=new Set(payroll?[...payroll.querySelectorAll('a[href]')].map(n=>n.href):[]);
  for(const item of sidebar.querySelectorAll('a[href],button[data-view]')){
    if(item.closest('.brand,.side-note,.sidebar-source')||payroll?.contains(item)||item.hasAttribute('download')||item.hasAttribute('data-liquidaciones-legacy'))continue;
    const route=item.hasAttribute('href')?routes.resolve(item.href,location.href):null;
    if(item.hasAttribute('href')&&!route)continue;
    if(payrollDestinations.has(item.href)){duplicates.push(item);continue;}
    const home=route?.file==='internal-dashboard.html'&&['','#inicio'].includes(route.hash)&&!item.dataset.view;
    const area=home?'inicio':classifyWorkItem({view:item.dataset.view,file:route?.file});
    if(area)entries.push({item,area,route});
  }
  if(!entries.length){mounting=false;return null;}
  const nav=make('nav',null,'mc-work-navigation');nav.dataset.workAreaNav='';nav.setAttribute('aria-label','Áreas de trabajo');
  const mobile=make('button',null,'mc-work-toggle');mobile.type='button';mobile.setAttribute('aria-controls','mcWorkAreaBody');
  const mobileTitle=make('span','Áreas de trabajo'),mobileCurrent=make('strong','Inicio');mobile.append(mobileTitle,mobileCurrent);
  const body=make('div',null,'mc-work-body');body.id='mcWorkAreaBody';
  const searchBox=make('div',null,'mc-work-search'),label=make('label','Buscar módulo');label.htmlFor='mcWorkAreaSearch';
  const input=make('input');input.id='mcWorkAreaSearch';input.type='search';input.maxLength=100;input.autocomplete='off';input.placeholder='Nombre de módulo o área';
  const searchHelp=make('small','Alt + M para buscar');input.setAttribute('aria-describedby','mcWorkAreaHelp');searchHelp.id='mcWorkAreaHelp';
  const clear=make('button','Limpiar búsqueda','mc-work-clear');clear.type='button';clear.hidden=true;
  searchBox.append(label,input,searchHelp,clear);
  const homeList=make('div',null,'mc-work-home'),areaList=make('div',null,'mc-work-groups');
  const status=make('p',null,'mc-work-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  body.append(searchBox,homeList,areaList,status);nav.append(mobile,body);
  const groups=new Map();
  for(const definition of WORK_AREAS){
    const group=definition.id==='liquidaciones'&&payroll?payroll:make('details');
    group.classList.add('mc-work-area');group.dataset.workArea=definition.id;
    let summary=group.querySelector(':scope > summary');
    if(!summary){summary=make('summary');const icon=make('span',definition.code,'mc-work-icon');icon.setAttribute('aria-hidden','true');summary.append(icon,make('span',definition.label));group.append(summary);}
    let items=group.querySelector(':scope > nav');
    if(!items){items=make('div',null,'mc-work-items');group.append(items);}else items.classList.add('mc-work-items');
    groups.set(definition.id,{group,summary,items,label:definition.label});
  }
  const moved=[];const move=(item,parent)=>{moved.push({item,parent:item.parentNode,next:item.nextSibling});parent.append(item);};
  try{
    let before=legacyContainers[0]||sidebar.querySelector('.side-note,.sidebar-source');while(before&&before.parentNode!==sidebar)before=before.parentElement;sidebar.insertBefore(nav,before);
    for(const entry of entries){entry.item.dataset.workAreaItem='';move(entry.item,entry.area==='inicio'?homeList:groups.get(entry.area).items);}
    for(const [id,g]of groups){if(g.group===payroll)move(payroll,areaList);else areaList.append(g.group);}
    if(payroll)for(const item of payroll.querySelectorAll('a[href]')){item.dataset.workAreaItem='';entries.push({item,area:'liquidaciones',route:routes.resolve(item.href,location.href)});}
    for(const item of duplicates)attr(item,'data-work-area-duplicate','true');
    for(const node of legacyContainers)if(!nav.contains(node)&&!node.querySelector('a[href],button'))attr(node,'data-work-area-empty','true');
    for(const node of sidebar.querySelectorAll(':scope > .nav-label,:scope > .suite-label'))attr(node,'data-work-area-empty','true');
    sidebar.classList.add('mc-work-sidebar');
  }catch(error){for(const old of moved.reverse())old.parent.insertBefore(old.item,old.next?.parentNode===old.parent?old.next:null);nav.remove();mounting=false;throw error;}
  const mobileMedia=matchMedia('(max-width: 1050px)');let mobileOpen=false,suspended=false,scheduled=false,lastActive=null,searchOpenState=null;
  const normalized=()=>({tenantCapabilities:asSet(access.tenantCapabilities),platformCapabilities:asSet(access.platformCapabilities),platformRoles:asSet(access.platformRoles)});
  function permitted(entry){
    const {tenantCapabilities:tenant,platformCapabilities:platform,platformRoles:roles}=normalized();
    const any=words(entry.item.getAttribute('data-any-capability')||entry.item.getAttribute('data-requires-any-capability'));
    const all=words(entry.item.getAttribute('data-requires-all-capability'));
    if(any.length&&!any.some(cap=>tenant.has(cap))||all.length&&!all.every(cap=>tenant.has(cap)))return false;
    if(entry.item.hasAttribute('data-platform-admin')&&(!roles.has('PLATFORM_OWNER')||!['platform.tenants.manage','platform.users.invite','platform.users.manage','platform.roles.manage'].some(cap=>platform.has(cap))))return false;
    const requirement=entry.item.hasAttribute('href')?gate.requirements[gate.normalizedRoute(entry.item.href,location.href)]:null;
    if(requirement&&!gate.allowed(requirement,tenant,platform,roles))return false;
    return true;
  }
  function activeArea(){
    const current=routes.resolve(location.href,location.href);
    const marked=entries.find(e=>permitted(e)&&e.item.getAttribute('aria-current')==='page'&&(!e.route||e.route.file===current?.file));
    if(marked)return marked.area;
    if(current?.file==='internal-dashboard.html')return classifyWorkItem({view:(current.hash||'#inicio').slice(1),file:current.file});
    return classifyWorkItem({file:current?.file});
  }
  function mobileState(){hidden(body,mobileMedia.matches&&!mobileOpen);attr(mobile,'aria-expanded',!body.hidden);}
  function render(){
    scheduled=false;if(suspended||!nav.isConnected)return;
    const active=activeArea(),query=input.value.trim();let count=0;
    for(const e of entries){const allowed=permitted(e);attr(e.item,'data-work-permission-denied',!allowed);const match=allowed&&matchesMenuQuery((groups.get(e.area)?.label||'Inicio')+' '+e.item.textContent,query);attr(e.item,'data-work-filtered',!match);if(match&&!e.item.hidden&&!e.item.hasAttribute('data-mc-capability-denied'))count++;}
    for(const [id,g]of groups){const visible=entries.some(e=>e.area===id&&e.item.getAttribute('data-work-filtered')==='false'&&!e.item.hidden&&!e.item.hasAttribute('data-mc-capability-denied'));hidden(g.group,!visible);attr(g.group,'data-active',id===active);if(query&&visible)g.group.open=true;else if(active!==lastActive)g.group.open=id===active;}
    hidden(homeList,!entries.some(e=>e.area==='inicio'&&e.item.getAttribute('data-work-filtered')==='false'&&!e.item.hidden));
    const currentLabel=groups.get(active)?.label||'Inicio';if(mobileCurrent.textContent!==currentLabel)mobileCurrent.textContent=currentLabel;
    const statusText=query?(count?count+' accesos encontrados':'No hay accesos habilitados con ese nombre.'):'Abrí un área para ver sus tareas.';
    if(status.textContent!==statusText)status.textContent=statusText;hidden(clear,!query);lastActive=active;mobileState();
  }
  const schedule=()=>{if(!scheduled&&!suspended){scheduled=true;queueMicrotask(render);}};
  function search(){if(input.value&&!searchOpenState)searchOpenState=new Map([...groups].map(([id,g])=>[id,g.group.open]));if(!input.value&&searchOpenState){for(const [id,opened]of searchOpenState)groups.get(id).group.open=opened;searchOpenState=null;}render();}
  input.addEventListener('input',search);clear.addEventListener('click',()=>{input.value='';search();input.focus();});
  mobile.addEventListener('click',()=>{mobileOpen=!mobileOpen;mobileState();if(mobileOpen)input.focus();});mobileMedia.addEventListener('change',mobileState);
  for(const [id,g]of groups)g.group.addEventListener('toggle',()=>{if(suspended||!g.group.open||input.value.trim())return;for(const [other,group]of groups)if(other!==id)group.group.open=false;});
  nav.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;event.preventDefault();event.stopPropagation();
    if(input.value){input.value='';search();input.focus();return;}
    const group=event.target.closest('[data-work-area]');if(group?.open){group.open=false;group.querySelector('summary').focus();return;}
    if(mobileMedia.matches&&mobileOpen){mobileOpen=false;mobileState();mobile.focus();}
  });
  document.addEventListener('keydown',event=>{if(suspended||!event.altKey||event.ctrlKey||event.metaKey||event.key.toLowerCase()!=='m'||document.querySelector('dialog[open]'))return;event.preventDefault();mobileOpen=true;mobileState();input.focus();input.select();});
  nav.addEventListener('click',event=>{if(!event.target.closest('[data-work-area-item]'))return;queueMicrotask(()=>{render();if(mobileMedia.matches){mobileOpen=false;mobileState();}});});
  const observer=new MutationObserver(schedule);observer.observe(nav,{subtree:true,attributes:true,attributeFilter:['aria-current','hidden','data-mc-capability-denied']});
  function suspend(){suspended=true;input.value='';status.textContent='';nav.hidden=true;observer.disconnect();for(const e of entries)attr(e.item,'data-work-permission-denied','true');}
  const stateObserver=new MutationObserver(()=>{if(['denied','checking'].includes(document.documentElement.dataset.mcCapabilityState))suspend();});
  stateObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-mc-capability-state']});
  document.addEventListener('municontrol:capabilities-ready',event=>{if(suspended)return;access=event.detail||{};const a=normalized();gate.apply(nav,{tenantCapabilities:[...a.tenantCapabilities],platformCapabilities:[...a.platformCapabilities],platformRoles:[...a.platformRoles]},location.href);input.value='';searchOpenState=null;lastActive=null;render();});
  for(const type of ['hashchange','popstate'])window.addEventListener(type,schedule);document.addEventListener('taskchange',schedule);
  document.getElementById('logoutButton')?.addEventListener('click',suspend);window.addEventListener('pagehide',suspend);
  window.addEventListener('pageshow',event=>{if(event.persisted&&suspended)location.reload();});
  render();mounting=false;return nav;
}
if(typeof document!=='undefined'){const start=()=>mountWorkAreaMenu().catch(()=>{mounting=false;});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
