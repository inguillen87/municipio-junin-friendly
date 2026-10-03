// Generated text-only fixture. No municipal certificate or identity.
export const schoolReadingPages=[
 ['CERTIFICADO SINTETICO QA','Institucion: Escuela Sintetica QA','Nivel: Primario','Grado: 3 A','Ciclo lectivo: 2026','Fecha de emision: 30/09/2026'],
 ['CERTIFICADO SINTETICO QA - SEGUNDA PAGINA','Institucion: Escuela Alternativa QA','Nivel: Secundario','Curso: 1 B','Ciclo lectivo: 2026','Vencimiento: 30/11/2026']
];
export function syntheticSchoolReadingPdf(pages=schoolReadingPages){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',''];const ids=[];
 for(const lines of pages){const pageId=objects.length+1,contentId=pageId+1;ids.push(pageId);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${2+pages.length*2+1} 0 R >> >> /Contents ${contentId} 0 R >>`);
  const content='BT /F1 15 Tf 50 760 Td 28 TL '+lines.map((line,i)=>(i?'T* ':'')+'('+line.replace(/[()\\]/g,'')+') Tj').join('\n')+' ET';objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
 }
 objects[1]=`<< /Type /Pages /Kids [${ids.map(id=>id+' 0 R').join(' ')}] /Count ${pages.length} >>`;objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 let pdf='%PDF-1.4\n';const offsets=[];for(const [i,object]of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;}
 const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(pdf);
}
