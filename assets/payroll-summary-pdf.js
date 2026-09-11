import {civilDate} from './civil-date.js';
/** Private, client-side salary SUMMARY. No signature, payment certification or official receipt. */
const labels={monthly:'Mensual',first_fortnight:'Primera quincena',second_fortnight:'Segunda quincena',sac:'Sueldo anual complementario',vacation:'Vacaciones',supplementary:'Complementaria',final:'Liquidación final',other:'Otra liquidación'};
export function money(value){const m=/^(-?)(0|[1-9][0-9]*)\.([0-9]{2})$/.exec(String(value??''));if(!m)throw new Error('Importe no disponible o inválido');return '$ '+m[1]+new Intl.NumberFormat('es-AR').format(BigInt(m[2]))+','+m[3]}
function cents(value){if(!/^-?(?:0|[1-9][0-9]*)\.[0-9]{2}$/.test(String(value)))throw new Error('Importe no disponible o inválido');return BigInt(String(value).replace('.',''))}
function clean(value,max=100){const s=String(value??'').replace(/[\x00-\x1f\x7f]/g,' ').trim();if(!s||s.length>max)throw new Error('Dato documental incompleto');return s}
const cp={0x20ac:128,0x2013:150,0x2014:151,0x2018:145,0x2019:146,0x201c:147,0x201d:148,0x2022:149};
function hex(value){let h='';for(const c of value){const n=c.codePointAt(0);h+=(n<=255?n:(cp[n]??63)).toString(16).padStart(2,'0')}return '<'+h+'>'}
export function salarySummaryModel(employee,item){
 const name=clean(employee.fullName||employee.name||employee.full_name,150),legajo=clean(employee.legajo??employee.legacyLegajo,20);
 const payrollDate=civilDate(item.payrollDate);
 const fields=['subjectEarnings','nonSubjectEarnings','familyAllowance','employeeWithholdings','netPayable','employerContributions'];fields.forEach(k=>money(item[k]));
 const difference=cents(item.subjectEarnings)+cents(item.nonSubjectEarnings)+cents(item.familyAllowance)-cents(item.employeeWithholdings)-cents(item.netPayable);
 const formatCents=n=>(n<0n?'-':'')+( (n<0n?-n:n)/100n)+'.'+String((n<0n?-n:n)%100n).padStart(2,'0');
 return {name,legajo,date:payrollDate,type:labels[item.canonicalPayrollType]||'Tipo no identificado',status:item.presentationStatus==='open'?'PRELIQUIDACIÓN / CONSULTA':item.closureStatus==='closed'||String(item.presentationStatus).startsWith('closed')?'RESUMEN DE FUENTE CERRADA':'CONSULTA / ESTADO NO CERTIFICADO',values:Object.fromEntries(fields.map(k=>[k,money(item[k])])),sourceCutoff:clean(item.sourceCutoff||'No informado',60),difference:money(formatCents(difference)),matches:difference>=-1n&&difference<=1n,concepts:Number.isSafeInteger(item.distinctConcepts)?String(item.distinctConcepts):'No informado'};
}
export function createPayrollSummaryPdf(employee,item){
 const m=salarySummaryModel(employee,item);let ops=[];
 const rect=(x,y,w,h,color)=>ops.push(color+' rg '+[x,y,w,h].join(' ')+' re f');
 const text=(x,y,t,size=10,bold=false,color='0.08 0.20 0.26')=>ops.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm ${hex(t)} Tj ET`);
 const line=(y)=>ops.push(`0.80 0.86 0.88 RG 0.6 w 38 ${y} m 557 ${y} l S`);
 rect(0,733,595,109,'0.035 0.13 0.19');rect(0,730,595,3,'0.02 0.51 0.47');
 text(38,800,'MuniControl',22,true,'1 1 1');text(38,779,'PORTAL INTERNO · PERSONAS Y LIQUIDACIONES',9,false,'0.71 0.85 0.87');text(38,750,'RESUMEN DE HABERES',16,true,'1 1 1');
 text(38,703,m.status,9,true,'0.48 0.28 0.04');
 // Bound text length with wrapping, preserving full employee name.
 const wrap=(value,max)=>{const out=[];let row='';for(const word of value.split(/\s+/)){if((row+' '+word).trim().length>max&&row){out.push(row);row=word}else row=(row+' '+word).trim()}if(row)out.push(row);return out};
 wrap(m.name,58).slice(0,3).forEach((v,i)=>text(38,677-i*17,v,14,true));
 text(38,620,'Legajo '+m.legajo,10,true);text(240,620,'Período '+m.date.slice(0,7)+' · '+m.type,10);line(605);
 text(38,580,'CONCEPTO',9,true);text(392,580,'IMPORTE · ARS',9,true);line(568);
 const rows=[['Haberes remunerativos',m.values.subjectEarnings],['Haberes no remunerativos',m.values.nonSubjectEarnings],['Asignaciones familiares',m.values.familyAllowance],['Retenciones del empleado',m.values.employeeWithholdings]];
 rows.forEach(([label,amount],i)=>{const y=542-i*37;if(i%2===0)rect(38,y-11,519,31,'0.96 0.98 0.98');text(48,y,label,11);text(386,y,amount,11,true)});
 rect(38,355,519,47,'0.035 0.28 0.31');text(50,375,'NETO INFORMADO POR LA FUENTE',10,true,'1 1 1');text(377,372,m.values.netPayable,15,true,'1 1 1');
 text(38,329,'Contribuciones patronales (no integran el neto): '+m.values.employerContributions,10);
 rect(38,264,519,47,m.matches?'0.92 0.97 0.95':'1 0.96 0.88');text(50,291,m.matches?'CONTROL ARITMÉTICO COINCIDENTE':'CONTROL ARITMÉTICO CON DIFERENCIA',9,true);
 text(50,274,'Haberes + asignaciones - retenciones - neto: '+m.difference,9);
 text(38,240,'Conceptos informados: '+m.concepts+' · Corte de fuente: '+m.sourceCutoff,9);line(226);
 text(38,206,'ALCANCE DEL DOCUMENTO',9,true);
 ['Resumen de totales previamente consultados con tu sesión autorizada.',
 'Fuente laboral importada de GRH. No incluye el desglose de todos los conceptos.',
 'No es un recibo oficial ni una constancia de pago. Sin firma ni sello de aprobación.',
 'Una diferencia contable o un período abierto requieren revisión antes de emitir el recibo.'].forEach((s,i)=>text(38,188-i*16,s,9));
 text(38,98,'El recibo oficial requiere cierre, detalle de conceptos y emisión autorizada.',9,true);
 text(38,80,'No se alteraron los importes de origen. Uso interno · información personal.',9);
 line(60);text(38,42,'MuniControl · Legajos y liquidaciones',8);text(481,42,'Página 1 de 1',8);
 const stream=ops.join('\n'),objects=[null,'<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let pdf='%PDF-1.4\n',offset=[0];for(let i=1;i<objects.length;i++){offset.push(pdf.length);pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`}const xref=pdf.length;pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;for(const n of offset.slice(1))pdf+=String(n).padStart(10,'0')+' 00000 n \n';pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return new TextEncoder().encode(pdf);
}
export function downloadPayrollSummary(employee,item){const bytes=createPayrollSummaryPdf(employee,item),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download='resumen-haberes-'+item.payrollDate.slice(0,7)+'.pdf';a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return bytes.length}
