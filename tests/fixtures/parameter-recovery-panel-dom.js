import {NativeLeavePanelElement,nativeLeavePanelEnvironment} from './native-leave-panel-dom.js';

// Memory-only dialog/selector surface for exercising the real employee picker.
// It does not implement browser focus, layout, accessibility or HTML conformance.
export class ParameterPanelElement extends NativeLeavePanelElement{
 getAttribute(name){
  const value=super.getAttribute(name);if(value!==null)return value;
  if(name.startsWith('data-'))return this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]??null;
  return ['id','type','name','value'].includes(name)&&typeof this[name]==='string'?this[name]:null;
 }
 removeAttribute(name){delete this.attributes[name];if(name==='hidden'||name==='disabled')this[name]=false;}
 showModal(){this.open=true;}
 close(){this.open=false;}
 set innerHTML(value){super.innerHTML=value;const decorate=n=>{for(const c of n.children){Object.setPrototypeOf(c,ParameterPanelElement.prototype);decorate(c);}};decorate(this);}
 querySelectorAll(selector){
  const selectors=selector.split(',').map(v=>v.trim().split(/\s+/)),out=[];
  const matches=(n,part)=>{if(part.startsWith('#'))return n.getAttribute('id')===part.slice(1);const m=part.match(/^([\w-]+)?(?:\[([\w-]+)(?:=(?:"([^"]*)"|([^\]]+)))?\])?$/);return !!m&&(!m[1]||n.tagName===m[1])&&(!m[2]||n.getAttribute(m[2])!==null&&(m[3]===undefined&&m[4]===undefined||n.getAttribute(m[2])===(m[3]??m[4])));};
  const accepts=(n,parts)=>{if(!matches(n,parts.at(-1)))return false;let p=n.parentElement;for(let i=parts.length-2;i>=0;i--){while(p&&p!==this&&!matches(p,parts[i]))p=p.parentElement;if(!p||!matches(p,parts[i]))return false;p=p.parentElement;}return true;};
  const walk=n=>{for(const c of n.children){if(selectors.some(parts=>accepts(c,parts)))out.push(c);walk(c);}};walk(this);return out;
 }
}
export function parameterPanelEnvironment(t){
 const env=nativeLeavePanelEnvironment(t);env.document.head=new ParameterPanelElement('head');env.document.body=new ParameterPanelElement('body');
 env.document.createElement=tag=>new ParameterPanelElement(tag);
 env.document.querySelector=s=>env.document.head.querySelector(s)??env.document.body.querySelector(s);
 return env;
}
