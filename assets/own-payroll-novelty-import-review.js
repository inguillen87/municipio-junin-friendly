import {OWN_NOVELTY_MAX_ROWS} from './own-payroll-novelties-model.js';

export const OWN_NOVELTY_IMPORT_PAGE_SIZE=50;
const searchable=value=>String(value??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
const terms=row=>searchable([row.key,row.name,row.legajo,row.concept,...(row.sourceLines??[]),...(row.candidates??[]).flatMap(candidate=>[candidate.legajo,candidate.detail])].join(' '));

// A search is only a view over the complete resolution. It never changes a choice or the rows to be added.
export function ownNoveltyImportPage(rows,{search='',page=1}={}){
 if(!Array.isArray(rows)||rows.length>OWN_NOVELTY_MAX_ROWS||typeof search!=='string'||!Number.isSafeInteger(page)||page<1)throw Error('No se verificó la página de revisión del archivo.');
 const query=searchable(search).trim().split(/\s+/).filter(Boolean),filtered=query.length?rows.filter(row=>query.every(word=>terms(row).includes(word))):rows;
 const pages=Math.max(1,Math.ceil(filtered.length/OWN_NOVELTY_IMPORT_PAGE_SIZE)),current=Math.min(page,pages),start=(current-1)*OWN_NOVELTY_IMPORT_PAGE_SIZE;
 return {rows:filtered.slice(start,start+OWN_NOVELTY_IMPORT_PAGE_SIZE),total:rows.length,filtered:filtered.length,page:current,pages,from:filtered.length?start+1:0,to:Math.min(start+OWN_NOVELTY_IMPORT_PAGE_SIZE,filtered.length)};
}

export function ownNoveltyImportResolution(read,linked){
 const groups=[linked?.resolved,linked?.missing,linked?.ambiguous];
 if(!Array.isArray(read?.rows)||read.rows.length>OWN_NOVELTY_MAX_ROWS||groups.some(rows=>!Array.isArray(rows))||groups.reduce((n,rows)=>n+rows.length,0)!==read.rows.length)throw Error('La revisión no conserva todas las filas del archivo. Volvé a leerlo.');
 const missing=linked.missing.length,ambiguous=linked.ambiguous.length;
 return {total:read.rows.length,resolved:linked.resolved.length,missing,ambiguous,ready:read.rows.length>0&&missing===0&&ambiguous===0};
}
