// Approved source dispositions travel with the programme. The source inventory
// is documentary evidence; current absence is checked from complete native reads.
import {salaryExact,salaryHash,salarySerialized} from './native-salary-catalog-model.js';
import {payrollRequire as require} from './own-payroll-exact.js';
import {POLICY_LIQUIDATION_TYPES,policyCode,policyCanonicalText,policySha256,requirePolicyDeclaration,requirePolicyScope,resolvePolicySuccession,resolvedPolicyAppliesTo,policyBoundaryMonths} from './own-payroll-policy-validity.js';

export const OWN_PAYROLL_SOURCE_COVERAGE_VERSION='own-payroll-source-coverage.v1';
export const ownProgramSourceCoverage=p=>Object.getOwnPropertyDescriptor(p??{},'sourceCoverageVersion')?.value===OWN_PAYROLL_SOURCE_COVERAGE_VERSION;
export const sourceCoverageProgramFields=p=>ownProgramSourceCoverage(p)?['sourceCoverageVersion','sourceCoveragePolicies']:[];
const keys=['policyId','supersedes','agreementCode','liquidationType','validFrom','validUntil','sourceSha256','inventorySha256','expectedSourceRows','inventory','nativeInputs'];
const order=(a,b)=>a<b?-1:a>b?1:0;
const key=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value);
const active=(r,p,period)=>r.agreementCode===p.agreementCode&&r.validFrom<=period&&(r.validUntil===null||r.validUntil>=period)&&r.liquidationTypes.includes(p.liquidationType);
const eventBinding=b=>/^(monthly|fixed)_(amount|quantity|presence)$/.test(b.sourceKind);
const scope=p=>p.agreementCode+':'+p.liquidationType;
const sortedCodes=rows=>rows.every((r,i)=>i===0||order(rows[i-1].code,r.code)<0);
function bindingKeys(value){
  require(Array.isArray(value)&&value.length>0&&value.length<=512&&value.every(key)&&new Set(value).size===value.length,'SOURCE_COVERAGE_BINDINGS_INVALID','La disposición necesita claves de entradas explícitas y sin duplicados.');
  return [...value];
}
export const sourceCoverageInventorySha256=inventory=>policySha256(inventory.map(({code,sourceRowSha256})=>({code,sourceRowSha256})));
function exclusionBasis(raw,policy,sourceRow){
  require(raw&&typeof raw==='object','SOURCE_COVERAGE_EXCLUSION_UNRESOLVED','Falta una base de exclusión tipada; un diagnóstico no acredita ausencia de efecto.');
  if(raw.kind==='event_activation_only'){
    require(salaryExact(raw,['kind','sourceActivation','evidenceSha256'])&&raw.sourceActivation==='N'&&salaryHash(raw.evidenceSha256),'SOURCE_COVERAGE_EXCLUSION_UNRESOLVED','La activación por novedad conserva el literal N y su evidencia exacta; no se normalizan otras activaciones.');
  }else if(raw.kind==='source_dispatch_disabled'){
    require(salaryExact(raw,['kind','methodCode','methodRowSha256','nonAmountEffects','phaseReviewSha256','evidenceSha256'])&&raw.methodCode==='0'&&raw.nonAmountEffects==='none'&&[raw.methodRowSha256,raw.phaseReviewSha256,raw.evidenceSha256].every(salaryHash),'SOURCE_COVERAGE_EXCLUSION_UNRESOLVED','La inhibición requiere método original y revisión íntegra de cantidad/PRE/POST; ALGO=0 solo no alcanza.');
  }else if(raw.kind==='outside_liquidation_type'){
    require(salaryExact(raw,['kind','applicableLiquidationTypes','dispatchScope','evidenceSha256'])&&Array.isArray(raw.applicableLiquidationTypes)&&raw.applicableLiquidationTypes.length>0&&raw.applicableLiquidationTypes.every(t=>POLICY_LIQUIDATION_TYPES.includes(t))&&new Set(raw.applicableLiquidationTypes).size===raw.applicableLiquidationTypes.length&&!raw.applicableLiquidationTypes.includes(policy.liquidationType)&&raw.dispatchScope==='whole_definition'&&salaryHash(raw.evidenceSha256),'SOURCE_COVERAGE_EXCLUSION_UNRESOLVED','La exclusión por tipo debe abarcar toda la definición y excluir expresamente el tipo elegido.');
  }else if(raw.kind==='outside_february_school_condition'){
    // This is an explicit own municipal decision, not a claim that GRH's CONM suppresses UNIM.
    // A finite single month prevents annual recurrence from hiding inside an interval.
    require(salaryExact(raw,['kind','condition','authority','decisionSha256','dispatchScope','quantityTreatment','nonAmountEffects','phaseReviewSha256','evidenceSha256'])
      &&salaryExact(raw.condition,['reference','operator','value'])&&raw.condition.reference==='L[101]'&&raw.condition.operator==='eq'&&raw.condition.value===2
      &&policy.agreementCode==='1'&&policy.liquidationType==='monthly'&&['311','312'].includes(sourceRow.code)
      &&policy.validUntil===policy.validFrom&&policy.validFrom.slice(5)!=='02'
      &&raw.authority==='own_programme_decision'&&raw.dispatchScope==='whole_definition'&&raw.quantityTreatment==='suppressed_by_own_decision'&&raw.nonAmountEffects==='empty_source_pre_post'
      &&[raw.decisionSha256,raw.phaseReviewSha256,raw.evidenceSha256].every(salaryHash),
      'SOURCE_COVERAGE_EXCLUSION_UNRESOLVED','La ayuda escolar C1 requiere decisión propia expresa, condición L101=2, revisión de cantidad y fases, y un solo mes distinto de febrero.');
  }else if(raw.kind==='documented_retirement'){
    require(salaryExact(raw,['kind','decisionSha256','evidenceSha256'])&&[raw.decisionSha256,raw.evidenceSha256].every(salaryHash),'SOURCE_COVERAGE_EXCLUSION_UNRESOLVED','El retiro propio conserva la decisión y su respaldo; una condición pendiente no equivale a un retiro.');
  }else require(false,'SOURCE_COVERAGE_EXCLUSION_UNRESOLVED','La exclusión conserva una condición o efecto sin resolver; necesita una regla completa o una guarda tipada compatible.');
  return structuredClone(raw);
}
export function normalizeSourceCoveragePolicies(raw){
  require(Array.isArray(raw)&&raw.length>0&&raw.length<=1000,'SOURCE_COVERAGE_INVALID','El programa necesita políticas completas de cobertura.');
  policyCanonicalText(raw);
  const policies=raw.map(p=>{
    require(salaryExact(p,keys)&&[p.sourceSha256,p.inventorySha256].every(salaryHash)&&Number.isSafeInteger(p.expectedSourceRows)&&p.expectedSourceRows>0&&p.expectedSourceRows<=1000&&Array.isArray(p.inventory)&&p.inventory.length===p.expectedSourceRows&&Array.isArray(p.nativeInputs)&&p.nativeInputs.length<=512,'SOURCE_COVERAGE_INCOMPLETE','El inventario debe conservar la cantidad y las huellas originales de la fuente.');
    requirePolicyDeclaration(p);requirePolicyScope(p);
    const inventory=p.inventory.map(r=>{
      require(r&&policyCode(r.code)&&salaryHash(r.sourceRowSha256),'SOURCE_COVERAGE_INCOMPLETE','Una disposición no conserva código y huella de la fila de origen.');
      const common=['code','sourceRowSha256','kind'];
      if(r.kind==='rule')require(salaryExact(r,common),'SOURCE_COVERAGE_INVALID','La regla no admite datos implícitos.');
      else if(r.kind==='input'){require(salaryExact(r,[...common,'bindingKeys']),'SOURCE_COVERAGE_INVALID','La entrada debe declarar sus claves.');bindingKeys(r.bindingKeys);}
      else if(r.kind==='total')require(salaryExact(r,[...common,'targetCode'])&&policyCode(r.targetCode),'SOURCE_COVERAGE_INVALID','El total necesita su auxiliar propio exacto.');
      else if(r.kind==='excluded_total')require(salaryExact(r,[...common,'decisionSha256'])&&salaryHash(r.decisionSha256),'SOURCE_COVERAGE_EXCLUSION_UNRESOLVED','El total excluido necesita la decisión documental completa.');
      else if(r.kind==='excluded'){require(salaryExact(r,[...common,'basis']),'SOURCE_COVERAGE_INVALID','La exclusión necesita su base exacta.');exclusionBasis(r.basis,p,r);}
      else require(false,'SOURCE_COVERAGE_EXCLUSION_UNRESOLVED','Hay una disposición de fuente pendiente; no se transforma en una exclusión.');
      return structuredClone(r);
    });
    require(sortedCodes(inventory)&&sourceCoverageInventorySha256(inventory)===p.inventorySha256,'SOURCE_COVERAGE_INVENTORY_CHANGED','El conjunto ordenado de filas de origen no coincide con su huella o contiene duplicados.');
    const universe=new Set(inventory.map(r=>r.code));
    const nativeInputs=p.nativeInputs.map(r=>{
      require(salaryExact(r,['code','evidenceSha256','bindingKeys'])&&policyCode(r.code)&&salaryHash(r.evidenceSha256)&&!universe.has(r.code),'SOURCE_COVERAGE_NATIVE_INPUT_INVALID','El alias nativo debe conservar su identidad y respaldo separados del inventario de origen.');
      bindingKeys(r.bindingKeys);return structuredClone(r);
    });
    require(sortedCodes(nativeInputs),'SOURCE_COVERAGE_NATIVE_INPUT_INVALID','Los aliases nativos no admiten duplicados ni orden ambiguo.');
    return {...structuredClone(p),inventory,nativeInputs};
  });
  resolvePolicySuccession(policies,{identity:p=>p.policyId,scope});
  return policies;
}
const resolved=policies=>resolvePolicySuccession(policies,{identity:p=>p.policyId,scope});
function inputKeys(node,found){
  if(node.op==='input'||node.op==='match')found.add(node.key);
  for(const k of ['left','right','value','condition','then','else'])if(node[k]&&typeof node[k]==='object')inputKeys(node[k],found);
}
export function normalizeSourceCoverageProgram(program){
  require(program.namespaceVersion==='own-payroll-namespaces.v2','SOURCE_COVERAGE_NAMESPACE_REQUIRED','La cobertura distingue conceptos y auxiliares por su identidad propia.');
  const policies=normalizeSourceCoveragePolicies(program.sourceCoveragePolicies);let inspections=0;
  if(policies.some(p=>p.inventory.some(r=>r.basis?.kind==='outside_february_school_condition')))
    require(program.periodContextVersion==='own-payroll-period-context.v1','SOURCE_COVERAGE_PERIOD_CONTEXT_REQUIRED','La condición escolar usa el mes del período declarado, no el reloj ni un dato supletorio.');
  for(const entry of resolved(policies)){
    const p=entry.policy,relevant=program.rules.filter(r=>r.agreementCode===p.agreementCode&&r.liquidationTypes.includes(p.liquidationType)),quantities=(program.quantityPhases??[]).filter(r=>r.agreementCode===p.agreementCode&&r.liquidationTypes.includes(p.liquidationType));
    const boundaries=policyBoundaryMonths(entry,[...relevant,...quantities]);
    inspections+=(p.inventory.length+p.nativeInputs.length)*boundaries.length;
    require(inspections<=50000,'SOURCE_COVERAGE_LIMIT','La cobertura supera 50.000 inspecciones de fuente por fronteras de vigencia; no se recortan filas.');
    for(const period of boundaries){
      const rules=relevant.filter(r=>active(r,p,period)),phases=quantities.filter(r=>active(r,p,period)),payable=new Map(rules.filter(r=>r.nature!=='auxiliary').map(r=>[r.code,r])),used=new Set();
      for(const r of [...rules,...phases])inputKeys(r.expression,used);
      const bindings=program.bindings.filter(b=>b.agreementCode===p.agreementCode&&used.has(b.key)),byKey=new Map(bindings.map(b=>[b.key,b]));
      const validateInput=r=>{
        require(r.bindingKeys.every(k=>{const b=byKey.get(k);return b&&eventBinding(b)&&b.sourceCode===r.code;}),'SOURCE_COVERAGE_BINDING_REQUIRED','La disposición de entrada debe coincidir con una fuente consumida en toda la vigencia.');
        require(!payable.has(r.code),'SOURCE_COVERAGE_ROLE_CONFLICT','Una entrada no puede ocultar una regla pagable del mismo código.');
      };
      for(const r of p.inventory){
        if(r.kind==='rule')require(payable.has(r.code),'SOURCE_COVERAGE_RULE_REQUIRED','La fuente tipada necesita su regla pagable en toda la vigencia.');
        else if(r.kind==='input')validateInput(r);
        else if(r.kind==='total')require(!payable.has(r.code)&&rules.some(q=>q.nature==='auxiliary'&&q.code===r.targetCode&&q.unit==='money'),'SOURCE_COVERAGE_TOTAL_REQUIRED','El total necesita su auxiliar monetario vigente y una identidad separada.');
        else require(!payable.has(r.code)&&!phases.some(q=>q.code===r.code),'SOURCE_COVERAGE_ROLE_CONFLICT','Una exclusión no puede ocultar una regla pagable o una cantidad propia.');
      }
      for(const r of p.nativeInputs)validateInput(r);
      const declared=new Map(p.inventory.map(r=>[r.code,r]));
      require([...payable.keys()].every(code=>declared.get(code)?.kind==='rule'),'SOURCE_COVERAGE_RULE_UNACCOUNTED','Toda regla pagable vigente debe estar vinculada al inventario de fuente.');
      const codes=new Set([...declared.keys(),...p.nativeInputs.map(r=>r.code)]);
      require(bindings.filter(eventBinding).every(b=>codes.has(b.sourceCode)),'SOURCE_COVERAGE_BINDING_UNACCOUNTED','Una fuente de novedades consumida no figura en el inventario ni en los aliases nativos.');
    }
  }
  return{sourceCoverageVersion:OWN_PAYROLL_SOURCE_COVERAGE_VERSION,sourceCoveragePolicies:policies};
}
export function sourceCoverageProgramHistory(before,after){
  if(!ownProgramSourceCoverage(before))return;
  require(ownProgramSourceCoverage(after),'PROGRAM_HISTORY_REQUIRED','Conservá la cobertura de fuente y sus disposiciones anteriores.');
  const future=new Map(after.sourceCoveragePolicies.map(p=>[p.policyId,salarySerialized(p)]));
  require(before.sourceCoveragePolicies.every(p=>future.get(p.policyId)===salarySerialized(p)),'PROGRAM_HISTORY_REQUIRED','Una disposición anterior se conserva exacta; una nueva vigencia declara su sucesión.');
}
export function captureSourceCoverage(program,{period,liquidationType,population,monthly}){
  if(!ownProgramSourceCoverage(program))return null;
  require(population?.complete===true&&Array.isArray(population.employees)&&population.employees.length>0,'SOURCE_COVERAGE_CHANNEL_INCOMPLETE','La cobertura necesita la población propia completa.');
  require(monthly?.complete===true&&Array.isArray(monthly.batches)&&Array.isArray(monthly.nativeBatches),'SOURCE_COVERAGE_CHANNEL_INCOMPLETE','La ausencia requiere los dos canales mensuales explícitos, incluso cuando están vacíos.');
  const normalizedPolicies=normalizeSourceCoveragePolicies(program.sourceCoveragePolicies);
  if(normalizedPolicies.some(p=>p.inventory.some(r=>r.basis?.kind==='outside_february_school_condition')))
    require(program.periodContextVersion==='own-payroll-period-context.v1','SOURCE_COVERAGE_PERIOD_CONTEXT_REQUIRED','La condición escolar usa el mes del período declarado.');
  const policies=resolved(normalizedPolicies),byAgreement=new Map();
  for(const agreementCode of new Set(population.employees.map(e=>e.agreementCode))){
    const found=policies.filter(p=>resolvedPolicyAppliesTo(p,{period,liquidationType,agreementCode}));
    require(found.length===1,'SOURCE_COVERAGE_POLICY_REQUIRED','Falta la cobertura de fuente para el convenio, período y tipo elegidos.');
    const policy=found[0].policy;byAgreement.set(agreementCode,{inventory:new Map(policy.inventory.map(r=>[r.code,r])),nativeInputs:new Set(policy.nativeInputs.map(r=>r.code))});
  }
  return byAgreement;
}
export function assertSourceCoverageEvent(coverage,{agreementCode,conceptCode}){
  if(coverage===null)return;
  const scope=coverage.get(agreementCode);
  require(scope,'SOURCE_COVERAGE_POLICY_REQUIRED','La novedad no tiene una cobertura verificada para su convenio.');
  const row=scope.inventory.get(conceptCode);
  require(row||scope.nativeInputs.has(conceptCode),'SOURCE_COVERAGE_UNKNOWN_EVENT','La novedad pertenece a un código fuera del inventario revisado.');
  require(!row||!['excluded','excluded_total','total'].includes(row.kind),'SOURCE_COVERAGE_EXCLUDED_EVENT','Reapareció una novedad de un concepto excluido; revisá su disposición antes de calcular.');
}
