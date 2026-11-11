import {encodePayrollPages} from './payroll-detail-export.js';
import {ownReceiptBatch,ownReceiptSelf,ownReceiptSnapshot,ownReceiptType} from './own-payroll-receipt-model.js';
import {OWN_RUN_NATURES,formatOwnRunDecimal} from './own-payroll-run-workspace-model.js';
import {OWN_PDF_INK as INK,OWN_PDF_MUTED as MUTED,OWN_PDF_STRONG as STRONG,OWN_PDF_TINT as TINT,ownPdfDateText,ownPdfDocument,ownPdfPeriodText,ownPdfTaxIdText,ownPdfText} from './own-payroll-pdf-kit.js';
const UNSUPPORTED='El PDF no admite un carácter de la identidad o etiqueta original. No se reemplazó ni omitió el recibo.';
// Width in points of a text as the receipt draws it; a character the PDF cannot draw is rejected, never replaced.
export const ownReceiptTextWidth=ownPdfText(UNSUPPORTED).width;
// One page for an ordinary receipt, laid out the way payroll staff already read one: employer and period on top, the net in its own
// box, earnings on the left and deductions on the right, each with its total. Employer contributions and technical values go in a
// separate informative block, so nothing is hidden and nothing that is not pay is mixed with pay. Long receipts continue on more
// pages that repeat whose they are. Every amount is the exact one of the closed liquidation; this file adds or rounds nothing.
export function ownReceiptPages(record,params,source,{state='prepared',batchId='Previa sin conservar'}={}){
 const L=38,R=557,W=R-L,MID=(L+R)/2,EDGES=[L,MID,R],HALF=MID-L;
 for(const concept of record.concepts)if(!Object.hasOwn(OWN_RUN_NATURES,concept.nature))throw Error('El recibo contiene un concepto de una naturaleza desconocida. No se omitió.');
 const type=ownReceiptType(source.type),money=value=>formatOwnRunDecimal(value),totals=record.totals,net=money(totals.net);
 let continued=false;
 const doc=ownPdfDocument({unsupported:UNSUPPORTED,header(doc){
  // Employer on the left, kind of document on the right.
  const issuer=doc.fit(params.issuer.name,330,12,true),place=doc.fit(`CUIT ${ownPdfTaxIdText(params.issuer.taxId)} · ${params.issuer.address}`,330,8);
  issuer.forEach((part,i)=>doc.put(L,doc.y-i*14,part,12,true));
  doc.right(R,doc.y,'RECIBO DE HABERES',11,true);doc.right(R,doc.y-12,'Recibo propio · copia para revisión',7.5,false,MUTED);
  doc.y-=(issuer.length-1)*14+12;place.forEach((part,i)=>doc.put(L,doc.y-i*10,part,8,false,MUTED));doc.y-=(place.length-1)*10+7;
  doc.line(L,doc.y,R,doc.y,STRONG,0.8);
  if(!continued){
   // Period, kind of liquidation, declared payment date and the net, where the eye lands first.
   doc.y-=8;const top=doc.y,h=34,items=[['Período',ownPdfPeriodText(source.period),160],['Liquidación',type,112],['Fecha de pago declarada',ownPdfDateText(params.paymentDate),112]];
   let x=L;for(const [label,value,w]of items){doc.box(x,top-h,w,h);doc.put(x+7,top-11,label,7,false,MUTED);doc.put(x+7,top-26,value,doc.shrink(value,w-14,10.5,true),true);x+=w;}
   doc.box(x,top-h,R-x,h,{fill:TINT,stroke:STRONG,weight:0.8});doc.put(x+7,top-11,'Neto a cobrar',7,true,MUTED);doc.right(R-7,top-27,net,doc.shrink(net,R-x-14,12.5,true),true);
   doc.y=top-h-19;
   const names=doc.fit(record.name,W-160,12,true),number='Legajo '+record.employeeNumber;
   names.forEach((part,i)=>doc.put(L,doc.y-i*15,part,12,true));doc.right(R,doc.y,number,doc.shrink(number,150,11,true),true);
   doc.y-=(names.length-1)*15+17;
   doc.cells([['CUIL',ownPdfTaxIdText(record.cuil)],['DNI',String(record.dni)],['Convenio',String(record.agreementCode)],['Repartición',String(record.departmentCode)],['Versión de la liquidación',String(record.liquidationVersion)]],L,W);
   doc.y-=9;
  }else{
   doc.y-=15;const names=doc.fit(record.name,W-190,10,true),number='Legajo '+record.employeeNumber+' · continuación';
   names.forEach((part,i)=>doc.put(L,doc.y-i*12,part,10,true));doc.right(R,doc.y,number,doc.shrink(number,180,9.5,true),true);
   doc.y-=(names.length-1)*12+11;doc.put(L,doc.y,`${ownPdfPeriodText(source.period)} · ${type}`,8,false,MUTED);doc.y-=9;
  }
  continued=true;
 }});
 const group=(nature,title,options)=>{const rows=record.concepts.filter(concept=>concept.nature===nature).map(concept=>doc.entry(concept,HALF,options));return rows.length&&title?[{heading:title,height:12.5},...rows]:rows;};
 const mainHead=()=>{
  doc.box(L,doc.y-16,W,16,{fill:TINT,stroke:null});doc.line(L,doc.y,R,doc.y,STRONG,0.8);
  doc.put(L+6,doc.y-11.5,'HABERES',8.5,true);doc.put(MID+6,doc.y-11.5,'DESCUENTOS',8.5,true);doc.y-=16;
  for(const [x0,x1]of [[L,MID],[MID,R]]){doc.put(x0+6,doc.y-9.5,'Cód.',7,false,MUTED);doc.put(x0+38,doc.y-9.5,'Concepto',7,false,MUTED);doc.right(x1-6,doc.y-9.5,'Importe ($)',7,false,MUTED);}
  doc.y-=13;doc.line(L,doc.y,R,doc.y);doc.y-=3;
 };
 const infoHead=()=>{
  doc.box(L,doc.y-14,W,14,{fill:TINT,stroke:null});doc.line(L,doc.y,R,doc.y);
  doc.put(L+6,doc.y-10,'APORTES PATRONALES · a cargo del empleador',7.5,true,MUTED);doc.put(MID+6,doc.y-10,'VALORES TÉCNICOS · no suman ni restan',7.5,true,MUTED);doc.y-=17;
 };
 doc.page();
 const earnings=[...group('remuneration','Remunerativos'),...group('non_remuneration','No remunerativos')],deductions=group('deduction',null);
 doc.columns(earnings.length?earnings:[{note:'Sin haberes en esta liquidación.',height:14}],deductions.length?deductions:[{note:'Sin descuentos en esta liquidación.',height:14}],EDGES,{head:mainHead,headHeight:32});
 // Column totals, the exact totals of the closed liquidation and the net stay together on one page.
 doc.ensure(108);
 doc.box(L,doc.y-18,W,18,{fill:TINT});doc.line(MID,doc.y,MID,doc.y-18);
 doc.put(L+6,doc.y-12.5,'Total haberes',9,true);doc.right(MID-6,doc.y-12.5,money(totals.gross),9,true);
 doc.put(MID+6,doc.y-12.5,'Total descuentos',9,true);doc.right(R-6,doc.y-12.5,money(totals.deduction),9,true);
 doc.y-=33;doc.put(L,doc.y,'Totales exactos de la liquidación cerrada',8,true,MUTED);doc.y-=13;
 doc.cells([['Remunerativos',money(totals.remuneration)],['No remunerativos',money(totals.non_remuneration)],['Bruto',money(totals.gross)],['Retenciones',money(totals.deduction)],['Aportes patronales',money(totals.employer_contribution)]],L,W,{bold:true});
 doc.y-=12;
 doc.box(L,doc.y-26,W,26,{fill:TINT,stroke:STRONG,weight:0.8});doc.put(L+8,doc.y-17.5,'Neto',12,true);doc.right(R-8,doc.y-17.5,net,doc.shrink(net,W-90,13,true),true);
 doc.y-=42;const netPage=doc.pages.length;
 // What the employer pays and the technical values of the calculation: shown, apart from pay.
 const employer=group('employer_contribution',null,{size:7.5,withSign:true}),technical=group('auxiliary',null,{size:7.5,withSign:true});
 if(employer.length||technical.length){doc.columns(employer,technical,EDGES,{head:infoHead,headHeight:17});doc.y-=5;}else doc.y+=9;
 // State and origin of the document, kept together so a page never starts with a stray line.
 const notes=[
  ['La fecha declarada no acredita pago. Firma digital pendiente.',false,MUTED],
  [state==='approved'?'Disponibilidad revisada por otra persona.':'Preparación para revisión; aún no disponible para el agente.',true,INK],
  ...(params.legend?[[params.legend,false,MUTED]]:[]),
  ['Origen: identidad del registro municipal verificado; conceptos del catálogo conservado en el cálculo.',false,MUTED],
  [`Emisión: ${batchId} · Grupo cerrado: ${source.id}`,false,MUTED],
  ['Huella del cierre: '+source.snapshotSha256,false,MUTED],
  ['No acredita firma digital, imputación ni ejecución de pago.',false,MUTED],
 ].flatMap(([value,bold,color])=>doc.fit(value,W,7.5,bold).map(part=>[part,bold,color]));
 doc.ensure(notes.length*10+9);doc.y-=9;
 // When this block lands on a later page than the totals, the net is repeated so the last page still says what is paid.
 if(doc.pages.length!==netPage)notes.unshift([`Neto: ${net} (totales en la página ${netPage})`,true,INK]);
 for(const [part,bold,color]of notes){doc.put(L,doc.y,part,7.5,bold,color);doc.y-=10;}
 for(const i of doc.pages.keys()){doc.select(i);doc.line(L,64,R,64);doc.put(L,52,'SIN FIRMA DIGITAL · COPIA PARA REVISIÓN',8,true);doc.put(L,41,`Legajo ${record.employeeNumber} · ${source.period} · ${type}`,7.5,false,MUTED);doc.right(R,46,`${i+1} / ${doc.pages.length}`,8);}
 return doc.pages;
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
export function saveOwnReceiptPdf(result,name){
 let url=null;
 try{
  const blob=new Blob([result.bytes],{type:'application/pdf'});
  url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=name;link.click();
 }finally{
  try{result?.bytes?.fill(0);}
  finally{if(url!==null)setTimeout(()=>URL.revokeObjectURL(url),1000);}
 }
}
