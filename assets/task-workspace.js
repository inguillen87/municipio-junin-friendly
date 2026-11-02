/** Accessible tabbed tasks with deep links. Existing nodes and form state are preserved.
 * Default: one horizontal tablist prepended to the host (report centre, synthetic harnesses).
 * `sections` ([{label,tasks:[id…]}], label null = standalone) renders one vertical tablist per process inside a
 * collapsible details; `menu` names a sidebar menu that may adopt the whole navigation element (only the tab
 * controls move; panels, nodes and form state stay in the host). The adopter listens to municontrol:task-workspace. */
export function taskWorkspace({host,groups,initial,aliases={},sections=null,menu=null}){
 const nav=document.createElement('nav');nav.className='task-tabs';nav.setAttribute('aria-label','Áreas de trabajo');
 const panels=new Map(),buttons=new Map(),lists=[],members=new Map(),slots=new Map(),sectionOf=new Map();
 const tablist=label=>{const list=document.createElement('div');list.setAttribute('role','tablist');list.setAttribute('aria-label',label);if(sections)list.setAttribute('aria-orientation','vertical');members.set(list,[]);lists.push(list);list.addEventListener('keydown',event=>move(list,event));return list;};
 if(sections)for(const section of sections){
  let details=null;if(section.label!==null){details=document.createElement('details');details.className='task-section';details.open=true;const summary=document.createElement('summary');summary.textContent=section.label;details.append(summary);}
  const list=tablist(section.label??'Elegir tarea');(details??nav).append(list);if(details)nav.append(details);
  for(const id of section.tasks){if(slots.has(id))throw Error('taskWorkspace: tarea repetida en secciones: '+id);slots.set(id,{list,details});}
 }
 const single=sections?null:tablist('Elegir tarea');if(single)nav.append(single);
 host.prepend(nav);
 for(const group of groups){
  const panel=document.createElement('section');panel.id='task-'+group.id;panel.className='task-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','task-tab-'+group.id);panel.tabIndex=0;
  for(const node of group.nodes)if(node)panel.append(node);host.append(panel);panels.set(group.id,panel);
  const slot=sections?slots.get(group.id):{list:single,details:null};if(!slot)throw Error('taskWorkspace: tarea sin sección: '+group.id);
  const b=document.createElement('button');b.type='button';b.id='task-tab-'+group.id;b.setAttribute('role','tab');b.setAttribute('aria-controls',panel.id);b.dataset.task=group.id;b.textContent=group.label;b.addEventListener('click',()=>activate(group.id,true));buttons.set(group.id,b);
  if(slot.details)sectionOf.set(group.id,slot.details);if(!sections){slot.list.append(b);members.get(slot.list).push(b);}
 }
 // Visual order inside a section is the section order, not the panel order.
 if(sections)for(const section of sections)for(const id of section.tasks){const b=buttons.get(id);if(!b)throw Error('taskWorkspace: sección con tarea inexistente: '+id);const slot=slots.get(id);slot.list.append(b);members.get(slot.list).push(b);}
 function roving(id){
  for(const [key,b]of buttons)b.tabIndex=key===id?0:-1;
  if(!sections)return;
  // Every vertical tablist keeps one reachable tab so Tab moves across sections and arrows move inside them.
  for(const list of lists){const all=members.get(list);if(!all.some(b=>b.dataset.task===id))for(const b of all)if(!b.hidden&&!b.disabled){b.tabIndex=0;break;}}
 }
 function activate(id,history=false){
  if(!panels.has(id))return false;
  for(const [key,p]of panels){p.hidden=key!==id;buttons.get(key).setAttribute('aria-selected',String(key===id));}
  roving(id);const section=sectionOf.get(id);if(section&&!section.open)section.open=true;
  host.dataset.activeTask=id;
  if(history){if(location.hash!=='#'+id)window.history.pushState(null,'','#'+id);if(nav.parentElement===host)nav.scrollIntoView({block:'nearest',behavior:'instant'});else host.scrollIntoView({block:'start',behavior:'instant'})}
  host.dispatchEvent(new CustomEvent('taskchange',{detail:{id},bubbles:true}));return true;
 }
 function fromHash(){
  let key;try{key=decodeURIComponent(location.hash.slice(1))}catch{key=''}
  const id=panels.has(key)?key:aliases[key];
  if(id){activate(id);const target=document.getElementById(key);if(target){let p=target;while(p&&p!==host){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement}if(key!==id)requestAnimationFrame(()=>target.scrollIntoView({block:'start',behavior:'instant'}))}return}
  if(!key)activate(initial);else for(const [id,panel]of panels){const target=document.getElementById(key);if(target&&panel.contains(target)){activate(id);let n=target;while(n&&n!==panel){if(n.tagName==='DETAILS')n.open=true;n=n.parentElement}requestAnimationFrame(()=>target.scrollIntoView({block:'start',behavior:'instant'}));return}}
 }
 function move(list,event){
  const all=members.get(list).filter(button=>!button.hidden&&!button.disabled),i=all.indexOf(event.target);if(i<0)return;
  const vertical=!!sections;let n=i;
  if(event.key==='ArrowRight'||vertical&&event.key==='ArrowDown')n=(i+1)%all.length;else if(event.key==='ArrowLeft'||vertical&&event.key==='ArrowUp')n=(i+all.length-1)%all.length;else if(event.key==='Home')n=0;else if(event.key==='End')n=all.length-1;else return;
  event.preventDefault();all[n].focus();
 }
 window.addEventListener('hashchange',fromHash);window.addEventListener('popstate',fromHash);
 activate(initial);fromHash();
 if(menu){nav.dataset.taskMenu=menu;document.dispatchEvent(new CustomEvent('municontrol:task-workspace',{detail:{menu,nav,host}}));}
 return{activate,panels,buttons,fromHash};
}
export function toolDetails(node,label){const d=document.createElement('details');d.className='task-tool';const s=document.createElement('summary');s.textContent=label;d.append(s,node);return d}
