import {verifiedDocumentCollection,COLLECTION_LIMITS} from './payroll-document-collection.js';
import {payrollDetailPages,encodePayrollPages} from './payroll-detail-export.js';
const mapping={0x20ac:128,0x2013:150,0x2014:151,0x2018:145,0x2019:146,0x201c:147,0x201d:148,0x2022:149,0x2212:45};
const fail=code=>{throw Object.assign(Error(code),{code});};
function compatible(v){for(const c of String(v??'')){const n=c.codePointAt(0);if(!(n>=32&&n<=255||mapping[n]!==undefined))fail('COLLECTION_TEXT_UNSUPPORTED');}}
const hex=v=>'<'+Array.from(String(v),c=>(mapping[c.codePointAt(0)]??c.codePointAt(0)).toString(16).padStart(2,'0')).join('')+'>';
function lines(text,max){const result=[];let current='';for(let word of String(text).split(/\s+/)){while(word.length>max){if(current)result.push(current);current='';result.push(word.slice(0,max));word=word.slice(max);}if((current+' '+word).trim().length>max){if(current)result.push(current);current=word;}else current=(current+' '+word).trim();}if(current)result.push(current);return result.length?result:[''];}
function text(x,y,value,size=9,bold=false,color='0.08 0.20 0.26'){return `BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm ${hex(value)} Tj ET`;}
function checkedCollection(value){const c=verifiedDocumentCollection(value);for(const m of c.models)for(const v of [m.name,m.sourceLabel,m.legajo,...m.rows.map(r=>r.description)])compatible(v);return c;}
export function createPayrollDocumentSetPdf(value){const c=checkedCollection(value);return finishPdf(c,c.models.map(m=>payrollDetailPages(m,{boundedText:true})));}
export async function createPayrollDocumentSetPdfAsync(value,{signal,progress=()=>{}}={}){
 const c=checkedCollection(value),documents=[];let pages=0;signal.throwIfAborted();
 for(let i=0;i<c.models.length;i++){signal.throwIfAborted();const part=payrollDetailPages(c.models[i],{boundedText:true});pages+=part.length;if(pages>8000)fail('COLLECTION_LIMIT');documents.push(part);progress({phase:'pdf',done:i+1,total:c.models.length});await new Promise(r=>setTimeout(r,0));}
 signal.throwIfAborted();const result=finishPdf(c,documents);await new Promise(r=>setTimeout(r,0));if(signal.aborted){result.bytes.fill(0);signal.throwIfAborted();}return result;
}
function finishPdf(value,documents){
 const c=verifiedDocumentCollection(value),d=c.preview.dataset;
 for(const m of c.models){for(const v of [m.name,m.sourceLabel,m.legajo,...m.rows.map(r=>r.description)])compatible(v);}
 const index=[],entries=[];let y=478,page=0;
 for(let n=0;n<c.models.length;n++){
  const name=lines(c.models[n].name,39),height=Math.max(25,name.length*12+10);
  if(y-height<80){page++;y=716;}entries.push({n,page,y,name,height});y-=height;
 }
 const indexPages=page+1,totalPages=indexPages+documents.reduce((n,p)=>n+p.length,0);
 if(totalPages>8000)fail('COLLECTION_LIMIT');
 for(let p=0;p<indexPages;p++){
  const ops=[`0.04 0.20 0.26 rg 0 775 595 67 re f`,text(38,809,'MuniControl · DOCUMENTOS DEL RANGO',15,true,'1 1 1'),text(38,789,`${d.period}-${String(d.month).padStart(2,'0')} · Tipo ${d.type} · ${c.models.length} documentos`,10,false,'1 1 1')];
  if(p===0){
   let top=750;const note=(value,bold=false)=>{for(const line of lines(value,102)){ops.push(text(38,top,line,9,bold));top-=13;}top-=5;};
   note('PDF conjunto informativo. No acredita pago ni emisión oficial. Sin firma aplicada.',true);
   note('Fecha de liquidación: '+d.date+'. Fecha de pago: no informada.');
   note('Legajos: '+(c.preview.filters.fromNumber||'inicio')+' a '+(c.preview.filters.toNumber||'fin')+'. Reparticiones al corte: '+(c.preview.filters.fromSector||'inicio')+' a '+(c.preview.filters.toSector||'fin')+'. Límites inclusivos.');
   note('Se incluyen todos los documentos del filtro, no sólo la página visible. Conceptos: '+c.concepts+'. Páginas del PDF: '+totalPages+'.');
   note('Nombre y repartición provienen del padrón al corte '+c.preview.directory.cutoff+'. La repartición no acredita la asignación histórica.');
   note('Selección SHA-256: '+c.preview.selectionHash);note('Fuente SHA-256: '+d.sourceHash);
   note('Índice completo de documentos. Las páginas indicadas corresponden a este PDF.',true);
  }
  const head=p===0?499:737;ops.push(`0.90 0.95 0.95 rg 38 ${head-7} 519 22 re f`,text(44,head,'LEGAJO',8,true),text(112,head,'AGENTE SEGÚN PADRÓN',8,true),text(485,head,'PÁGINAS',8,true));
  for(const entry of entries.filter(e=>e.page===p)){
   const begin=indexPages+documents.slice(0,entry.n).reduce((n,x)=>n+x.length,0)+1,end=begin+documents[entry.n].length-1;
   ops.push(text(44,entry.y,c.models[entry.n].legajo,8,true));entry.name.forEach((line,i)=>ops.push(text(112,entry.y-i*12,line,9)));
   ops.push(text(485,entry.y,begin+'–'+end,8),`0.84 0.90 0.90 RG .5 w 38 ${entry.y-entry.height+8} m 557 ${entry.y-entry.height+8} l S`);
  }
  ops.push(text(38,51,'USO INTERNO · ÍNDICE DOCUMENTAL · NO ACREDITA PAGO',8,true));index.push(ops);
 }
 const all=[...index,...documents.flat()];
 all.forEach((ops,i)=>ops.push(text(38,21,'Paquete '+(i+1)+' / '+all.length+' · Selección '+c.preview.selectionHash.slice(0,20),7)));
 const bytes=encodePayrollPages(all);if(bytes.byteLength>COLLECTION_LIMITS.bytes)fail('COLLECTION_LIMIT');
 return {bytes,filename:'municontrol_documentos_'+d.period+'-'+String(d.month).padStart(2,'0')+'_'+d.type+'_'+c.preview.selectionHash.slice(0,12)+'.pdf',documents:c.models.length,pages:all.length,concepts:c.concepts};
}
