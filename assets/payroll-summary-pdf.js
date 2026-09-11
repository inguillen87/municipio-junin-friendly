import {salarySummaryModel} from './payroll-summary-model.js';
export {money, salarySummaryModel, verifySalarySummarySnapshot} from './payroll-summary-model.js';
const cp={0x20ac:128,0x2013:150,0x2014:151,0x2018:145,0x2019:146,0x201c:147,0x201d:148,0x2022:149};
function hex(value){let h='';for(const c of value){const n=c.codePointAt(0);h+=(n<=255?n:(cp[n]??63)).toString(16).padStart(2,'0')}return '<'+h+'>'}
export function createPayrollSummaryPdf(employee,item){
 const m=salarySummaryModel(employee,item);let ops=[];
 const rect=(x,y,w,h,color)=>ops.push(color+' rg '+[x,y,w,h].join(' ')+' re f');
 const text=(x,y,t,size=10,bold=false,color='0.08 0.20 0.26')=>ops.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm ${hex(t)} Tj ET`);
 // Conservative Helvetica advance estimates prevent clipping; amounts use exact digit widths.
 const advance = s => [...s].reduce((n,c) => n + (/[0-9$]/.test(c) ? .556 : /[., ]/.test(c) ? .278 : c === '-' ? .333 : /[WMwm]/.test(c) ? .96 : .76),0);
 const right = (x,y,s,size=11,bold=true,color='0.08 0.20 0.26',width=165) => {const units=advance(s);size=Math.min(size,width/Math.max(1,units));text(x-units*size,y,s,size,bold,color)};
 const line=(y)=>ops.push(`0.80 0.86 0.88 RG 0.6 w 38 ${y} m 557 ${y} l S`);
 rect(0,733,595,109,'0.035 0.13 0.19');rect(0,730,595,3,'0.02 0.51 0.47');
 text(38,800,'MuniControl',22,true,'1 1 1');text(38,779,'PORTAL INTERNO · PERSONAS Y LIQUIDACIONES',9,false,'0.71 0.85 0.87');text(38,750,'RESUMEN DE HABERES',16,true,'1 1 1');
 text(38,703,m.status,9,true,'0.48 0.28 0.04');
 // Bound text length with wrapping, preserving full employee name.
 const wrap=(value,size,width)=>{const rows=[];let row='';for(const word of value.split(/\s+/)){if(row&&advance(row+' '+word)*size>width){rows.push(row);row=''}for(const char of word){if(advance(row+char)*size>width){rows.push(row.trimEnd());row=''}row+=char}row+=' '}if(row.trim())rows.push(row.trim());return rows};
 let nameSize=14,nameRows=wrap(m.name,nameSize,519);while(nameRows.length>3&&nameSize>8){nameSize-=.5;nameRows=wrap(m.name,nameSize,519)}
 nameRows.forEach((v,i)=>text(38,677-i*17,v,nameSize,true));
 text(38,620,'Legajo '+m.legajo,10,true);text(240,620,'Período '+m.date.slice(0,7)+' · '+m.type,10);line(605);
 text(38,580,'CONCEPTO',9,true);text(392,580,'IMPORTE · ARS',9,true);line(568);
 const rows=[['Haberes remunerativos',m.values.subjectEarnings],['Haberes no remunerativos',m.values.nonSubjectEarnings],['Asignaciones familiares',m.values.familyAllowance],['Retenciones del empleado',m.values.employeeWithholdings]];
 rows.forEach(([label,amount],i)=>{const y=542-i*37;if(i%2===0)rect(38,y-11,519,31,'0.96 0.98 0.98');text(48,y,label,11);right(545,y,amount)});
 rect(38,355,519,47,'0.035 0.28 0.31');text(50,375,'NETO INFORMADO POR LA FUENTE',10,true,'1 1 1');right(545,372,m.values.netPayable,15,true,'1 1 1',165);
 text(38,329,'Contribuciones patronales (no integran el neto): '+m.values.employerContributions,10);
 rect(38,264,519,47,m.matches===true?'0.92 0.97 0.95':'1 0.96 0.88');text(50,291,m.matches===null?'CONTROL ARITMÉTICO NO EVALUABLE':m.matches?'CONTROL ARITMÉTICO COINCIDENTE':'CONTROL ARITMÉTICO CON DIFERENCIA',9,true);
 text(50,274,m.matches===null?'Faltan importes de origen. No se reemplazaron por cero.':'Haberes + asignaciones - retenciones - neto: '+m.difference,9);
 text(38,240,'Conceptos informados: '+m.concepts+' · Corte de fuente: '+m.sourceCutoff,9);line(226);
 text(38,206,'ALCANCE DEL DOCUMENTO',9,true);
 ['Resumen de totales reconsultados con tu sesión autorizada antes de descargar.',
 'Fuente laboral importada de GRH. No incluye el desglose de todos los conceptos.',
 'No es un recibo oficial ni una constancia de pago. Sin firma ni sello de aprobación.',
 'Los campos no informados y las diferencias requieren revisión antes de emitir el recibo.'].forEach((s,i)=>text(38,188-i*16,s,9));
 text(38,98,'El recibo oficial requiere cierre, detalle de conceptos y emisión autorizada.',9,true);
 text(38,80,'No se alteraron los importes de origen. Uso interno · información personal.',9);
 line(60);text(38,42,'MuniControl · Legajos y liquidaciones',8);text(481,42,'Página 1 de 1',8);
 const stream=ops.join('\n'),objects=[null,'<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let pdf='%PDF-1.4\n',offset=[0];for(let i=1;i<objects.length;i++){offset.push(pdf.length);pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`}const xref=pdf.length;pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;for(const n of offset.slice(1))pdf+=String(n).padStart(10,'0')+' 00000 n \n';pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return new TextEncoder().encode(pdf);
}
export function downloadPayrollSummary(employee,item){
 const model=salarySummaryModel(employee,item),bytes=createPayrollSummaryPdf(employee,item);
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');
 a.href=url;a.download='resumen-haberes-legajo-'+model.legajo+'-'+model.date+'-'+String(model.sourceType).replace(/[^a-z0-9_-]/gi,'_')+'.pdf';a.rel='noopener';
 try{document.body.append(a);a.click()}catch(error){URL.revokeObjectURL(url);throw error}finally{a.remove()}
 setTimeout(()=>URL.revokeObjectURL(url),30000);return bytes.length;
}
