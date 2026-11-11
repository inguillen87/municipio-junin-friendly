import {verifiedPlanilla} from './own-payroll-receipt-planilla-model.js';
import {ownReceiptType} from './own-payroll-receipt-model.js';
import {OWN_RUN_NATURES,formatOwnRunDecimal} from './own-payroll-run-workspace-model.js';
import {storedZip} from './clock-dashboard-zip.js';
import {encodePayrollPages} from './payroll-detail-export.js';
import {SALARY_UNITS} from './native-salary-catalog-model.js';
import {OWN_PDF_MUTED as MUTED,OWN_PDF_STRONG as STRONG,OWN_PDF_TINT as TINT,ownPdfDateText,ownPdfDocument,ownPdfPeriodText} from './own-payroll-pdf-kit.js';
const labels={remuneration:'Remunerativos',non_remuneration:'No remunerativos',deduction:'Retenciones',employer_contribution:'Aportes patronales',gross:'Bruto',net:'Neto'};
const xml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function table(value){verifiedPlanilla(value);return [['Período','Tipo','Jurisdicción','Convenio','Repartición','Tipo documento','DNI','Legajo','Apellido y nombre',...Object.values(labels)],...value.records.map(r=>[r.period,ownReceiptType(r.type),r.jurisdiction,r.agreementCode,r.departmentCode,'DNI',r.dni,r.employeeNumber,r.name,...Object.keys(labels).map(k=>r.totals[k])])];}
const csvCell=v=>'"'+(/^[\s]*[=+\-@\t\r\n]/.test(String(v))?"'":'')+String(v).replaceAll('"','""')+'"';
export function ownPlanillaCsv(value){return '\ufeff'+table(value).map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';}
function sheet(rows){return '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="15" width="24" customWidth="1"/><col min="9" max="9" width="48" customWidth="1"/></cols><sheetData>'+rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((v,j)=>'<c r="'+String.fromCharCode(65+j)+(i+1)+'" t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>';}
export function ownPlanillaXlsx(value){verifiedPlanilla(value);const data=[table(value),[['Período','Tipo','Jurisdicción','Convenio','Repartición','Recibos',...Object.values(labels)],...value.groups.map(g=>[g.period,ownReceiptType(g.type),g.jurisdiction,g.agreementCode,g.departmentCode,String(g.records.length),...Object.keys(labels).map(k=>g.totals[k])])],[['Período','Tipo','Jurisdicción','Repartición','DNI','Legajo','Apellido y nombre','Código','Descripción conservada','Naturaleza','Unidad','Valor exacto'],...value.records.flatMap(r=>r.concepts.map(c=>[r.period,ownReceiptType(r.type),r.jurisdiction,r.departmentCode,r.dni,r.employeeNumber,r.name,c.code,c.label,OWN_RUN_NATURES[c.nature],SALARY_UNITS[c.unit],c.amount]))],[['Procedencia','Valor'],['Emisión aprobada',value.batchId],['SHA-256 emisión',value.snapshotSha256],['Revisión',value.reviewId],['Recibos en emisión',String(value.total)],['Incluidos',String(value.selected)],['Otra jurisdicción',String(value.excluded)],['Orden','Período, tipo, jurisdicción, convenio, repartición y tipo DNI / número'],['Precisión','Decimales originales como texto exacto; sin redondeo ni fórmulas'],['Firma','Pendiente de circuito autorizado; no acredita pago'],...value.sources.map(s=>['Cierre '+s.period+' / '+ownReceiptType(s.type),s.id+' · '+s.snapshotSha256])]];
 const names=['Planilla','Reparticiones','Conceptos','Procedencia'];return storedZip([['[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+names.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'],['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],['xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+names.map((n,i)=>'<sheet name="'+n+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'],['xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+names.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'</Relationships>'],...data.map((d,i)=>['xl/worksheets/sheet'+(i+1)+'.xml',sheet(d)])]);
}
// The payroll sheet on paper: one block per person with earnings on the left and deductions on the right, the way the receipt
// shows them, so a page holds several people instead of one long list. Each group (period, type, jurisdiction, agreement and
// department) starts on its own page and ends with its exact totals. Every amount is printed as the reviewed emission has it.
export async function ownPlanillaPdf(value,{signal}={}){
 verifiedPlanilla(value);if(!value.selected)throw Error('No hay recibos en la jurisdicción elegida. No se generó una planilla vacía.');
 const pages=await ownPlanillaPages(value,{signal});
 return {bytes:encodePayrollPages(pages),pageCount:pages.length,recordCount:value.selected};
}
// Drawing only: the pages of an already verified sheet. Downloads go through ownPlanillaPdf, which verifies the emission first.
export async function ownPlanillaPages(value,{signal}={}){
 const L=38,R=557,W=R-L,MID=(L+R)/2,EDGES=[L,MID,R],HALF=MID-L,money=amount=>formatOwnRunDecimal(amount);
 const MAIN={size:7.5,lead:1.5,pad:1.5,labelX:32,reserve:56},INFO={...MAIN,size:7,withSign:true},heading=text=>({heading:text,size:6.5,height:11});
 let group=null,current=null,opening=false,bodyTop=0,count=0;
 const band=(doc,record,continuation)=>{
  const names=doc.fit(record.name,230,8.5,true),height=Math.max(15,names.length*10.5+4.5),base=doc.y-10.5,number='Legajo '+record.employeeNumber;
  doc.box(L,doc.y-height,W,height,{fill:TINT,stroke:null});doc.line(L,doc.y,R,doc.y,STRONG,0.6);
  doc.put(L+6,base,number,doc.shrink(number,80,8.5,true),true);names.forEach((part,i)=>doc.put(L+92,base-i*10.5,part,8.5,true));
  doc.put(L+328,base,'DNI '+record.dni,8);doc.put(L+388,base,'Versión '+record.liquidationVersion,7,false,MUTED);
  if(continuation)doc.right(R-6,base,'continuación',8,false,MUTED);
  else{const net='Neto '+money(record.totals.net);doc.right(R-6,base,net,doc.shrink(net,88,9,true),true);}
  doc.y-=height+3;
 };
 const doc=ownPdfDocument({unsupported:'El PDF no admite un carácter original. Usá Excel o CSV; no se sustituyó ni omitió texto.',bottom:58,header(doc){
  signal?.throwIfAborted();if(doc.pages.length>8000)throw Error('El conjunto supera la capacidad PDF. No se descargó una parte.');
  doc.put(L,doc.y,'PLANILLA DE SUELDOS',13,true);doc.right(R,doc.y,`${ownPdfPeriodText(group.period)} · ${ownReceiptType(group.type)} · J${group.jurisdiction}`,10,true);doc.y-=14;
  const issuer=doc.fit(value.issuer.name,W-200,9.5,true);issuer.forEach((part,i)=>doc.put(L,doc.y-i*12,part,9.5,true));
  doc.right(R,doc.y,`Convenio ${group.agreementCode} · Repartición ${group.departmentCode}`,9.5,true);doc.y-=(issuer.length-1)*12+11;
  doc.put(L,doc.y,`${group.records.length} recibos de esta repartición · Emisión completa: ${value.total} · Selección: ${value.selected} · Orden: DNI / número`,7.5,false,MUTED);doc.y-=10;
  doc.put(L,doc.y,`Fecha de pago declarada: ${ownPdfDateText(value.paymentDate)} · no acredita pago`,7.5,false,MUTED);doc.y-=6;
  doc.line(L,doc.y,R,doc.y,STRONG,0.8);doc.box(L,doc.y-13,W,13,{fill:TINT,stroke:null});
  for(const [x0,x1,title]of [[L,MID,'Haberes ($)'],[MID,R,'Descuentos ($)']]){doc.put(x0+6,doc.y-9,'Cód.',7,true,MUTED);doc.put(x0+32,doc.y-9,'Concepto',7,true,MUTED);doc.right(x1-6,doc.y-9,title,7,true,MUTED);}
  doc.y-=13;doc.line(L,doc.y,R,doc.y);doc.y-=6;bodyTop=doc.y;
  if(opening&&value.legend){for(const part of doc.fit(value.legend,W,8)){doc.put(L,doc.y-8,part,8,false,MUTED);doc.y-=10.5;}doc.y-=5;}
  opening=false;
  // A person whose block continues on this page is named again before the rest of the lines.
  if(current)band(doc,current,true);
 }});
 const totalsBox=(title,totals,note,extra=0)=>{
  doc.ensure(62+extra);doc.y-=4;const top=doc.y,height=46;
  doc.box(L,top-height,W,height,{fill:TINT,stroke:STRONG,weight:0.8});doc.put(L+8,top-13,title,9,true);doc.right(R-8,top-13,note,8,false,MUTED);
  doc.y=top-24;doc.cells(Object.keys(labels).map(key=>[labels[key],money(totals[key])]),L+8,W-16,{bold:true,size:8.5});doc.y=top-height-12;
 };
 for(group of value.groups){
  current=null;opening=true;doc.page();
  for(const record of group.records){
   signal?.throwIfAborted();
   const rows=(nature,options)=>record.concepts.filter(concept=>concept.nature===nature).map(concept=>doc.entry(concept,HALF,options));
   const remunerative=rows('remuneration',MAIN),other=rows('non_remuneration',MAIN),deductions=rows('deduction',MAIN),employer=rows('employer_contribution',INFO),technical=rows('auxiliary',INFO);
   const earnings=other.length?[...(remunerative.length?[heading('Remunerativos')]:[]),...remunerative,heading('No remunerativos'),...other]:remunerative;
   const infoLeft=employer.length?[heading('A cargo del empleador'),...employer]:[],infoRight=technical.length?[heading('Valores técnicos · no suman ni restan'),...technical]:[];
   const summary=doc.fit(['remuneration','non_remuneration','gross','deduction','employer_contribution'].map(key=>labels[key]+' '+money(record.totals[key])).join(' · '),W-12,7.5);
   const tall=items=>items.reduce((sum,item)=>sum+item.height,0),names=doc.fit(record.name,230,8.5,true);
   const height=Math.max(15,names.length*10.5+4.5)+3+Math.max(tall(earnings),tall(deductions))+2+(infoLeft.length||infoRight.length?Math.max(tall(infoLeft),tall(infoRight))+3:0)+summary.length*9.5+11;
   // A person stays whole on one page whenever a page can hold the block; only a longer one continues on the next.
   doc.ensure(height>bodyTop-doc.bottom?64:height);
   band(doc,record,false);current=record;
   doc.columns(earnings,deductions,EDGES,{frame:false,divider:true});
   if(infoLeft.length||infoRight.length){doc.y-=1;doc.columns(infoLeft,infoRight,EDGES,{frame:false,divider:true});}
   doc.ensure(summary.length*9.5+6);summary.forEach((part,i)=>doc.put(L+6,doc.y-8-i*9.5,part,7.5,false,MUTED));doc.y-=summary.length*9.5+11;
   current=null;
   if(++count%10===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  totalsBox('TOTALES EXACTOS · REPARTICIÓN '+group.departmentCode,group.totals,`${group.records.length} recibos`,24);
  doc.put(L,doc.y,'Firma digital pendiente de Contaduría'+(group.jurisdiction==='55'?' y Coordinación de jardines maternales.':'.'),8);doc.y-=10;
  doc.put(L,doc.y,'Aportes patronales y valores técnicos van aparte; no se restan otra vez del neto.',7.5,false,MUTED);doc.y-=16;
 }
 if(value.groups.length>1)totalsBox('TOTAL GENERAL DE LA PLANILLA · todos los grupos incluidos',value.totals,`${value.selected} recibos`);
 signal?.throwIfAborted();
 for(const i of doc.pages.keys()){doc.select(i);doc.line(L,52,R,52);doc.put(L,40,'USO INTERNO · FIRMA DIGITAL PENDIENTE · NO ACREDITA PAGO',8);doc.right(R,40,`${i+1} / ${doc.pages.length}`,8);}
 return doc.pages;
}
export function saveOwnPlanilla(bytes,format,period){const mime={pdf:'application/pdf',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',csv:'text/csv;charset=utf-8'}[format];if(!mime)throw Error('Formato inválido.');const url=URL.createObjectURL(new Blob([bytes],{type:mime})),a=document.createElement('a');a.href=url;a.download='municontrol_planilla_sueldos_'+period+'.'+format;a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
