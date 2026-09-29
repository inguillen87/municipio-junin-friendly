// Inclusive filtering of source periods already returned by the authorized library.
// No new reads, amounts, identity selection, inferred payment or source merging.
import {normalizeDocumentLibrary,DOCUMENT_PAGE_SIZE} from './payroll-document-library-model.js';
function validMonth(value){return typeof value==='string'&&/^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/.test(value);}
export function documentPeriodRangePage(raw,{from,to,type=''}={},requestedPage=1){
 if(!validMonth(from)||!validMonth(to)||from>to||typeof type!=='string'||type!==''&&!/^[A-Z]$/.test(type))throw Object.assign(Error('Completá desde y hasta en orden; ambos períodos son obligatorios.'),{code:'DOCUMENT_PERIOD_RANGE_INVALID'});
 if(!Number.isSafeInteger(requestedPage)||requestedPage<1)throw Error('DOCUMENT_PAGE_INVALID');
 const library=normalizeDocumentLibrary(raw);
 const matches=library.items.filter(item=>{
  const period=item.sourcePeriod+'-'+String(item.sourceMonth).padStart(2,'0');
  return period>=from&&period<=to&&(type===''||item.payrollType===type);
 });
 const pages=Math.max(1,Math.ceil(matches.length/DOCUMENT_PAGE_SIZE)),page=Math.min(requestedPage,pages),offset=(page-1)*DOCUMENT_PAGE_SIZE;
 return Object.freeze({items:Object.freeze(matches.slice(offset,offset+DOCUMENT_PAGE_SIZE)),total:matches.length,page,pages,from:matches.length?offset+1:0,to:Math.min(offset+DOCUMENT_PAGE_SIZE,matches.length),periodFrom:from,periodTo:to,type,truncated:library.truncated,received:library.items.length});
}
