/** Source metadata only. The library never derives salary, payment or signature authority. */
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const DOCUMENT_TYPES=Object.freeze({F:'Liquidación final',M:'Mensual / segunda quincena',O:'Otras liquidaciones',P:'Primera quincena',S:'Sueldo anual complementario',V:'Vacaciones'});
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
function integer(n,min,max){return Number.isSafeInteger(n)&&n>=min&&n<=max}
function safeText(s,max){return typeof s==='string'&&s.trim().length>0&&s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s)}
export function documentTypeLabel(value){return DOCUMENT_TYPES[value]||'Tipo de origen '+String(value)}
export function normalizeDocumentLibrary(data){
 if(!data||data.version!=='payroll-document-library.v1'||data.found!==true||!Array.isArray(data.items)||data.items.length>1000||!integer(data.total,0,100000)||typeof data.truncated!=='boolean'||data.items.length!==Math.min(1000,data.total)||data.truncated!==(data.total>1000)||data.officialReceipt!==false||data.signatureApplied!==false)throw Error('PAYROLL_DOCUMENT_LIBRARY_INVALID');
 const keys=new Set(),ids=new Set();
 const items=data.items.map(r=>{
  if(!r||!UUID.test(r.datasetId)||!validDate(r.payrollDate)||!integer(r.sourcePeriod,1900,2100)||!integer(r.sourceMonth,1,12)||! /^[A-Z]$/.test(r.payrollType)||!['closed','open','unknown'].includes(r.closureStatus)||!safeText(r.sourceLabel,240)||!safeText(r.importedAt,64)||!/^\d{4}-\d{2}-\d{2}T/.test(r.importedAt)||!Number.isFinite(Date.parse(r.importedAt))||!integer(r.conceptCount,1,1000)||!integer(r.versionsAvailable,1,100000)||typeof r.historySummaryAvailable!=='boolean')throw Error('PAYROLL_DOCUMENT_LIBRARY_ITEM_INVALID');
  const key=[r.payrollDate,r.sourcePeriod,r.sourceMonth,r.payrollType].join('|');if(keys.has(key)||ids.has(r.datasetId))throw Error('PAYROLL_DOCUMENT_LIBRARY_DUPLICATE');keys.add(key);ids.add(r.datasetId);
  return Object.freeze(Object.fromEntries(['datasetId','payrollDate','sourcePeriod','sourceMonth','payrollType','closureStatus','sourceLabel','importedAt','conceptCount','versionsAvailable','historySummaryAvailable'].map(k=>[k,r[k]])));
 });
 items.sort((a,b)=>b.payrollDate.localeCompare(a.payrollDate)||a.payrollType.localeCompare(b.payrollType)||b.sourcePeriod-a.sourcePeriod||b.sourceMonth-a.sourceMonth);
 return Object.freeze({version:data.version,found:true,items:Object.freeze(items),total:data.total,truncated:data.truncated,officialReceipt:false,signatureApplied:false});
}
export function filterDocumentLibrary(library,{year='',month='',type=''}={}){
 if(year!==''&&!/^(19\d{2}|20\d{2}|2100)$/.test(String(year)))throw Error('DOCUMENT_YEAR_INVALID');
 if(month!==''&&!/^(?:[1-9]|1[0-2])$/.test(String(month)))throw Error('DOCUMENT_MONTH_INVALID');
 if(type!==''&&!/^[A-Z]$/.test(type))throw Error('DOCUMENT_TYPE_INVALID');
 return library.items.filter(r=>(year===''||r.sourcePeriod===Number(year))&&(month===''||r.sourceMonth===Number(month))&&(type===''||r.payrollType===type));
}
