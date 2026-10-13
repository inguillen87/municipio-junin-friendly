import {ownProgramBootstrap,ownProgramDefinition,ownProgramFields,ownProgramHistory,ownProgramNamespaced} from './own-payroll-program-model.js';
import {ownProgramParticipation,participationRuleKey} from './own-period-participation-program.js';
import {salaryExact,salaryRowKey,salarySerialized} from './native-salary-catalog-model.js';
import {decimal,exactMultiply,quantize} from './own-payroll-exact.js';
import {OWN_PAYROLL_LIMITS} from './own-payroll-engine.js';

const require=(valid,message)=>{if(!valid)throw Error(message);};
const month=v=>typeof v==='string'&&/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(v);
const code=v=>typeof v==='string'&&/^[0-9]{1,9}$/.test(v);
const reference=v=>typeof v==='string'&&v===v.trim()&&v===v.normalize('NFC')&&v.length>=3&&v.length<=180&&!/[<>\u0000-\u001f\u007f]/.test(v);
const dense=(v,max)=>Array.isArray(v)&&v.length>0&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.hasOwn(v,i)).every(Boolean);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const previousMonth=v=>{const[y,m]=v.split('-').map(Number);return `${m===1?y-1:y}-${String(m===1?12:m-1).padStart(2,'0')}`;};

// Builds an ordinary native rule from one explicitly selected approved class.
// It does not interpret archived expressions or use an employee's own class.
export function prepareProgramScaleReference(bootstrap,draft,intent){
 const boot=ownProgramBootstrap(bootstrap);
 require(boot.permissions.canPropose&&boot.salaryCatalog.revision>0,'La preparación necesita permiso y un maestro salarial aprobado.');
 require(ownProgramNamespaced(draft),'Separá expresamente los códigos de conceptos y auxiliares antes de preparar la referencia.');
 const empty=salaryExact(draft,ownProgramFields(draft))&&Array.isArray(draft.rules)&&draft.rules.length===0&&Array.isArray(draft.bindings)&&draft.bindings.length<=1000;
 require(!empty||Number.isInteger(draft.totalsPrecision)&&draft.totalsPrecision>=0&&draft.totalsPrecision<=8,'Declará la precisión de los totales del programa.');
 const base=empty?structuredClone(draft):ownProgramDefinition(draft,boot.salaryCatalog.items);
 ownProgramHistory(boot.program.definition,base);
 require(salaryExact(intent,['sourceKey','auxiliaryCode','targets','validFrom','validUntil','liquidationTypes','factor','precision','ruleReference','mode','periodTreatment'])
  &&typeof intent.sourceKey==='string'&&code(intent.auxiliaryCode)&&dense(intent.targets,1000)&&intent.targets.every(code)&&new Set(intent.targets).size===intent.targets.length
  &&month(intent.validFrom)&&month(intent.validUntil)&&intent.validUntil>=intent.validFrom
  &&dense(intent.liquidationTypes,7)&&intent.liquidationTypes.every(t=>['monthly','first_fortnight','sac','vacation','supplementary','final','other'].includes(t))&&new Set(intent.liquidationTypes).size===intent.liquidationTypes.length
  &&typeof intent.factor==='string'&&/^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,8})?$/.test(intent.factor)
  &&Number.isInteger(intent.precision)&&intent.precision>=0&&intent.precision<=8&&reference(intent.ruleReference)&&['add','replace'].includes(intent.mode),
  'Elegí escala, auxiliar, convenios, tipos, factor exacto, precisión, vigencia finita y respaldo. No se omiten destinos.');
 const source=boot.salaryCatalog.items.find(r=>salaryRowKey(r)===intent.sourceKey);
 require(source?.active&&source.kind==='scale'&&source.unit==='money'&&source.value!==null&&source.validFrom<=intent.validFrom&&(source.validUntil??'9999-12')>=intent.validUntil,
  'La clase de referencia debe existir, tener importe y cubrir toda la vigencia elegida. No se prolonga ni se sustituye por otra clase.');
 const participating=ownProgramParticipation(base);
 require(participating?salaryExact(intent.periodTreatment,['treatment','reference'])&&['fraction','declared_formula'].includes(intent.periodTreatment.treatment)&&reference(intent.periodTreatment.reference):intent.periodTreatment===null,
  'Declarale el tratamiento de período parcial a las reglas nuevas según la política del programa.');
 require(base.rules.length+intent.targets.length<=OWN_PAYROLL_LIMITS.rules,'El programa completo supera la capacidad. No se divide ni recorta la preparación.');
 const preview=quantize(exactMultiply(decimal(source.value),decimal(intent.factor)),{mode:'exact',precision:intent.precision});
 const program=structuredClone(base),types=[...intent.liquidationTypes].sort();
 const bindingName=`sr_${intent.auxiliaryCode}_${source.agreementCode}_${source.categoryCode}_${source.code}_${source.validFrom.replace('-','_')}`;
 for(const target of [...intent.targets].sort()){
  const overlaps=program.rules.filter(r=>r.nature==='auxiliary'&&r.code===intent.auxiliaryCode&&r.agreementCode===target&&r.validFrom<=intent.validUntil&&(r.validUntil??'9999-12')>=intent.validFrom&&r.liquidationTypes.some(t=>types.includes(t)));
  if(intent.mode==='add')require(!overlaps.length,`Convenio ${target}: ya existe una regla superpuesta. Revisá el tratamiento del historial.`);
  else{require(overlaps.length===1&&overlaps[0].validFrom<intent.validFrom&&salarySerialized(overlaps[0].liquidationTypes)===salarySerialized(types),`Convenio ${target}: cerrar la anterior requiere una única regla previa, inicio posterior y los mismos tipos.`);overlaps[0].validUntil=previousMonth(intent.validFrom);}
  const binding={agreementCode:target,key:bindingName,unit:'money',sourceKind:'scale_reference',sourceCode:source.code,sourceAgreementCode:source.agreementCode,sourceCategoryCode:source.categoryCode,onMissing:'error',combine:'single',ruleReference:source.ruleReference};
  const prior=program.bindings.find(b=>b.agreementCode===target&&b.key===bindingName);
  require(!prior||salarySerialized(prior)===salarySerialized(binding),`Convenio ${target}: la base ya declarada tiene otra fuente. No se sobrescribe.`);
  if(!prior)program.bindings.push(binding);
  const rule={agreementCode:target,code:intent.auxiliaryCode,nature:'auxiliary',unit:'money',validFrom:intent.validFrom,validUntil:intent.validUntil,liquidationTypes:types,ruleReference:intent.ruleReference,rounding:{mode:'exact',precision:intent.precision},expression:{op:'multiply',left:{op:'input',key:bindingName,unit:'money'},right:{op:'literal',unit:'coefficient',value:intent.factor}}};
  program.rules.push(rule);
  if(participating)program.periodParticipation.treatments.push({ruleKey:participationRuleKey(rule),...intent.periodTreatment});
 }
 const checked=ownProgramDefinition(program,boot.salaryCatalog.items);ownProgramHistory(boot.program.definition,checked);
 return freeze({scopeVersion:boot.scopeVersion,programVersion:boot.program.version,salaryVersion:boot.salaryCatalog.version,approvedDefinition:salarySerialized(boot.program.definition),catalog:salarySerialized(boot.salaryCatalog.items),base:salarySerialized(base),intent:structuredClone(intent),source:structuredClone(source),preview:{base:source.value,factor:intent.factor,amount:preview.amount,precision:intent.precision},program:checked});
}
export function applyProgramScaleReference(bootstrap,draft,plan){
 require(plan,'Revisá primero la referencia completa.');
 const checked=prepareProgramScaleReference(bootstrap,draft,plan.intent);
 require(salarySerialized(checked)===salarySerialized(plan),'Cambió la preparación, el programa o el maestro. Revisá de nuevo el conjunto completo.');
 return structuredClone(checked.program);
}
