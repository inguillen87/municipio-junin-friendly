// Generated fixtures only. No municipal documents or user credentials.
import {createHash} from 'node:crypto';
export const ID='11111111-1111-4111-8111-111111111111',TENANT='33333333-3333-4333-8333-333333333333',MEMBER='44444444-4444-4444-8444-444444444444',SESSION='55555555-5555-4555-8555-555555555555';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function syntheticLegalPdf(pages=1,text='NORMATIVA SINTETICA QA - Documento de ensayo'){
 const content=`BT /F1 14 Tf 50 760 Td (${text.replace(/[()\\]/g,'')}) Tj ET`,contentId=pages+3,fontId=pages+4;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${Array.from({length:pages},(_,i)=>`${i+3} 0 R`).join(' ')}] /Count ${pages} >>`];
 for(let i=0;i<pages;i++)objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
 objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 let textPdf='%PDF-1.4\n';const offsets=[];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(textPdf));textPdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(textPdf);textPdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(textPdf);
}
export const pdf=syntheticLegalPdf();
export const draft=()=>({id:null,expectedVersion:0,identity:{kind:'ordenanza',issuer:'HCD',number:'9999',year:1990},metadata:{title:'Norma sintética de luminarias',summary:'Documento de ensayo, sin efectos municipales.',topics:'alumbrado',sourceReference:'Archivo sintético QA',stage:'acto_registrado',issueDate:'1990-01-01',publicationDate:'',effectiveDate:'',articles:[{label:'Artículo 1',page:1,text:'Se crea un registro sintético de luminarias.'}]},document:{filename:'norma-qa.pdf',contentBase64:pdf.toString('base64'),sha256:digest(pdf)},reason:'Registro sintético de prueba'});
export const session={id:SESSION,email:'operator@example.invalid',version:1};
export const access=(caps=['legal.norm.read','legal.norm.register'])=>({mode:'managed',session,principal:{user:{email:session.email},tenant:{id:TENANT,membershipId:MEMBER,source:'membership',effectiveCapabilities:caps}}});
export const receipt=(version=1,replayed=false)=>({version:'legal-registry.v1',id:ID,recordVersion:version,replayed});
export const bootstrap=(canRegister=true,total=0)=>({version:'legal-registry.v1',canRegister,total,storageBytes:total*pdf.length,storageLimitBytes:134217728});
export const record=(version=1,current=version)=>({id:ID,...draft().identity,version,currentVersion:current,metadata:{...draft().metadata,title:version===1?draft().metadata.title:'Título corregido de luminarias'},legalStatus:'no_determinada',recordedAt:'2026-09-17T02:00:00Z',recordedBy:session.email,reason:version===1?draft().reason:'Corrección sintética documentada',document:{filename:'norma-qa.pdf',sha256:digest(pdf),bytes:pdf.length,pages:1},history:Array.from({length:current},(_,i)=>({version:current-i,recordedAt:'2026-09-17T02:00:00Z',recordedBy:session.email,reason:current-i===1?draft().reason:'Corrección sintética documentada'}))});
export const list=(total=1,page=1)=>({version:'legal-registry.v1',total,page,pageSize:25,rows:total?[{id:ID,...draft().identity,title:draft().metadata.title,current_version:1,stage:'acto_registrado'}]:[]});
