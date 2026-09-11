/** Accessible tabbed tasks with deep links. Existing nodes and form state are preserved. */
export function taskWorkspace({host,groups,initial,aliases={}}){
 const nav=document.createElement('nav');nav.className='task-tabs';nav.setAttribute('aria-label','Áreas de trabajo');
 const list=document.createElement('div');list.setAttribute('role','tablist');list.setAttribute('aria-label','Elegir tarea');nav.append(list);host.prepend(nav);
 const panels=new Map(),buttons=new Map();
 for(const group of groups){
  const panel=document.createElement('section');panel.id='task-'+group.id;panel.className='task-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','task-tab-'+group.id);panel.tabIndex=0;
  for(const node of group.nodes)if(node)panel.append(node);host.append(panel);panels.set(group.id,panel);
  const b=document.createElement('button');b.type='button';b.id='task-tab-'+group.id;b.setAttribute('role','tab');b.setAttribute('aria-controls',panel.id);b.dataset.task=group.id;b.textContent=group.label;b.addEventListener('click',()=>activate(group.id,true));list.append(b);buttons.set(group.id,b);
 }
 function activate(id,history=false){
  if(!panels.has(id))return false;
  for(const [key,p]of panels){p.hidden=key!==id;buttons.get(key).setAttribute('aria-selected',String(key===id));buttons.get(key).tabIndex=key===id?0:-1}
  host.dataset.activeTask=id;
  if(history){if(location.hash!=='#'+id)window.history.pushState(null,'','#'+id);nav.scrollIntoView({block:'nearest',behavior:'instant'})}
  host.dispatchEvent(new CustomEvent('taskchange',{detail:{id},bubbles:true}));return true;
 }
 function fromHash(){
  let key;try{key=decodeURIComponent(location.hash.slice(1))}catch{key=''}
  const id=panels.has(key)?key:aliases[key];
  if(id){activate(id);const target=document.getElementById(key);if(target){let p=target;while(p&&p!==host){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement}if(key!==id)requestAnimationFrame(()=>target.scrollIntoView({block:'start',behavior:'instant'}))}return}
  if(!key)activate(initial);else for(const [id,panel]of panels){const target=document.getElementById(key);if(target&&panel.contains(target)){activate(id);let n=target;while(n&&n!==panel){if(n.tagName==='DETAILS')n.open=true;n=n.parentElement}requestAnimationFrame(()=>target.scrollIntoView({block:'start',behavior:'instant'}));return}}
 }
 list.addEventListener('keydown',event=>{const all=[...buttons.values()],i=all.indexOf(event.target);if(i<0)return;let n=i;if(event.key==='ArrowRight')n=(i+1)%all.length;else if(event.key==='ArrowLeft')n=(i+all.length-1)%all.length;else if(event.key==='Home')n=0;else if(event.key==='End')n=all.length-1;else return;event.preventDefault();all[n].focus()});
 window.addEventListener('hashchange',fromHash);window.addEventListener('popstate',fromHash);
 activate(initial);fromHash();return{activate,panels,buttons,fromHash};
}
export function toolDetails(node,label){const d=document.createElement('details');d.className='task-tool';const s=document.createElement('summary');s.textContent=label;d.append(s,node);return d}
