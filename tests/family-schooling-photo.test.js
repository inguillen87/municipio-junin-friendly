import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {certificateInputFile,photoDimensions,photoAdjustment,photoCertificatePdf} from '../assets/family-schooling-photo.js';
import {validateSchoolCertificatePdf} from '../lib/internal-family-certificates.js';
import {photoFixture} from './fixtures/school-photo-synthetic.js';
const jpeg=Uint8Array.from(Buffer.from(photoFixture.jpeg,'base64')),png=Uint8Array.from(Buffer.from(photoFixture.png,'base64'));
test('las fotos admitidas tienen tipo real y dimensiones acotadas; SVG, HEIC, archivos enormes o engañosos no se admiten',()=>{
 assert.deepEqual(photoDimensions(jpeg),{type:'image/jpeg',width:240,height:180});assert.deepEqual(photoDimensions(png),{type:'image/png',width:240,height:180});
 for(const file of [{name:'x.svg',type:'image/svg+xml',size:100},{name:'x.heic',type:'image/heic',size:100},{name:'x.jpg',type:'text/html',size:100},{name:'../x.jpg',type:'image/jpeg',size:100},{name:'x.jpg',type:'image/jpeg',size:2097153}])assert.throws(()=>certificateInputFile(file));
 for(const bytes of [new Uint8Array(24),jpeg.slice(0,50),new Uint8Array(2097153)])assert.throws(()=>photoDimensions(bytes));
 const huge=png.slice();new DataView(huge.buffer).setUint32(16,12001);assert.throws(()=>photoDimensions(huge));
 const zero=png.slice();new DataView(zero.buffer).setUint32(20,0);assert.throws(()=>photoDimensions(zero));
});
test('el giro y recorte sólo aceptan valores explícitos y dejan intactos los buffers originales',()=>{
 assert.deepEqual(photoAdjustment({rotation:90,left:5}),{rotation:90,left:5,right:0,top:0,bottom:0});
 for(const adjustment of [{rotation:45},{top:-1},{left:46},{bottom:0.5},{right:NaN}])assert.throws(()=>photoAdjustment(adjustment));
});
test('el PDF pasa el validador real del servidor y conserva JPEG/PNG originales byte a byte como adjuntos privados',async()=>{
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 for(const original of [jpeg,png]){
  const before=original.slice(),name='foto sintética '+(original===jpeg?'original.jpg':'original.png'),pdf=await photoCertificatePdf({original,display:jpeg,name,adjustment:{rotation:90,top:5}});
  assert.deepEqual(original,before);assert.ok(pdf.length<2097152);assert.deepEqual(await validateSchoolCertificatePdf(pdf),{pages:1});
  const task=getDocument({data:pdf.slice(),verbosity:0,isEvalSupported:false,enableXfa:false,useSystemFonts:false,disableFontFace:true,useWasm:false});
  try{const doc=await task.promise;assert.equal(doc.numPages,1);const attachments=await doc.getAttachments();assert.ok(attachments instanceof Map);assert.equal(attachments.size,1);assert.equal(attachments.get('original').filename,name);assert.deepEqual(Uint8Array.from(await doc.getAttachmentContent('original')),before);
   const metadata=JSON.parse((await doc.getMetadata()).info.Subject);assert.equal(metadata.originalSha256,createHash('sha256').update(before).digest('hex'));assert.equal(metadata.adjustment.rotation,90);assert.equal(metadata.originalBytes,before.length);assert.deepEqual(await doc.getJSActions(),null);
  }finally{await task.destroy();}
 }
});
test('el contenedor nunca recorta los bytes para eludir el límite del documento privado',async()=>{
 const large=new Uint8Array(2097100);large.set(jpeg);const before=large.slice();
 await assert.rejects(photoCertificatePdf({original:large,display:jpeg,name:'original.jpg'}),/supera 2 MiB/);assert.deepEqual(large,before);
});
