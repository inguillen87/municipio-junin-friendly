// Formula approval and period values have different lifetimes. This opt-in
// resolves only the immutable, complete catalogue frozen in the capture.
import {payrollRequire as require,OwnPayrollError,decimal,quantize} from './own-payroll-exact.js';
import {salaryExact,salaryHash,salaryUuid,salaryItems,salaryRowKey,salarySerialized} from './native-salary-catalog-model.js';
import {policySha256,policyMonth,policyCode,policyCanonicalText} from './own-payroll-policy-validity.js';
import {participationRules} from './own-period-participation-program.js';
import {quantityProgramBindingRules} from './own-payroll-quantity-program.js';

export const OWN_APPROVED_PERIOD_VALUES_VERSION='own-approved-period-values.v1';
export const OWN_CATALOGUE_VALUES_CAPTURE_VERSION='own-approved-period-values-capture.v1';
export const ownProgramCatalogueValues=p=>p?.catalogueValueResolutionVersion===OWN_APPROVED_PERIOD_VALUES_VERSION;
export const catalogueValueProgramFields=p=>Object.hasOwn(p??{},'catalogueValueResolutionVersion')?['catalogueValueResolutionVersion']:[];
export const catalogueValueSource=kind=>['parameter','auxiliary_parameter','scale','scale_reference'].includes(kind);
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);
const active=(r,period,type)=>r.validFrom<=period&&(r.validUntil===null||r.validUntil>=period)&&(!type||r.liquidationTypes.includes(type));
const overlaps=(a,b)=>a.validFrom<=(b.validUntil??'9999-12')&&b.validFrom<=(a.validUntil??'9999-12');
const key=b=>b.agreementCode+':'+b.key;
const inputs=n=>!n||typeof n!=='object'?[]:['input','match'].includes(n.op)?[n.key]:['left','right','value','condition','then','else'].flatMap(k=>inputs(n[k]));
const bindingRules=p=>[...participationRules(p),...quantityProgramBindingRules(p)];
const sourceKind=b=>['scale','scale_reference'].includes(b.sourceKind)?'scale':b.sourceKind==='auxiliary_parameter'?'auxiliary':'concept';
const sourceAgreement=b=>b.sourceKind==='scale_reference'?b.sourceAgreementCode:b.agreementCode;
const catalogueKey=(kind,agreement,code,category)=>[kind,agreement,code,category??''].join(':');
const compatible=(d,b)=>d.active&&d.kind===sourceKind(b)&&d.code===b.sourceCode&&d.agreementCode===sourceAgreement(b)&&d.unit===b.unit
 &&(d.kind!=='concept'||d.nature!=='auxiliary')&&(b.sourceKind!=='scale_reference'||d.categoryCode===b.sourceCategoryCode);

export function normalizeCatalogueValueProgram(p){
 const enabled=ownProgramCatalogueValues(p);
 require(!Object.hasOwn(p,'catalogueValueResolutionVersion')||enabled,'CATALOGUE_VALUE_PROGRAM_INVALID','Revisá la versión explícita de valores aprobados por período.');
 require(!enabled||p.namespaceVersion==='own-payroll-namespaces.v2','CATALOGUE_VALUE_PROGRAM_INVALID','Los valores por período requieren referencias separadas de conceptos y auxiliares.');
 return enabled?{catalogueValueResolutionVersion:OWN_APPROVED_PERIOD_VALUES_VERSION}:{};
}
export function catalogueValueProgramHistory(before,after){
 require(!ownProgramCatalogueValues(before)||ownProgramCatalogueValues(after),'PROGRAM_HISTORY_REQUIRED','Conservá la política aprobada de valores por período.');
}
// A type definition must intersect the consumer's validity. It need not carry
// a value for every future month. Output definitions retain their own checks.
export function catalogueValueDefinitionAvailable(rows,rule,binding){
 const found=rows.filter(d=>compatible(d,binding)&&overlaps(d,rule));
 return found.length>0&&new Set(found.map(d=>d.nature)).size===1;
}
export function catalogueSourceContracts(program,originalItems){
 normalizeCatalogueValueProgram(program);
 const rows=salaryItems(originalItems),rules=bindingRules(program);
 return program.bindings.filter(b=>catalogueValueSource(b.sourceKind)).map(b=>{
  const consumers=rules.filter(r=>r.agreementCode===b.agreementCode&&inputs(r.expression).includes(b.key));
  require(consumers.length>0&&consumers.every(r=>catalogueValueDefinitionAvailable(rows,r,b)),'CATALOGUE_VALUE_DEFINITION_MISSING','Falta la identidad tipada de una fuente en el catálogo original aprobado.');
  const found=rows.filter(d=>compatible(d,b)&&consumers.some(r=>overlaps(d,r))),natures=[...new Set(found.map(d=>d.nature))];
  require(natures.length===1,'CATALOGUE_VALUE_SOURCE_CHANGED','La fuente original declara naturalezas incompatibles.');
  return {bindingAgreementCode:b.agreementCode,key:b.key,sourceKind:b.sourceKind,kind:sourceKind(b),code:b.sourceCode,agreementCode:sourceAgreement(b),
   categorySelector:b.sourceKind==='scale'?'employee':b.sourceKind==='scale_reference'?'explicit':'none',categoryCode:b.sourceKind==='scale_reference'?b.sourceCategoryCode:null,unit:b.unit,nature:natures[0]};
 }).sort((a,b)=>a.bindingAgreementCode<b.bindingAgreementCode?-1:a.bindingAgreementCode>b.bindingAgreementCode?1:a.key<b.key?-1:a.key>b.key?1:0);
}

/** SQL authenticates both immutable approval events, scoped to tenant/binding.
 * Readers check the whole frozen preimage and original source contracts again;
 * they never read the live catalogue or rewrite the programme salaryVersion.
 */
export function catalogueValueResolver({programState,sourceInventory,period}){
 const program=programState?.program,definition=program?.definition,proof=sourceInventory?.catalogueValues;
 if(!ownProgramCatalogueValues(definition)){
  require(proof===undefined,'CATALOGUE_VALUE_CAPTURE_INVALID','La captura agregó valores por período sin la política aprobada.');return null;
 }
 normalizeCatalogueValueProgram(definition);
 const catalog=programState.salaryCatalog;
 require(proof&&typeof proof==='object','CATALOGUE_VALUE_CAPTURE_INVALID','Falta la prueba del catálogo aprobado completo y del programa original.');
 policyCanonicalText(proof);
 require(salaryExact(proof,['version','complete','tenantId','sourceBindingId','revision','approvalId','proposalId','catalogueVersion','itemsSha256','itemCount','programVersion','programApprovalId','programProposalId','programSalaryVersion','originalItemsSha256','sourceContractsSha256','sourceContracts'])
  &&proof.version===OWN_CATALOGUE_VALUES_CAPTURE_VERSION&&proof.complete===true
  &&[proof.tenantId,proof.sourceBindingId,proof.approvalId,proof.proposalId,proof.programApprovalId,proof.programProposalId].every(salaryUuid)
  &&[proof.catalogueVersion,proof.itemsSha256,proof.programVersion,proof.programSalaryVersion,proof.originalItemsSha256,proof.sourceContractsSha256].every(salaryHash)
  &&Number.isSafeInteger(proof.revision)&&proof.revision>0&&proof.revision===catalog?.revision&&proof.catalogueVersion===catalog?.version
  &&Number.isSafeInteger(program.revision)&&program.revision>0&&proof.programVersion===program.version&&proof.programApprovalId===program.approvalId&&proof.programProposalId===program.proposalId&&proof.programSalaryVersion===program.salaryVersion
  &&Number.isSafeInteger(proof.itemCount)&&proof.itemCount>0&&proof.itemCount<=10000&&Array.isArray(catalog.items)&&proof.itemCount===catalog.items.length&&policyMonth(period),
 'CATALOGUE_VALUE_CAPTURE_INVALID','La captura no conserva ambas aprobaciones, el ámbito y todos los items del catálogo.');
 require(policySha256(catalog.items)===proof.itemsSha256,'CATALOGUE_VALUE_CAPTURE_INVALID','El catálogo capturado está incompleto o fue alterado.');
 const originals=(programState.proposals??[]).filter(p=>p.id===program.proposalId),original=originals[0];
 require(originals.length===1&&original.status==='approved'&&original.decision?.command==='approve'&&original.decision.revision===program.revision
  &&original.salaryVersion===program.salaryVersion&&same(original.definition,definition)&&policySha256(original.salaryItems)===proof.originalItemsSha256,
 'CATALOGUE_VALUE_CAPTURE_INVALID','Falta la propuesta original aprobada con su catálogo y fórmula íntegros.');
 const contracts=catalogueSourceContracts(definition,original.salaryItems);
 require(same(contracts,proof.sourceContracts)&&policySha256(contracts)===proof.sourceContractsSha256,'CATALOGUE_VALUE_SOURCE_CHANGED','La identidad de las fuentes cambió respecto de la revisión original.');
 // Other catalogue consumers in the same capture must refer to this same
 // approval and scope. SQL authenticates the IDs against immutable events.
 for(const field of ['optionalScales','conditionalSources'])if(sourceInventory[field]!==undefined){
  const other=sourceInventory[field];
  require(other&&['tenantId','sourceBindingId','revision','approvalId','proposalId','catalogueVersion','itemsSha256','itemCount'].every(k=>other[k]===proof[k]),
   'CATALOGUE_VALUE_CAPTURE_INVALID','Las fuentes del mismo cálculo deben conservar el mismo catálogo aprobado y ámbito.');
 }
 const byBinding=new Map(contracts.map(c=>[c.bindingAgreementCode+':'+c.key,c])),rows=salaryItems(catalog.items),bySource=new Map();
 for(const row of rows)if(row.active&&active(row,period)){
  const id=catalogueKey(row.kind,row.agreementCode,row.code,row.categoryCode);
  require(!bySource.has(id),'CATALOGUE_VALUE_CAPTURE_INVALID','Hay más de una fila de catálogo aplicable al mismo período.');
  bySource.set(id,row);
 }
 return (employee,binding)=>{
  const contract=byBinding.get(key(binding));
  require(contract&&binding.agreementCode===employee.agreementCode&&catalogueValueSource(binding.sourceKind)&&binding.combine==='single'&&binding.onMissing==='error'
   &&[employee.agreementCode,employee.categoryCode].every(policyCode)&&salaryUuid(employee.contractId)&&salaryHash(employee.identityToken)&&employee.origin==='MUNICONTROL',
  'CATALOGUE_VALUE_INPUT_INVALID','La fuente necesita el contrato y encuadre nativos capturados.');
  const category=contract.categorySelector==='employee'?employee.categoryCode:contract.categoryCode;
  const row=bySource.get(catalogueKey(contract.kind,contract.agreementCode,contract.code,category));
  if(!row||row.value===null){
   const error=new OwnPayrollError('CATALOGUE_VALUE_MISSING',`Falta el valor aprobado de ${contract.kind} ${contract.code}, convenio ${contract.agreementCode}${category===null?'':', categoría '+category}, período ${period}.`);
   error.catalogueDiagnostic={period,bindingAgreementCode:binding.agreementCode,key:binding.key,sourceKind:binding.sourceKind,agreementCode:contract.agreementCode,categoryCode:category,code:contract.code};throw error;
  }
  require(row.unit===contract.unit&&row.nature===contract.nature&&binding.unit===contract.unit&&binding.sourceKind===contract.sourceKind&&binding.sourceCode===contract.code&&sourceAgreement(binding)===contract.agreementCode
   &&(binding.sourceKind!=='scale_reference'||binding.sourceCategoryCode===contract.categoryCode),
  'CATALOGUE_VALUE_SOURCE_CHANGED','El valor posterior cambió la unidad, naturaleza o identidad de la fuente aprobada.');
  const value=quantize(decimal(row.value),{precision:8,mode:'exact'}).amount;
  const evidence={version:'own-approved-period-value-resolution.v1',catalogueVersion:proof.catalogueVersion,approvalId:proof.approvalId,itemsSha256:proof.itemsSha256,programVersion:program.version,
   sourceContract:contract,period,contractId:employee.contractId,identityToken:employee.identityToken,categoryCode:employee.categoryCode,rowKey:salaryRowKey(row),value};
  return {key:binding.key,unit:binding.unit,value,sourceReference:'Catálogo por período:'+proof.catalogueVersion+':'+policySha256(evidence)};
 };
}
export function approvedCatalogueMatches(payload){
 const p=payload?.programState?.program;
 return p?.revision>0&&(ownProgramCatalogueValues(p.definition)?catalogueValueResolver(payload)!==null:p.salaryVersion===payload.programState.salaryCatalog.version);
}
export function verifyCatalogueValueInputs(payload,input=null){
 const resolve=catalogueValueResolver(payload);if(!resolve)return;
 const definition=payload.programState.program.definition,population=payload.population;
 require(population?.complete===true&&Array.isArray(population.employees)&&population.employees.length>0&&population.employees.length<=10000
  &&new Set(population.employees.map(e=>e.contractId)).size===population.employees.length,
 'CATALOGUE_VALUE_INPUT_INVALID','Falta la población completa de la captura original.');
 if(input!==null)require(Array.isArray(input?.employees)&&input.employees.length===population.employees.length&&new Set(input.employees.map(e=>e.contractId)).size===input.employees.length
  &&input.period===payload.period&&input.liquidationType===payload.liquidationType,'CATALOGUE_VALUE_INPUT_INVALID','La entrada cambió el período o la población capturados.');
 const actualById=new Map((input?.employees??[]).map(e=>[e.contractId,e]));
 const used=new Set(bindingRules(definition).filter(r=>active(r,payload.period,payload.liquidationType)).flatMap(r=>inputs(r.expression).map(k=>r.agreementCode+':'+k)));
 for(const employee of population.employees){
  const actual=actualById.get(employee.contractId);
  if(input!==null)require(actual&&['employeeNumber','agreementCode','departmentCode'].every(k=>actual[k]===employee[k])&&Array.isArray(actual.inputs),'CATALOGUE_VALUE_INPUT_INVALID','La entrada cambió la identidad o el encuadre original.');
  for(const binding of definition.bindings.filter(b=>catalogueValueSource(b.sourceKind)&&b.agreementCode===employee.agreementCode)){
   const expected=used.has(key(binding))?[resolve(employee,binding)]:[];
   if(input!==null)require(same(actual.inputs.filter(i=>i.key===binding.key),expected),'CATALOGUE_VALUE_INPUT_INVALID','La entrada no coincide con el valor de su catálogo congelado, aunque se recalculen sus huellas.');
  }
 }
}
