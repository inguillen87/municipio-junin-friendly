import {TimeCatalogReviewSession} from './time-catalog-review-model.js';
import {timeCatalogCommand, timeCatalogExact, timeCatalogKey, timeCatalogScope} from './time-catalog-contract.js';

export const ASSIGNMENT_DECISION_LIMIT=100;
export const ASSIGNMENT_DECISIONS=Object.freeze(['submit','approve','reject']);
const check=(ok,message)=>{if(!ok)throw Error(message);};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
export const assignmentDecisionSnapshot=entry=>canonical({record:entry.record,assignment:entry.assignment});

export function assignmentDecisionPlan({details,scope,permissions,action,reasonCode,reason}){
 check(timeCatalogScope(scope)&&ASSIGNMENT_DECISIONS.includes(action),'Verificá el acceso y elegí una acción de revisión.');
 check(Array.isArray(details)&&details.length>0&&details.length<=ASSIGNMENT_DECISION_LIMIT,'Elegí entre1 y100 asignaciones. El conjunto no se recorta.');
 const ids=new Set(),dependencies=new Map(),entries=[];
 for(const detail of details){
  const session=new TimeCatalogReviewSession();session.scope=scope;session.permissions=structuredClone(permissions);session.detail(detail,detail?.record?.id);
  const record=session.selected,assignment=session.assignment;
  check(record.kind==='assignment'&&assignment&&session.commands().includes(action),'Una asignación ya no permite esta acción. Consultá el conjunto nuevamente.');
  check(!ids.has(record.id.toLowerCase()),'Hay una asignación repetida. No se registró ninguna decisión.');ids.add(record.id.toLowerCase());
  for(const [key,kind] of [['shift','shift'],['calendar','calendar'],['ruleProfile','rule_profile']]){
   const dependency=assignment[key];
   if(action!=='reject')check(dependency.status==='approved'&&dependency.timezone===record.timezone&&dependency.effectiveFrom<=record.effectiveFrom
    &&(dependency.effectiveTo===undefined||record.effectiveTo!==undefined&&dependency.effectiveTo>=record.effectiveTo),'Las configuraciones aprobadas deben cubrir toda la vigencia de cada contrato.');
   const previous=dependencies.get(dependency.id.toLowerCase());
   check(!previous||canonical(previous.record)===canonical(dependency),'Una configuración cambió durante la consulta del conjunto. Revisá nuevamente.');
   dependencies.set(dependency.id.toLowerCase(),{record:dependency,kind});
  }
  const body=timeCatalogCommand({command:action,kind:null,id:record.id,expectedVersion:record.version,payload:null,reasonCode,reason,manualValidationConfirmed:action==='approve',scopeVersion:scope});
  entries.push({record:structuredClone(record),assignment:structuredClone(assignment),body});
 }
 return freeze({scope,action,reasonCode,reason,total:entries.length,entries,dependencies:[...dependencies.values()]});
}

// A decision's body contains only its existing entry ID/version. Recovery first
// consults that same assignment with fresh nominal access; it never restores
// a selection or creates decisions for the remaining contracts.
export function restoreAssignmentDecisionAttempt(session,attempt){
 check(session.scope&&session.permissions.canReadAssignments&&!session.pending&&timeCatalogExact(attempt,['key','scope','body','generation'])
  &&timeCatalogKey(attempt.key)&&attempt.scope===session.scope&&typeof attempt.body==='string'&&attempt.body.length<=65536,'Verificá el acceso original antes de recuperar la decisión.');
 let envelope;try{envelope=JSON.parse(attempt.body);}catch{throw Error('El intento original no pudo verificarse.');}
 check(timeCatalogExact(envelope,['operation','payload'])&&envelope.operation==='command','El intento original no pudo verificarse.');
 const body=timeCatalogCommand(envelope.payload);
 check(ASSIGNMENT_DECISIONS.includes(body.command)&&body.kind===null&&body.payload===null&&body.scopeVersion===attempt.scope&&body.expectedVersion>=1
  &&body.manualValidationConfirmed===(body.command==='approve')&&(body.command==='submit'?session.permissions.canPropose:session.permissions.canApprove)
  &&session.selected?.kind==='assignment'&&session.selected.id.toLowerCase()===body.id.toLowerCase()&&session.assignment,'La recuperación requiere la misma asignación y el acceso original.');
 session.pending=Object.freeze({...attempt,generation:session.generation});return session.attempt();
}
