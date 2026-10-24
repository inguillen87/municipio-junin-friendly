import {PayrollPanelElement,payrollPanelEvents} from './payroll-panel-dom.js';

// In-memory component substrate, not a browser or an HTML conformance test.
const attribute=(node,name)=>name.startsWith('data-')
 ? node.getAttribute(name)??node.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]
 : node.getAttribute(name);
const matches=(node,selector)=>{
 const part=selector.match(/^([\w-]+)?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/);
 return !!part&&(!part[1]||node.tagName===part[1])&&(!part[2]||attribute(node,part[2])!==undefined&&attribute(node,part[2])!==null&&(part[3]===undefined||attribute(node,part[2])===part[3]));
};
export class NativeLeavePanelElement extends PayrollPanelElement{
 constructor(tag='div'){super(tag);this.classList={add(){}};}
 add(node){this.append(node);}
 prepend(...nodes){for(const node of [...nodes].reverse()){node.parentElement=this;this.children.unshift(node);}}
 insertBefore(node,before){const old=node.parentElement;if(old)old.children=old.children.filter(child=>child!==node);const index=this.children.indexOf(before);node.parentElement=this;if(index<0)this.children.push(node);else this.children.splice(index,0,node);return node;}
 set innerHTML(value){super.innerHTML=value;const decorate=node=>{for(const child of node.children){Object.setPrototypeOf(child,NativeLeavePanelElement.prototype);child.classList={add(){}};decorate(child);}};decorate(this);}
 querySelectorAll(selector){
  const selectors=selector.split(',').map(s=>s.trim().split(/\s+/)),out=[];
  const accepted=(node,parts)=>{if(!matches(node,parts.at(-1)))return false;let parent=node.parentElement;for(let i=parts.length-2;i>=0;i--){while(parent&&parent!==this&&!matches(parent,parts[i]))parent=parent.parentElement;if(!parent||parent===this&&!matches(parent,parts[i]))return false;parent=parent.parentElement;}return true;};
  const walk=node=>{for(const child of node.children){if(selectors.some(parts=>accepted(child,parts)))out.push(child);walk(child);}};walk(this);return out;
 }
}
export function nativeLeavePanelEnvironment(t){
 const keys=['document','window','Option','fetch'],before=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),events=payrollPanelEvents(),win=payrollPanelEvents();
 const document={...events,hidden:false,createElement:tag=>new NativeLeavePanelElement(tag),getElementById:()=>null};
 class Option extends NativeLeavePanelElement{constructor(label,value){super('option');this.textContent=label;this._value=String(value);}}
 Object.assign(globalThis,{document,window:win,Option});
 const restore=()=>{for(const key of keys)if(before[key])Object.defineProperty(globalThis,key,before[key]);else delete globalThis[key];};
 return{document,events,win,restore};
}
