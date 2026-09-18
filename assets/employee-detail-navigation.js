// Local navigation over sections already rendered by the authorized detail view.
// No employee objects, network requests, storage, links or lifecycle operations.
export function mountEmployeeDetailNavigation(container){
 if(!container||container.querySelector(':scope > .employee-section-nav'))return;
 const sections=[...container.children].filter(el=>el.matches('section,details')&&!el.hidden)
  .map(section=>{const heading=section.matches('details')?section.querySelector(':scope > summary'):section.querySelector('h3');
   const label=heading?.querySelector('strong')?.textContent||heading?.textContent;
   return{section,heading,label:label?.trim()};}).filter(x=>x.heading&&x.label);
 if(sections.length<2)return;
 const nav=document.createElement('nav');nav.className='employee-section-nav';nav.setAttribute('aria-label','Navegación de la ficha');
 const copy=document.createElement('div'),title=document.createElement('strong'),hint=document.createElement('span');
 title.textContent='Encontrá lo que necesitás en esta ficha';hint.textContent='Elegí una sección. No se modifica ningún dato.';copy.append(title,hint);
 const controls=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select'),go=document.createElement('button');
 controls.className='employee-section-controls';label.append(document.createTextNode('Ir a una sección'));
 sections.forEach((x,i)=>select.add(new Option(x.label,String(i))));label.append(select);
 go.type='button';go.className='button';go.textContent='Ir';go.setAttribute('aria-label','Ir a la sección');controls.append(label,go);nav.append(copy,controls);
 function jump(){
  if(!nav.isConnected||!container.isConnected||!/^\d+$/.test(select.value))return;
  const item=sections[Number(select.value)];
  if(!item||item.section.parentElement!==container||item.section.hidden||!item.heading.isConnected)return;
  if(!item.heading.matches('summary'))item.heading.tabIndex=-1;
  item.heading.style.scrollMarginTop=(nav.getBoundingClientRect().height+18)+'px';
  item.heading.scrollIntoView({block:'start',behavior:'auto'});item.heading.focus({preventScroll:true});
 }
 go.addEventListener('click',jump);select.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();jump();}});
 container.prepend(nav);
}
