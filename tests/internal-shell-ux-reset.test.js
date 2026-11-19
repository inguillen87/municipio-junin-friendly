import assert from 'node:assert/strict';
import fs from 'node:fs';
import test, { before, after } from 'node:test';
import { chromium } from 'playwright';

// Real Chromium, invented options only. No network or municipal authentication.
const source=fs.readFileSync(process.env.MC_SHELL_SOURCE || new URL('../assets/internal-shell-ux.js',import.meta.url),'utf8');
let browser;
// Like the original shell test: without an installed Chromium (e.g. the deployment build) the browser cases skip.
before(async()=>{try{browser=await chromium.launch({headless:true});}catch{browser=null;}});
after(async()=>{if(browser)await browser.close();});
const options='<option value="a" selected>Area A</option><option value="b">Area B</option>';
const selector=(opts=options,attrs='')=>`<label>Areas<select id="areas" multiple size="4" ${attrs}>${opts}</select></label>`;
const form=(control=selector())=>`<form id="f">${control}<button type="reset" id="reset">Restablecer</button></form>`;
async function setup(t,body,viewport={width:1280,height:800}){
 if(!browser){t.skip('Chromium unavailable');return null;}
 const page=await browser.newPage({viewport});
 t.after(()=>page.close());
 await page.route('**/*',r=>r.abort());
 const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial;margin:16px}label{display:block}select{display:block;width:250px;max-width:100%}button{margin:4px}</style></head><body>${body}</body></html>`);
 await page.addScriptTag({content:source});
 await page.evaluate(()=>{window.eventCounts={input:0,change:0};for(const type of ['input','change'])document.addEventListener(type,()=>window.eventCounts[type]++);});
 return page;
}
const button=(page,label,id='areas')=>page.locator(`#${id} + [data-mc-multi-helpers]`).getByRole('button',{name:label,exact:true});
async function state(page,id='areas'){
 return page.evaluate(id=>{const s=document.getElementById(id),bar=s.nextElementSibling,buttons=bar.querySelectorAll('button');return{selected:Array.from(s.selectedOptions,o=>o.value),count:bar.querySelector('.mc-multi-count').textContent,allDisabled:buttons[0].disabled,noneDisabled:buttons[1].disabled};},id);
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,40)));}

test('native reset refreshes selection count and buttons after the default action without emitting changes',async t=>{
 const p=await setup(t,form());if(!p)return;await button(p,'Todas').click();
 const counts=await p.evaluate(()=>window.eventCounts);assert.deepEqual(counts,{input:1,change:1});
 await p.click('#reset');await settle(p);
 assert.deepEqual(await state(p),{selected:['a'],count:'1 de 2 disponibles',allDisabled:false,noneDisabled:false});
 assert.deepEqual(await p.evaluate(()=>window.eventCounts),counts);
 assert.equal(await p.evaluate(()=>document.activeElement.id),'reset');
});
test('programmatic reset restores an empty default and disables Ninguna',async t=>{
 const p=await setup(t,form(selector(options.replace(' selected',''))));if(!p)return;await button(p,'Todas').click();
 await p.evaluate(()=>HTMLFormElement.prototype.reset.call(document.getElementById('f')));await settle(p);
 assert.deepEqual(await state(p),{selected:[],count:'0 de 2 disponibles',allDisabled:false,noneDisabled:true});
});
test('reset restores an all-selected default and disables Todas',async t=>{
 const p=await setup(t,form(selector(options.replace('value="b"','value="b" selected'))));if(!p)return;await button(p,'Ninguna').click();
 await p.click('#reset');await settle(p);
 assert.deepEqual(await state(p),{selected:['a','b'],count:'2 de 2 disponibles',allDisabled:true,noneDisabled:false});
});
test('a canceled reset retains current selection and helper state',async t=>{
 const p=await setup(t,form());if(!p)return;await button(p,'Todas').click();
 await p.evaluate(()=>document.getElementById('f').addEventListener('reset',e=>e.preventDefault()));
 const before=await state(p);await p.click('#reset');await settle(p);assert.deepEqual(await state(p),before);
});
test('reset respects disabled options and optgroups without emitting new input/change',async t=>{
 const opts=options+'<option value="locked" disabled selected>Bloqueada</option><optgroup disabled label="Grupo bloqueado"><option value="group" selected>Grupo</option></optgroup>';
 const p=await setup(t,form(selector(opts)));if(!p)return;await button(p,'Ninguna').click();
 const counts=await p.evaluate(()=>window.eventCounts);await p.click('#reset');await settle(p);
 assert.deepEqual(await state(p),{selected:['a','locked','group'],count:'1 de 2 disponibles',allDisabled:false,noneDisabled:false});
 assert.deepEqual(await p.evaluate(()=>window.eventCounts),counts);
});
test('form-associated select outside the form refreshes on reset',async t=>{
 const p=await setup(t,form('')+selector(options,'form="f"'));if(!p)return;await button(p,'Todas').click();
 await p.click('#reset');await settle(p);
 assert.equal((await state(p)).count,'1 de 2 disponibles');assert.equal((await state(p)).allDisabled,false);
});
test('reset of an unrelated form does not alter another selection or emit changes',async t=>{
 const p=await setup(t,form()+'<form id="other"><button type="reset" id="otherReset">Otro</button></form>');if(!p)return;
 await button(p,'Todas').click();const before=await state(p),counts=await p.evaluate(()=>window.eventCounts);
 await p.click('#otherReset');await settle(p);assert.deepEqual(await state(p),before);assert.deepEqual(await p.evaluate(()=>window.eventCounts),counts);
});
test('disabled fieldset remains disabled while reset refreshes the count',async t=>{
 const p=await setup(t,form('<fieldset id="scope">'+selector()+'</fieldset>'));if(!p)return;await button(p,'Todas').click();
 await p.evaluate(()=>document.getElementById('scope').disabled=true);await p.click('#reset');await settle(p);
 assert.deepEqual(await state(p),{selected:['a'],count:'',allDisabled:true,noneDisabled:true});
 await p.evaluate(()=>document.getElementById('scope').disabled=false);await settle(p);
 assert.deepEqual(await state(p),{selected:['a'],count:'1 de 2 disponibles',allDisabled:false,noneDisabled:false});
});
test('late-added controls and reset-time default changes use the final native values',async t=>{
 const p=await setup(t,form(''));if(!p)return;
 await p.evaluate(html=>document.getElementById('f').insertAdjacentHTML('afterbegin',html),selector());
 await p.waitForSelector('#areas + [data-mc-multi-helpers]');await button(p,'Todas').click();
 await p.evaluate(()=>document.getElementById('f').addEventListener('reset',()=>{const s=document.getElementById('areas');s.options[0].defaultSelected=false;s.options[1].defaultSelected=true;}));
 await p.click('#reset');await settle(p);
 assert.deepEqual(await state(p),{selected:['b'],count:'1 de 2 disponibles',allDisabled:false,noneDisabled:false});
});
test('removed controls and repeated resets do not throw or dispatch duplicate changes',async t=>{
 const p=await setup(t,form());if(!p)return;await button(p,'Todas').click();const counts=await p.evaluate(()=>window.eventCounts);
 await p.evaluate(()=>{const f=document.getElementById('f');for(let i=0;i<5;i++)HTMLFormElement.prototype.reset.call(f);document.getElementById('areas').remove();});await settle(p);
 assert.deepEqual(await p.evaluate(()=>window.eventCounts),counts);
});
test('mobile reset preserves keyboard focus, native visibility and viewport width',async t=>{
 const p=await setup(t,form(),{width:390,height:844});if(!p)return;await button(p,'Todas').click();await p.click('#reset');await settle(p);
 assert.equal((await state(p)).count,'1 de 2 disponibles');
 assert.deepEqual(await p.evaluate(()=>({hidden:Object.hasOwn(document,'hidden'),visibility:Object.hasOwn(document,'visibilityState')})),{hidden:false,visibility:false});
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 assert.equal(await p.evaluate(()=>document.activeElement.id),'reset');
 if(process.env.MC_SCREENSHOT_PATH)await p.screenshot({path:process.env.MC_SCREENSHOT_PATH,fullPage:true});
});
