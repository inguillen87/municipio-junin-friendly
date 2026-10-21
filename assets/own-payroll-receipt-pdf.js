import {encodePayrollPages} from './payroll-detail-export.js';
import {ownReceiptBatch,ownReceiptSelf,ownReceiptSnapshot,ownReceiptType,ownReceiptPresentation} from './own-payroll-receipt-model.js';
// Canonical Helvetica AFM widths (ASCII 32..126), in thousandths of an em.
// Accented Latin letters use their base glyph; other WinAnsi characters use
// the font's maximum width as a conservative bound, never an average width.
const regularWidths = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const boldWidths = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
function glyphWidth(char, bold) {
  const base = char.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), n = base.codePointAt(0);
  return base.length === 1 && n >= 32 && n <= 126 ? (bold ? boldWidths : regularWidths)[n - 32] : 1015;
}
function receiptPdfTextWidth(value, size = 8, bold = false) { return [...String(value)].reduce((width, char) => width + glyphWidth(char, bold) * size / 1000, 0); }
function receiptPdfLines(value,width,size=9,bold=false){
 const result=[];let line='',lineWidth=0;
 for(const token of String(value).match(/\s+|\S+/gu)??['']){
  if(line&&lineWidth+receiptPdfTextWidth(token,size,bold)>width){result.push(line);line='';lineWidth=0;}
  for(const char of token){
   const charWidth=glyphWidth(char,bold)*size/1000;
   if(line&&lineWidth+charWidth>width){result.push(line);line='';lineWidth=0;}
   line+=char;lineWidth+=charWidth;
  }
 }
 if(line)result.push(line);return result.length?result:[''];
}
const mapping={0x20ac:128,0x2013:150,0x2014:151,0x2018:145,0x2019:146,0x201c:147,0x201d:148,0x2022:149,0x2212:45};
function hex(value){return '<'+[...String(value)].map(c=>{const n=c.codePointAt(0);if(!(n>=32&&n<=255||mapping[n]!==undefined))throw Error('El PDF no admite un carácter de la identidad o etiqueta original. No se reemplazó ni omitió el recibo.');return(mapping[n]??n).toString(16).padStart(2,'0');}).join('')+'>';}
function wrap(value,max=91){const result=[];let line='';for(let word of String(value).split(/\s+/)){while(word.length>max){if(line)result.push(line);line='';result.push(word.slice(0,max));word=word.slice(max);}if((line+' '+word).trim().length>max){if(line)result.push(line);line=word;}else line=(line+' '+word).trim();}if(line)result.push(line);return result.length?result:[''];}
export function ownReceiptPages(record,params,source,{state='prepared',batchId='Previa sin conservar'}={}){
 const presentation=ownReceiptPresentation(record),pages=[];let ops=[],y;const put=(x,y,t,size=9,bold=false)=>ops.push(`BT /${bold?'F2':'F1'} ${size} Tf 0.07 0.20 0.25 rg 1 0 0 1 ${x} ${y} Tm ${hex(t)} Tj ET`);
 const page=()=>{if(ops.length)pages.push(ops);ops=[];y=796;put(38,y,'MuniControl · RECIBO PROPIO PARA REVISIÓN',14,true);y-=22;put(38,y,`${source.period} · ${ownReceiptType(source.type)} · Legajo ${record.employeeNumber}`,10,true);y-=20;for(const line of wrap(record.name,72)){put(38,y,line,11,true);y-=15;}put(38,y,`DNI ${record.dni} · CUIL ${record.cuil}`,9);y-=18;put(38,y,`Convenio ${record.agreementCode} · Repartición ${record.departmentCode} · Versión ${record.liquidationVersion}`,9);y-=23;};
 const ensure=h=>{if(y-h<78)page();},line=(value,bold=false)=>{for(const part of wrap(value)){ensure(17);put(38,y,part,9,bold);y-=15;}},heading=(value,following)=>{ensure(following===undefined?38:6+wrap(value).length*15+5+wrap(following).length*15+2);y-=6;line(value,true);y-=5;};
 page();line('Emisor declarado: '+params.issuer.name,true);line('CUIT '+params.issuer.taxId+' · '+params.issuer.address);line('Fecha de pago/acreditación declarada: '+(params.paymentDate??'No informada'));line('La fecha declarada no acredita pago. Firma digital pendiente.');line(state==='approved'?'Disponibilidad revisada por otra persona.':'Preparación para revisión; aún no disponible para el agente.',true);if(params.legend)line(params.legend);
 for(const group of presentation.groups){heading(group.title,group.explanation);line(group.explanation);for(const c of group.rows){
  const amount=c.displayAmount,right=553,gap=8,descriptionX=92,amountWidth=receiptPdfTextWidth(amount,9,true);
  const separate=right-amountWidth-gap-descriptionX<160,parts=receiptPdfLines(c.label,separate?right-descriptionX:right-amountWidth-gap-descriptionX),unitLines=wrap('Unidad: '+c.displayUnit,78);
  const amountSize=separate?Math.min(9,(right-38)/receiptPdfTextWidth(amount,1,true)):9;
  const amountX=right-receiptPdfTextWidth(amount,amountSize,true),height=parts.length*13+4+unitLines.length*11+6+(separate?15:0);
  ensure(height);put(38,y,c.code,9,true);parts.forEach((part,i)=>put(descriptionX,y-i*13,part,9));
  if(!separate)put(amountX,y,amount,amountSize,true);
  y-=parts.length*13+4;
  if(separate){put(amountX,y,amount,amountSize,true);y-=15;}
  for(const unitLine of unitLines){put(descriptionX,y,unitLine,8);y-=11;}y-=6;
 }}
 const totalsHeading='Totales exactos de la liquidación cerrada',totalsLines=presentation.totals.map(total=>total.label+': '+total.displayAmount);
 // line() reserves17 points per15-point advance; keep its final2-point guard.
 ensure(6+wrap(totalsHeading).length*15+5+totalsLines.reduce((height,value)=>height+wrap(value).length*15,0)+wrap(presentation.netExplanation).length*15+2);
 heading(totalsHeading);for(const [index,total]of presentation.totals.entries())line(totalsLines[index],total.key==='net');line(presentation.netExplanation);
 const origin='Identidad del registro municipal verificado. Conceptos del catálogo conservado en el cálculo.';heading('Origen y estado del documento',origin);line(origin);line('Emisión: '+batchId);line('Grupo cerrado: '+source.id);line('Huella del cierre: '+source.snapshotSha256);line('No acredita firma digital, imputación ni ejecución de pago.');pages.push(ops);
 for(const [i,operations]of pages.entries()){ops=operations;put(38,52,'SIN FIRMA DIGITAL · COPIA PARA REVISIÓN',8,true);put(480,38,`${i+1} / ${pages.length}`,8);}return pages;
}
export async function createOwnReceiptPdf(value,{signal,preview=false,self=false,index=0}={}){
 const pages=[];let records,params,sources,state,batchId;
 if(self){ownReceiptSelf(value);const item=value.items[index];if(!item)throw Error('Elegí un recibo propio vigente.');records=[item.record];params=item.params;sources=[item.source];state='approved';batchId=item.batchId;}
 else if(preview){ownReceiptSnapshot(value);records=value.records;params=value.params;sources=value.sources;state='prepared';}
 else{ownReceiptBatch(value);if(!value.permissions.canDownload)throw Error('La emisión no admite una descarga vigente.');records=value.snapshot.records;params=value.snapshot.params;sources=value.snapshot.sources;state=value.state;batchId=value.id;}
 if(!records.length)throw Error('No hay recibos en este alcance; no se inventó una liquidación en cero.');
 for(const [i,record]of records.entries()){signal?.throwIfAborted();pages.push(...ownReceiptPages(record,params,sources.find(s=>s.id===record.sourceGroupId),{state,batchId}));if(pages.length>8000)throw Error('El conjunto supera la capacidad de PDF. No se exportó una parte.');if(i%10===0)await new Promise(resolve=>setTimeout(resolve,0));}
 signal?.throwIfAborted();const bytes=encodePayrollPages(pages);await new Promise(resolve=>setTimeout(resolve,0));if(signal?.aborted){bytes.fill(0);signal.throwIfAborted();}return {bytes,recordCount:records.length,pageCount:pages.length};
}
export function saveOwnReceiptPdf(result,name){const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
