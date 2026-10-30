// Navigation to existing payroll tasks; no payroll execution.
export const LIQUIDACIONES_TASKS = Object.freeze([
  {label:'Resumen de liquidaciones',href:'/nomina#resumen',capability:'payroll.read'},
  {label:'Reportes y costo salarial',href:'/nomina#reportes',capability:'payroll.read'},
  {label:'Novedades',href:'/novedades',capability:'payroll.novelty.read'},
  {label:'Comparar liquidaciones',href:'/nomina#comparar',capability:'payroll.read'},
  {label:'Historial de corridas',href:'/nomina#historial',capability:'payroll.read'},
  {label:'Parámetros salariales',href:'/nomina#parametros',capability:'payroll.read'},
  {label:'Solicitudes de corrección',href:'/nomina#correcciones',capability:'payroll.read'},
].map(task=>Object.freeze(task)));
export function visibleLiquidacionesTasks(capabilities){const allowed=new Set(Array.isArray(capabilities)?capabilities:[]);return LIQUIDACIONES_TASKS.filter(task=>allowed.has(task.capability));}
export function activeLiquidacionesTask(pathname,hash=''){
  if(['/novedades','/novedades-nomina','/novedades-nomina.html'].includes(pathname))return '/novedades';
  if(!['/nomina','/nomina-control','/nomina-control.html'].includes(pathname))return null;
  const href='/nomina'+(hash||'#resumen');return LIQUIDACIONES_TASKS.some(task=>task.href===href)?href:null;
}
// The payroll page registers its task workspace under this menu name (task-workspace.js, option `menu`). The
// whole navigation element is adopted here, vertical, with one accordion per process; panels never move.
const TASK_MENU='liquidaciones',NOMINA='/nomina#';
export async function mountLiquidacionesMenu(){
  const sidebar=document.querySelector('aside.sidebar'),gate=window.MuniControlCapabilityGate;
  if(!sidebar||!gate?.ready||sidebar.querySelector('[data-liquidaciones-menu]'))return null;
  let access=await gate.ready;if(!access||sidebar.querySelector('[data-liquidaciones-menu]'))return null;
  const tasks=visibleLiquidacionesTasks([...access.tenantCapabilities]);if(!tasks.length)return null;
  const group=document.createElement('details');group.className='mc-liquidaciones-menu';group.dataset.liquidacionesMenu='';group.setAttribute('data-requires-any-capability','payroll.read payroll.novelty.read');
  const summary=document.createElement('summary'),icon=document.createElement('span'),label=document.createElement('span');icon.className='mc-liquidaciones-icon';icon.textContent='LI';icon.setAttribute('aria-hidden','true');label.textContent='Liquidaciones';summary.append(icon,label);group.append(summary);
  const links=document.createElement('nav');links.setAttribute('aria-label','Tareas de liquidaciones');group.append(links);
  for(const task of tasks){const link=document.createElement('a');link.href=task.href;link.textContent=task.label;link.setAttribute('data-requires-all-capability',task.capability);links.append(link);}
  const old=[...sidebar.querySelectorAll('a[href]')].find(link=>['/nomina','/nomina-control','/nomina-control.html'].includes(new URL(link.href).pathname));
  const people=[...sidebar.querySelectorAll('a,button')].find(item=>item.dataset.view==='legajos'||item.textContent.trim().endsWith('Personas'));
  if(people)people.after(group);else if(old)old.before(group);else (sidebar.querySelector('nav,.nav-group')||sidebar).append(group);
  if(!group.isConnected)return null;
  let retired=false;const values=value=>value instanceof Set?[...value]:Array.isArray(value)?value:[];
  const apply=()=>gate.apply(group,{tenantCapabilities:values(access.tenantCapabilities),platformCapabilities:values(access.platformCapabilities),platformRoles:values(access.platformRoles)},location.href);
  document.addEventListener('municontrol:capabilities-ready',event=>{if(retired)return;access=event.detail||{};apply();});
  apply();
  if(old){old.dataset.liquidacionesLegacy='';old.hidden=true;}
  let adopted=null;
  function updateActive(){const tab=adopted?.querySelector('[role=tab][aria-selected="true"]');const active=activeLiquidacionesTask(location.pathname,location.hash)??(tab?NOMINA+tab.dataset.task:null);group.dataset.active=String(active!==null);for(const link of links.children){if(link.getAttribute('href')===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}if(active)group.open=true;if(adopted)for(const section of adopted.querySelectorAll('details.task-section'))section.open=!!tab&&section.contains(tab);}
  updateActive();window.addEventListener('hashchange',updateActive);window.addEventListener('popstate',updateActive);document.addEventListener('taskchange',updateActive);
  const escape=event=>{if(event.key==='Escape'){group.open=false;summary.focus();}};links.addEventListener('keydown',escape);
  // Adopt the page's own task workspace whether it registered before (already in the DOM) or after this mount.
  function adopt(nav){
    if(retired||adopted||!nav||nav.dataset.taskMenu!==TASK_MENU||!nav.isConnected)return;
    // The moved tabs retain the original page gate for every task. Legacy links keep their own requirements.
    const authority=nav.parentElement?.closest('[data-requires-any-capability]')?.getAttribute('data-requires-any-capability')||'';
    for(const tab of nav.querySelectorAll('[data-task]')){if(authority)tab.setAttribute('data-requires-any-capability',authority);tab.dataset.workAreaItem='';}
    for(const link of links.children){const href=link.getAttribute('href')||'';if(href.startsWith(NOMINA)&&nav.querySelector('[data-task="'+href.slice(NOMINA.length)+'"]')){link.hidden=true;link.dataset.liquidacionesDuplicate='';}}
    nav.classList.add('mc-liquidaciones-tasks');nav.setAttribute('aria-label','Tareas de nómina');links.after(nav);adopted=nav;
    // Keep a single process expanded; search may temporarily reveal matches in several processes.
    for(const section of nav.querySelectorAll('details.task-section'))section.addEventListener('toggle',()=>{
      if(retired||!section.open||document.getElementById('mcWorkAreaSearch')?.value.trim())return;
      for(const other of nav.querySelectorAll('details.task-section'))if(other!==section)other.open=false;
    });
    nav.addEventListener('keydown',escape);apply();updateActive();
    group.dispatchEvent(new CustomEvent('municontrol:liquidaciones-menu-change',{bubbles:true}));
  }
  adopt(document.querySelector('.task-tabs[data-task-menu="'+TASK_MENU+'"]'));
  document.addEventListener('municontrol:task-workspace',event=>adopt(event.detail?.nav));
  const retire=()=>{retired=true;group.hidden=true;};document.getElementById('logoutButton')?.addEventListener('click',retire);window.addEventListener('pagehide',retire);return group;
}
if(typeof document!=='undefined'){const start=()=>{mountLiquidacionesMenu().catch(()=>{});};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
