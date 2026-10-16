import {ownRunBootstrap} from './own-payroll-run-model.js';
import {ownProgramBootstrap} from './own-payroll-program-model.js';
import {programWorkspaceGuidance} from './own-payroll-program-workspace-model.js';
import {nativeRoster,nativeRosterFilters} from './native-roster-model.js';
import {salaryUuid} from './native-salary-catalog-model.js';
import {MUNICIPAL_ADOPTION_PENDING_HREF} from './municipal-adoption-navigation-model.js';

// An unfiltered, complete own roster proves registration, not eligibility for
// a particular month. Historical references and pending proposals never count.
export const OWN_PAYROLL_READINESS_FILTERS=Object.freeze(nativeRosterFilters({status:'all'}));
export const OWN_PAYROLL_READINESS_ROSTER_URL='/api/internal-data?'+new URLSearchParams({resource:'nativeroster',schema:'2',...OWN_PAYROLL_READINESS_FILTERS});
const verified=new WeakSet();
const messages=Object.freeze({
 roster_required:{title:'Primero: incorporar el padrón propio',description:'No hay legajos registrados o adoptados en el padrón propio consultado. Revisá las propuestas de adopción en Personas o registrá un alta propia. Los registros históricos se conservan; todavía no integran este cálculo.',href:MUNICIPAL_ADOPTION_PENDING_HREF,action:'Revisar adopción del padrón en Personas'},
 catalog_required:{title:'Siguiente paso: aprobar el maestro salarial',description:'El maestro salarial propio todavía no tiene una aprobación registrada. Revisá conceptos, valores y vigencias en Parámetros antes de preparar las reglas.',href:'/nomina#parametros',action:'Revisar parámetros salariales'},
 program_required:{title:'Siguiente paso: aprobar las reglas de cálculo',description:'Podés elegir el período, la fecha, el tipo y el alcance como borrador. Para calcular hace falta un programa de cálculo propio aprobado mediante revisión independiente. La selección no certifica la elegibilidad de los legajos.',href:'/nomina#reglas',action:'Revisar reglas de cálculo'},
 catalog_changed:{title:'Actualizar las reglas con el maestro vigente',description:'El programa aprobado usa otra revisión del maestro salarial. Revisá la propuesta de reglas con los valores actuales; se conserva el programa anterior.',href:'/nomina#reglas',action:'Revisar reglas de cálculo'},
 linked:{title:'Padrón propio, maestro y programa consultados',description:'Podés preparar el período, la fecha, el tipo y el alcance. El cálculo verifica nuevamente la vigencia y los datos aprobados de cada legajo; esta consulta no certifica su elegibilidad ni ejecuta una liquidación.',href:null,action:null},
});
export function ownPayrollReadinessUnavailable(){return Object.freeze({state:'unverified',title:'Preparación no verificada',description:'No se pudo verificar el padrón propio y las reglas de cálculo. Actualizá la consulta antes de preparar un cálculo nuevo. La consulta y recuperación de intentos anteriores siguen disponibles según tu acceso.',href:null,action:'Volver a verificar preparación',rosterTotal:null,catalogRevision:null,programRevision:null});}
export function ownPayrollReadiness({run,program,roster},tenantId){
 const r=ownRunBootstrap(run),p=ownProgramBootstrap(program),n=nativeRoster(roster,OWN_PAYROLL_READINESS_FILTERS);
 if(!salaryUuid(tenantId)||n.scope.tenantId.toLowerCase()!==tenantId.toLowerCase()||r.scopeVersion!==p.scopeVersion||r.programVersion!==p.program.version)throw Error('Cambió el ámbito o el programa durante la consulta. Actualizá la preparación antes de calcular.');
 const g=programWorkspaceGuidance(p),state=n.total===0?'roster_required':g.state;
 const result=Object.freeze({state,...messages[state],rosterTotal:n.total,catalogRevision:g.catalogRevision,programRevision:g.programRevision,scopeVersion:r.scopeVersion,programVersion:r.programVersion,salaryVersion:p.salaryCatalog.version,rosterSnapshot:n.snapshot});
 verified.add(result);return result;
}
// Draft selection proves registration and the current salary master, not payroll eligibility.
export const ownPayrollReadinessAllowsPreparation=value=>verified.has(value)&&value.rosterTotal>0&&value.catalogRevision>0&&['program_required','linked'].includes(value.state);
export const ownPayrollReadinessAllowsNew=value=>verified.has(value)&&value.state==='linked';
export function ownPayrollReadinessUnchanged(before,after){return verified.has(before)&&verified.has(after)&&['state','scopeVersion','programVersion','salaryVersion','rosterSnapshot'].every(k=>before[k]===after[k]);}
export function ownPayrollProgramSummary(value){const p=ownProgramBootstrap(value);return (p.program.revision>0?'Programa aprobado: revisión '+p.program.revision:'Sin programa aprobado')+'. '+(p.salaryCatalog.revision>0?'Maestro salarial aprobado: revisión '+p.salaryCatalog.revision:'Maestro salarial pendiente de aprobación')+'.';}
