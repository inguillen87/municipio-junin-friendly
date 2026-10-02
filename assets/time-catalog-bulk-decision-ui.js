import {TimeCatalogReviewSession,catalogCivilDate,CATALOG_STATUS_LABELS,CATALOG_KIND_LABELS,CATALOG_REASON_LABELS} from './time-catalog-review-model.js';
import {TIME_CATALOG_REASONS} from './time-catalog-contract.js';
import {assignmentDecisionPlan,assignmentDecisionSnapshot,ASSIGNMENT_DECISION_LIMIT} from './time-catalog-bulk-decision.js';
const make=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
const actions={submit:'Enviar a revisión',approve:'Aprobar asignaciones',reject:'Rechazar asignaciones'};
const weekday=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const dates=r=>`${catalogCivilDate(r.effectiveFrom)} a ${catalogCivilDate(r.effectiveTo)}`;
export class TimeCatalogBulkDecisionUi{
 constructor({model,request,isLocked,lock,remember,pending,finish,failed}){
  Object.assign(this,{model,request,isLocked,lock,remember,pending,finish,failed});this.selected=new Map();this.review=null;this.running=false;this.stop=false;
  this.nodes=Object.fromEntries(['assignmentSelection','assignmentSelectionCount','selectAssignmentPage','clearAssignmentSelection','reviewAssignments','assignmentDecisionDialog','assignmentDecisionClose','assignmentDecisionForm','assignmentDecisionAction','assignmentDecisionReasonCode','assignmentDecisionReason','assignmentDecisionPreview','assignmentDecisionConfirmed','assignmentDecisionMessage','assignmentDecisionSend','bulkResults'].map(id=>[id,document.getElementById(id)]));
  const n=this.nodes;
  n.selectAssignmentPage.addEventListener('click',()=>this.selectPage());n.clearAssignmentSelection.addEventListener('click',()=>{if(!this.isLocked()){this.selected.clear();this.controls(false);}});
  n.reviewAssignments.addEventListener('click',()=>this.open());n.assignmentDecisionClose.addEventListener('click',()=>n.assignmentDecisionDialog.close());
  n.assignmentDecisionDialog.addEventListener('close',()=>{if(this.running)this.stop=true;this.clearReview();n.assignmentDecisionReason.value='';});
  n.assignmentDecisionAction.addEventListener('change',()=>this.reasonOptions());
  for(const event of ['input','change'])n.assignmentDecisionForm.addEventListener(event,e=>{if(e.target!==n.assignmentDecisionConfirmed&&!this.running)this.clearReview();});
  n.assignmentDecisionForm.addEventListener('submit',e=>{e.preventDefault();this.compareOrSend();});
 }
 available(record){return this.model.permissions.canReadAssignments&&record.kind==='assignment'&&((record.status==='draft'&&this.model.permissions.canPropose)||(record.status==='submitted'&&this.model.permissions.canApprove));}
 choices(){return this.model.permissions.canApprove?['approve','reject']:this.model.permissions.canPropose?['submit']:[];}
 clearReview(){this.review=null;this.nodes.assignmentDecisionPreview.replaceChildren();this.nodes.assignmentDecisionPreview.hidden=true;this.nodes.assignmentDecisionConfirmed.checked=false;this.nodes.assignmentDecisionConfirmed.required=false;this.nodes.assignmentDecisionConfirmed.closest('label').hidden=true;this.nodes.assignmentDecisionSend.textContent='Comparar decisiones';}
 clear(){this.stop=true;this.selected.clear();this.nodes.assignmentDecisionDialog.close();this.clearReview();this.nodes.assignmentDecisionReason.value='';this.nodes.assignmentSelectionCount.textContent='';this.nodes.assignmentSelection.hidden=true;}
 message(text){this.nodes.assignmentDecisionMessage.textContent=text;this.nodes.assignmentDecisionMessage.hidden=!text;}
 controls(locked){
  const n=this.nodes,visible=this.model.permissions.canReadAssignments&&this.choices().length>0;
  n.assignmentSelection.hidden=!visible;n.assignmentSelectionCount.textContent=`${this.selected.size} asignaciones seleccionadas · Las páginas y filtros no recortan la selección.`;
  n.selectAssignmentPage.disabled=locked||!this.model.records.some(r=>this.available(r));n.clearAssignmentSelection.disabled=locked||!this.selected.size;n.reviewAssignments.disabled=locked||!this.selected.size;
  document.querySelectorAll('#records input[data-assignment-review]').forEach(input=>{input.checked=this.selected.has(input.dataset.assignmentReview);input.disabled=locked||!input.checked&&this.selected.size>=ASSIGNMENT_DECISION_LIMIT;});
  n.assignmentDecisionForm.querySelectorAll('input,select,textarea,button').forEach(input=>input.disabled=locked);
  n.assignmentDecisionClose.disabled=locked&&!this.running;n.assignmentDecisionClose.textContent=this.running?'Detener próximas decisiones':'Cerrar';
 }
 choice(record){
  if(!this.available(record))return null;
  const label=make('label',undefined,'check assignment-target assignment-review-choice'),input=make('input');input.type='checkbox';input.dataset.assignmentReview=record.id.toLowerCase();
  label.append(input,make('span',`Seleccionar ${record.reference?.title||'asignación'} · Revisión ${record.revision} · Desde ${catalogCivilDate(record.effectiveFrom)}`));
  input.addEventListener('change',()=>this.toggle(record.id,input.checked));return label;
 }
 async read(id){return this.request({resource:'detail',id});}
 verify(data){
  const s=new TimeCatalogReviewSession();s.scope=this.model.scope;s.permissions={...this.model.permissions};s.detail(data,data.record.id);
  if(s.selected.kind!=='assignment'||!s.assignment||!this.choices().some(action=>s.commands().includes(action)))throw Error('Una asignación ya no está disponible para tu revisión. No se completó la selección.');return s;
 }
 async toggle(id,checked){
  if(this.isLocked())return;const generation=this.model.generation;this.lock(true);
  try{
   if(!checked)this.selected.delete(id.toLowerCase());
   else{if(this.selected.size>=ASSIGNMENT_DECISION_LIMIT)throw Error('La selección admite hasta100 asignaciones; no se recorta.');this.model.bootstrap(await this.request({resource:'bootstrap'}));const data=await this.read(id);this.verify(data);this.selected.set(id.toLowerCase(),data);}
   this.clearReview();
  }catch(e){this.failed(e);}finally{if(generation===this.model.generation)this.lock(false);}
 }
 async selectPage(){
  if(this.isLocked())return;const generation=this.model.generation,rows=this.model.records.filter(r=>this.available(r));this.lock(true);
  try{
   if(new Set([...this.selected.keys(),...rows.map(r=>r.id.toLowerCase())]).size>ASSIGNMENT_DECISION_LIMIT)throw Error('Esta página supera el límite conjunto de100. No se seleccionó parcialmente.');
   this.model.bootstrap(await this.request({resource:'bootstrap'}));const additions=[];
   for(const row of rows){const data=await this.read(row.id);this.verify(data);additions.push([row.id.toLowerCase(),data]);}
   additions.forEach(([id,data])=>this.selected.set(id,data));this.clearReview();
  }catch(e){this.failed(e);}finally{if(generation===this.model.generation)this.lock(false);}
 }
 reasonOptions(){const n=this.nodes;n.assignmentDecisionReasonCode.replaceChildren();for(const code of TIME_CATALOG_REASONS[n.assignmentDecisionAction.value]){const option=make('option',CATALOG_REASON_LABELS[code]);option.value=code;n.assignmentDecisionReasonCode.append(option);}this.clearReview();}
 open(){
  if(this.isLocked()||!this.selected.size)return;const n=this.nodes;this.clearReview();this.message('');n.assignmentDecisionAction.replaceChildren();
  for(const action of this.choices()){const option=make('option',actions[action]);option.value=action;n.assignmentDecisionAction.append(option);}this.reasonOptions();n.assignmentDecisionReason.value='';n.assignmentDecisionDialog.showModal();n.assignmentDecisionAction.focus();
 }
 render(plan){
  const out=this.nodes.assignmentDecisionPreview;out.replaceChildren(make('h3',`${actions[plan.action]} · ${plan.total} asignaciones`),make('p','Revisá todos los contratos, vigencias y configuraciones. Cada decisión se registra por separado; una falla detiene las siguientes. No calcula horas ni haberes.'));
  const references=new Map(plan.dependencies.map((dep,index)=>[dep.record.id.toLowerCase(),index+1]));
  for(const entry of plan.entries){const article=make('article',undefined,'assignment-decision-target');article.append(make('h4',`${entry.assignment.target.legajo} · ${entry.assignment.target.name||'Nombre no informado'}`),make('p',`${CATALOG_STATUS_LABELS[entry.record.status]} · Revisión ${entry.record.revision} · Versión ${entry.record.version} · ${dates(entry.record)}`));
   article.append(make('p',entry.record.reference?.title||'Asignación sin nombre visible'));if(entry.record.reference?.legalReference)article.append(make('p','Referencia documental: '+entry.record.reference.legalReference));
   for(const key of ['shift','calendar','ruleProfile']){const dep=entry.assignment[key];article.append(make('p',`${CATALOG_KIND_LABELS[dep.kind]}: configuración ${references.get(dep.id.toLowerCase())} · ${dep.reference?.title||'Sin nombre visible'} · Revisión ${dep.revision}`));}out.append(article);
  }
  for(const [index,dep] of plan.dependencies.entries()){
   const r=dep.record,c=r.configuration,section=make('section',undefined,'assignment-decision-config');section.append(make('h4',`Configuración ${index+1} · ${CATALOG_KIND_LABELS[r.kind]} · ${r.reference?.title||'Sin nombre visible'}`),make('p',`Revisión ${r.revision} · Versión ${r.version} · ${CATALOG_STATUS_LABELS[r.status]} · ${dates(r)} · Mendoza (UTC−3)`));
   if(r.reference?.legalReference)section.append(make('p','Referencia documental: '+r.reference.legalReference));
   if(r.kind==='calendar'){section.append(make('p',`${c.days.length} días declarados. Los días ausentes no se infieren.`));for(const day of c.days)section.append(make('p',`${catalogCivilDate(day.date)} · ${({working:'Laborable',non_working:'No laborable',holiday:'Feriado',special:'Especial'})[day.kind]} · ${day.code} · ${day.evidencePresent?'Huella registrada':'Sin huella de evidencia'}`));}
   if(r.kind==='shift'){section.append(make('p',`Tolerancias: entrada ${c.entryToleranceSeconds} segundos · salida ${c.exitToleranceSeconds} segundos`));for(const interval of c.intervals)section.append(make('p',`${weekday[interval.day-1]} · Tramo ${interval.sequence} · ${({work:'Trabajo',break:'Pausa',on_call:'Guardia'})[interval.kind]} · ${interval.start} → ${interval.end}${interval.crossesMidnight?' del día siguiente':''}`));}
   if(r.kind==='rule_profile')for(const parameter of c.parameters){const value=parameter[({integer:'integerValue',decimal:'decimalValue',boolean:'booleanValue',time:'timeValue',code:'codeValue'})[parameter.valueKind]];section.append(make('p',`${parameter.key}: ${parameter.valueKind==='boolean'?(value?'Sí':'No'):value} · Unidad declarada: ${parameter.unitCode}`));}
   out.append(section);
  }
  out.hidden=false;this.nodes.assignmentDecisionConfirmed.checked=false;this.nodes.assignmentDecisionConfirmed.required=true;this.nodes.assignmentDecisionConfirmed.closest('label').hidden=false;this.nodes.assignmentDecisionSend.textContent=`${actions[plan.action]} (${plan.total})`;
 }
 results(states,action){
  const out=this.nodes.bulkResults;out.replaceChildren(make('h3','Resultado de las decisiones'),make('p',`${states.filter(row=>row.confirmed).length} decisiones confirmadas de ${states.length} · ${actions[action]}. Cada resultado corresponde a una asignación.`));
  for(const row of states){const item=make('div',undefined,'assignment-result');item.append(make('strong',`${row.entry.assignment.target.legajo} · ${row.entry.assignment.target.name||'Nombre no informado'}`),make('span',row.status));out.append(item);}
 }
 async compareOrSend(){
  if(this.isLocked()||document.hidden)return;const generation=this.model.generation;this.lock(true);const n=this.nodes;
  try{
   this.model.bootstrap(await this.request({resource:'bootstrap'}));
   if(!this.review){const details=[];for(const id of this.selected.keys())details.push(await this.read(id));const plan=assignmentDecisionPlan({details,scope:this.model.scope,permissions:this.model.permissions,action:n.assignmentDecisionAction.value,reasonCode:n.assignmentDecisionReasonCode.value,reason:n.assignmentDecisionReason.value});this.review=plan;this.render(plan);this.message('');return;}
   if(!n.assignmentDecisionConfirmed.checked)throw Error('Confirmá la revisión de todos los contratos y configuraciones.');
   await this.send(this.review,generation);
  }catch(e){if(generation===this.model.generation)this.message(e.message);this.failed(e);}finally{if(generation===this.model.generation)this.lock(false);}
 }
 async send(plan,generation){
  this.running=true;this.stop=false;this.controls(true);const states=plan.entries.map(entry=>({entry,confirmed:false,status:'Sin enviar'}));
  try{
   for(const row of states){
    if(this.stop)throw Error('Se detuvieron las próximas decisiones. Las ya registradas se conservan; revisá el resultado completo.');
    if(generation!==this.model.generation||document.hidden)return;
    this.model.bootstrap(await this.request({resource:'bootstrap'}));const data=await this.read(row.entry.record.id);
    const fresh=assignmentDecisionPlan({details:[data],scope:this.model.scope,permissions:this.model.permissions,action:plan.action,reasonCode:plan.reasonCode,reason:plan.reason});
    if(fresh.scope!==plan.scope||assignmentDecisionSnapshot(fresh.entries[0])!==assignmentDecisionSnapshot(row.entry))throw Error('Una asignación o configuración cambió desde la comparación. Se detuvieron las siguientes; revisá el resultado.');
    if(this.stop)throw Error('Se detuvieron las próximas decisiones. Las ya registradas se conservan; revisá el resultado completo.');
    this.model.detail(data,row.entry.record.id);const attempt=this.model.prepare(plan.action,plan.reasonCode,plan.reason,plan.action==='approve',crypto.randomUUID());this.remember(attempt);row.status='Envío sin confirmación';
    this.model.confirm(await this.request(null,attempt));this.remember(null);row.confirmed=true;row.status='Decisión registrada · Vínculo pendiente de consulta';this.results(states,plan.action);
    const acknowledged=this.model.selected.version;this.model.detail(await this.read(row.entry.record.id),row.entry.record.id);
    const current=this.model.assignment;
    if(!current||current.target.contractId.toLowerCase()!==row.entry.assignment.target.contractId.toLowerCase()||this.model.selected.version<acknowledged||['shift','calendar','ruleProfile'].some(key=>current[key].id!==row.entry.assignment[key].id))throw Error('La decisión se registró, pero el vínculo no pudo conciliarse. Se detuvieron las siguientes.');
    row.status=`Decisión registrada · Estado actual: ${CATALOG_STATUS_LABELS[this.model.selected.status]} · Vínculo verificado`;this.results(states,plan.action);this.selected.delete(row.entry.record.id.toLowerCase());
   }
   this.nodes.assignmentDecisionDialog.close();await this.finish(`${plan.total} decisiones registradas · ${actions[plan.action]}. No genera cálculo de horas ni liquidaciones.`);this.results(states,plan.action);
  }catch(e){
   if(generation===this.model.generation&&this.model.scope){this.results(states,plan.action);if(this.model.pending){this.nodes.assignmentDecisionDialog.close();this.pending(e);}else{this.clearReview();this.message(e.message);}}
   this.failed(e);
  }finally{this.running=false;}
 }
}
