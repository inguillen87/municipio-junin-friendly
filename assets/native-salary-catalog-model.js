// Municipal definitions and declared scale values. No formula evaluation or pay.
export const SALARY_VERSION='native-salary-catalog.v1';
export const SALARY_MAX_ITEMS=10000;
export const SALARY_MAX_INPUT_BYTES=4*1024*1024;
// JSONB adds a space after every structural comma and key separator. Object
// ordering does not change UTF8 length. Match SQL's complete-item byte budget.
export function salaryJsonbBytes(value){let spaces=0;const walk=v=>{if(Array.isArray(v)){spaces+=Math.max(0,v.length-1);for(const x of v)walk(x);}else if(v&&typeof v==='object'){const keys=Object.keys(v);spaces+=keys.length+Math.max(0,keys.length-1);for(const key of keys)walk(v[key]);}};walk(value);return new TextEncoder().encode(JSON.stringify(value)).length+spaces;}
export const SALARY_NATURES=Object.freeze({remuneration:'Haber remunerativo',non_remuneration:'Haber no remunerativo',deduction:'Retención',employer_contribution:'Contribución patronal',auxiliary:'Auxiliar'});
export const SALARY_UNITS=Object.freeze({money:'Pesos',hours:'Horas',minutes:'Minutos',percent:'Porcentaje',units:'Unidades',coefficient:'Coeficiente'});
export const salaryExact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
export const salaryHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const salaryUuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export const salaryKey=v=>salaryUuid(v)&&v[14]==='4'&&/[89ab]/.test(v[19]);
export class SalaryInputError extends Error{constructor(code,message){super(message);Object.assign(this,{name:'SalaryInputError',code});}}
const ok=(v,message,code='INPUT_INVALID')=>{if(!v)throw new SalaryInputError(code,message);};
const text=(v,min,max)=>typeof v==='string'&&v===v.trim()&&v===v.normalize('NFC')&&v.length>=min&&v.length<=max&&!/[<>\u0000-\u001f\u007f]/.test(v);
const month=v=>typeof v==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const code=v=>typeof v==='string'&&/^[0-9]{1,9}$/.test(v);
export function salaryRowKey(r){return [r.kind,r.agreementCode,r.categoryCode??'',r.code,r.validFrom].join(':');}
export function salarySerialized(v){if(Array.isArray(v))return '['+v.map(salarySerialized).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+salarySerialized(v[k])).join(',')+'}';return JSON.stringify(v);}
export function salaryItems(raw,{allowEmpty=false}={}){
 ok(Array.isArray(raw)&&raw.length<=SALARY_MAX_ITEMS&&(allowEmpty||raw.length>0),'El catálogo debe tener entre 1 y 10000 filas. No se recorta.');
 ok(salaryJsonbBytes(raw)<=SALARY_MAX_INPUT_BYTES,'El maestro completo supera 4 MiB. No se recorta ni se divide la versión.');
 const keys=['active','agreementCode','categoryCode','code','dependencies','kind','label','nature','precision','ruleReference','unit','validFrom','validUntil','value'];
 const rows=raw.map(r=>{
  ok(salaryExact(r,keys),'La fila contiene campos no admitidos.');
  ok(['concept','auxiliary','scale'].includes(r.kind)&&code(r.code)&&code(r.agreementCode)&&text(r.label,1,160),'Completá tipo, código, convenio y descripción.');
  ok(typeof r.active==='boolean'&&Number.isInteger(r.precision)&&r.precision>=0&&r.precision<=8&&Object.hasOwn(SALARY_UNITS,r.unit),'Indicá unidad y precisión explícitas (0 a 8 decimales).');
  ok(month(r.validFrom)&&(r.validUntil===null||month(r.validUntil)&&r.validUntil>=r.validFrom),'Revisá la vigencia, sin inferirla del documento.');
  ok(text(r.ruleReference,3,180),'Identificá el documento que respalda esta definición.');
  ok(r.kind==='concept'?r.categoryCode===null&&Object.hasOwn(SALARY_NATURES,r.nature):r.kind==='auxiliary'?r.categoryCode===null&&r.nature==='auxiliary':code(r.categoryCode)&&r.nature===null&&r.unit==='money'&&r.value!==null,'La escala necesita clase e importe; el concepto necesita naturaleza; el auxiliar tiene su propio código y naturaleza auxiliar.');
  ok(r.value===null||typeof r.value==='string'&&/^-?(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,8})?$/.test(r.value)&&!/^\-0(?:\.0+)?$/.test(r.value)&&(r.value.split('.')[1]?.length??0)===r.precision,'Conservá el valor decimal exacto, con la precisión declarada. Vacío significa no informado; cero es un valor.');
  ok(Array.isArray(r.dependencies)&&r.dependencies.length<=50&&r.dependencies.every((d,i)=>text(d,1,120)&&(i===0||d>r.dependencies[i-1])),'Las dependencias deben estar ordenadas y no repetidas.');
  ok(r.kind!=='scale'||r.dependencies.length===0,'Una escala registra un valor; no evalúa dependencias.');
  return {...r,dependencies:[...r.dependencies]};
 }).sort((a,b)=>salaryRowKey(a)<salaryRowKey(b)?-1:salaryRowKey(a)>salaryRowKey(b)?1:0);
 const byKey=new Map();for(const r of rows){const key=salaryRowKey(r);ok(!byKey.has(key),'Hay una definición repetida para código, convenio, clase y vigencia.');byKey.set(key,r);}
 const groups=new Map();for(const r of rows.filter(r=>r.active)){const id=[r.kind,r.agreementCode,r.categoryCode??'',r.code].join(':');const g=groups.get(id)??[];for(const other of g)ok((r.validUntil??'9999-12')<other.validFrom||(other.validUntil??'9999-12')<r.validFrom,'Hay vigencias superpuestas para la misma definición.');g.push(r);groups.set(id,g);}
 for(const r of rows)for(const key of r.dependencies){const d=byKey.get(key);ok(d&&d.agreementCode===r.agreementCode&&(!r.active||d.active&&d.validFrom<=r.validFrom&&(d.validUntil??'9999-12')>=(r.validUntil??'9999-12')),'Cada dependencia debe existir en el mismo convenio y cubrir la vigencia.');}
 const visiting=new Set(),visited=new Set();for(const root of byKey.keys()){if(visited.has(root))continue;const stack=[[root,false]];while(stack.length){const[key,finished]=stack.pop();if(finished){visiting.delete(key);visited.add(key);continue;}if(visited.has(key))continue;ok(!visiting.has(key),'Las dependencias forman un ciclo.');visiting.add(key);stack.push([key,true]);for(const dependency of byKey.get(key).dependencies)stack.push([dependency,false]);}}
 return rows;
}
export function salaryDiff(before,after){const a=salaryItems(before,{allowEmpty:true}),b=salaryItems(after),next=new Map(b.map(r=>[salaryRowKey(r),r]));for(const r of a)ok(next.has(salaryRowKey(r)),'No borres antecedentes: desactivá la fila o cerrá su vigencia.');const old=new Map(a.map(r=>[salaryRowKey(r),r]));return b.flatMap(r=>{const prior=old.get(salaryRowKey(r))??null;return prior&&salarySerialized(prior)===salarySerialized(r)?[]:[{key:salaryRowKey(r),before:prior,after:r}];});}
export function salaryCommand(v){
 ok(salaryExact(v,['command','scopeVersion','baseVersion','classificationVersion','proposalId','proposalSha256','items','reason','reviewConfirmed']),'El formulario contiene campos no admitidos.');
 ok(new TextEncoder().encode(JSON.stringify({operation:'command',payload:v})).length<=SALARY_MAX_INPUT_BYTES,'La solicitud completa supera 4 MiB. No se preparó otro intento ni un envío recortado.');
 ok(['propose','approve','reject'].includes(v.command)&&salaryHash(v.scopeVersion)&&salaryHash(v.baseVersion)&&salaryHash(v.classificationVersion)&&text(v.reason,10,1000)&&typeof v.reviewConfirmed==='boolean','Revisá operación, versión y motivo.');
 if(v.command==='propose'){ok(v.proposalId===null&&v.proposalSha256===null&&v.reviewConfirmed===false,'Una propuesta no es una decisión.');return {...v,items:salaryItems(v.items)};}
 ok(salaryUuid(v.proposalId)&&salaryHash(v.proposalSha256)&&v.items===null&&v.reviewConfirmed===true,'Revisá la propuesta completa y confirmá la decisión.');return {...v};
}
export function salaryBootstrap(v){
 ok(salaryExact(v,['version','scopeVersion','classification','catalog','proposals','complete','permissions','payrollCalculated','payrollPosted'])&&v.version===SALARY_VERSION&&v.complete===true&&v.payrollCalculated===false&&v.payrollPosted===false&&salaryHash(v.scopeVersion),'No se pudo verificar la consulta completa.','CONTRACT_INVALID');
 ok(salaryHash(v.classification?.version)&&Array.isArray(v.classification?.items)&&salaryHash(v.catalog?.version)&&Number.isSafeInteger(v.catalog.revision)&&v.catalog.revision>=0&&Array.isArray(v.proposals)&&v.proposals.length<=1000&&typeof v.permissions?.canPropose==='boolean'&&typeof v.permissions?.canReview==='boolean','El catálogo no informó versiones o permisos verificables.','CONTRACT_INVALID');
 salaryItems(v.catalog.items,{allowEmpty:true});v.proposals.forEach(salaryProposal);return v;
}
export function salaryProposal(p){
 ok(salaryExact(p,['id','status','requestSha256','baseVersion','classificationVersion','baseItems','items','reason','createdAt','authorLabel','canReview','decision'])&&salaryUuid(p.id)&&['pending','approved','rejected'].includes(p.status)&&salaryHash(p.requestSha256)&&salaryHash(p.baseVersion)&&salaryHash(p.classificationVersion)&&text(p.reason,10,1000)&&typeof p.canReview==='boolean'&&text(p.authorLabel,1,160)&&typeof p.createdAt==='string','No se pudo verificar la propuesta.','CONTRACT_INVALID');
 ok(p.status==='pending'?p.decision===null:salaryExact(p.decision,['command','reason','actorLabel','recordedAt','revision'])&&p.decision.command===(p.status==='approved'?'approve':'reject')&&text(p.decision.reason,10,1000)&&text(p.decision.actorLabel,1,160)&&typeof p.decision.recordedAt==='string'&&Number.isSafeInteger(p.decision.revision)&&p.decision.revision>=0,'No se pudo verificar la decisión.','CONTRACT_INVALID');
 salaryDiff(p.baseItems,p.items);return p;
}
export function salaryReceipt(r,attempt=null){
 ok(salaryExact(r,['version','eventId','proposalId','requestKey','requestSha256','body','status','revision','catalogVersion','replayed','payrollCalculated','payrollPosted'])&&r.version===SALARY_VERSION&&salaryUuid(r.eventId)&&salaryUuid(r.proposalId)&&salaryKey(r.requestKey)&&salaryHash(r.requestSha256)&&typeof r.replayed==='boolean'&&r.payrollCalculated===false&&r.payrollPosted===false&&salaryHash(r.catalogVersion)&&Number.isSafeInteger(r.revision)&&r.revision>=0&&r.revision<=1000,'La confirmación no pudo verificarse.','CONTRACT_INVALID');
 const body=salaryCommand(r.body);ok(r.status===({propose:'pending',approve:'approved',reject:'rejected'})[body.command]&& (body.command!=='propose'?r.proposalId===body.proposalId:r.proposalId===r.eventId),'La confirmación no corresponde a la operación.','CONTRACT_INVALID');
 ok(body.command==='propose'?r.catalogVersion===body.baseVersion:body.command!=='approve'||r.revision>0&&r.catalogVersion!==body.baseVersion,'La versión confirmada no corresponde al efecto de la decisión.','CONTRACT_INVALID');
 if(attempt)ok(r.requestKey===attempt.key&&salarySerialized(body)===salarySerialized(attempt.body),'La confirmación cambió el contenido o la referencia del envío.','CONTRACT_INVALID');return r;
}
