// Reused in-memory DOM from own-payroll-readiness-panel.test.js; not a browser.
export class Element{
 constructor(tag='div'){this.tagName=tag.toLowerCase();this.children=[];this.parentElement=null;this.attributes={};this.listeners=new Map();this.hidden=false;this.disabled=false;this.checked=false;this.selected=false;this.open=false;this._value=undefined;this._text='';this.isConnected=true;this.dataset=new Proxy({}, {set:(target,key,value)=>{target[key]=String(value);this.attributes['data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=String(value);return true;}});}
 append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}}
 replaceChildren(...items){this.children=[];this._text='';this.append(...items);}
 setAttribute(name,value){this.attributes[name.toLowerCase()]=String(value);if(name==='hidden')this.hidden=true;if(name==='disabled')this.disabled=true;if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;}
 getAttribute(name){return this.attributes[name.toLowerCase()]??null;}
 removeAttribute(name){delete this.attributes[name.toLowerCase()];if(name==='href')delete this.href;}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
 set textContent(value){this._text=String(value);this.children=[];}
 get options(){return this.tagName==='select'?this.children:[];}
 get selectedOptions(){return this.options.filter(o=>o.selected);}
 get value(){return this._value??(this.tagName==='select'?this.children[0]?.value??'':'');}
 set value(value){const s=String(value);this._value=this.tagName==='select'&&!this.children.some(o=>o.value===s)?'':s;}
 focus(){} showModal(){this.open=true;} close(){this.open=false;}
 set innerHTML(html){this.replaceChildren();const stack=[this];for(const token of html.match(/<[^>]*>|[^<]+/g)??[]){if(token.startsWith('</')){stack.pop();continue;}if(token.startsWith('<')){const m=token.match(/^<([a-z][\w-]*)\b([^>]*)>/i);if(!m)continue;const element=new Element(m[1]);for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))element.setAttribute(a[1],a[2]??'');if(element.tagName==='input')element.type=element.getAttribute('type');if(element.tagName==='option')element._value=element.getAttribute('value')??'';stack.at(-1).append(element);if(!['input','link','br','hr','meta'].includes(element.tagName)&&!token.endsWith('/>'))stack.push(element);}else{const text=new Element('#text');text._text=token;stack.at(-1).append(text);}}}
 matches(selector){if(selector.startsWith('#'))return this.getAttribute('id')===selector.slice(1);const attr=selector.match(/^(?:([\w-]+))?\[([\w-]+)(?:="?([^"\]]+)"?)?\]$/);return attr?(!attr[1]||this.tagName===attr[1])&&Object.hasOwn(this.attributes,attr[2])&&(attr[3]===undefined||this.getAttribute(attr[2])===attr[3]):this.tagName===selector;}
 querySelectorAll(selector){const matches=n=>selector.split(',').some(s=>{const parts=s.trim().split(/\s+/);if(!n.matches(parts.pop()))return false;let p=n.parentElement;while(parts.length&&p){if(p.matches(parts.at(-1)))parts.pop();p=p.parentElement;}return !parts.length;}),result=[];const walk=n=>{for(const c of n.children){if(matches(c))result.push(c);walk(c);}};walk(this);return result;}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(f=>f!==fn));}
 async emit(type){for(let n=this;n;n=n.parentElement)if(n.disabled)return;await Promise.all((this.listeners.get(type)??[]).map(fn=>fn({target:this,preventDefault(){}})));}
}
const events=()=>{const listeners=new Map();return{addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},removeEventListener(type,fn){listeners.set(type,(listeners.get(type)??[]).filter(f=>f!==fn));},dispatch(type,detail){for(const fn of listeners.get(type)??[])fn({detail});}};};

