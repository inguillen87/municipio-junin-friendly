import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {mountOwnGrhComparisonPanel} from '../assets/own-grh-comparison-panel.js';

class Element{
 constructor(tag='div'){this.tagName=tag.toLowerCase();this.children=[];this.dataset={};this.hidden=false;this.disabled=false;this.listeners=new Map();this.isConnected=true;this.textContent='';this.attributes={};this.value='';}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];}
 setAttribute(k,v){this.attributes[k]=v;}
 getAttribute(k){return this.attributes[k]??null;}
 addEventListener(k,fn){this.listeners.set(k,[...(this.listeners.get(k)??[]),fn]);}
 removeEventListener(k,fn){this.listeners.set(k,(this.listeners.get(k)??[]).filter(f=>f!==fn));}
 focus(){}
 closest(){return null;}
 set innerHTML(html){this.raw=html;this.controls=new Map();for(const match of html.matchAll(/data-ogc-([a-z-]+)/g)){if(!this.controls.has(match[1]))this.controls.set(match[1],new Element());}
  for(const [key,el]of this.controls)if(['view','filter','own','grh'].includes(key))el.value=key==='view'?'concepts':key==='filter'?'all':'';}
 querySelector(q){if(q==='h3')return new Element('h3');const m=q.match(/^\[data-ogc-([a-z-]+)\]$/);return m?this.controls.get(m[1])??null:null;}
 querySelectorAll(){return [];}
}
test('monta sin red, sin escribir datos ni pedir permisos nuevos; sólo consulta bajo acción explícita',t=>{
 const originals=['document','window','setInterval','clearInterval'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);
 const listeners=new Map(),body=new Element(),head=new Element();
 globalThis.document={hidden:false,head,querySelectorAll:()=>[],createElement:tag=>new Element(tag),
  addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k),getElementById:()=>null};
 globalThis.window={addEventListener:(k,fn)=>listeners.set(k,fn)};
 globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};
 t.after(()=>{for(const [k,v]of originals)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];});
 const panel=mountOwnGrhComparisonPanel(body);
 assert.equal(panel.hasComparison,false);
 assert.ok(body.raw.includes('MuniControl contra GRH'));
 for(const key of ['catalog','own','grh','compare','view','filter','search','summary','csv','xlsx','pdf','trace','rows'])assert.ok(body.controls.has(key),key);
 assert.ok((body.controls.get('catalog').listeners.get('click')??[]).length);
 assert.equal((body.controls.get('form').listeners.get('submit')??[]).length,1);
 assert.equal(body.controls.get('compare').disabled,true);
 assert.equal(body.controls.get('pdf').disabled,true);
 assert.ok(body.raw.includes('Diferencia de redondeo')||body.raw.includes('redondeo'));
 assert.ok(body.raw.includes('Las descargas incluyen todas las filas'));
 assert.equal(body.raw.includes('method="POST"'),false);
 panel.clear();assert.equal(panel.hasComparison,false);
});
test('ambos centros integran la pantalla sin reemplazar las dos comparaciones anteriores',()=>{
 for(const path of ['assets/payroll-navigation.js','assets/report-centre.js']){
  const source=fs.readFileSync(path,'utf8');assert.match(source,/mountOwnGrhComparisonPanel\(grhComparison\)/);
  assert.match(source,/mountOwnPayrollComparison\(ownComparison\)/);
  assert.match(source,/mountPayrollComparison\(sourceComparison\)/);
  assert.match(source,/Comparar MuniControl contra GRH por legajo/);
 }
 const source=fs.readFileSync('assets/own-grh-comparison-panel.js','utf8');
 assert.match(source,/resource=owngrhstatementlines&datasetId=/);
 assert.match(source,/grhStatementLinesExpand\(await request\(grhEndpoint\+'\?resource=owngrhstatementlines/,'la forma compacta de la 242 se expande y valida antes de comparar');
 assert.match(source,/resource=payrollsourcereport/);
 assert.match(source,/OWN_GRH_JOIN/);
 const lib=fs.readFileSync('lib/internal-own-grh-statement-lines.js','utf8'),caps=JSON.parse(lib.match(/OWN_GRH_STATEMENT_LINES_CAPABILITIES = Object\.freeze\((\[[^\]]*\])\)/)[1].replaceAll("'",'"'));
 assert.ok(source.includes('const grhCapabilities='+JSON.stringify(caps).replaceAll('"',"'")+';'),'el panel pide las mismas capacidades que la fachada');assert.match(source,/verifiedHistoricalCapture/);
 assert.match(source,/reportCsv\(doc\).*reportXlsx\(doc\).*reportPdf\(doc\)/s);
 assert.doesNotMatch(source,/localStorage|sessionStorage|method:'POST'|method:"POST"/);
});

test('consultar catálogos completa la selección sin errores de ejecución (regresión: grh no declarado y Option fuera del navegador)',async t=>{
 const originals=['document','window','setInterval','clearInterval','fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);
 const body=new Element(),head=new Element(),hex=c=>c.repeat(64),uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
 globalThis.document={hidden:false,head,querySelectorAll:()=>[],createElement:tag=>new Element(tag),addEventListener(){},removeEventListener(){},getElementById:()=>null};
 globalThis.window={addEventListener(){}};globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};
 const caps=['actions.read','payroll.calculation.read','payroll.calculation.nominal.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export','payroll.read','workforce.employee.read'];
 const {OWN_RUN_NOMINAL}=await import('../assets/own-payroll-run-workspace-model.js');
 const auth={ok:true,authenticated:true,sessionVersion:2,expiresAt:new Date(Date.now()+3600000).toISOString(),user:{id:'qa-user',email:'qa@example.invalid'},
  access:{context:'tenant',tenant:{id:uid(1),roleKey:'qa'},tenantCapabilities:[...new Set([...OWN_RUN_NOMINAL,...caps])]}};
 const boot={version:'own-liquidation-bootstrap.v1',scopeVersion:hex('a'),complete:true,runs:[
  {id:uid(2),period:'2026-10',liquidationType:'monthly',createdAt:'2026-11-01T10:00:00Z',employeeCount:2,resultSha256:hex('b'),canConsult:true},
  {id:uid(3),period:'2026-10',liquidationType:'supplementary',createdAt:'2026-11-01T10:00:00Z',employeeCount:2,resultSha256:hex('c'),canConsult:true}]};
 const catalog={version:'payroll-source-report.v1',official:false,mode:'catalog',total:2,truncated:false,items:[
  {datasetId:uid(4),date:'2026-10-31',type:'M',statementCount:2,lineCount:10,closureStatus:'closed',payloadHash:hex('d'),sourceLabel:'Respaldo sintético'},
  {datasetId:uid(5),date:'2026-10-31',type:'S',statementCount:2,lineCount:10,closureStatus:'closed',payloadHash:hex('e'),sourceLabel:'Respaldo sintético'}]};
 const asked=[];globalThis.fetch=async url=>{asked.push(url);const data=url==='/api/internal-auth'?auth:url.includes('resource=bootstrap')?{ok:true,data:boot}:url.includes('resource=payrollsourcereport')?{ok:true,data:catalog}:null;
  if(!data)throw new Error('unexpected '+url);return {ok:true,status:200,json:async()=>data};};
 t.after(()=>{for(const [k,v]of originals)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];});
 mountOwnGrhComparisonPanel(body);const $=k=>body.controls.get(k);
 await $('catalog').listeners.get('click')[0]();
 assert.match($('state').textContent,/^Elegí un cálculo y una fuente GRH del mismo tipo/,$('state').textContent);
 assert.equal($('form').hidden,false);
 assert.deepEqual($('own').children.map(o=>o.value),['',uid(2)],'suplementaria no tiene letra GRH y no se ofrece');
 $('own').value=uid(2);$('own').listeners.get('change')[0]();
 assert.deepEqual($('grh').children.map(o=>o.value),['',uid(4)],'sólo liquidaciones GRH del mismo tipo');
 assert.ok(asked.every(u=>!/owngrhstatementlines/.test(u)),'no lee recibos hasta comparar');
});

test('revisión de Codex (58457598): una corrida que exige revisión se retira si se pierde ese permiso; Atrás no deja el panel muerto',async t=>{
 const {detail}=await import('./fixtures/own-payroll-liquidation-synthetic.js');
 const {OWN_RUN_NOMINAL}=await import('../assets/own-payroll-run-workspace-model.js');
 const {OWN_LIQ_REVIEW}=await import('../assets/own-payroll-liquidation-model.js');
 const originals=['document','window','setInterval','clearInterval','fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);
 t.after(()=>{for(const [k,v]of originals)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];});
 const body=new Element(),head=new Element(),winListeners=new Map(),hex=c=>c.repeat(64),uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
 globalThis.document={hidden:false,head,querySelectorAll:()=>[],createElement:tag=>new Element(tag),addEventListener(){},removeEventListener(){},getElementById:()=>null};
 globalThis.window={addEventListener:(k,fn)=>winListeners.set(k,fn),removeEventListener:k=>winListeners.delete(k)};
 let poll=null;globalThis.setInterval=fn=>{poll=fn;return 1;};globalThis.clearInterval=()=>{};
 const d=detail(2);assert.equal(d.reviewAccessRequired,true);
 const group={remuneration:'993',non_remuneration:'994',deduction:'996',employer_contribution:'990'},concepts={},people=new Map(d.capture.saved.input.employees.map(e=>[e.contractId,e]));
 const statements=d.capture.saved.result.employeeTotals.map((tot,i)=>{const lines=d.capture.saved.result.rows.filter(r=>r.contractId===tot.contractId&&r.nature!=='auxiliary').map(r=>[r.conceptCode,r.amount,null]);
  for(const r of d.capture.saved.result.rows.filter(r=>r.contractId===tot.contractId&&r.nature!=='auxiliary'))concepts[r.conceptCode]={description:null,totalGroup:group[r.nature],unit:null};
  for(const [code,amount]of [['990',tot.employer_contribution],['993',tot.remuneration],['994',tot.non_remuneration],['995','0.00'],['996',tot.deduction],['999',tot.net]]){lines.push([code,amount,null]);concepts[code]={description:null,totalGroup:null,unit:null};}
  return {legajo:people.get(tot.contractId).employeeNumber,statementId:uid(100+i),statementHash:hex(String(i+1)),lines};});
 const grh={version:'grh-statement-lines-compact.v1',official:false,datasetId:uid(4),period:d.capture.saved.input.period,payrollType:'M',closureStatus:'closed',sourceHash:hex('e'),complete:true,concepts,statements};
 const boot={version:'own-liquidation-bootstrap.v1',scopeVersion:d.scopeVersion,complete:true,runs:[{id:d.id,period:d.capture.body.period,liquidationType:d.capture.body.liquidationType,
  createdAt:'2026-11-01T10:00:00Z',employeeCount:d.capture.saved.result.employeeCount,resultSha256:d.capture.saved.resultSha256,canConsult:true}]};
 const catalog={version:'payroll-source-report.v1',official:false,mode:'catalog',total:1,truncated:false,items:[{datasetId:uid(4),date:'2026-10-31',type:'M',statementCount:2,lineCount:10,closureStatus:'closed',payloadHash:hex('d'),sourceLabel:'Respaldo sintético'}]};
 let caps=[...new Set(['actions.read','payroll.read','workforce.employee.read',...OWN_RUN_NOMINAL,...OWN_LIQ_REVIEW])];
 const auth=()=>({ok:true,authenticated:true,sessionVersion:2,expiresAt:new Date(Date.now()+3600000).toISOString(),user:{id:'qa-user',email:'qa@example.invalid'},access:{context:'tenant',tenant:{id:uid(1),roleKey:'qa'},tenantCapabilities:caps}});
 const json=v=>new Response(JSON.stringify(v),{status:200,headers:{'content-type':'application/json'}});
 globalThis.fetch=async url=>url==='/api/internal-auth'?json(auth()):url.includes('resource=bootstrap')?json({ok:true,data:boot}):url.includes('resource=detail')?json({ok:true,data:d})
  :url.includes('resource=payrollsourcereport')?json({ok:true,data:catalog}):url.includes('resource=owngrhstatementlines')?json({ok:true,data:grh}):assert.fail('unexpected '+url);
 const panel=mountOwnGrhComparisonPanel(body),$=k=>body.controls.get(k);
 // El envío del formulario no devuelve su promesa: se espera a que el panel deje de estar ocupado.
 const settle=async()=>{for(let i=0;i<400&&body.getAttribute('aria-busy')==='true';i++)await new Promise(r=>setTimeout(r,5));};
 const compare=async()=>{await $('catalog').listeners.get('click')[0]();$('own').value=d.id;$('own').listeners.get('change')[0]();$('grh').value=uid(4);$('form').listeners.get('submit')[0]({preventDefault(){}});await settle();};
 await compare();assert.equal(panel.hasComparison,true,$('state').textContent);
 // Se retira el permiso de revisión: el sondeo de sesión retira la comparación ya abierta.
 caps=caps.filter(c=>c!=='payroll.calculation.approve');poll();await settle();
 assert.equal(panel.hasComparison,false);assert.match($('state').textContent,/permiso de revisión/);
 // Sin ese permiso, la comparación no llega a mostrarse aunque el detalle se lea.
 await compare();assert.equal(panel.hasComparison,false);
 // «Atrás» con la página guardada: se retiran los datos, pero al volver se puede consultar de nuevo.
 caps=[...caps,'payroll.calculation.approve'];await compare();assert.equal(panel.hasComparison,true);
 winListeners.get('pagehide')({persisted:true});assert.equal(panel.hasComparison,false);
 winListeners.get('pageshow')({persisted:true});assert.equal($('catalog').disabled,false,'el panel sigue vivo');
 await compare();assert.equal(panel.hasComparison,true);
 winListeners.get('pagehide')({persisted:false});assert.equal(panel.hasComparison,false);assert.equal(winListeners.has('pageshow'),false);
});

test('revisión de Codex (58457598): el CSV conserva los decimales negativos exactos y sigue neutralizando fórmulas',async()=>{
 const {reportCsv}=await import('../assets/report-document.js');
 const doc={layout:'own-grh-comparison.v1',title:'x',columns:['Legajo','Concepto','MuniControl','GRH','Diferencia','Estado'].map(label=>({label,type:'text',width:20})),
  rows:[['1001','210','3.98','4.01','-0.03','Diferencia de redondeo (hasta 5 centavos)'],['=1+1','-1+1','-0.00000001','@x','No evaluable','+cmd']],totals:[],metadata:[['Período','2026-10']],notes:[],filename:'municontrol_comparacion_grh_concepts_2026-10_m'};
 const csv=reportCsv(doc);
 assert.ok(csv.includes('"-0.03"')&&csv.includes('"-0.00000001"'),'un decimal negativo exacto queda legible');
 for(const formula of ['=1+1','-1+1','@x','+cmd'])assert.ok(csv.includes('"\''+formula+'"'),formula);
});
