// Pure preparation of reviewed typed evidence. No SQL, IO, formula text execution or approval.
import { createHash } from 'node:crypto';
import { salaryBootstrap, salaryItems, salaryDiff, salaryRowKey, salarySerialized } from '../assets/native-salary-catalog-model.js';
import { ownProgramBootstrap, ownProgramDefinition, ownProgramHistory, ownProgramRuleKey } from '../assets/own-payroll-program-model.js';
import { OWN_PAYROLL_NAMESPACE_VERSION, OWN_PAYROLL_LIMITS } from '../assets/own-payroll-engine.js';

import {ownProgramPeriodContext,OWN_PAYROLL_PERIOD_CONTEXT_VERSION,periodContextFields} from '../assets/own-payroll-period-context.js';
export const OWN_PROGRAMME_SOURCE_VERSION = 'own-payroll-programme-source-preparation.v1';
const hash = v => createHash('sha256').update(salarySerialized(v)).digest('hex');
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const code = v => typeof v === 'string' && /^[0-9]{1,9}$/.test(v);
const text = v => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC') && v.length > 0 && v.length <= 180 && !/[<>\x00-\x1f\x7f]/.test(v);
const reference = v => typeof v === 'string' && /^[RNIALU]\[[0-9]{1,9}\]$/.test(v);
const exact = (v, keys) => v && !Array.isArray(v) && Object.keys(v).sort().join('|') === [...keys].sort().join('|');
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
export class OwnProgrammePreparationError extends Error {
  constructor(code) { super(code); this.name = 'OwnProgrammePreparationError'; this.code = code; }
}
const require = (value, code = 'PREPARATION_CONTRACT_INVALID') => { if (!value) throw new OwnProgrammePreparationError(code); };
// Read descriptors before values. Never invoke a supplied accessor/toJSON or coerce a decimal.
function inert(value, depth = 0, ancestors = new Set(), budget = { n: 0 }) {
  require(depth <= 48 && ++budget.n <= 250000, 'PREPARATION_LIMIT');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') { require(Number.isSafeInteger(value)); return value; }
  require(value && typeof value === 'object' && !ancestors.has(value));
  const array = Array.isArray(value), descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  require(array ? Object.getPrototypeOf(value) === Array.prototype && keys.length === value.length + 1 && Array.from({ length: value.length }, (_,i) => String(i)).every(k => descriptors[k]) : Object.getPrototypeOf(value) === Object.prototype);
  require(keys.every(k => typeof k === 'string' && Object.hasOwn(descriptors[k], 'value') && (array && k === 'length' || descriptors[k].enumerable)));
  ancestors.add(value);
  const result = array ? Array.from({ length: value.length }, (_,i) => inert(descriptors[String(i)].value,depth+1,ancestors,budget)) : Object.fromEntries(keys.map(k => [k,inert(descriptors[k].value,depth+1,ancestors,budget)]));
  ancestors.delete(value); return result;
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const identity = d => `${d.kind}:${d.agreementCode}:${d.code}`;
const phaseIdentity = d => `quantity:${d.agreementCode}:${d.code}`;
const definitionFields = ['kind','agreementCode','code','label','active','nature','quantityUnit','outputUnit','precision','validFrom','validUntil','value','dependencies','ruleReference','sourceSha256','liquidationTypes','rounding','expression','quantity'];
const nativeLeaves = new Map([['literal',['op','unit','value']],['concept',['op','code','stage']],['auxiliary',['op','code','stage']]]);
const nativeChildren = new Map([['add',['left','right']],['subtract',['left','right']],['multiply',['left','right']],['divide',['left','right']],['min',['left','right']],['max',['left','right']],['compare',['left','right']],['choose',['condition','then','else']],['round',['value']],['convert',['value']]]);

/**
 * Input: two complete current model bootstraps plus a complete typed evidence bundle.
 * Expressions use native nodes, source/source_match nodes, quantity nodes and period_month.
 * Source SQL/formula strings are deliberately not accepted. Unresolved semantics return incidents.
 * A returned programme is only a proposal draft against an already approved exact catalogue;
 * this function never emits a command, request key, approval or calculated result.
 */
export function prepareOwnPayrollProgrammeSource(raw) {
  const input = inert(raw);
  require(Buffer.byteLength(JSON.stringify(input),'utf8') <= 12 * 1024 * 1024, 'PREPARATION_LIMIT');
  require(exact(input,['version','salary','programme','period','agreementCodes','source','definitions','bindings','programmeOptions','totalsPrecision']) && input.version === OWN_PROGRAMME_SOURCE_VERSION);
  const declaredPeriodContext=periodContextFields(input.period);
  require(Array.isArray(input.agreementCodes) && input.agreementCodes.length > 0 && input.agreementCodes.length <= 1000 && input.agreementCodes.every(code) && new Set(input.agreementCodes).size === input.agreementCodes.length);
  require(exact(input.source,['sha256','complete','expectedDefinitions']) && digest(input.source.sha256) && typeof input.source.complete === 'boolean' && Number.isSafeInteger(input.source.expectedDefinitions) && input.source.expectedDefinitions > 0);
  require(Array.isArray(input.definitions) && input.definitions.length > 0 && input.definitions.length <= OWN_PAYROLL_LIMITS.rules && Array.isArray(input.bindings) && input.bindings.length <= 1000, 'PREPARATION_LIMIT');
  require(exact(input.programmeOptions,Object.keys(input.programmeOptions ?? {})) && input.programmeOptions.namespaceVersion === OWN_PAYROLL_NAMESPACE_VERSION && Object.keys(input.programmeOptions).every(k => ['namespaceVersion','employmentFactsVersion','workingTimeVersion','agreementWorkingTimeVersion','periodContextVersion','salaryConditionsVersion','periodParticipation','monthlyDayDeclarationVersion','monthlyDaysVersion','monthlyDaysPolicy'].includes(k)));
  const salary = salaryBootstrap(input.salary), programme = ownProgramBootstrap(input.programme);
  require(salary.scopeVersion === programme.scopeVersion && salary.catalog.version === programme.salaryCatalog.version && salary.catalog.revision === programme.salaryCatalog.revision && salarySerialized(salary.catalog.items) === salarySerialized(programme.salaryCatalog.items), 'PREPARATION_BASE_CHANGED');
  const incidents = [], trace = [], dependencies = [], incidentKeys = new Set();
  const incident = (code, definition = null, path = null, sourceReference = null) => { const i = {code,definition,path,sourceReference}, k = salarySerialized(i); if (!incidentKeys.has(k)) { incidentKeys.add(k); incidents.push(i); } };
  if (!input.source.complete || input.source.expectedDefinitions !== input.definitions.length) incident('SOURCE_SET_INCOMPLETE');
  const definitions = new Map();
  for (const d of input.definitions) {
    require(exact(d,definitionFields) && ['concept','auxiliary'].includes(d.kind) && code(d.agreementCode) && code(d.code) && text(d.label) && text(d.ruleReference) && digest(d.sourceSha256) && input.agreementCodes.includes(d.agreementCode));
    require(!definitions.has(identity(d)), 'PREPARATION_DEFINITION_DUPLICATE'); definitions.set(identity(d),d);
    require(Array.isArray(d.dependencies) && d.dependencies.every(text));
    if (d.quantity !== null) require(d.kind === 'concept' && exact(d.quantity,['unit','stage','rounding','expression','sourceReference','sourceSha256']) && text(d.quantity.sourceReference) && digest(d.quantity.sourceSha256));
    if (d.active !== true) incident(d.active === false ? 'SOURCE_DEFINITION_INACTIVE' : 'SOURCE_ACTIVATION_UNRESOLVED',identity(d));
    if (d.validFrom !== null && (input.period < d.validFrom || d.validUntil !== null && input.period > d.validUntil)) incident('DEFINITION_PERIOD_OUTSIDE_VALIDITY',identity(d));
    if (d.quantity !== null && d.quantity.unit !== d.quantityUnit) incident('QUANTITY_DEFINITION_UNIT_MISMATCH',identity(d),'quantity');
  }
  for (const agreement of input.agreementCodes) if (![...definitions.values()].some(d => d.agreementCode === agreement)) incident('AGREEMENT_DEFINITION_MISSING',agreement);
  const bindings = new Map(), bindingKeys = new Set();
  for (const b of input.bindings) {
    require(exact(b,['agreementCode','reference','sourceSha256','binding']) && code(b.agreementCode) && input.agreementCodes.includes(b.agreementCode) && reference(b.reference) && digest(b.sourceSha256));
    const id = `${b.agreementCode}:${b.reference}`; require(!bindings.has(id),'PREPARATION_BINDING_DUPLICATE'); bindings.set(id,b);
    if (b.binding !== null) {
      require(b.binding.agreementCode === b.agreementCode && typeof b.binding.key === 'string');
      const key = `${b.agreementCode}:${b.binding.key}`; require(!bindingKeys.has(key),'PREPARATION_BINDING_DUPLICATE'); bindingKeys.add(key);
    }
  }
  const monthNumber=declaredPeriodContext.monthNumber;
  const hasPeriodContext=ownProgramPeriodContext(input.programmeOptions),periodBindings=new Map();
  const context = {version:'own-programme-source-period-context.v1',period:input.period,month:{reference:'L[101]',unit:'units',value:monthNumber,nativeBindingSupported:hasPeriodContext}};
  const counters = new Map(), resolving = new Set(), quantityUsed = new Set();
  function bindingFor(d, reference, unit, path) {
    if(reference==='L[101]'){
      if(!hasPeriodContext){incident('PERIOD_MONTH_BINDING_UNSUPPORTED',identity(d),path,reference);return null;}
      if(unit!=='units'){incident('SOURCE_BINDING_UNIT_MISMATCH',identity(d),path,reference);return null;}
      const supplied=bindings.get(`${d.agreementCode}:${reference}`),b=supplied?.binding;
      if(b&&(b.sourceKind!=='period_context_fact'||b.sourceField!=='monthNumber'||b.unit!=='units'||b.combine!=='single'||b.onMissing!=='error')){incident('PERIOD_MONTH_BINDING_CONFLICT',identity(d),path,reference);return null;}
      const binding=b??{agreementCode:d.agreementCode,key:'periodMonthNumber',unit:'units',sourceKind:'period_context_fact',sourceField:'monthNumber',combine:'single',onMissing:'error',ruleReference:'Mes del período de liquidación declarado; contexto nativo versionado.'};
      periodBindings.set(d.agreementCode+':'+binding.key,binding);
      trace.push({definition:identity(d),phase:'binding',path,sourceReference:reference,sourceSha256:supplied?.sourceSha256??d.sourceSha256,key:binding.key,unit,contextVersion:OWN_PAYROLL_PERIOD_CONTEXT_VERSION});
      return binding;
    }
    const evidence = bindings.get(`${d.agreementCode}:${reference}`);
    if (!evidence?.binding) { incident('SOURCE_BINDING_UNRESOLVED',identity(d),path,reference); return null; }
    if (evidence.binding.unit !== unit || unit === null) { incident('SOURCE_BINDING_UNIT_MISMATCH',identity(d),path,reference); return null; }
    trace.push({definition:identity(d),phase:'binding',path,sourceReference:reference,sourceSha256:evidence.sourceSha256,key:evidence.binding.key,unit});
    return evidence.binding;
  }
  function lower(d, node, path, depth = 0, owner = identity(d)) {
    const id = identity(d), count = (counters.get(id) ?? 0) + 1; counters.set(id,count);
    require(depth <= OWN_PAYROLL_LIMITS.depth && count <= OWN_PAYROLL_LIMITS.nodes, 'PREPARATION_EXPRESSION_LIMIT');
    if (node === null) { incident('EXPRESSION_UNRESOLVED',id,path); return null; }
    require(node && typeof node === 'object' && !Array.isArray(node) && typeof node.op === 'string');
    trace.push({definition:id,phase:'expression',path,op:node.op,sourceSha256:d.sourceSha256});
    if (node.op === 'unresolved') { require(exact(node,['op','reference','unit']) && text(node.reference)); incident('EXPRESSION_UNRESOLVED',id,path,node.reference); return null; }
    if(node.op==='period_month'){require(exact(node,['op']));const b=bindingFor(d,'L[101]','units',path);return b?{op:'input',key:b.key,unit:'units'}:null;}
    if (node.op === 'source') { require(exact(node,['op','reference','unit']) && reference(node.reference)); const b = bindingFor(d,node.reference,node.unit,path); return b ? {op:'input',key:b.key,unit:node.unit} : null; }
    if (node.op === 'source_match') { require(exact(node,['op','reference','type','operator','value']) && reference(node.reference)); const b = bindingFor(d,node.reference,node.type,path); return b ? {op:'match',key:b.key,type:node.type,operator:node.operator,value:node.value} : null; }
    if (node.op === 'quantity') {
      require(exact(node,['op','code','unit']) && code(node.code));
      const targetId = `concept:${d.agreementCode}:${node.code}`, target = definitions.get(targetId), phase = target && phaseIdentity(target);
      dependencies.push({from:owner,path,to:`quantity:${d.agreementCode}:${node.code}`,stage:'declared_quantity_phase'});
      if (!target?.quantity) { incident('QUANTITY_PHASE_MISSING',id,path,`U[${node.code}]`); return null; }
      if (resolving.has(phase)) { incident('QUANTITY_PHASE_CYCLE',id,path,`U[${node.code}]`); return null; }
      const q = target.quantity;
      quantityUsed.add(phase);
      if (q.unit !== node.unit || q.unit === null) { incident('QUANTITY_PHASE_UNIT_MISMATCH',id,path,`U[${node.code}]`); return null; }
      if (!['exact','rounded'].includes(q.stage) || q.stage === 'exact' && q.rounding !== null || q.stage === 'rounded' && q.rounding === null) { incident('QUANTITY_PHASE_STAGE_UNRESOLVED',id,path,`U[${node.code}]`); return null; }
      trace.push({definition:id,phase:'quantity',path,quantity:phase,unit:q.unit,stage:q.stage,rounding:q.rounding,sourceReference:q.sourceReference,sourceSha256:q.sourceSha256});
      resolving.add(phase); const value = lower(target,q.expression,`${path}/U[${node.code}]`,depth+1,phase); resolving.delete(phase);
      return value === null ? null : q.stage === 'rounded' ? {op:'round',value,rounding:q.rounding} : value;
    }
    if (nativeLeaves.has(node.op)) {
      require(exact(node,nativeLeaves.get(node.op)));
      if (node.op !== 'literal') { require(code(node.code)); dependencies.push({from:owner,path,to:`${node.op}:${d.agreementCode}:${node.code}`,stage:node.stage}); if (!['exact','rounded'].includes(node.stage)) { incident('REFERENCE_STAGE_UNRESOLVED',id,path); return null; } }
      return node;
    }
    require(nativeChildren.has(node.op), 'PREPARATION_OPERATION_UNSUPPORTED');
    const children = nativeChildren.get(node.op), extras = node.op === 'compare' ? ['operator'] : node.op === 'round' ? ['rounding'] : node.op === 'convert' ? ['unit','factor','conversionReference'] : [];
    require(exact(node,['op',...children,...extras]));
    const lowered = Object.fromEntries(children.map(k => [k,lower(d,node[k],`${path}/${k}`,depth+1,owner)]));
    return Object.values(lowered).some(v => v === null) ? null : {...node,...lowered};
  }
  const definitionDrafts = [], proposedRows = [], typedRules = [];
  for (const d of definitions.values()) {
    const row = {kind:d.kind,agreementCode:d.agreementCode,categoryCode:null,code:d.code,label:d.label,active:d.active,nature:d.nature,unit:d.kind === 'concept' ? d.quantityUnit : d.outputUnit,precision:d.precision,validFrom:d.validFrom,validUntil:d.validUntil,value:d.value,dependencies:d.dependencies,ruleReference:d.ruleReference};
    definitionDrafts.push({identity:identity(d),sourceSha256:d.sourceSha256,catalogue:row,outputUnit:d.outputUnit,quantity:d.quantity});
    try { salaryItems([{...row,dependencies:[]}]); proposedRows.push(row); } catch (error) { incident('CATALOGUE_DEFINITION_UNRESOLVED',identity(d)); }
    if (d.rounding === null) incident('ROUNDING_UNRESOLVED',identity(d));
    const expression = lower(d,d.expression,'amount');
    if (!Array.isArray(d.liquidationTypes) || d.liquidationTypes.length === 0) incident('LIQUIDATION_TYPES_UNRESOLVED',identity(d));
    else if (expression !== null) typedRules.push({code:d.code,agreementCode:d.agreementCode,nature:d.nature,unit:d.outputUnit,validFrom:d.validFrom,validUntil:d.validUntil,liquidationTypes:d.liquidationTypes,ruleReference:d.ruleReference,rounding:d.rounding,expression});
  }
  for (const d of definitions.values()) if (d.quantity !== null && !quantityUsed.has(phaseIdentity(d))) incident('QUANTITY_PHASE_NOT_EMBEDDED',identity(d),'quantity');
  const masterRows = salary.catalog.items.map(r => ({...r,dependencies:[...r.dependencies]})), approvedKeys = new Map(masterRows.map(r => [salaryRowKey(r),r]));
  let masterChanged = false;
  for (const row of proposedRows) { const old = approvedKeys.get(salaryRowKey(row)); if (old && salarySerialized(old) !== salarySerialized(row)) incident('CATALOGUE_EXISTING_DEFINITION_CONFLICT'); else if (!old) { masterRows.push(row); masterChanged = true; } }
  let masterDraft = null;
  try { if (proposedRows.length === input.definitions.length && input.source.complete && input.source.expectedDefinitions === input.definitions.length) { salaryDiff(salary.catalog.items,masterRows); masterDraft = salaryItems(masterRows); } } catch (error) { incident('CATALOGUE_COMPLETE_CONTRACT_REJECTED'); }
  if (salary.catalog.revision === 0 || masterChanged) incident('CATALOGUE_APPROVAL_REQUIRED');
  const prior = programme.program.definition, rules = prior ? [...prior.rules] : [], nativeBindings = prior ? [...prior.bindings] : [];
  for (const r of typedRules) {
    const key = ownProgramRuleKey({...r,liquidationTypes:[...r.liquidationTypes].sort()},OWN_PAYROLL_NAMESPACE_VERSION);
    const previous = rules.find(p => ownProgramRuleKey(p,OWN_PAYROLL_NAMESPACE_VERSION) === key);
    if (previous && salarySerialized(previous) !== salarySerialized(r)) incident('PROGRAMME_EXISTING_RULE_CONFLICT'); else if (!previous) rules.push(r);
  }
  for (const b of bindings.values()) if (b.binding) { const old = nativeBindings.find(n => n.agreementCode === b.agreementCode && n.key === b.binding.key); if (old && salarySerialized(old) !== salarySerialized(b.binding)) incident('PROGRAMME_EXISTING_BINDING_CONFLICT'); else if (!old) nativeBindings.push(b.binding); }
  for(const binding of periodBindings.values()){const old=nativeBindings.find(b=>b.agreementCode===binding.agreementCode&&b.key===binding.key);if(old&&salarySerialized(old)!==salarySerialized(binding))incident('PROGRAMME_EXISTING_BINDING_CONFLICT');else if(!old)nativeBindings.push(binding);}
  const graph = new Map([...definitions.keys(),...[...definitions.values()].filter(d => d.quantity !== null).map(phaseIdentity),...(prior?.rules ?? []).map(r => `${r.nature === 'auxiliary' ? 'auxiliary' : 'concept'}:${r.agreementCode}:${r.code}`)].map(k => [k,[]]));
  for (const edge of dependencies) if (!graph.has(edge.to)) incident('DEPENDENCY_DEFINITION_MISSING',edge.from,edge.path,edge.to); else graph.get(edge.from)?.push(edge.to);
  const visiting = new Set(), visited = new Set();
  function inspectGraph(id, depth = 0) { if (visiting.has(id)) { incident('DEPENDENCY_CYCLE',id); return; } if (visited.has(id)) return; if (depth > OWN_PAYROLL_LIMITS.dependencyDepth) { incident('DEPENDENCY_DEPTH_LIMIT',id); return; } visiting.add(id); for (const next of graph.get(id)) inspectGraph(next,depth+1); visiting.delete(id); visited.add(id); }
  for (const id of graph.keys()) inspectGraph(id);
  let programmeDraft = null;
  if (incidents.length === 0 && typedRules.length === input.definitions.length) {
    try {
      const draft = ownProgramDefinition({...input.programmeOptions,rules,bindings:nativeBindings,totalsPrecision:input.totalsPrecision},salary.catalog.items);
      ownProgramHistory(prior,draft); programmeDraft = draft;
    } catch (error) { incident('PROGRAMME_CURRENT_CONTRACT_REJECTED',null,error.code ?? null); }
  }
  if (!salary.permissions.canPropose) incident('MASTER_PROPOSAL_NOT_PERMITTED');
  if (!programme.permissions.canPropose) { incident('PROGRAMME_PROPOSAL_NOT_PERMITTED'); programmeDraft = null; }
  const result = {version:OWN_PROGRAMME_SOURCE_VERSION,status:programmeDraft ? 'proposal_draft' : 'not_presentable',approved:false,executable:false,payrollCalculated:false,payrollPosted:false,sourceHashStatus:'declared_evidence_not_backup_revalidation',basePinStatus:'validated_model_snapshots_not_remote_authorization',
    pins:{scopeVersion:salary.scopeVersion,classificationVersion:salary.classification.version,salaryVersion:salary.catalog.version,salaryRevision:salary.catalog.revision,programVersion:programme.program.version,programRevision:programme.program.revision,programmeDefinitionSha256:hash(programme.program.definition),sourceSha256:input.source.sha256,evidenceSha256:hash({source:input.source,period:input.period,agreementCodes:input.agreementCodes,definitions:input.definitions,bindings:input.bindings,programmeOptions:input.programmeOptions,totalsPrecision:input.totalsPrecision}),catalogueItemsSha256:hash(salary.catalog.items),period:input.period},
    completeness:{sourceDeclaredComplete:input.source.complete,expectedDefinitions:input.source.expectedDefinitions,receivedDefinitions:input.definitions.length,typedRules:typedRules.length,allAgreements:input.agreementCodes.slice().sort(compare),masterContractComplete:masterDraft !== null,programmeContractComplete:programmeDraft !== null},
    presentable:{master:masterChanged && masterDraft !== null && salary.permissions.canPropose && !incidents.some(i => ['SOURCE_SET_INCOMPLETE','AGREEMENT_DEFINITION_MISSING','CATALOGUE_EXISTING_DEFINITION_CONFLICT'].includes(i.code)),programme:programmeDraft !== null},
    context,incidents,dependencies,trace,draft:{definitions:definitionDrafts,typedRules,masterItems:masterDraft,programme:programmeDraft}};
  result.pins.preparationSha256 = hash(result);
  require(Buffer.byteLength(JSON.stringify(result),'utf8') <= 16 * 1024 * 1024,'PREPARATION_LIMIT');
  return freeze(result);
}
