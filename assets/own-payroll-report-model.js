import {OWN_JURISDICTIONS,ownJurisdictionChoice,ownJurisdictionSelect,ownClosedJurisdiction,ownJurisdictionLabel} from './own-payroll-jurisdiction-model.js';
import {salaryExact,salarySerialized,salaryUuid} from './native-salary-catalog-model.js';
import {OWN_RUN_TYPES,OWN_RUN_NATURES} from './own-payroll-run-workspace-model.js';
import {ownCloseDetail,ownCloseReceipt,verifiedOwnCloseDetail,verifiedOwnCloseReceipt,OWN_CLOSE_TOTAL_KEYS} from './own-payroll-close-model.js';
import {decimal,rational,exactAdd,quantize} from './own-payroll-exact.js';
import {ownReportVariableSources,OWN_VARIABLE_UNITS} from './own-payroll-report-variables.js';
import {ownReportStatement} from './own-payroll-report-statement.js';
import {ownLegajoReportRows} from './own-payroll-report-legajo.js';

export const OWN_REPORT_MAX_ROWS=250000;
export const OWN_REPORT_MAX_BYTES=256*1024*1024;
const need=(value,message)=>{if(!value)throw Error(message);};
const month=v=>typeof v==='string'&&/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(v);
const monthIndex=v=>Number(v.slice(0,4))*12+Number(v.slice(5))-1;
const indexMonth=v=>String(Math.floor(v/12))+'-'+String(v%12+1).padStart(2,'0');
const key=(period,type)=>period+':'+type;
const code=v=>typeof v==='string'&&/^\d{1,9}$/.test(v);
const compare=(a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:a.localeCompare(b);
// Display ordering only. Numeric identifiers retain their existing order;
// opaque identifiers remain exact strings and never become numeric ranges.
const compareEmployee=(a,b)=>code(a)&&code(b)?compare(a,b):code(a)?-1:code(b)?1:a<b?-1:a>b?1:0;

export function ownReportContracts(value=[]){
 need(Array.isArray(value)&&value.length<=10000&&Reflect.ownKeys(value).length===value.length+1&&value.every(salaryUuid)&&new Set(value).size===value.length,'Elegí legajos del histórico consultado sin repetir destinos.');
 return [...value].sort();
}

export function ownReportQuery(value){
 need(salaryExact(value,['from','to','types'])&&month(value.from)&&month(value.to),'Elegí un rango válido de meses.');
 const count=monthIndex(value.to)-monthIndex(value.from)+1;
 need(count>0&&count<=12,'Consultá entre uno y doce meses consecutivos; no se recortó el rango.');
 need(Array.isArray(value.types)&&value.types.length>0&&value.types.length<=Object.keys(OWN_RUN_TYPES).length&&Reflect.ownKeys(value.types).length===value.types.length+1&&Object.keys(value.types).every((k,i)=>k===String(i))&&value.types.every(t=>Object.hasOwn(OWN_RUN_TYPES,t))&&new Set(value.types).size===value.types.length,'Elegí los tipos de liquidación sin repetirlos.');
 return {from:value.from,to:value.to,types:[...value.types].sort()};
}
export function ownReportPeriods(value){const q=ownReportQuery(value);return Array.from({length:monthIndex(q.to)-monthIndex(q.from)+1},(_,i)=>indexMonth(monthIndex(q.from)+i));}
export function ownReportFilters(value){
 const fields=['employeeFrom','employeeTo','departmentFrom','departmentTo','agreementFrom','agreementTo'];
 need(salaryExact(value,fields)&&fields.every(f=>value[f]===''||code(value[f])),'Los rangos admiten códigos de uno a nueve dígitos.');
 for(const field of ['employee','department','agreement'])need(!value[field+'From']||!value[field+'To']||BigInt(value[field+'From'])<=BigInt(value[field+'To']),'El inicio de un rango no puede superar su final.');
 return {...value};
}
export const emptyOwnReportFilters=()=>({employeeFrom:'',employeeTo:'',departmentFrom:'',departmentTo:'',agreementFrom:'',agreementTo:''});

// The census must cover every requested month/type. No source is inferred from
// a current personnel record, a visible page, or a legacy payroll dataset.
export function ownReportBundle(query,details,receipts,captures=null){
 const q=ownReportQuery(query),expected=ownReportPeriods(q).flatMap(p=>q.types.map(t=>key(p,t)));
 need(Array.isArray(details)&&details.length===expected.length&&Array.isArray(receipts)&&receipts.length<=1000,'No se obtuvo todo el histórico solicitado; no se exportará un subconjunto.');
 const census=new Map(),groups=new Map(),sources=[],employees=[],seen=new Set(),identities=new Set();let scope;
 for(const d of details){ownCloseDetail(d);const k=key(d.period,d.liquidationType);need(expected.includes(k)&&!census.has(k),'Un período o tipo está repetido o es ajeno a la consulta.');census.set(k,d);scope??=d.scopeVersion;need(d.scopeVersion===scope,'Las fuentes no corresponden al mismo ámbito autorizado.');
  for(const g of d.groups)if(g.state==='closed'){need(!groups.has(g.id),'Un grupo histórico está repetido.');groups.set(g.id,{group:g,detail:d});}
 }
 need(receipts.length===groups.size,'Falta un grupo cerrado o se incluyó un histórico reabierto.');
 for(const receipt of receipts){ownCloseReceipt(receipt);const ref=groups.get(receipt.groupId),s=receipt.snapshot;
  need(ref&&receipt.body.command==='close'&&!seen.has(receipt.groupId)&&receipt.snapshotSha256===ref.group.snapshotSha256&&receipt.recordedAt===ref.group.recordedAt&&s.period===ref.detail.period&&s.liquidationType===ref.detail.liquidationType&&s.employeeCount===ref.group.employeeCount&&s.populationCount===ref.group.populationCount,'El grupo no coincide con su copia histórica y cobertura originales.');seen.add(receipt.groupId);sources.push(receipt);
  for(const employee of s.employees){const identity=key(s.period,s.liquidationType)+':'+employee.contractId;need(!identities.has(identity),'Un legajo aparece dos veces cerrado en el mismo período y tipo.');identities.add(identity);employees.push({identity,period:s.period,type:s.liquidationType,source:receipt,employee});}
 }
 need(employees.length<=OWN_REPORT_MAX_ROWS&&sources.reduce((n,r)=>n+r.snapshot.conceptCount,0)<=OWN_REPORT_MAX_ROWS,'El histórico completo supera 250.000 participaciones o conceptos. No se omitieron ni dividieron filas.');
 sources.sort((a,b)=>key(a.snapshot.period,a.snapshot.liquidationType).localeCompare(key(b.snapshot.period,b.snapshot.liquidationType))||a.groupId.localeCompare(b.groupId));
 employees.sort((a,b)=>key(a.period,a.type).localeCompare(key(b.period,b.type))||compareEmployee(a.employee.employeeNumber,b.employee.employeeNumber)||a.employee.contractId.localeCompare(b.employee.contractId));
 const bundle={query:q,details,sources,employees,proof:salarySerialized(details.map(d=>[d.period,d.liquidationType,d.scopeVersion,d.stateVersion,d.groups.map(g=>[g.id,g.state,g.snapshotSha256])]))};
 if(captures!==null){bundle.captures=captures;bundle.variableProof=ownReportVariableSources(bundle,captures,OWN_REPORT_MAX_ROWS).proof;}
 return bundle;
}
export async function verifiedOwnReportBundle(query,details,receipts){for(const d of details)await verifiedOwnCloseDetail(d);for(const r of receipts)await verifiedOwnCloseReceipt(r);return ownReportBundle(query,details,receipts);}
function selected(bundle,filters,contracts){
 const f=ownReportFilters(filters),ids=ownReportContracts(contracts),available=new Set(bundle.employees.map(({employee:e})=>e.contractId));
 need(ids.every(id=>available.has(id)),'Falta un legajo seleccionado en el histórico cerrado. Consultá nuevamente; no se omitió ese destino.');
 const selectedIds=new Set(ids),candidates=bundle.employees.filter(({employee:e})=>(!ids.length||selectedIds.has(e.contractId))&&[['department','departmentCode'],['agreement','agreementCode']].every(([range,field])=>(!f[range+'From']||BigInt(e[field])>=BigInt(f[range+'From']))&&(!f[range+'To']||BigInt(e[field])<=BigInt(f[range+'To']))));
 need((!f.employeeFrom&&!f.employeeTo)||candidates.every(({employee:e})=>code(e.employeeNumber)),'El alcance contiene legajos que no admiten un rango numérico. Retirá ese rango y elegí los legajos exactos del histórico. No se omitieron filas.');
 return candidates.filter(({employee:e})=>(!f.employeeFrom||BigInt(e.employeeNumber)>=BigInt(f.employeeFrom))&&(!f.employeeTo||BigInt(e.employeeNumber)<=BigInt(f.employeeTo)));
}
const sum=(values,precision)=>quantize(values.reduce((total,value)=>exactAdd(total,decimal(value)),rational(0n)),{precision,mode:'exact'}).amount;

export const emptyOwnStatisticsSelection=()=>({department:'',agreement:'',concept:''});
export function ownStatisticsSelection(value){
 need(salaryExact(value,['department','agreement','concept'])&&Object.values(value).every(v=>v===''||code(v)),'Elegí repartición, convenio y concepto del histórico consultado.');
 return {...value};
}
export function ownStatisticsChoices(bundle){
 const b=ownReportBundle(bundle.query,bundle.details,bundle.sources),ordered=values=>[...new Set(values)].sort(compare);
 return {departments:ordered(b.employees.map(r=>r.employee.departmentCode)),agreements:ordered(b.employees.map(r=>r.employee.agreementCode)),concepts:ordered(b.sources.flatMap(s=>s.snapshot.concepts.map(r=>r.conceptCode)))};
}
function statisticsSelected(bundle,items,value){
 const choice=ownStatisticsSelection(value);
 for(const [key,field] of [['department','departmentCode'],['agreement','agreementCode']])need(!choice[key]||bundle.employees.some(r=>r.employee[field]===choice[key]),'La selección no está en el histórico consultado. No se sustituyó por datos actuales.');
 need(!choice.concept||bundle.sources.some(s=>s.snapshot.concepts.some(r=>r.conceptCode===choice.concept)),'El concepto seleccionado no está en el histórico consultado.');
 return items.filter(({employee:e})=>(!choice.department||e.departmentCode===choice.department)&&(!choice.agreement||e.agreementCode===choice.agreement));
}

export function ownReportDocument(bundle,filters=emptyOwnReportFilters(),view='payroll',grouping='concept',contracts=[],jurisdiction='all',statisticsSelection=emptyOwnStatisticsSelection()){
 // Recheck the complete census and original concept totals before deriving a view.
 const b=ownReportBundle(bundle.query,bundle.details,bundle.sources),f=ownReportFilters(filters),ids=ownReportContracts(contracts),statistics=ownStatisticsSelection(statisticsSelection),population=selected(b,f,ids),chosen=ownJurisdictionSelect(view==='statistics'?statisticsSelected(b,population,statistics):population,jurisdiction);
 need(['payroll','summary','concepts','legajo','statistics','sources','variables','variable_usage','variable_sources','statement'].includes(view)&&['concept','department','agreement','agreement_department','jurisdiction'].includes(grouping),'Elegí un informe y una agrupación disponibles.');
 const jurisdictionColumns=b.sources.some(s=>s.snapshot.version==='own-close-snapshot.v2'),jurisdictionCell=(source,e)=>jurisdictionColumns?[ownJurisdictionLabel(ownClosedJurisdiction(e,source.snapshot.version))]:[];
 const text=label=>({label,type:'text',width:24}),integer=label=>({label,type:'integer',width:20});let columns,rows,title,payrollStatement;const variableMetadata=[];
 if(view==='legajo'){
  title='Liquidaciones propias por legajo';
  columns=[['Período / tipo',20],['Legajo / convenio / repartición',26],['Concepto / descripción original',45],['Haberes exactos',18],['Retenciones exactas',18],['Contribuciones patronales exactas',20],['Auxiliares exactos',18],['Totales cerrados exactos',18],['Versión / fecha declarada',24]].map(([label,width])=>({...text(label),width}));
  rows=ownLegajoReportRows({...b,captures:bundle.captures},chosen,OWN_REPORT_MAX_ROWS);
 }else if(view==='payroll'){
  title='Planilla de liquidaciones propias';columns=['Período','Tipo','Legajo','Convenio','Repartición','Bruto exacto','Retenciones exactas','Neto exacto',...(jurisdictionColumns?['Jurisdicción conservada']:[])].map(text);
  rows=chosen.map(({period,type,source,employee:e})=>[period,OWN_RUN_TYPES[type],e.employeeNumber,e.agreementCode,e.departmentCode,e.totals.gross,e.totals.deduction,e.totals.net,...jurisdictionCell(source,e)]);
 }else if(view==='statement'){
  title='Informe de liquidación para expediente';
  columns=[text('Período / tipo'),{...text('Convenio / repartición / jurisdicción'),width:48},integer('Participaciones'),...['Remunerativo exacto','No remunerativo exacto','Retenciones exactas','Bruto exacto','Neto exacto','Aportes patronales exactos'].map(text)];
  const statement=ownReportStatement(chosen,b.sources,b.details,grouping);rows=statement.rows;payrollStatement=statement.cover;
 }else if(view==='summary'){
  title='Resumen de liquidaciones propias por repartición';columns=[text('Período'),text('Tipo'),text('Convenio'),text('Repartición'),integer('Participaciones'),text('Bruto exacto'),text('Retenciones exactas'),text('Neto exacto'),...(jurisdictionColumns?[text('Jurisdicción conservada')]:[])];const groups=new Map();
  for(const item of chosen){const id=salarySerialized([item.period,item.type,item.employee.agreementCode,item.employee.departmentCode,ownJurisdictionLabel(ownClosedJurisdiction(item.employee,item.source.snapshot.version))]),group=groups.get(id)??[];group.push(item);groups.set(id,group);}
  rows=[...groups.values()].map(group=>{const item=group[0],precision=group.reduce((p,r)=>Math.max(p,r.employee.precision),0);return [item.period,OWN_RUN_TYPES[item.type],item.employee.agreementCode,item.employee.departmentCode,group.length,...['gross','deduction','net'].map(k=>sum(group.map(r=>r.employee.totals[k]),precision)),...jurisdictionCell(item.source,item.employee)];});
 }else if(view==='concepts'){
  title='Conceptos propios por legajo';columns=['Período','Tipo','Legajo','Concepto','Naturaleza','Unidad','Importe / valor exacto','Versión',...(jurisdictionColumns?['Jurisdicción conservada']:[])].map(text);
  rows=chosen.flatMap(({period,type,source,employee:e})=>source.snapshot.concepts.filter(r=>r.contractId===e.contractId).map(r=>[period,OWN_RUN_TYPES[type],e.employeeNumber,r.conceptCode,OWN_RUN_NATURES[r.nature],r.unit,r.amount,String(e.liquidationVersion),...jurisdictionCell(source,e)]));
 }else if(view==='statistics'){
  payrollStatement=ownReportStatement(chosen,b.sources,b.details,'concept').cover;
  variableMetadata.push(['Repartición elegida',statistics.department||'Todas'],['Convenio elegido',statistics.agreement||'Todos'],['Concepto elegido',statistics.concept||'Todos']);
  title='Estadísticas de conceptos propios';columns=[text('Tipo'),text(grouping==='department'?'Repartición':grouping==='agreement'?'Convenio':grouping==='agreement_department'?'Convenio / repartición':grouping==='jurisdiction'?'Jurisdicción conservada':'Alcance'),text('Concepto'),text('Naturaleza'),text('Unidad'),integer('Participaciones'),text('Importe / valor exacto'),text('Rango de meses')];const groups=new Map();
  const conceptsBySource=new Map();for(const source of b.sources){const byContract=new Map();for(const r of source.snapshot.concepts){if(statistics.concept&&r.conceptCode!==statistics.concept)continue;const list=byContract.get(r.contractId)??[];list.push(r);byContract.set(r.contractId,list);}conceptsBySource.set(source.groupId,byContract);}
  for(const {type,source,employee:e}of chosen)for(const r of conceptsBySource.get(source.groupId).get(e.contractId)??[]){
   const dimension=grouping==='department'?e.departmentCode:grouping==='agreement'?e.agreementCode:grouping==='agreement_department'?e.agreementCode+' / '+e.departmentCode:grouping==='jurisdiction'?ownJurisdictionLabel(ownClosedJurisdiction(e,source.snapshot.version)):'Todos los seleccionados',id=salarySerialized([type,dimension,r.conceptCode,r.nature,r.unit]);
   const g=groups.get(id)??{type,dimension,code:r.conceptCode,nature:r.nature,unit:r.unit,amounts:[],precision:0};g.amounts.push(r.amount);g.precision=Math.max(g.precision,r.amount.split('.')[1]?.length??0);groups.set(id,g);
  }
  rows=[...groups.values()].sort((a,b)=>a.type.localeCompare(b.type)||a.dimension.localeCompare(b.dimension)||compare(a.code,b.code)||a.nature.localeCompare(b.nature)||a.unit.localeCompare(b.unit)).map(g=>[OWN_RUN_TYPES[g.type],g.dimension,g.code,OWN_RUN_NATURES[g.nature],g.unit,g.amounts.length,sum(g.amounts,g.precision),b.query.from+' a '+b.query.to]);
 }else if(['variables','variable_usage','variable_sources'].includes(view)){
  const originals=ownReportVariableSources(b,bundle.captures,OWN_REPORT_MAX_ROWS);
  const variables=chosen.flatMap(item=>originals.participations.get(item.identity).variables);
  variableMetadata.push(['Variables originales seleccionadas',variables.length],['Variables capturadas sin uso en la traza',variables.filter(v=>v.occurrences.length===0).length],['Valores de variables no informados',variables.filter(v=>v.input.value===null).length]);
  if(view!=='variable_sources'){
   const summary=view==='variables';title=summary?'Variables originales de las liquidaciones propias':'Uso de variables originales por concepto';columns=['Período / tipo','Legajo / convenio / repartición','Variable / descripción conservada','Valor original','Unidad declarada',...(summary?['Conceptos con uso directo','Conceptos con uso por referencia']:['Concepto','Uso registrado']),'Fuente original','Versión / fecha declarada'].map((label,i)=>summary&&[5,6].includes(i)?integer(label):text(label));
   rows=chosen.flatMap(item=>{const {capture,variables}=originals.participations.get(item.identity),e=item.employee,context=[item.period+' / '+OWN_RUN_TYPES[item.type],e.employeeNumber+' / '+e.agreementCode+' / '+e.departmentCode],version=String(e.liquidationVersion)+' / '+(capture.body.liquidationDate??'Fecha no declarada');
    if(!variables.length)return [[...context,'Sin variables capturadas',null,null,null,summary?null:'No informado',null,version]];
    if(summary)return variables.map(({input,label,origin,occurrences})=>[...context,input.key+' / '+label,input.value,OWN_VARIABLE_UNITS[input.unit],occurrences.filter(v=>v.kind==='Uso directo').length,occurrences.filter(v=>v.kind==='Uso por concepto referenciado').length,origin+' / '+input.sourceReference,version]);
    return variables.flatMap(({input,label,origin,occurrences})=>(occurrences.length?occurrences:[{concept:null,kind:'Capturada; sin uso en la traza'}]).map(use=>[...context,input.key+' / '+label,input.value,OWN_VARIABLE_UNITS[input.unit],use.concept,use.kind,origin+' / '+input.sourceReference,version]));
   });
  }else{
   title='Fuentes originales de las variables';columns=['Período','Tipo','Corrida original','Fecha declarada','Participaciones seleccionadas','SHA-256 programa','SHA-256 captura','SHA-256 entradas','SHA-256 resultado'].map((label,i)=>i===4?integer(label):text(label));
   const selectedRuns=new Map();for(const item of chosen){const group=selectedRuns.get(item.employee.runId)??[];group.push(item);selectedRuns.set(item.employee.runId,group);}
   rows=[...selectedRuns].map(([id,items])=>{const c=originals.runs.get(id).capture;return [items[0].period,OWN_RUN_TYPES[items[0].type],id,c.body.liquidationDate??null,items.length,c.body.programVersion,c.payloadSha256,c.saved.inputSha256,c.saved.resultSha256];});
  }
 }else{
  title='Fuentes y cobertura del histórico propio';columns=[text('Período'),text('Tipo'),text('Grupo original'),integer('Legajos del grupo'),integer('Padrón propio declarado'),integer('Participaciones seleccionadas'),text('SHA-256 original')];
  rows=b.sources.map(r=>[r.snapshot.period,OWN_RUN_TYPES[r.snapshot.liquidationType],r.groupId,r.snapshot.employeeCount,r.snapshot.populationCount,chosen.filter(e=>e.source.groupId===r.groupId).length,r.snapshotSha256]);
  for(const d of b.details)if(!d.groups.some(g=>g.state==='closed'))rows.push([d.period,OWN_RUN_TYPES[d.liquidationType],'Sin grupo cerrado',null,null,null,null]);
 }
 need(rows.length<=OWN_REPORT_MAX_ROWS,'El informe completo supera la capacidad. No se exportaron filas parciales.');
 const precision=chosen.reduce((p,r)=>Math.max(p,r.employee.precision),0),totals=chosen.length?Object.fromEntries(OWN_CLOSE_TOTAL_KEYS.map(k=>[k,sum(chosen.map(r=>r.employee.totals[k]),precision)])):null;
 const ranges=['employee','department','agreement'].map((key,i)=>['Legajos','Reparticiones','Convenios'][i]+': '+(f[key+'From']||'inicio')+' a '+(f[key+'To']||'fin')).join(' · ');
 return {layout:'own-payroll-report.v1',title,columns,rows,totals:[],...(view==='legajo'?{legajoReport:true}:{}),...(payrollStatement?{payrollStatement}:{}),...(view==='statistics'?{statisticsSelection:statistics}:{}),metadata:[...variableMetadata,['Períodos',b.query.from+' a '+b.query.to],['Tipos',b.query.types.map(t=>OWN_RUN_TYPES[t]).join(', ')],['Jurisdicción elegida',OWN_JURISDICTIONS[ownJurisdictionChoice(jurisdiction)]],['Participaciones sin jurisdicción informada',chosen.filter(r=>{const j=ownClosedJurisdiction(r.employee,r.source.snapshot.version);return j.basis==='captured_own_registration'&&j.code===null;}).length],['Participaciones sin captura de jurisdicción',chosen.filter(r=>ownClosedJurisdiction(r.employee,r.source.snapshot.version).basis==='not_captured').length],['Rangos',ranges],['Selección de legajos',ids.length?String(ids.length)+' contratos exactos':'Todos los contratos del alcance'],['Grupos originales cerrados',b.sources.length],['Participaciones seleccionadas',chosen.length],['Contratos distintos',new Set(chosen.map(e=>e.employee.contractId)).size],['Bruto exacto del alcance',totals?.gross??'Sin participaciones'],['Retenciones exactas del alcance',totals?.deduction??'Sin participaciones'],['Neto exacto del alcance',totals?.net??'Sin participaciones'],['Filas completas del informe',rows.length]],notes:['variables','variable_usage','variable_sources'].includes(view)?['Los valores, descripciones, unidades y fuentes proceden de las capturas originales de cada liquidación. La antigüedad sólo se informa si fue capturada; su ausencia no equivale a cero y no se completa desde el padrón actual.','Variables originales muestra una vez cada entrada. Uso de variables por concepto distingue uso directo, uso por otro concepto y entradas capturadas sin uso, según la traza conservada.','Sólo incluye grupos actualmente cerrados. Un grupo parcial conserva su cobertura parcial. Fuentes de las variables permite consultar las huellas originales y la fecha declarada, si existe.','Legajos elegidos, meses, tipos y rangos definen el mismo alcance en PDF, Excel y CSV. La búsqueda y la página sólo cambian la vista.','Informe de consulta sin firma ni presentación oficial. Conserva los importes originales; no genera cálculos, imputaciones ni pagos.']:[...(view==='legajo'?['Las descripciones y naturalezas proceden del catálogo conservado en cada cálculo. No se sustituyen por conceptos actuales.','Haberes reúne remunerativos y no remunerativos, identificados por su naturaleza original. Retenciones, contribuciones patronales y auxiliares permanecen separados. Una celda vacía indica que esa naturaleza no corresponde a la columna; un cero explícito se conserva.','Los seis totalizadores de cada participación son sus totales cerrados originales, separados del detalle. No se suman otra vez como conceptos. Los totalizadores no calculan un SAC nuevo.']:[]),'Histórico cerrado de registros propios, incluidas adopciones aprobadas; no certifica cobertura del padrón municipal migrado.','Sólo grupos actualmente cerrados. Los grupos reabiertos se conservan en el histórico de cierre y quedan fuera de este informe vigente.','Los importes y valores originales conservan su precisión. No se evalúan fórmulas, se imputan haberes ni se ejecutan pagos.','Búsqueda y página cambian sólo la vista; legajos elegidos, rangos, tipos y agrupación definen el mismo alcance en todas las descargas.','Cada contrato, período y tipo es una participación. Los auxiliares son valores de cálculo separados; no se suman como haberes.','Convenio, repartición y jurisdicción proceden exclusivamente de las fuentes conservadas. Un cierre anterior conserva jurisdicción no capturada; no se completa desde el padrón actual. Jurisdicción, identidad documental y antigüedad no se infieren de datos actuales. La clasificación 42/55 no certifica encuadre fiscal.','No es un recibo institucional ni un documento firmado. Consultá Fuentes y cobertura para las huellas y cantidades originales.'],filename:'municontrol_nomina_propia_'+view+'_'+b.query.from+'_'+b.query.to};
}
