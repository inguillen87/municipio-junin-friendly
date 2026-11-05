import {salaryBootstrap,salaryItems,salaryRowKey,salarySerialized,salaryExact,salaryHash} from './native-salary-catalog-model.js';
import {ownProgramBootstrap,ownProgramStructure,ownProgramDefinition,ownProgramHistory,ownProgramRuleKey,ownProgramPeriodContext,ownProgramNamespaced,ownProgramConditions,OWN_PROGRAM_MAX_BYTES} from './own-payroll-program-model.js';
import {prepareProgramWorkspace} from './own-payroll-program-workspace-model.js';
import {OWN_PAYROLL_LIMITS,normalizeOwnPayrollRules} from './own-payroll-engine.js';
import {periodContextFields} from './own-payroll-period-context.js';

// Reads the existing preparation result; never interprets formula source, runs
// the Node preparer, uploads the evidence, or issues a municipal command.
export const OWN_PROGRAM_PREPARED_MAX_BYTES=16*1024*1024;
export const OWN_PROGRAM_PREPARED_VERSIONS=Object.freeze(['own-payroll-programme-source-preparation.v1','own-payroll-programme-source-preparation.v2']);
export const OWN_PROGRAM_PREPARED_REVIEW_VERSION='own-payroll-program-prepared-draft-review.v1';
const encoder=new TextEncoder(),maximumReason='\ud800'.repeat(1000);
const rootFields=['version','status','approved','executable','payrollCalculated','payrollPosted','sourceHashStatus','basePinStatus','pins','completeness','presentable','context','incidents','dependencies','trace','draft'];
const pinFields=['scopeVersion','classificationVersion','salaryVersion','salaryRevision','programVersion','programRevision','programmeDefinitionSha256','sourceSha256','evidenceSha256','catalogueItemsSha256','period','preparationSha256'];
const completenessFields=['sourceDeclaredComplete','expectedDefinitions','receivedDefinitions','typedRules','allAgreements','masterContractComplete','programmeContractComplete'];
const definitionFields=['identity','sourceSha256','catalogue','outputUnit','quantity'];
const roles=['payable','dependency','input'],units=['money','hours','minutes','days','percent','units','coefficient'];
const code=v=>typeof v==='string'&&/^[0-9]{1,9}$/.test(v);
const month=v=>typeof v==='string'&&/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(v);
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export class PreparedProgramDraftError extends Error{constructor(code,message){super(message);this.name='PreparedProgramDraftError';this.code=code;}}
const require=(ok,code='PROGRAM_PREPARED_INVALID',message='El archivo no conserva una preparación completa verificable. El borrador anterior se conserva.')=>{if(!ok)throw new PreparedProgramDraftError(code,message);};
const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(salarySerialized(v)))),b=>b.toString(16).padStart(2,'0')).join('');
function inert(value,depth=0,ancestors=new Set(),budget={nodes:0}){
 require(depth<=64&&++budget.nodes<=1000000,'PROGRAM_PREPARED_LIMIT','El archivo supera la capacidad de revisión completa. No se recortaron elementos.');
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){require(Number.isSafeInteger(value));return value;}
 require(value&&typeof value==='object'&&!ancestors.has(value));
 const array=Array.isArray(value),descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(value);
 require(array?Object.getPrototypeOf(value)===Array.prototype&&keys.length===value.length+1&&Array.from({length:value.length},(_,i)=>String(i)).every(k=>Object.hasOwn(descriptors,k)):Object.getPrototypeOf(value)===Object.prototype);
 require(keys.every(k=>typeof k==='string'&&!['__proto__','constructor','prototype'].includes(k)&&Object.hasOwn(descriptors[k],'value')&&(array&&k==='length'||descriptors[k].enumerable)));
 ancestors.add(value);
 const next=array?Array.from({length:value.length},(_,i)=>inert(descriptors[String(i)].value,depth+1,ancestors,budget)):Object.fromEntries(keys.map(k=>[k,inert(descriptors[k].value,depth+1,ancestors,budget)]));
 ancestors.delete(value);return next;
}
// Check duplicate decoded property names and nesting before JSON.parse. This
// scanner only validates JSON transport; it does not interpret any formula.
function parse(text){
 require(typeof text==='string'&&encoder.encode(text).byteLength>0&&encoder.encode(text).byteLength<=OWN_PROGRAM_PREPARED_MAX_BYTES,'PROGRAM_PREPARED_LIMIT','Elegí un JSON UTF-8 completo de hasta 16 MiB. El borrador anterior se conserva.');
 let position=0,nodes=0;
 const white=()=>{while(position<text.length&&/[\x20\t\r\n]/.test(text[position]))position++;};
 const string=()=>{require(text[position]==='"');const start=position++;let escaped=false;for(;position<text.length;position++){const c=text[position];if(!escaped&&c==='"'){position++;try{return JSON.parse(text.slice(start,position));}catch{require(false);}}if(!escaped&&c==='\\')escaped=true;else escaped=false;}require(false);};
 function value(depth){
  require(depth<=64&&++nodes<=1000000,'PROGRAM_PREPARED_LIMIT');white();const c=text[position];
  if(c==='{'){position++;white();const seen=new Set();if(text[position]==='}'){position++;return;}for(;;){white();const key=string();require(!seen.has(key),'PROGRAM_PREPARED_DUPLICATE_KEY','El JSON repite un campo. No se eligió una de las versiones ni se cambió el borrador.');seen.add(key);white();require(text[position++]===':');value(depth+1);white();const end=text[position++];if(end==='}')return;require(end===',');}}
  if(c==='['){position++;white();if(text[position]===']'){position++;return;}for(;;){value(depth+1);white();const end=text[position++];if(end===']')return;require(end===',');}}
  if(c==='"'){string();return;}
  const match=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(position));require(match);position+=match[0].length;
 }
 value(0);white();require(position===text.length);
 let result;try{result=JSON.parse(text);}catch{require(false);}return inert(result);
}
function requestBytes(program,boot){
 const payload={command:'propose',scopeVersion:boot.scopeVersion,baseVersion:boot.program.version,salaryVersion:boot.salaryCatalog.version,proposalId:null,proposalSha256:null,program,reason:maximumReason,reviewConfirmed:false};
 return encoder.encode(JSON.stringify({operation:'command',payload})).byteLength;
}
const ruleIdentity=r=>(r.nature==='auxiliary'?'auxiliary':'concept')+':'+r.agreementCode+':'+r.code;
async function reviewParsed(salaryValue,programmeValue,currentDraft,file){
 require(salaryExact(file,rootFields)&&OWN_PROGRAM_PREPARED_VERSIONS.includes(file.version)&&salaryExact(file.pins,pinFields)&&salaryHash(file.pins.preparationSha256));
 // All result fields, including flags, roles, trace and the complete programme,
 // participate in this hash. Remove only the self-referential pin.
 const unsigned={...file,pins:{...file.pins}};delete unsigned.pins.preparationSha256;
 require(await hash(unsigned)===file.pins.preparationSha256,'PROGRAM_PREPARED_HASH_CHANGED','El contenido completo no coincide con su huella. No se cambió el borrador.');
 require(file.status==='proposal_draft'&&[file.approved,file.executable,file.payrollCalculated,file.payrollPosted].every(v=>v===false)&&file.sourceHashStatus==='declared_evidence_not_backup_revalidation'&&file.basePinStatus==='validated_model_snapshots_not_remote_authorization');
 require(Array.isArray(file.incidents)&&file.incidents.length===0,'PROGRAM_PREPARED_INCIDENTS','La preparación conserva incidencias. Revisá su fuente; no se cargó un programa parcial.');
 require(salaryExact(file.presentable,['master','programme'])&&file.presentable.master===false&&file.presentable.programme===true);
 const roleVersion=file.version===OWN_PROGRAM_PREPARED_VERSIONS[1],count=file.completeness;
 require(salaryExact(count,[...completenessFields,...(roleVersion?['expectedTypedRules','inputDefinitions','consumedInputDefinitions']:[])])&&count.sourceDeclaredComplete===true&&count.masterContractComplete===true&&count.programmeContractComplete===true);
 require(integer(count.expectedDefinitions)&&count.expectedDefinitions>0&&count.expectedDefinitions<=OWN_PAYROLL_LIMITS.rules&&count.receivedDefinitions===count.expectedDefinitions&&integer(count.typedRules));
 require(Array.isArray(count.allAgreements)&&count.allAgreements.length>0&&count.allAgreements.length<=1000&&count.allAgreements.every(code)&&new Set(count.allAgreements).size===count.allAgreements.length&&salarySerialized([...count.allAgreements].sort())===salarySerialized(count.allAgreements));
 require(salaryExact(file.draft,['definitions','typedRules','masterItems','programme'])&&Array.isArray(file.draft.definitions)&&file.draft.definitions.length===count.receivedDefinitions&&Array.isArray(file.draft.typedRules)&&file.draft.typedRules.length===count.typedRules&&file.draft.programme!==null&&Array.isArray(file.trace)&&Array.isArray(file.dependencies));
 const salary=salaryBootstrap(inert(salaryValue)),boot=ownProgramBootstrap(inert(programmeValue)),pins=file.pins;
 require(boot.permissions.canPropose&&salary.catalog.revision>0,'PROGRAM_PREPARED_NOT_PERMITTED','La cuenta o el maestro actual no permiten preparar reglas. El borrador anterior se conserva.');
 require(pinFields.filter(k=>!['salaryRevision','programRevision','period'].includes(k)).every(k=>salaryHash(pins[k]))&&integer(pins.salaryRevision)&&integer(pins.programRevision)&&month(pins.period));
 require(salary.scopeVersion===boot.scopeVersion&&salary.catalog.version===boot.salaryCatalog.version&&salary.catalog.revision===boot.salaryCatalog.revision&&salarySerialized(salary.catalog.items)===salarySerialized(boot.salaryCatalog.items),'PROGRAM_PREPARED_BASE_CHANGED','Los dos maestros consultados no corresponden a la misma base. Volvé a revisar el archivo completo.');
 require(pins.scopeVersion===salary.scopeVersion&&pins.classificationVersion===salary.classification.version&&pins.salaryVersion===salary.catalog.version&&pins.salaryRevision===salary.catalog.revision&&pins.programVersion===boot.program.version&&pins.programRevision===boot.program.revision&&pins.catalogueItemsSha256===await hash(salary.catalog.items)&&pins.programmeDefinitionSha256===await hash(boot.program.definition),'PROGRAM_PREPARED_BASE_CHANGED','Cambió el ámbito, encuadre, maestro o programa. Rehacé la preparación contra las fuentes actuales; el borrador anterior se conserva.');
 require(salarySerialized(salaryItems(file.draft.masterItems))===salarySerialized(salary.catalog.items),'PROGRAM_PREPARED_MASTER_CHANGED','El archivo requiere un maestro distinto. No se sustituyó ni se propuso un maestro desde esta carga.');
 require(requestBytes(file.draft.programme,boot)<=OWN_PROGRAM_MAX_BYTES,'PROGRAM_PREPARED_COMMAND_LIMIT','El programa completo supera el envío de 4 MiB, incluida la reserva para el fundamento. No se recorta ni se divide.');
 const baseDraft=inert(currentDraft),blankDraft=salaryExact(baseDraft,['rules','bindings','totalsPrecision'])&&Array.isArray(baseDraft.rules)&&baseDraft.rules.length===0&&Array.isArray(baseDraft.bindings)&&baseDraft.bindings.length===0&&baseDraft.totalsPrecision===null;
 require(blankDraft||baseDraft.rules?.length>0,'PROGRAM_PREPARED_DRAFT_INCOMPLETE','El borrador local está incompleto. Conservamos sus datos; revisalo antes de sustituirlo con un archivo.');
 if(!blankDraft)ownProgramStructure(baseDraft);
 const program=ownProgramDefinition(file.draft.programme,boot.salaryCatalog.items);ownProgramHistory(boot.program.definition,program);
 // Keep the same new-rule precision policy as the existing propose path.
 prepareProgramWorkspace(boot,program,maximumReason);
 const definitions=new Map(),typed=new Map(),master=new Map(salary.catalog.items.map(r=>[salaryRowKey(r),r]));
 for(const definition of file.draft.definitions){
  require(salaryExact(definition,[...definitionFields,...(roleVersion?['role']:[])])&&typeof definition.identity==='string'&&salaryHash(definition.sourceSha256)&&(units.includes(definition.outputUnit)||roleVersion&&definition.role==='input'&&definition.outputUnit===null));
  const row=salaryItems([definition.catalogue])[0],identity=row.kind+':'+row.agreementCode+':'+row.code;
  require(['concept','auxiliary'].includes(row.kind)&&definition.identity===identity&&!definitions.has(identity)&&count.allAgreements.includes(row.agreementCode)&&row.active===true&&row.validFrom<=pins.period&&(row.validUntil===null||row.validUntil>=pins.period)&&salarySerialized(master.get(salaryRowKey(row)))===salarySerialized(row));
  require(!roleVersion||roles.includes(definition.role));
  if(roleVersion&&definition.role==='payable')require(row.kind==='concept'&&row.nature!=='auxiliary');
  if(roleVersion&&definition.role==='dependency')require(row.kind==='auxiliary'&&row.nature==='auxiliary');
  if(definition.quantity!==null)require(salaryExact(definition.quantity,['unit','stage','rounding','expression','sourceReference','sourceSha256'])&&row.kind==='concept'&&definition.quantity.unit===row.unit&&salaryHash(definition.quantity.sourceSha256)&&['exact','rounded'].includes(definition.quantity.stage)&&((definition.quantity.stage==='exact')===(definition.quantity.rounding===null)));
  definitions.set(identity,definition);
 }
 require(count.allAgreements.every(a=>[...definitions.values()].some(d=>d.catalogue.agreementCode===a)));
 const fullRules=new Map(program.rules.map(r=>[ownProgramRuleKey(r,program.namespaceVersion),r]));
 for(const rule of normalizeOwnPayrollRules(file.draft.typedRules,{namespaced:ownProgramNamespaced(program),typedConditions:ownProgramConditions(program)})){
  const identity=ruleIdentity(rule),definition=definitions.get(identity);
  require(definition&&(!roleVersion||definition.role!=='input')&&!typed.has(identity)&&salarySerialized(fullRules.get(ownProgramRuleKey(rule,program.namespaceVersion)))===salarySerialized(rule)&&rule.unit===definition.outputUnit&&rule.nature===definition.catalogue.nature&&rule.validFrom===definition.catalogue.validFrom&&rule.validUntil===definition.catalogue.validUntil&&rule.ruleReference===definition.catalogue.ruleReference);
  typed.set(identity,rule);
 }
 const inputDefinitions=[...definitions.values()].filter(d=>roleVersion&&d.role==='input'),inputs=new Set(inputDefinitions.map(d=>d.identity)),consumed=new Set();
 for(const edge of file.dependencies){
  require(salaryExact(edge,['from','path','to','stage'])&&['from','path','to','stage'].every(k=>typeof edge[k]==='string'));
  if(edge.stage==='declared_input_binding'&&inputs.has(edge.to)){
   const d=definitions.get(edge.to);require(program.bindings.some(b=>b.agreementCode===d.catalogue.agreementCode&&b.sourceCode===d.catalogue.code&&(d.catalogue.kind==='auxiliary'?b.sourceKind==='auxiliary_parameter':['parameter','monthly_quantity','monthly_amount','fixed_quantity','fixed_amount'].includes(b.sourceKind))));
   consumed.add(edge.to);
  }
  if(edge.stage==='declared_quantity_phase'){
   const id=edge.to.replace(/^quantity:/,'concept:');if(inputs.has(id)){const d=definitions.get(id);require(d.quantity!==null&&file.trace.some(t=>t.phase==='quantity'&&t.quantity===edge.to));consumed.add(id);}
  }
 }
 const expectedTyped=definitions.size-inputDefinitions.length;
 require(count.typedRules===expectedTyped&&[...definitions].every(([id,d])=>roleVersion&&d.role==='input'?!typed.has(id):typed.has(id)));
 if(roleVersion)require(count.expectedTypedRules===expectedTyped&&count.inputDefinitions===inputDefinitions.length&&count.consumedInputDefinitions===consumed.size&&consumed.size===inputDefinitions.length);
 for(const d of inputDefinitions)require(!program.rules.some(r=>ruleIdentity(r)===d.identity&&r.validFrom<=pins.period&&(r.validUntil===null||r.validUntil>=pins.period)));
 require(salaryExact(file.context,['version','period','month'])&&file.context.version==='own-programme-source-period-context.v1'&&file.context.period===pins.period&&salaryExact(file.context.month,['reference','unit','value','nativeBindingSupported'])&&file.context.month.reference==='L[101]'&&file.context.month.unit==='units'&&file.context.month.value===periodContextFields(pins.period).monthNumber&&file.context.month.nativeBindingSupported===ownProgramPeriodContext(program));
 return freeze({version:OWN_PROGRAM_PREPARED_REVIEW_VERSION,file,baseDefinition:salarySerialized(inert(currentDraft)),program,summary:{fileVersion:file.version,period:pins.period,definitions:definitions.size,typedRules:typed.size,inputDefinitions:inputDefinitions.length,consumedInputDefinitions:consumed.size,totalRules:program.rules.length,totalBindings:program.bindings.length,agreements:count.allAgreements.slice(),preparationSha256:pins.preparationSha256,sourceSha256:pins.sourceSha256,commandBytesWithMaximumReason:requestBytes(program,boot)}});
}
export async function reviewPreparedProgramDraft(salary,programme,currentDraft,text){return reviewParsed(salary,programme,currentDraft,parse(text));}
export async function applyPreparedProgramDraft(salary,programme,currentDraft,review){
 const plan=inert(review);require(salaryExact(plan,['version','file','baseDefinition','program','summary'])&&plan.version===OWN_PROGRAM_PREPARED_REVIEW_VERSION);
 require(plan.baseDefinition===salarySerialized(inert(currentDraft)),'PROGRAM_PREPARED_DRAFT_CHANGED','Cambió el borrador después de la revisión. Volvé a revisar el archivo completo antes de aplicarlo.');
 const checked=await reviewParsed(salary,programme,currentDraft,plan.file);
 require(salarySerialized(checked)===salarySerialized(plan),'PROGRAM_PREPARED_REVIEW_CHANGED','Cambió la revisión del archivo. No se cambió el borrador.');
 return structuredClone(checked.program);
}
