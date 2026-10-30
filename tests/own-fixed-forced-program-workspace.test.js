import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {build} from 'esbuild';
import * as ui from '../assets/own-payroll-program-workspace-model.js';
import {ownProgramStructure} from '../assets/own-payroll-program-model.js';
import {ownFixedForcedRuleKey,fixedForcedExpressionSet} from '../assets/own-payroll-engine.js';
import {salaryItems,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {bootstrap,program,uid,hash} from './fixtures/own-payroll-program-synthetic.js';
import {rule,lit,fact,binary} from './fixtures/own-payroll-synthetic.js';
import {exactProgram} from './fixtures/own-payroll-exact-program-synthetic.js';
const clone=structuredClone,sha=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
const quantity=(stage='exact')=>({op:'quantity_phase',code:'100',unit:'units',stage,rounding:stage==='exact'?null:{precision:2,mode:'half_up'},value:fact('fixedUnits','units'),sourceReference:'Preparación ficticia QA',sourceSha256:hash('d')});
function fixture(){
 const rules=[rule('100',lit('10.00','money')),rule('110',{op:'convert',value:quantity(),unit:'money',factor:'1',conversionReference:'Conversión inventada QA'}),rule('900',lit('1','units'),{nature:'auxiliary',unit:'units'}),rule('200',fact('other'),{agreementCode:'2'})];
 for(const r of rules)r.rounding={precision:8,mode:'exact'};
 const policies=[{ruleKey:ownFixedForcedRuleKey(rules[0]),sourceKind:'fixed_amount',sourceCode:'100',quantityPolicy:'reject',sourceSha256:hash('e'),ruleReference:'Fundamento fijo ficticio QA'}];
 const definition=ownProgramStructure({namespaceVersion:'own-payroll-namespaces.v2',fixedForcedAmountsVersion:'own-fixed-forced-amount.v1',fixedForcedAmountsPolicy:{quantityLineage:{version:'own-quantity-lineage-review.v1',sourceSha256:hash('a'),sourceControlSha256:hash('f'),expressionSetSha256:sha(fixedForcedExpressionSet(rules,policies)),complete:true},policies},rules,bindings:[{agreementCode:'1',key:'fixedUnits',unit:'units',sourceKind:'fixed_quantity',sourceCode:'100',onMissing:'error',combine:'single',ruleReference:'Fuente ficticia QA'}, {agreementCode:'2',key:'other',unit:'money',sourceKind:'monthly_amount',sourceCode:'200',onMissing:'error',combine:'single',ruleReference:'Fuente ajena ficticia QA'}],totalsPrecision:8});
 const items=salaryItems(definition.rules.map(r=>({active:true,agreementCode:r.agreementCode,categoryCode:null,code:r.code,dependencies:[],kind:r.nature==='auxiliary'?'auxiliary':'concept',label:'Definición exclusivamente ficticia QA',nature:r.nature,precision:8,ruleReference:'Sin norma municipal; sólo QA',unit:r.code==='100'?'units':r.unit,validFrom:r.validFrom,validUntil:null,value:null})));
 const boot=bootstrap({salaryCatalog:{version:hash('c'),revision:1,items},program:{version:hash('b'),revision:1,definition,salaryVersion:hash('c'),proposalId:uid(30),approvalId:uid(31)}});
 return {definition,boot};
}
test('programa fijo: recorre cantidades completas exactas/redondeadas sin exponer hashes',()=>{
 for(const stage of ['exact','rounded']){const q=quantity(stage);assert.deepEqual(ui.expressionChildren(q),['value']);assert.deepEqual(ui.expressionSize(q),{nodes:2,depth:1});const text=ui.describeProgramExpression(q);assert.match(text,/Cantidad del concepto 100/);assert.match(text,stage==='exact'?/antes del redondeo/:/después del redondeo a 2 decimales/);assert.match(text,/fixedUnits/);assert.match(text,/Preparación ficticia QA/);assert.ok(!text.includes(q.sourceSha256));}
 const malformed=fixture().definition;malformed.rules.find(r=>r.code==='110').expression.value.rounding={precision:2,mode:'half_up'};assert.throws(()=>ownProgramStructure(malformed));
 let deep=quantity();for(let n=0;n<33;n++)deep={op:'round',value:deep,rounding:{precision:2,mode:'exact'}};assert.throws(()=>ui.expressionSize(deep),/capacidad/);
});
test('programa fijo: no fabrica ni descarta cantidades con origen desde el selector genérico',()=>{
 assert.equal(Object.hasOwn(ui.PROGRAM_OPERATIONS,'quantity_phase'),false);
 assert.throws(()=>ui.changeExpressionOperation(binary('add',quantity(),lit('1')),'literal'),/preparación revisada/);
 assert.throws(()=>ui.changeExpressionOperation(quantity(),'input'),/preparación revisada/);
 assert.deepEqual(ui.changeExpressionOperation(lit('1'),'input'),{op:'input',unit:'coefficient',key:''});
});
test('programa fijo: la comparación incluye política y respaldo aunque cambie sólo la última declaración',()=>{
 const {definition}=fixture(),after=clone(definition);after.fixedForcedAmountsPolicy.quantityLineage.sourceControlSha256=hash('9');
 const diff=ui.programWorkspaceChanges(definition,after);assert.equal(diff.changed,1);assert.equal(diff.rows.at(-1).kind,'fixedForcedLineage');assert.equal(diff.rows.at(-1).status,'modified');assert.equal(diff.rows.find(r=>r.kind==='fixedForcedPolicy').status,'unchanged');
 const changed=clone(definition);changed.fixedForcedAmountsPolicy.policies[0].ruleReference='Nuevo fundamento ficticio QA';assert.equal(ui.programWorkspaceChanges(definition,changed).changed,1);
 const old=program(),legacy=ui.programWorkspaceChanges(old,clone(old));assert.equal(legacy.changed,0);assert.equal(legacy.rows.length,old.rules.length+old.bindings.length);assert.ok(!Object.hasOwn(legacy,'fixedForcedAmountsVersion'));assert.ok(legacy.rows.every(r=>r.status==='unchanged'));
});
test('programa fijo: preparar bloquea mutaciones del alcance completo y de sus fuentes sin renovar lineage',()=>{
 const {definition,boot}=fixture();
 const changes=[p=>p.rules.find(r=>r.code==='100').expression.value='11.00',p=>p.rules.find(r=>r.code==='110').expression.value.value.key='otherUnits',p=>p.rules.find(r=>r.code==='900').expression.value='2',p=>p.rules.find(r=>r.code==='100').validUntil='2026-12',p=>p.bindings.find(b=>b.key==='fixedUnits').onMissing='zero',p=>p.fixedForcedAmountsPolicy.quantityLineage.sourceSha256=hash('9')];
 for(const change of changes){const next=clone(definition);change(next);assert.throws(()=>ui.prepareProgramWorkspace(boot,next,'Cambio exclusivamente ficticio QA'));assert.deepEqual(boot.program.definition,definition);}
 const next=clone(definition);next.rules.find(r=>r.code==='100').expression.value='11.00';assert.throws(()=>ui.prepareProgramWorkspace(boot,next,'Cambio exclusivamente ficticio QA'),/preparación revisada/);
});
test('programa fijo: edición ajena conserva pareja, wrapper y el cuerpo congelado del intento',async()=>{
 globalThis.crypto??=webcrypto;const {definition,boot}=fixture(),next=clone(definition);next.rules.find(r=>r.code==='200').ruleReference='Fundamento ajeno actualizado QA';
 const body=ui.prepareProgramWorkspace(boot,next,'Cambio ajeno al alcance fijo QA');assert.deepEqual(body.program.fixedForcedAmountsPolicy,definition.fixedForcedAmountsPolicy);assert.deepEqual(body.program.rules.find(r=>r.code==='110').expression,definition.rules.find(r=>r.code==='110').expression);
 const attempt=ui.programWorkspaceAttempt(uid(50),body,'sesión sintética');body.program.fixedForcedAmountsPolicy.quantityLineage.sourceSha256=hash('9');assert.deepEqual(attempt.body.program,next);assert.throws(()=>{attempt.body.program.rules.pop();});
 const receipt={version:'own-payroll-program.v1',eventId:uid(51),proposalId:uid(51),requestKey:attempt.key,requestSha256:sha(attempt.body),body:attempt.body,status:'pending',revision:1,programVersion:hash('b'),replayed:false,payrollCalculated:false,payrollPosted:false};await ui.verifiedProgramWorkspaceReceipt(receipt,attempt);
});
test('programa fijo: protección no activa la característica en un programa anterior ni cambia su propuesta',()=>{
 const definition=exactProgram(),boot=bootstrap(),body=ui.prepareProgramWorkspace(boot,definition,'Preparación exclusivamente ficticia QA');assert.deepEqual(body.program,definition);assert.ok(!Object.hasOwn(body.program,'fixedForcedAmountsVersion'));assert.ok(!Object.hasOwn(body.program,'fixedForcedAmountsPolicy'));
 if(ui.programWorkspaceForcedProtection)assert.equal(ui.programWorkspaceForcedProtection(definition),null);
 const next=fixture().definition;delete next.namespaceVersion;assert.throws(()=>ownProgramStructure(next),{code:'FORCED_POLICY_INVALID'});
});

class Element{
 constructor(tag='div'){this.tagName=tag.toLowerCase();this.dataset={};this.children=[];this.events=new Map();this.queries=new Map();this.style={setProperty(){}};this.isConnected=true;this.value='';this.hidden=false;this.checked=false;this.disabled=false;this._text='';}
 set innerHTML(value){for(const m of value.matchAll(/<([a-z]+)[^>]*\bdata-program-([a-z-]+)\b[^>]*>/g)){const el=new Element(m[1]);el.hidden=/\shidden\b/.test(m[0]);this.queries.set('[data-program-'+m[2]+']',el);}}
 get textContent(){return this._text+this.children.map(n=>typeof n==='string'?n:n.textContent).join('');}set textContent(value){this._text=String(value);this.children=[];}
 setAttribute(name,value){if(name==='aria-label')this.label=value;}append(...nodes){this.children.push(...nodes);if(this.tagName==='select'&&!this.value)this.value=nodes.find(n=>n?.value)?.value??'';}prepend(...nodes){this.children.unshift(...nodes);}replaceChildren(...nodes){this._text='';this.children=[];this.value=this.tagName==='select'?'':this.value;this.append(...nodes);}insertBefore(){}get options(){return this.children.filter(n=>n&&typeof n==='object');}get lastElementChild(){return this.children.at(-1)??new Element();}
 querySelector(selector){if(this.queries.has(selector))return this.queries.get(selector);return this.querySelectorAll(selector)[0]??null;}
 querySelectorAll(selector){const match=e=>selector==='input,select,textarea,button'?['input','select','textarea','button'].includes(e.tagName):selector.startsWith('[data-program-field="')?e.dataset.programField===selector.slice(21,-2):false;return this.children.filter(n=>n instanceof Element).flatMap(n=>[...(match(n)?[n]:[]),...n.querySelectorAll(selector)]);}
 addEventListener(key,fn){this.events.set(key,fn);}removeEventListener(){}focus(){}scrollIntoView(){}
}
async function panelFixture({pending=false}={}){
 const {definition,boot}=fixture(),listeners=new Map(),windowListeners=new Map(),requests=[],fixtureState={};
 if(pending){const p=clone(definition);p.fixedForcedAmountsPolicy.quantityLineage.sourceControlSha256=hash('9');boot.proposals=[{id:uid(80),requestSha256:hash('8'),baseVersion:boot.program.version,salaryVersion:boot.salaryCatalog.version,salaryItems:boot.salaryCatalog.items,baseDefinition:definition,definition:p,reason:'Revisión documental exclusivamente ficticia QA',createdAt:'2026-10-17T12:00:00Z',authorLabel:'Preparador ficticio QA',canReview:true,status:'pending',decision:null}];boot.permissions.canReview=true;}
 const document={hidden:false,head:new Element(),querySelector:()=>null,createElement:t=>new Element(t),createTextNode:v=>v,getElementById:()=>null,addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
 const auth={ok:true,authenticated:true,sessionVersion:2,user:{id:'program-ui-qa',email:'program-ui@example.invalid'},access:{context:'tenant',tenant:{id:uid(1),roleKey:'QA'},tenantCapabilities:['workforce.employee.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve']},expiresAt:new Date(Date.now()+3600000).toISOString()};let rejectPost;
 const result=await build({stdin:{contents:"export {mountOwnPayrollProgram} from './assets/own-payroll-program-panel.js'",resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'browser',logLevel:'silent',define:{'import.meta.url':JSON.stringify('https://fixture.invalid/assets/own-payroll-program-panel.js')},plugins:[{name:'bounded-program-ui-context',setup(b){for(const [pattern,name] of [[/municipal-owner-program-workspace\.js$/,'owner'],[/own-program-coverage-panel\.js$/,'coverage'],[/own-payroll-program-scale-reference-panel\.js$/,'scale']])b.onResolve({filter:pattern},()=>({path:name,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='owner'?"export function mountMunicipalOwnerProgram(host,options){globalThis.fixtureState.owner=options;return{state:()=>({busy:false,pending:null}),setEnabled(){},suspend(){},forget(){},update(){}}}":a.path==='coverage'?"export const mountProgramCoverage=()=>({setEnabled(){},setSource(){},clear(){}})":"export const mountProgramScaleReference=()=>({setEnabled(){},clear(){},clearReview(){},renderChoices(){}})"}));}}]});
 const module={exports:{}},context=vm.createContext({module,exports:module.exports,fixtureState,document,window:{addEventListener:(k,fn)=>windowListeners.set(k,fn)},URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,DOMException,Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value;}},crypto:webcrypto,structuredClone,fetch:async(url,options={})=>{requests.push({url,method:options.method??'GET',body:options.body,headers:options.headers});if(options.method==='POST')return new Promise((_resolve,reject)=>{rejectPost=reject;options.signal?.addEventListener('abort',()=>reject(new DOMException('Synthetic request aborted','AbortError')),{once:true});});return new Response(JSON.stringify(url==='/api/internal-auth'?auth:{ok:true,data:boot}),{status:200});},setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},console});
 new vm.Script('globalThis.structuredClone=value=>JSON.parse(JSON.stringify(value))').runInContext(context);new vm.Script(result.outputFiles[0].text).runInContext(context,{timeout:10000});const container=new Element();module.exports.mountOwnPayrollProgram(container);listeners.get('taskchange')({detail:{id:'reglas'}});const host=container.children[0],field=key=>host.querySelector('[data-program-'+key+']');
 const settle=async check=>{const limit=Date.now()+3000;do{await new Promise(r=>setImmediate(r));if(check())return;}while(Date.now()<limit);throw Error('Synthetic panel did not settle: '+field('status').textContent);};await settle(()=>field('status').textContent==='Consulta completa y acceso verificados.');
 return {definition,boot,document,listeners,windowListeners,requests,field,settle,reject:()=>rejectPost(Error('Acuse sintético perdido')),allText:()=>[...host.queries.values()].map(e=>e.textContent).join(''),dispose:()=>windowListeners.get('pagehide')()};
}
test('panel fijo real: muestra política y cantidad protegidas, sin hashes ni controles para inventar lineage',async()=>{
 const h=await panelFixture();try{assert.equal(h.field('content').hidden,false);assert.ok(h.field('forced'),'La política explícita necesita una vista propia');assert.equal(h.field('forced').hidden,false);assert.match(h.field('forced').textContent,/Importe fijo aprobado/);assert.match(h.field('forced').textContent,/no se elige una ni se suman/);assert.equal(h.field('rule-editor').querySelectorAll('input,select,textarea,button').length,0);
 h.field('rule-select').value='1';h.field('rule-select').events.get('change')();assert.match(h.field('rule-editor').textContent,/Cantidad del concepto 100/);assert.equal(h.field('rule-editor').querySelectorAll('input,select,textarea,button').length,0);assert.equal(h.field('binding-editor').querySelectorAll('input,select,textarea,button').length,0);
 for(const token of [hash('d'),hash('e'),h.definition.fixedForcedAmountsPolicy.quantityLineage.expressionSetSha256,'sourceSha256','quantityLineage','quantity_phase'])assert.ok(!h.allText().includes(token),token);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
 }finally{h.dispose();}
});
test('panel fijo real: revisión muestra el respaldo modificado y conserva las guardas de decisión',async()=>{
 const h=await panelFixture({pending:true});try{h.field('proposal-select').value=uid(80);h.field('proposal-select').events.get('change')();h.field('review-tab').events.get('click')();const text=h.field('proposal-detail').textContent;assert.match(text,/Respaldo documental/);assert.match(text,/Modificado/);assert.match(text,/Importe fijo aprobado/);assert.ok(!text.includes(hash('9')));assert.equal(h.field('decision-fields').disabled,false);h.field('decision').value='approve';h.field('decision-reason').value='Revisión independiente ficticia QA';h.field('review-decision').events.get('click')();assert.equal(h.field('send-box').hidden,false);assert.equal(h.field('send').disabled,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
 h.listeners.get('municontrol:capabilities-ready')({detail:{capabilities:[]}});assert.equal(h.field('content').hidden,true);
 }finally{h.dispose();}
});
test('panel fijo real: edición ajena e intento incierto conservan pareja y cuerpo sin un segundo envío',async()=>{
 const h=await panelFixture();try{h.field('rule-select').value=String(h.definition.rules.findIndex(r=>r.code==='200'));h.field('rule-select').events.get('change')();const input=h.field('rule-editor').querySelector('[data-program-field="ruleReference"]');assert.ok(input);input.value='Respaldo ajeno actualizado QA';input.events.get('input')();h.field('reason').value='Cambio ajeno exclusivamente ficticio QA';h.field('prepare').events.get('click')();assert.equal(h.field('send-box').hidden,false,h.field('status').textContent);h.field('confirm').checked=true;h.field('confirm').events.get('change')();h.field('send').events.get('click')();await h.settle(()=>h.requests.some(r=>r.method==='POST'));const original=h.requests.find(r=>r.method==='POST'),body=JSON.parse(original.body).payload;assert.deepEqual(body.program.fixedForcedAmountsPolicy,h.definition.fixedForcedAmountsPolicy);assert.deepEqual(body.program.rules.find(r=>r.code==='110').expression,h.definition.rules.find(r=>r.code==='110').expression);assert.equal(h.field('fields').disabled,true);h.reject();await h.settle(()=>h.field('status').textContent.includes('Acuse sintético perdido'));input.value='Intento de cambio tardío QA';input.events.get('input')();assert.equal(h.requests.find(r=>r.method==='POST').body,original.body);h.dispose();assert.equal(h.field('content').hidden,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);
 }finally{h.dispose();}
});
