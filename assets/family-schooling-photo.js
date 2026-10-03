// Images stay in this browser until the operator submits the existing private
// certificate command. The PDF contains an unchanged original as an attachment.
import {MAX_CERTIFICATE_BYTES,certificateFile} from './family-schooling-model.js';
const MAX_PIXELS=24000000,MAX_SIDE=12000,DISPLAY_SIDE=2048;
const fail=message=>{throw Error(message);},ascii=s=>new TextEncoder().encode(s);
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
export function certificateInputFile(file){
 if(file&&/\.pdf$/i.test(file.name))return certificateFile(file);
 if(!file||typeof file.name!=='string'||file.name.length>180||/[\x00-\x1f\x7f\\/:*?"<>|]/.test(file.name)||!Number.isSafeInteger(file.size)||file.size<24||file.size>MAX_CERTIFICATE_BYTES||!(/\.jpe?g$/i.test(file.name)&&['','image/jpeg'].includes(file.type)||/\.png$/i.test(file.name)&&['','image/png'].includes(file.type)))fail('Elegí una foto JPEG/PNG o un PDF de hasta 2 MiB.');
 return file;
}
export function photoDimensions(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<24||bytes.length>MAX_CERTIFICATE_BYTES)fail('La foto no es válida o supera 2 MiB.');
 let type,width,height;
 if([137,80,78,71,13,10,26,10].every((x,n)=>bytes[n]===x)&&String.fromCharCode(...bytes.subarray(12,16))==='IHDR'){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);width=view.getUint32(16);height=view.getUint32(20);type='image/png';
 }else if(bytes[0]===255&&bytes[1]===216){
  type='image/jpeg';let at=2;
  while(at+4<=bytes.length){
   if(bytes[at++]!==255)fail('La foto JPEG no tiene una estructura válida.');while(bytes[at]===255)at++;
   const marker=bytes[at++];if(marker===217||marker===218)break;
   if(marker===1||marker>=208&&marker<=215)continue;
   const size=bytes[at]*256+bytes[at+1];if(size<2||at+size>bytes.length)fail('La foto JPEG está incompleta.');
   if([192,193,194].includes(marker)){if(size<8||bytes[at+2]!==8)fail('Esta foto JPEG no está admitida.');height=bytes[at+3]*256+bytes[at+4];width=bytes[at+5]*256+bytes[at+6];break;}at+=size;
  }
 }else fail('El contenido no corresponde a una foto JPEG o PNG.');
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>MAX_SIDE||height>MAX_SIDE||width*height>MAX_PIXELS)fail('La foto supera 24 megapíxeles o no tiene dimensiones válidas. Elegí una captura más pequeña.');
 return Object.freeze({type,width,height});
}
export function photoAdjustment({rotation=0,top=0,right=0,bottom=0,left=0}={}){
 if(![0,90,180,270].includes(rotation)||![top,right,bottom,left].every(n=>Number.isInteger(n)&&n>=0&&n<=45))fail('Revisá el giro y los bordes: cada recorte admite entre 0 y 45 %.');
 return Object.freeze({rotation,top,right,bottom,left});
}
const hexText=s=>'<feff'+Array.from(s).map(c=>{let r='';for(let n=0;n<c.length;n++)r+=c.charCodeAt(n).toString(16).padStart(4,'0');return r;}).join('')+'>';
function concatenate(chunks){const result=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const c of chunks){result.set(c,at);at+=c.length;}return result;}
// Small bounded PDF writer, using no new dependency. No scripts, URI actions,
// OCR, inferred dates or claims of signature/authenticity are added.
export async function photoCertificatePdf({original,display,name,adjustment={}}){
 const source=photoDimensions(original),image=photoDimensions(display),settings=photoAdjustment(adjustment);
 if(image.type!=='image/jpeg'||image.width>DISPLAY_SIDE||image.height>DISPLAY_SIDE)fail('No se pudo preparar una vista segura de la foto.');
 if(typeof name!=='string'||name.length>180||/[\x00-\x1f\x7f]/.test(name))fail('El nombre de la foto no es válido.');
 const sourceHash=await hash(original),scale=Math.min(555/image.width,720/image.height),w=+(image.width*scale).toFixed(3),h=+(image.height*scale).toFixed(3);
 const content=ascii(`q ${w} 0 0 ${h} ${(595-w)/2} ${80+(720-h)/2} cm /Photo Do Q\nBT /F1 9 Tf 20 52 Td (Foto para registro administrativo; no acredita firma digital.) Tj 0 -14 Td (Original sin modificar adjunto en este PDF; SHA256 en sus propiedades.) Tj ET\n`);
 const stream=(head,data)=>[ascii('<< '+head+' /Length '+data.length+' >>\nstream\n'),data,ascii('\nendstream')];
 const filename=source.type==='image/jpeg'?'original.jpg':'original.png';
 const objects=[
  [ascii('<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(original) 7 0 R] >> >> /AF [7 0 R] >>')],
  [ascii('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')],
  [ascii('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Photo 4 0 R >> /Font << /F1 9 0 R >> >> /Contents 5 0 R >>')],
  stream('/Type /XObject /Subtype /Image /Width '+image.width+' /Height '+image.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',display),
  stream('',content),
  stream('/Type /EmbeddedFile /Subtype /'+(source.type==='image/jpeg'?'image#2Fjpeg':'image#2Fpng'),original),
  [ascii('<< /Type /Filespec /F ('+filename+') /UF '+hexText(name)+' /EF << /F 6 0 R /UF 6 0 R >> /AFRelationship /Source /Desc (Original sin modificar) >>')],
  [ascii('<< /Title (Certificado escolar - foto aportada) /Producer (MuniControl) /Subject '+hexText(JSON.stringify({version:'school-photo-container.v1',originalSha256:sourceHash,originalBytes:original.length,originalType:source.type,originalWidth:source.width,originalHeight:source.height,adjustment:settings}))+' >>')],
  [ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')],
 ];
 const chunks=[ascii('%PDF-1.7\n%MuniControl\n')],offsets=[0];let total=chunks[0].length;
 for(let n=0;n<objects.length;n++){offsets.push(total);const c=[ascii((n+1)+' 0 obj\n'),...objects[n],ascii('\nendobj\n')];chunks.push(...c);total+=c.reduce((v,x)=>v+x.length,0);}
 const xref=total;chunks.push(ascii('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R /Info 8 0 R >>\nstartxref\n'+xref+'\n%%EOF\n'));
 const bytes=concatenate(chunks);if(bytes.length>MAX_CERTIFICATE_BYTES){bytes.fill(0);fail('El PDF con la foto original supera 2 MiB. Elegí una captura más liviana; el original no se comprimirá ni reemplazará.');}return bytes;
}
const element=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
export function mountCertificatePhoto({host,input,available,onChange}){
 const allowed=()=>!document.hidden&&available();
 const panel=element('section');panel.className='fs-photo';panel.dataset.fsPhoto='';panel.hidden=true;
 const canvas=element('canvas');canvas.setAttribute('aria-label','Vista de la foto con el giro y recorte elegidos');
 const status=element('p');status.className='fs-note';status.dataset.fsPhotoStatus='';status.setAttribute('role','status');
 const rotate=element('button','Girar foto');rotate.type='button';rotate.className='fs-button';rotate.dataset.fsPhotoRotate='';
 const crop=element('details'),summary=element('summary','Recortar bordes (opcional)');crop.append(summary);const cropFields={};
 for(const [key,label]of [['top','Borde superior (%)'],['right','Borde derecho (%)'],['bottom','Borde inferior (%)'],['left','Borde izquierdo (%)']]){const l=element('label',label),v=element('input');v.type='number';v.min='0';v.max='45';v.step='1';v.value='0';v.inputMode='numeric';v.dataset.fsPhotoCrop=key;l.append(v);crop.append(l);cropFields[key]=v;}
 const note=element('p','Revisá que se lean el texto y los bordes. El PDF conservará la foto original sin cambios como adjunto privado. El giro y recorte sólo se aplican a la vista.');note.className='fs-note';
 panel.append(canvas,rotate,crop,note,status);host.append(panel);let bitmap=null,raw=null,seq=0,rotation=0,busy=false;
 const settings=()=>photoAdjustment({rotation,...Object.fromEntries(Object.entries(cropFields).map(([k,v])=>[k,v.value===''?0:Number(v.value)]))});
 function draw(){
  if(!bitmap||!allowed())return;const a=settings(),sx=Math.round(bitmap.width*a.left/100),sy=Math.round(bitmap.height*a.top/100),sw=Math.max(1,Math.round(bitmap.width*(100-a.left-a.right)/100)),sh=Math.max(1,Math.round(bitmap.height*(100-a.top-a.bottom)/100));
  const ratio=Math.min(1,DISPLAY_SIDE/Math.max(sw,sh)),w=Math.max(1,Math.round(sw*ratio)),h=Math.max(1,Math.round(sh*ratio));canvas.width=a.rotation%180?h:w;canvas.height=a.rotation%180?w:h;
  const c=canvas.getContext('2d',{alpha:false});c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);c.translate(canvas.width/2,canvas.height/2);c.rotate(a.rotation*Math.PI/180);c.drawImage(bitmap,sx,sy,sw,sh,-w/2,-h/2,w,h);
  status.textContent='Vista lista. Giro: '+a.rotation+'°. Guardar enviará el PDF por el circuito privado del certificado.';
 }
 function clear(){seq++;bitmap?.close();bitmap=null;raw?.fill(0);raw=null;busy=false;canvas.width=canvas.height=0;panel.hidden=true;status.textContent='';}
 async function load(event){
  clear();if(event?.type==='change'){rotation=0;for(const v of Object.values(cropFields))v.value='0';onChange();}const file=input.files[0];if(!file||/\.pdf$/i.test(file.name)||!allowed())return;
  const current=++seq;busy=true;panel.hidden=false;status.textContent='Preparando la foto en este dispositivo…';
  let bytes,image;
  try{certificateInputFile(file);bytes=new Uint8Array(await file.arrayBuffer());const dimensions=photoDimensions(bytes);if(file.type&&file.type!==dimensions.type||dimensions.type==='image/jpeg'&&!/\.jpe?g$/i.test(file.name)||dimensions.type==='image/png'&&!/\.png$/i.test(file.name))fail('El contenido de la foto no coincide con su formato.');
   image=await createImageBitmap(new Blob([bytes],{type:dimensions.type}),{imageOrientation:'from-image'});
   if(!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width*image.height>MAX_PIXELS)fail('No se pudo validar la foto.');
   if(current!==seq||!allowed()){image.close();bytes.fill(0);return;}raw=bytes;bitmap=image;bytes=null;image=null;busy=false;draw();
  }catch(error){image?.close();bytes?.fill(0);if(current!==seq||!allowed())return;busy=false;status.textContent=error.message;}
 }
 input.addEventListener('change',load);rotate.addEventListener('click',()=>{if(!bitmap||busy||!available())return;rotation=(rotation+90)%360;draw();onChange();});
 for(const v of Object.values(cropFields))v.addEventListener('input',()=>{if(!bitmap||busy||!available())return;try{draw();onChange();}catch(e){status.textContent=e.message;}});
 const hide=()=>{if(document.hidden)clear();};document.addEventListener('visibilitychange',hide);
 return{clear,refresh:load,readingCanvas(){
  if(busy||!bitmap||!raw||!allowed()||!canvas.width||!canvas.height)fail('Esperá a que termine la vista de la foto antes de leerla.');
  const copy=element('canvas');copy.width=canvas.width;copy.height=canvas.height;copy.getContext('2d').drawImage(canvas,0,0);return copy;
 },destroy(){clear();input.removeEventListener('change',load);document.removeEventListener('visibilitychange',hide);panel.remove();},async file(file){
  certificateInputFile(file);if(/\.pdf$/i.test(file.name))return file;
  if(busy||!raw||!bitmap||!allowed())fail('Esperá a que termine la vista de la foto, o elegí otra captura válida.');
  const current=seq,a=settings(),original=raw.slice(),displayData=canvas.toDataURL('image/jpeg',0.9).split(',')[1],display=Uint8Array.from(atob(displayData),c=>c.charCodeAt(0));
  try{const pdf=await photoCertificatePdf({original,display,name:file.name,adjustment:a});if(current!==seq||!allowed()){pdf.fill(0);fail('La vista cambió. Revisá nuevamente la foto antes de guardar.');}const result=new File([pdf],'certificado-foto.pdf',{type:'application/pdf'});pdf.fill(0);return result;}finally{original.fill(0);display.fill(0);}
 }};
}
