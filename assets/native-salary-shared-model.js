import {SALARY_MAX_ITEMS,SalaryInputError,salaryDiff,salaryItems,salaryRowKey} from './native-salary-catalog-model.js';
import {salaryBulkSelection} from './native-salary-bulk-model.js';

// Values that are the same in several agreements: the latest validity of a definition (kind,
// code, class, unit, precision) declared with the same value in two or more agreements.
// Grouping is read-only and only selects rows for a reviewed plan; it never converts a unit,
// fills a missing value or decides that two different values should be equal.
const KIND_ORDER={auxiliary:0,scale:1,concept:2};
const natural=new Intl.Collator('es',{numeric:true});
const month=value=>typeof value==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(value);
const requireInput=(condition,message)=>{if(!condition)throw new SalaryInputError('SHARED_INPUT_INVALID',message);};
const nextMonth=value=>{const [year,number]=value.split('-').map(Number);return number===12?`${year+1}-01`:`${year}-${String(number+1).padStart(2,'0')}`;};
const monthsBetween=(from,until)=>{const [fy,fm]=from.split('-').map(Number),[uy,um]=until.split('-').map(Number);return (uy-fy)*12+um-fm;};
const addMonths=(value,count)=>{let current=value;for(let step=0;step<count;step++)current=nextMonth(current);return current;};
const definition=row=>[row.kind,row.agreementCode,row.categoryCode??'',row.code].join(':');
const identity=row=>[row.kind,row.code,row.categoryCode??'',row.unit,row.precision].join('|');
const mostCommon=counts=>[...counts].sort((a,b)=>b[1]-a[1]||natural.compare(a[0],b[0]))[0][0];

export function salarySharedGroups(raw,{minAgreements=2}={}){
 if(!Number.isInteger(minAgreements)||minAgreements<1)throw new TypeError('minAgreements');
 // Only the latest validity of each enabled definition counts as «today».
 const latest=new Map();
 for(const row of salaryItems(raw)){
  if(!row.active)continue;
  const key=definition(row),known=latest.get(key);
  if(!known||row.validFrom>known.validFrom)latest.set(key,row);
 }
 const groups=new Map(),byIdentity=new Map();
 for(const row of latest.values()){
  if(row.value===null)continue;
  const id=identity(row)+'|'+row.value;
  let group=groups.get(id);
  if(!group)groups.set(id,group={id,identity:identity(row),kind:row.kind,code:row.code,categoryCode:row.categoryCode??null,unit:row.unit,precision:row.precision,value:row.value,rows:[],labels:new Map()});
  group.rows.push(row);group.labels.set(row.label,(group.labels.get(row.label)??0)+1);
  if(!byIdentity.has(group.identity))byIdentity.set(group.identity,new Map());
  const values=byIdentity.get(group.identity);
  if(!values.has(row.value))values.set(row.value,new Set());
  values.get(row.value).add(row.agreementCode);
 }
 return [...groups.values()].map(group=>{
  const rows=group.rows.sort((a,b)=>natural.compare(a.agreementCode,b.agreementCode)||salaryRowKey(a).localeCompare(salaryRowKey(b)));
  const agreements=[...new Set(rows.map(row=>row.agreementCode))].sort(natural.compare);
  const open=rows.filter(row=>row.validUntil===null).length,untils=[...new Set(rows.map(row=>row.validUntil))];
  const others=[...byIdentity.get(group.identity)].filter(([value])=>value!==group.value).map(([value,codes])=>({value,agreements:[...codes].sort(natural.compare)})).sort((a,b)=>natural.compare(a.value,b.value));
  return {id:group.id,kind:group.kind,code:group.code,categoryCode:group.categoryCode,label:mostCommon(group.labels),unit:group.unit,precision:group.precision,value:group.value,rows,agreements,
   // open: every row has no end and can start a new validity; closed: every row ended in the same month and a new period is prepared from it.
   mode:open===rows.length?'open':open===0&&untils.length===1?'closed':'mixed',
   latestValidFrom:rows.reduce((last,row)=>row.validFrom>last?row.validFrom:last,''),validUntil:untils.length===1?untils[0]:null,
   periodMonths:open===0&&untils.length===1&&rows.every(row=>row.validFrom===rows[0].validFrom)?monthsBetween(rows[0].validFrom,rows[0].validUntil):null,
   hasDependencies:rows.some(row=>row.dependencies.length>0),others};
 }).filter(group=>group.agreements.length>=minAgreements)
  .sort((a,b)=>KIND_ORDER[a.kind]-KIND_ORDER[b.kind]||natural.compare(a.code,b.code)||natural.compare(a.categoryCode??'',b.categoryCode??'')||natural.compare(a.value,b.value));
}

// First month the new value can start in every agreement of the group.
export function salarySharedFirstMonth(group){return nextMonth(group.mode==='closed'?group.validUntil:group.latestValidFrom);}
// Only a common finished duration suggests an end (a month stays a month).
export function salarySharedLastMonth(group,firstMonth){return group.mode==='closed'&&Number.isInteger(group.periodMonths)?addMonths(firstMonth,group.periodMonths):null;}

export function salarySharedTitle(group){
 const kind=group.kind==='scale'?'Escala':group.kind==='auxiliary'?'Valor':'Concepto';
 return `${kind} ${group.code}${group.categoryCode?' · clase '+group.categoryCode:''} · ${group.label}`;
}

export function salarySharedSummary(group){
 const where=group.agreements.length+' convenios ('+group.agreements.join(', ')+')';
 const when=group.mode==='open'?'sin fecha de fin':group.mode==='closed'?'vigente hasta '+group.validUntil:'con vigencias distintas entre convenios';
 const others=group.others.length?' · en otros convenios: '+group.others.map(entry=>`${entry.value} (${entry.agreements.join(', ')})`).join('; '):'';
 return `${where} · hoy ${group.value} · ${when}${others}`;
}

// A new period for definitions whose validity already ended, with one declared value for the
// whole selection. Source rows stay exactly as they are; nothing else gains a new validity.
export function salarySharedPeriodPlan(raw,selections,change,validFrom,validUntil){
 const {current,chosen}=salaryBulkSelection(raw,selections,change);
 requireInput(month(validFrom),'Elegí el mes en que empieza el período nuevo.');
 requireInput(month(validUntil)&&validUntil>=validFrom,'Elegí el mes final del período nuevo. No se prolonga la vigencia de origen.');
 for(const row of chosen.values()){
  requireInput(row.validUntil!==null&&row.validUntil<validFrom,`${describe(row)} todavía está vigente en ${validFrom}. Para una vigencia abierta usá «Iniciar vigencia desde otro mes».`);
  requireInput(row.dependencies.length===0,`${describe(row)} depende de otras definiciones. Preparala con sus dependencias desde la edición individual; acá no se copian referencias a un período anterior.`);
  requireInput(!current.some(other=>definition(other)===definition(row)&&other.validFrom>row.validFrom),`${describe(row)} ya tiene una vigencia posterior. Revisá la selección: sólo se parte de la última.`);
 }
 requireInput(current.length+chosen.size<=SALARY_MAX_ITEMS,`La versión completa tendría ${current.length+chosen.size} definiciones y el límite es ${SALARY_MAX_ITEMS}. No se recorta ni se divide la preparación.`);
 const started=[...chosen.values()].map(row=>({...row,value:change.value,ruleReference:change.ruleReference,validFrom,validUntil}));
 const items=salaryItems([...current,...started]),changes=salaryDiff(current,items);
 return {items,changes,selectedCount:chosen.size,unchangedSelectedCount:0,newDefinitionsCount:chosen.size,relatedDefinitionsCount:0,relinkedFutureDefinitionsCount:0,validFrom,previousUntil:null,validUntil,preparationMode:'closed_period'};
}
const describe=row=>`${row.kind==='scale'?'Escala':row.kind==='auxiliary'?'Auxiliar':'Concepto'} ${row.code} · convenio ${row.agreementCode}${row.categoryCode?' · clase '+row.categoryCode:''} · desde ${row.validFrom}`;
