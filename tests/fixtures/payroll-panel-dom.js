// Minimal DOM/event substrate for executing real payroll panels with synthetic HTTP.
export class PayrollPanelElement {
 constructor(tag='div'){this.tagName=tag.toLowerCase();this.children=[];this.parentElement=null;this.attributes={};this.dataset={};this.listeners=new Map();this.hidden=false;this.disabled=false;this.checked=false;this.selected=false;this._value=undefined;this._text='';this.isConnected=true;}
 append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}}
 replaceChildren(...items){this.children=[];this._text='';this.append(...items);}
 setAttribute(name,value){this.attributes[name.toLowerCase()]=String(value);if(name==='hidden')this.hidden=true;if(name==='disabled')this.disabled=true;}
 getAttribute(name){return this.attributes[name.toLowerCase()]??null;}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
 set textContent(value){this._text=String(value);this.children=[];}
 get options(){return this.tagName==='select'?this.children:[];}
 get firstChild(){return this.children[0]??null;}
 get selectedOptions(){return this.options.filter(o=>o.selected);}
 get value(){return this._value??(this.tagName==='select'?this.children[0]?.value??'':'');}
 set value(value){const s=String(value);this._value=this.tagName==='select'&&!this.children.some(o=>o.value===s)?'':s;}
 focus(){}
 set innerHTML(html){this.replaceChildren();const stack=[this];for(const token of html.match(/<[^>]*>|[^<]+/g)??[]){if(token.startsWith('</')){stack.pop();continue;}if(token.startsWith('<')){const m=token.match(/^<([a-z][\w-]*)\b([^>]*)>/i);if(!m)continue;const element=new PayrollPanelElement(m[1]);for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))element.setAttribute(a[1],a[2]??'');if(element.tagName==='input')element.type=element.getAttribute('type');if(element.tagName==='option')element._value=element.getAttribute('value')??'';stack.at(-1).append(element);if(!['input','link','br','hr','meta'].includes(element.tagName)&&!token.endsWith('/>'))stack.push(element);}else{const text=new PayrollPanelElement('#text');text._text=token;stack.at(-1).append(text);}}}
 querySelectorAll(selector){const attr=selector.match(/^(?:([\w-]+))?\[([\w-]+)(?:="([^"]*)")?\]$/),match=n=>attr?(!attr[1]||n.tagName===attr[1])&&Object.hasOwn(n.attributes,attr[2].toLowerCase())&&(attr[3]===undefined||n.attributes[attr[2].toLowerCase()]===attr[3]):n.tagName===selector;const result=[];const walk=n=>{for(const child of n.children){if(match(child))result.push(child);walk(child);}};walk(this);return result;}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(f=>f!==fn));}
 async emit(type){for(let n=this;n;n=n.parentElement)if(n.disabled)return;await Promise.all((this.listeners.get(type)??[]).map(fn=>fn({target:this,preventDefault(){}})));}
}
export function payrollPanelEvents(){const listeners=new Map();return{addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},removeEventListener:(type,fn)=>listeners.set(type,(listeners.get(type)??[]).filter(f=>f!==fn)),dispatch:(type,detail)=>{for(const fn of listeners.get(type)??[])fn({detail});}};}
