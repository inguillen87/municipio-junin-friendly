// Opt-in policy: absence of approved scale configuration, never a personal fact.
import {payrollRequire as require,decimal,quantize} from './own-payroll-exact.js';
import {salaryExact,salaryHash,salaryUuid,salaryItems,salaryRowKey,salarySerialized} from './native-salary-catalog-model.js';
import {policySha256,policyMonth,policyCode,policyCanonicalText} from './own-payroll-policy-validity.js';

export const OWN_PAYROLL_OPTIONAL_SCALES_VERSION='own-payroll-optional-scales.v1';
export const OWN_OPTIONAL_SCALE_CATALOGUE_VERSION='own-payroll-optional-scale-catalogue.v1';
export const ownProgramOptionalScales=p=>p?.optionalScalesVersion===OWN_PAYROLL_OPTIONAL_SCALES_VERSION;
export const optionalScaleProgramFields=p=>ownProgramOptionalScales(p)?['optionalScalesVersion']:[];
const active=(r,period,type)=>r.validFrom<=period&&(r.validUntil===null||r.validUntil>=period)&&(!type||r.liquidationTypes.includes(type));
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);
function inputs(n){if(!n||typeof n!=='object')return[];if(n.op==='input'||n.op==='match')return[n.key];return['left','right','value','condition','then','else'].flatMap(k=>inputs(n[k]));}

export function normalizeOptionalScaleProgram(p){
 const enabled=ownProgramOptionalScales(p),bindings=(p.bindings??[]).filter(b=>b.sourceKind==='optional_scale');
 require(!Object.hasOwn(p,'optionalScalesVersion')||enabled,'OPTIONAL_SCALE_PROGRAM_INVALID','La escala opcional requiere su versión explícita.');
 require((!enabled||p.namespaceVersion==='own-payroll-namespaces.v2')&&(!bindings.length||enabled),'OPTIONAL_SCALE_PROGRAM_INVALID','La escala opcional requiere referencias separadas y una política explícita.');
 for(const b of bindings){
  require(b.unit==='money'&&b.combine==='single'&&b.onMissing==='zero','OPTIONAL_SCALE_BINDING_INVALID','La escala opcional usa un importe único; cero sólo cuando no hay configuración aplicable.');
  for(const r of p.rules??[])if(r.agreementCode===b.agreementCode&&inputs(r.expression).includes(b.key))require(r.nature!=='auxiliary'&&r.code===b.sourceCode,'OPTIONAL_SCALE_CONSUMER_INVALID','Cada adicional usa sólo su propia escala por concepto, convenio y categoría.');
  require(!(p.quantityPhases??[]).some(q=>q.agreementCode===b.agreementCode&&inputs(q.expression).includes(b.key)),'OPTIONAL_SCALE_CONSUMER_INVALID','Una escala opcional monetaria no declara cantidades.');
 }
 return enabled?{optionalScalesVersion:OWN_PAYROLL_OPTIONAL_SCALES_VERSION}:{};
}
export function optionalScaleProgramHistory(before,after){
 require(!ownProgramOptionalScales(before)||ownProgramOptionalScales(after),'PROGRAM_HISTORY_REQUIRED','Conservá el contrato explícito de escalas opcionales.');
}

/** Validates the captured proof, not a browser assertion of municipal approval.
 * SQL derives and checks this proof against the immutable approved event. The
 * complete item preimage is hashed once per capture, never once per employee.
 */
export function optionalScaleResolver({programState,sourceInventory,period}){
 const definition=programState?.program?.definition,proof=sourceInventory?.optionalScales;
 if(!ownProgramOptionalScales(definition)){
  require(proof===undefined,'OPTIONAL_SCALE_CAPTURE_INVALID','La captura agregó una fuente opcional que el programa no declara.');return null;
 }
 normalizeOptionalScaleProgram(definition);
 const catalog=programState.salaryCatalog;
 require(proof&&typeof proof==='object','OPTIONAL_SCALE_CAPTURE_INVALID','Falta la prueba original del catálogo aprobado completo.');
 policyCanonicalText(proof);
 require(salaryExact(proof,['version','complete','tenantId','sourceBindingId','revision','approvalId','proposalId','catalogueVersion','itemsSha256','itemCount'])
  &&proof.version===OWN_OPTIONAL_SCALE_CATALOGUE_VERSION&&proof.complete===true
  &&[proof.tenantId,proof.sourceBindingId,proof.approvalId,proof.proposalId].every(salaryUuid)
  &&Number.isSafeInteger(proof.revision)&&proof.revision>0&&proof.revision===catalog?.revision
  &&[proof.catalogueVersion,proof.itemsSha256].every(salaryHash)&&proof.catalogueVersion===catalog?.version
  &&programState.program.revision>0&&programState.program.salaryVersion===catalog.version
  &&Number.isSafeInteger(proof.itemCount)&&proof.itemCount>0&&proof.itemCount<=10000
  &&Array.isArray(catalog.items)&&proof.itemCount===catalog.items.length&&policyMonth(period),
 'OPTIONAL_SCALE_CAPTURE_INVALID','Falta el catálogo aprobado completo y su prueba original de integridad.');
 require(policySha256(catalog.items)===proof.itemsSha256,'OPTIONAL_SCALE_CAPTURE_INVALID','El catálogo capturado no coincide con todos los items aprobados.');
 const rows=salaryItems(catalog.items),byKey=new Map();
 for(const row of rows)if(row.active&&row.kind==='scale'&&active(row,period)){
  const key=[row.agreementCode,row.categoryCode,row.code].join(':');
  require(!byKey.has(key),'OPTIONAL_SCALE_CAPTURE_INVALID','Hay más de una escala aplicable. No se supone cero.');byKey.set(key,row);
 }
 return (employee,binding)=>{
  require(binding.sourceKind==='optional_scale'&&binding.agreementCode===employee.agreementCode&&binding.unit==='money'&&binding.combine==='single'&&binding.onMissing==='zero'
   &&[binding.sourceCode,employee.agreementCode,employee.categoryCode].every(policyCode)&&salaryUuid(employee.contractId)&&salaryHash(employee.identityToken)&&employee.origin==='MUNICONTROL',
  'OPTIONAL_SCALE_INPUT_INVALID','La escala necesita el concepto y el encuadre nativo capturado sin sustituciones.');
  const row=byKey.get([employee.agreementCode,employee.categoryCode,binding.sourceCode].join(':'));
  const value=quantize(decimal(row?row.value:'0'),{precision:8,mode:'exact'}).amount;
  const evidence={version:'own-payroll-optional-scale-resolution.v1',catalogueVersion:proof.catalogueVersion,approvalId:proof.approvalId,itemsSha256:proof.itemsSha256,itemCount:proof.itemCount,
   period,contractId:employee.contractId,identityToken:employee.identityToken,agreementCode:employee.agreementCode,categoryCode:employee.categoryCode,sourceCode:binding.sourceCode,
   status:row?'configured':'not_configured',rowKey:row?salaryRowKey(row):null,value};
  return {key:binding.key,unit:'money',value,sourceReference:'Escala opcional:'+policySha256(evidence)};
 };
}

/** Browser/server historical readers verify the same selected inputs. They do
 * not replace an original result or resolve a newer catalogue. */
export function verifyOptionalScaleInputs(payload,input){
 const resolve=optionalScaleResolver(payload);if(!resolve)return;
 const definition=payload.programState.program.definition,population=payload.population;
 require(population?.complete===true&&Array.isArray(population.employees)&&Array.isArray(input?.employees)
  &&population.employees.length===input.employees.length&&population.employees.length>0&&population.employees.length<=10000
  &&new Set(population.employees.map(e=>e.contractId)).size===population.employees.length
  &&new Set(input.employees.map(e=>e.contractId)).size===input.employees.length
  &&input.period===payload.period&&input.liquidationType===payload.liquidationType,
 'OPTIONAL_SCALE_INPUT_INVALID','La fuente opcional necesita la población y el período completos originales.');
 const actualById=new Map(input.employees.map(e=>[e.contractId,e]));
 const used=new Set((definition.rules??[]).filter(r=>active(r,payload.period,payload.liquidationType)).flatMap(r=>inputs(r.expression).map(key=>r.agreementCode+':'+key)));
 for(const employee of population.employees){
  const actual=actualById.get(employee.contractId);
  require(actual&&['employeeNumber','agreementCode','departmentCode'].every(k=>actual[k]===employee[k])&&Array.isArray(actual.inputs),'OPTIONAL_SCALE_INPUT_INVALID','La entrada cambió la identidad o el encuadre capturado.');
  for(const binding of definition.bindings.filter(b=>b.sourceKind==='optional_scale'&&b.agreementCode===employee.agreementCode)){
   const observed=actual.inputs.filter(i=>i.key===binding.key),expected=used.has(binding.agreementCode+':'+binding.key)?[resolve(employee,binding)]:[];
   require(same(observed,expected),'OPTIONAL_SCALE_INPUT_INVALID','El importe opcional no coincide con su configuración aprobada o ausencia demostrada.');
  }
 }
}
