// MuniControl contra GRH: una corrida propia completa frente a la liquidación GRH incorporada del mismo
// período y tipo, por legajo y concepto y por totales de legajo. Modelo puro: no recalcula fórmulas, no
// redondea importes y no completa con cero lo que falta en un lado.
import {salaryExact,salaryHash,salarySerialized} from './native-salary-catalog-model.js';
import {ownHistoricalRunResult} from './own-payroll-historical-result-model.js';
import {decimal,exactAdd,exactSubtract,quantize,rational} from './own-payroll-exact.js';
import {OWN_COMPARISON_MAX_ROWS,ownComparisonCentRounding} from './own-payroll-comparison-model.js';

export const OWN_GRH_COMPARISON_VERSION='own-grh-comparison.v1';
export const GRH_STATEMENT_LINES_VERSION='grh-statement-lines.v1';
// Forma de transporte (242 → navegador): el catálogo de conceptos va una sola vez y cada renglón es [código, importe, cantidad].
// Con 30.000 renglones la forma expandida superaba el límite de respuesta de Vercel; ésta queda cerca de un tercio.
export const GRH_STATEMENT_LINES_COMPACT_VERSION='grh-statement-lines-compact.v1';
// La unión se declara; nunca se deduce. Número de legajo propio contra legajo GRH, por igualdad exacta de texto:
// sin convertir a número, sin quitar ceros iniciales ni espacios.
export const OWN_GRH_JOIN=Object.freeze({own:'employeeNumber',grh:'legajo'});
// Tipo propio ↔ letra GRH (sourceReportTypeLabel). «Suplementaria» no tiene equivalente declarado: no se compara.
export const OWN_GRH_TYPES=Object.freeze({monthly:'M',first_fortnight:'P',sac:'S',vacation:'V',final:'F',other:'O'});
// Acumulador GRH → naturaleza propia; la misma correspondencia que own-payroll-official-totals.js (expectedNatures).
export const OWN_GRH_GROUP_NATURES=Object.freeze({'990':'employer_contribution','993':'remuneration','994':'non_remuneration','995':'non_remuneration','996':'deduction'});
export const OWN_GRH_STATUS=Object.freeze({
 equal:'Sin diferencia',
 rounding:'Diferencia de redondeo (hasta 5 centavos)',
 difference:'Diferencia',
 only_own:'Sólo en MuniControl',
 only_grh:'Sólo en GRH',
 not_comparable:'Unidad o naturaleza distinta; diferencia no evaluable',
 missing:'Importe no informado; diferencia no evaluable',
});
// Totales por legajo: etiqueta (la misma que reconoce ownComparisonCentRounding), campo propio y códigos GRH que lo forman.
export const OWN_GRH_TOTALS=Object.freeze([
 Object.freeze({label:'Bruto',own:'gross',grh:Object.freeze(['993','994','995'])}),
 Object.freeze({label:'Retenciones',own:'deduction',grh:Object.freeze(['996'])}),
 Object.freeze({label:'Neto calculado',own:'net',grh:Object.freeze(['999'])}),
 Object.freeze({label:'Aportes patronales',own:'employer_contribution',grh:Object.freeze(['990'])}),
]);

const need=(v,message)=>{if(!v)throw Error(message);};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const cents=v=>v===null||(typeof v==='string'&&/^-?(0|[1-9][0-9]{0,12})\.[0-9]{2}$/.test(v));
const plain=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const technical=code=>Number(code)>=990&&Number(code)<=999;
const precision=v=>v.split('.')[1]?.length??0;
const subtract=(own,grh)=>quantize(exactSubtract(decimal(own),decimal(grh)),{precision:Math.max(precision(own),precision(grh)),mode:'exact'}).amount;
const sum=values=>quantize(values.reduce((a,v)=>exactAdd(a,decimal(v)),rational(0n)),{precision:Math.max(...values.map(precision)),mode:'exact'}).amount;
const zero=v=>decimal(v).n===0n;
const order=(a,b)=>a<b?-1:a>b?1:0;
const codeOrder=(a,b)=>Number(a)-Number(b)||order(a,b);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};

/** Valida la liquidación GRH por legajo. Exige la fuente completa: un legajo ausente de una fuente parcial no se puede afirmar. */
export function grhStatementLines(raw){
 need(salaryExact(raw,['version','official','datasetId','period','payrollType','closureStatus','sourceHash','complete','statements'])&&raw.version===GRH_STATEMENT_LINES_VERSION&&raw.official===false,'La liquidación GRH no tiene el formato esperado.');
 need(uuid(raw.datasetId)&&salaryHash(raw.sourceHash)&&/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.period)&&/^[A-Z]$/.test(raw.payrollType)&&['closed','open','unknown'].includes(raw.closureStatus),'La liquidación GRH no identifica su período, tipo, cierre o huella.');
 need(raw.complete===true,'La liquidación GRH incorporada debe estar completa para afirmar qué legajos faltan.');
 need(Array.isArray(raw.statements)&&raw.statements.length>0&&raw.statements.length<=OWN_COMPARISON_MAX_ROWS,'La liquidación GRH no tiene legajos o supera el límite completo.');
 const legajos=new Set(),statements=new Set();
 for(const s of raw.statements){
  need(salaryExact(s,['legajo','statementId','statementHash','lines'])&&typeof s.legajo==='string'&&/^[0-9]{1,12}$/.test(s.legajo)&&uuid(s.statementId)&&salaryHash(s.statementHash),'Un recibo GRH no identifica su legajo o su huella.');
  need(!legajos.has(s.legajo)&&!statements.has(s.statementId),'La liquidación GRH repite un legajo o un recibo: la unión por legajo sería ambigua.');
  legajos.add(s.legajo);statements.add(s.statementId);
  // 1.000 renglones por recibo es el contrato del respaldo (CHECK de payroll_detail_statement en la 048), no un recorte.
  need(Array.isArray(s.lines)&&s.lines.length>0&&s.lines.length<=1000,'Un recibo GRH no tiene renglones o excede el contrato del respaldo.');
  const codes=new Set();
  for(const l of s.lines){
   need(salaryExact(l,['code','description','amount','quantity','totalGroup','unit'])&&typeof l.code==='string'&&/^(0|[1-9][0-9]{0,5})$/.test(l.code)&&!codes.has(l.code),'Un renglón GRH tiene código inválido, con ceros iniciales o repetido.');
   codes.add(l.code);
   // Descripción y unidad son informativas: pueden llegar vacías desde el catálogo GRH (la unidad, hasta 80 como en el reporte de origen).
   need((l.description===null||plain(l.description,240))&&cents(l.amount)&&cents(l.quantity)&&(l.totalGroup===null||(typeof l.totalGroup==='string'&&/^\d{1,6}$/.test(l.totalGroup)))&&(l.unit===null||plain(l.unit,80)),'Un renglón GRH tiene importe, cantidad, acumulador o unidad inválidos.');
  }
 }
 return raw;
}

/** Expande la forma de transporte de la 242 a la forma que compara el modelo, sin completar ni inventar nada. */
export function grhStatementLinesExpand(raw){
 need(salaryExact(raw,['version','official','datasetId','period','payrollType','closureStatus','sourceHash','complete','concepts','statements'])&&raw.version===GRH_STATEMENT_LINES_COMPACT_VERSION,'La liquidación GRH no tiene el formato esperado.');
 const concepts=raw.concepts;
 need(concepts!==null&&typeof concepts==='object'&&!Array.isArray(concepts)&&Object.keys(concepts).length<=30000,'La liquidación GRH no trae su catálogo de conceptos.');
 for(const [code,c]of Object.entries(concepts))need(/^(0|[1-9][0-9]{0,5})$/.test(code)&&salaryExact(c,['description','totalGroup','unit']),'El catálogo GRH tiene un concepto inválido.');
 need(Array.isArray(raw.statements),'La liquidación GRH no tiene legajos.');
 const used=new Set();
 const statements=raw.statements.map(s=>{
  need(salaryExact(s,['legajo','statementId','statementHash','lines'])&&Array.isArray(s.lines),'Un recibo GRH no identifica su legajo o su huella.');
  return {legajo:s.legajo,statementId:s.statementId,statementHash:s.statementHash,lines:s.lines.map(l=>{
   need(Array.isArray(l)&&l.length===3&&typeof l[0]==='string'&&Object.hasOwn(concepts,l[0]),'Un renglón GRH no corresponde a su catálogo.');
   used.add(l[0]);const c=concepts[l[0]];
   return {code:l[0],description:c.description,amount:l[1],quantity:l[2],totalGroup:c.totalGroup,unit:c.unit};
  })};
 });
 need(used.size===Object.keys(concepts).length,'El catálogo GRH trae conceptos que ningún recibo usa.');
 const {concepts:_concepts,...head}=raw;
 return grhStatementLines({...head,version:GRH_STATEMENT_LINES_VERSION,statements});
}

function compare({own,grh,roundingLabel}){
 if(!grh)return {status:'only_own',delta:null};
 if(!own)return {status:'only_grh',delta:null};
 if(own.unit!=='money'||grh.unit!=='money'||own.nature===null||grh.nature===null||own.nature!==grh.nature)return {status:'not_comparable',delta:null};
 if(own.amount===null||grh.amount===null)return {status:'missing',delta:null};
 const delta=subtract(own.amount,grh.amount);
 if(zero(delta))return {status:'equal',delta};
 return {status:roundingLabel&&ownComparisonCentRounding(roundingLabel,delta)?'rounding':'difference',delta};
}
function row(kind,legajo,contractId,statementId,code,label,own,grh,roundingLabel){
 const {status,delta}=compare({own,grh,roundingLabel});
 return {kind,legajo,contractId,statementId,code,label,own,grh,delta,status,state:OWN_GRH_STATUS[status],
  rounding:status==='rounding',review:!['equal','rounding'].includes(status)};
}

/**
 * Compara la corrida propia (captura verificada por ownHistoricalRunResult) con la liquidación GRH del mismo
 * período y tipo. Diferencia = MuniControl menos GRH. Sólo en totales y retenciones una diferencia exacta de
 * 1 a 5 centavos se rotula como redondeo; sigue visible con su importe. Nada se recorta: si el resultado
 * completo supera OWN_COMPARISON_MAX_ROWS no se compara.
 */
export function ownGrhComparison(capture,grhRaw,join){
 need(salaryExact(join,['own','grh'])&&join.own===OWN_GRH_JOIN.own&&join.grh===OWN_GRH_JOIN.grh,'Declará la unión: número de legajo propio con legajo GRH.');
 const run=ownHistoricalRunResult(capture);
 need(run,'Elegí un cálculo propio completo. Una captura pendiente no se compara.');
 const grh=grhStatementLines(grhRaw),type=OWN_GRH_TYPES[run.input.liquidationType];
 need(run.input.period===grh.period,'La liquidación GRH debe ser del mismo período que el cálculo propio.');
 need(type!==undefined&&type===grh.payrollType,'La liquidación GRH debe ser del mismo tipo que el cálculo propio.');

 const ownPeople=new Map();
 for(const t of run.result.employeeTotals){
  const number=run.people.get(t.contractId)?.employeeNumber;
  need(typeof number==='string','Un contrato del cálculo propio no tiene número de legajo.');
  need(!ownPeople.has(number),'Dos contratos del cálculo propio comparten número de legajo: la unión por legajo sería ambigua.');
  ownPeople.set(number,{contractId:t.contractId,totals:t,rows:[]});
 }
 for(const r of run.result.rows)ownPeople.get(run.people.get(r.contractId).employeeNumber)?.rows.push(r);
 const grhPeople=new Map(grh.statements.map(s=>[s.legajo,s]));
 const legajos=[...new Set([...ownPeople.keys(),...grhPeople.keys()])].sort((a,b)=>order(a,b));
 // Primero se arma la unión completa y se cuenta lo que realmente se va a mostrar; recién entonces se compara.
 const plan=legajos.map(legajo=>{
  const mine=ownPeople.get(legajo)??null,theirs=grhPeople.get(legajo)??null;
  // Conceptos: un renglón GRH se une con el concepto propio del mismo código y, si no lo hay, con el auxiliar propio de ese código.
  const lines=new Map((theirs?.lines??[]).filter(l=>!technical(l.code)).map(l=>[l.code,l]));
  const byCode=new Map();
  for(const r of mine?.rows??[]){const slot=byCode.get(r.conceptCode)??{};slot[r.nature==='auxiliary'?'auxiliary':'concept']=r;byCode.set(r.conceptCode,slot);}
  const codes=[...new Set([...byCode.keys(),...lines.keys()])].sort(codeOrder);
  // Un total existe si al menos un lado lo informa: el propio siempre; GRH si trae alguno de sus totalizadores.
  const reported=new Map((theirs?.lines??[]).filter(l=>technical(l.code)).map(l=>[l.code,l.amount]));
  const totalSet=OWN_GRH_TOTALS.filter(t=>mine||t.grh.some(c=>reported.has(c)));
  return {legajo,mine,theirs,lines,byCode,codes,reported,totalSet,size:codes.length+codes.filter(c=>byCode.get(c)?.concept&&byCode.get(c)?.auxiliary).length+totalSet.length};
 });
 need(plan.reduce((n,p)=>n+p.size,0)<=OWN_COMPARISON_MAX_ROWS,'La comparación completa supera 250.000 filas. No se omitieron ni dividieron registros.');

 const rows=[],totals=[];
 for(const {legajo,mine,theirs,lines,byCode,codes,reported,totalSet}of plan){
  const contractId=mine?.contractId??null,statementId=theirs?.statementId??null;
  const ownView=r=>({nature:r.nature,unit:r.unit,amount:r.amount});
  const grhView=l=>({nature:l.totalGroup===null?null:OWN_GRH_GROUP_NATURES[l.totalGroup]??null,unit:'money',amount:l.amount,totalGroup:l.totalGroup,description:l.description,quantity:l.quantity,quantityUnit:l.unit});
  for(const code of codes){
   const slot=byCode.get(code)??{},line=lines.get(code)??null,paired=slot.concept??slot.auxiliary??null;
   const both=paired&&line&&paired.nature==='deduction'&&grhView(line).nature==='deduction';
   rows.push(row('concept',legajo,contractId,statementId,code,code,paired?ownView(paired):null,line?grhView(line):null,both?'Retenciones':null));
   if(slot.concept&&slot.auxiliary)rows.push(row('concept',legajo,contractId,statementId,code,code,ownView(slot.auxiliary),null,null));
  }
  for(const total of totalSet){
   // Ningún totalizador del total en el recibo: GRH no lo informa («Sólo en MuniControl»). Uno presente y otro
   // ausente, o un importe sin informar: el total GRH es incompleto y no se evalúa. Nunca se completa con cero.
   const parts=total.grh.map(c=>reported.has(c)?reported.get(c):null),present=total.grh.some(c=>reported.has(c));
   totals.push(row('total',legajo,contractId,statementId,total.grh.join('+'),total.label,
    mine?{nature:total.own,unit:'money',amount:mine.totals[total.own]}:null,
    theirs&&present?{nature:total.own,unit:'money',amount:parts.some(v=>v===null)?null:sum(parts),codes:total.grh}:null,total.label));
  }
 }
 const all=[...rows,...totals],count=status=>all.filter(r=>r.status===status).length;
 const warnings=[
  'Diferencia = MuniControl menos GRH. Lo que figura en un solo lado no equivale a cero.',
  'Sólo en totales y retenciones, una diferencia exacta de 1 a 5 centavos se rotula como redondeo: queda visible con su importe y no se iguala.',
  'Unión declarada por número de legajo, como texto exacto: los ceros iniciales cuentan y no se adivina ninguna correspondencia.',
  'Compara resultados guardados. No acredita confirmación, cierre, homologación municipal ni pago.',
 ];
 if(grh.closureStatus!=='closed')warnings.push('La liquidación GRH no informa cierre: comparación de consulta.');
 if([...ownPeople.keys()].some(l=>!grhPeople.has(l))||[...grhPeople.keys()].some(l=>!ownPeople.has(l)))warnings.push('Los legajos de MuniControl y GRH no coinciden por completo. Las ausencias se muestran sin convertirlas en cero.');
 return freeze({version:OWN_GRH_COMPARISON_VERSION,join:{...OWN_GRH_JOIN},
  own:{id:capture.id,key:capture.key,period:run.input.period,liquidationType:run.input.liquidationType,payloadSha256:capture.payloadSha256,inputSha256:capture.saved.inputSha256,resultSha256:capture.saved.resultSha256,algorithmSha256:capture.algorithmSha256},
  grh:{datasetId:grh.datasetId,period:grh.period,payrollType:grh.payrollType,closureStatus:grh.closureStatus,sourceHash:grh.sourceHash,statementCount:grh.statements.length},
  rows,totals,
  summary:{legajos:legajos.length,onlyOwnLegajos:[...ownPeople.keys()].filter(l=>!grhPeople.has(l)).length,onlyGrhLegajos:[...grhPeople.keys()].filter(l=>!ownPeople.has(l)).length,
   equal:count('equal'),rounding:count('rounding'),difference:count('difference'),onlyOwn:count('only_own'),onlyGrh:count('only_grh'),notComparable:count('not_comparable'),missing:count('missing'),review:all.filter(r=>r.review).length},
  warnings,proof:salarySerialized([capture.id,capture.payloadSha256,capture.saved.inputSha256,capture.saved.resultSha256,grh.datasetId,grh.sourceHash,grh.statements.map(s=>s.statementHash)])});
}
