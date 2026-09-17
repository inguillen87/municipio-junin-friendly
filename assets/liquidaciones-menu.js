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
export async function mountLiquidacionesMenu(){
  const sidebar=document.querySelector('aside.sidebar'),gate=window.MuniControlCapabilityGate;
  if(!sidebar||!gate?.ready||sidebar.querySelector('[data-liquidaciones-menu]'))return null;
  const access=await gate.ready;if(!access||sidebar.querySelector('[data-liquidaciones-menu]'))return null;
  const tasks=visibleLiquidacionesTasks([...access.tenantCapabilities]);if(!tasks.length)return null;
  const group=document.createElement('details');group.className='mc-liquidaciones-menu';group.dataset.liquidacionesMenu='';group.setAttribute('data-requires-any-capability','payroll.read payroll.novelty.read');
  const summary=document.createElement('summary'),icon=document.createElement('span'),label=document.createElement('span');icon.className='mc-liquidaciones-icon';icon.textContent='LI';icon.setAttribute('aria-hidden','true');label.textContent='Liquidaciones';summary.append(icon,label);group.append(summary);
  const links=document.createElement('nav');links.setAttribute('aria-label','Tareas de liquidaciones');group.append(links);
  for(const task of tasks){const link=document.createElement('a');link.href=task.href;link.textContent=task.label;link.setAttribute('data-requires-all-capability',task.capability);links.append(link);}
  const old=[...sidebar.querySelectorAll('a[href]')].find(link=>['/nomina','/nomina-control','/nomina-control.html'].includes(new URL(link.href).pathname));
  const people=[...sidebar.querySelectorAll('a,button')].find(item=>item.dataset.view==='legajos'||item.textContent.trim().endsWith('Personas'));
  if(people)people.after(group);else if(old)old.before(group);else (sidebar.querySelector('nav,.nav-group')||sidebar).append(group);
  if(!group.isConnected)return null;
  gate.apply(group,{tenantCapabilities:[...access.tenantCapabilities],platformCapabilities:[...access.platformCapabilities],platformRoles:[...access.platformRoles]},location.href);
  if(old){old.dataset.liquidacionesLegacy='';old.hidden=true;}
  function updateActive(){const active=activeLiquidacionesTask(location.pathname,location.hash);group.dataset.active=String(active!==null);for(const link of links.children){if(link.getAttribute('href')===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}if(active)group.open=true;}
  updateActive();window.addEventListener('hashchange',updateActive);window.addEventListener('popstate',updateActive);document.addEventListener('taskchange',updateActive);
  links.addEventListener('keydown',event=>{if(event.key==='Escape'){group.open=false;summary.focus();}});
  document.getElementById('logoutButton')?.addEventListener('click',()=>{group.hidden=true;});return group;
}
if(typeof document!=='undefined'){const start=()=>{mountLiquidacionesMenu().catch(()=>{});};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
