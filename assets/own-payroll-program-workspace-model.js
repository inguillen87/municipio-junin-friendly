import {ownProgramBootstrap,ownProgramStructure,ownProgramDefinition,ownProgramHistory,ownProgramCommand,ownProgramReceipt,ownProgramRuleKey} from './own-payroll-program-model.js';
import {salarySerialized,salaryKey} from './native-salary-catalog-model.js';
import {ownRunWorkspaceAccess} from './own-payroll-run-workspace-model.js';

export const PROGRAM_UNITS=Object.freeze({money:'Dinero',hours:'Horas',minutes:'Minutos',percent:'Porcentaje',units:'Unidades',coefficient:'Coeficiente'});
export const PROGRAM_SOURCES=Object.freeze({parameter:'Valor del concepto aprobado',scale:'Escala de la clase del empleado',scale_reference:'Escala de una clase de referencia',monthly_quantity:'Cantidad de novedad mensual',monthly_amount:'Importe de novedad mensual',fixed_quantity:'Cantidad de novedad fija',fixed_amount:'Importe de novedad fija'});
export const PROGRAM_ROUNDING=Object.freeze({exact:'Exigir resultado exacto',half_up:'Más cercano; mitad alejada del cero',half_even:'Más cercano; mitad al par',toward_zero:'Hacia cero',floor:'Hacia el inferior',ceiling:'Hacia el superior'});
export const PROGRAM_OPERATIONS=Object.freeze({input:'Usar una entrada',concept:'Usar otro concepto calculado',literal:'Valor explícito',add:'Sumar',subtract:'Restar',multiply:'Multiplicar',divide:'Dividir',min:'Elegir el menor',max:'Elegir el mayor',round:'Redondear en esta etapa',convert:'Convertir con respaldo',compare:'Comparar',choose:'Elegir según una condición'});
export const PROGRAM_COMPARE=Object.freeze({lt:'Menor que',le:'Menor o igual',eq:'Igual',ne:'Distinto',ge:'Mayor o igual',gt:'Mayor que'});
export const PROGRAM_READ=Object.freeze(['workforce.employee.read','payroll.parameter.read']);
const require=(v,message)=>{if(!v)throw Error(message);};
export const programWorkspaceAccess=ownRunWorkspaceAccess;
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export function programWorkspaceAttempt(key,body,accessKey){
 require(salaryKey(key)&&typeof accessKey==='string'&&accessKey,'No se pudo identificar el intento de reglas.');
 return freeze({key,body:structuredClone(ownProgramCommand(body)),accessKey});
}
export async function verifiedProgramWorkspaceReceipt(value,attempt){
 ownProgramReceipt(value,attempt);
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(value.body))))].map(b=>b.toString(16).padStart(2,'0')).join('');
 require(value.requestSha256===hash,'El comprobante no conserva el contenido verificado. Consultá el mismo intento.');return value;
}
export function prepareProgramWorkspace(bootstrap,definition,reason){
 const boot=ownProgramBootstrap(bootstrap);
 require(boot.permissions.canPropose,'Tu cuenta no permite preparar reglas.');
 require(boot.salaryCatalog.revision>0,'Primero debe aprobarse el catálogo de conceptos y valores.');
 const program=ownProgramDefinition(definition,boot.salaryCatalog.items);ownProgramHistory(boot.program.definition,program);
 return ownProgramCommand({command:'propose',scopeVersion:boot.scopeVersion,baseVersion:boot.program.version,salaryVersion:boot.salaryCatalog.version,proposalId:null,proposalSha256:null,program,reason,reviewConfirmed:false});
}
export function decideProgramWorkspace(bootstrap,proposalId,command,reason,reviewConfirmed){
 const boot=ownProgramBootstrap(bootstrap),proposal=boot.proposals.find(p=>p.id===proposalId);
 require(['approve','reject'].includes(command)&&proposal?.status==='pending','Seleccioná una propuesta pendiente completa.');
 require(boot.permissions.canReview&&proposal.canReview,'La decisión requiere otra persona habilitada.');
 if(command==='approve')require(proposal.baseVersion===boot.program.version&&proposal.salaryVersion===boot.salaryCatalog.version,'Cambió el programa o el catálogo aprobado. Esta propuesta necesita una revisión nueva.');
 return ownProgramCommand({command,scopeVersion:boot.scopeVersion,baseVersion:proposal.baseVersion,salaryVersion:proposal.salaryVersion,proposalId:proposal.id,proposalSha256:proposal.requestSha256,program:null,reason,reviewConfirmed});
}
export function expressionChildren(node){
 if(['add','subtract','multiply','divide','min','max','compare'].includes(node.op))return ['left','right'];
 if(['round','convert'].includes(node.op))return ['value'];
 if(node.op==='choose')return ['condition','then','else'];return [];
}
export function expressionSize(node){
 let count=0,depth=0;const walk=(n,level)=>{
  require(n&&typeof n==='object'&&Object.hasOwn(PROGRAM_OPERATIONS,n.op),'Elegí una operación para la fórmula.');
  require(++count<=256&&level<=32,'La fórmula supera su capacidad. No se recortaron operaciones.');depth=Math.max(depth,level);
  for(const child of expressionChildren(n))walk(n[child],level+1);
 };walk(node,0);return {nodes:count,depth};
}
export function changeExpressionOperation(previous,op){
 require(Object.hasOwn(PROGRAM_OPERATIONS,op),'La operación no está admitida.');
 const leaf=()=>({op:'literal',unit:'',value:''});
 if(op==='input')return {op,unit:previous?.unit??'',key:previous?.key??''};
 if(op==='literal')return {op,unit:previous?.unit??'',value:typeof previous?.value==='string'?previous.value:''};
 if(op==='concept')return {op,code:previous?.code??'',stage:previous?.stage??''};
 if(op==='choose')return {op,condition:previous?.condition??{op:'compare',operator:'',left:leaf(),right:leaf()},then:previous?.then??leaf(),else:previous?.else??leaf()};
 if(op==='round')return {op,value:previous?.value&&typeof previous.value==='object'?previous.value:leaf(),rounding:previous?.rounding??{precision:null,mode:''}};
 if(op==='convert')return {op,value:previous?.value&&typeof previous.value==='object'?previous.value:leaf(),unit:previous?.unit??'',factor:previous?.factor??'',conversionReference:previous?.conversionReference??''};
 return {op,...(op==='compare'?{operator:previous?.operator??''}:{}),left:previous?.left??leaf(),right:previous?.right??leaf()};
}
export function describeProgramExpression(node){
 expressionSize(node);
 const show=n=>{
  if(n.op==='input')return `Entrada ${n.key} (${PROGRAM_UNITS[n.unit]??'unidad pendiente'})`;
  if(n.op==='literal')return `${n.value} (${PROGRAM_UNITS[n.unit]??'unidad pendiente'})`;
  if(n.op==='concept')return `Concepto ${n.code}, ${n.stage==='exact'?'antes':'después'} del redondeo`;
  if(n.op==='round')return `Redondear [${show(n.value)}] a ${n.rounding.precision} decimales, ${PROGRAM_ROUNDING[n.rounding.mode]}`;
  if(n.op==='convert')return `Convertir [${show(n.value)}] a ${PROGRAM_UNITS[n.unit]}, factor ${n.factor}; respaldo: ${n.conversionReference}`;
  if(n.op==='choose')return `Si [${show(n.condition)}], usar [${show(n.then)}]; en otro caso [${show(n.else)}]`;
  return `${n.op==='compare'?PROGRAM_COMPARE[n.operator]:PROGRAM_OPERATIONS[n.op]} [${show(n.left)}] y [${show(n.right)}]`;
 };return show(node);
}
export function programWorkspaceChanges(before,after){
 const next=ownProgramStructure(after),prior=before?ownProgramStructure(before):{rules:[],bindings:[],totalsPrecision:null},rows=[];
 for(const [kind,key] of [['rules',ownProgramRuleKey],['bindings',b=>b.agreementCode+':'+b.key]]){
  const old=new Map(prior[kind].map(v=>[key(v),v])),fresh=new Map(next[kind].map(v=>[key(v),v]));
  for(const id of new Set([...old.keys(),...fresh.keys()])){const a=old.get(id)??null,b=fresh.get(id)??null;rows.push({kind,key:id,before:a,after:b,status:!a?'added':!b?'removed':salarySerialized(a)===salarySerialized(b)?'unchanged':'modified'});}
 }
 return {rows,totalsPrecision:{before:prior.totalsPrecision,after:next.totalsPrecision},changed:rows.filter(r=>r.status!=='unchanged').length+(prior.totalsPrecision!==next.totalsPrecision?1:0)};
}
