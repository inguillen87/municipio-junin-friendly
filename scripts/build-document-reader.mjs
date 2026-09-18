import fs from 'node:fs';import path from 'node:path';
export function buildDocumentReader(root,output){
 const asset=path.join(output,'assets'),vendor=path.join(asset,'vendor','ocr');fs.mkdirSync(path.join(vendor,'lang'),{recursive:true});
 for(const name of ['document-ocr-worker.js','document-reader.css'])fs.copyFileSync(path.join(root,'assets',name),path.join(asset,name));
 for(const name of ['tesseract.min.js','worker.min.js','tesseract.min.js.LICENSE.txt','worker.min.js.LICENSE.txt'])fs.copyFileSync(path.join(root,'node_modules','tesseract.js','dist',name),path.join(vendor,name));
 for(const type of ['lstm','simd-lstm','relaxedsimd-lstm']){
  const name='tesseract-core-'+type+'.wasm.js';fs.copyFileSync(path.join(root,'node_modules','tesseract.js-core',name),path.join(vendor,name));
 }
 fs.copyFileSync(path.join(root,'node_modules','@tesseract.js-data','spa','4.0.0_best_int','spa.traineddata.gz'),path.join(vendor,'lang','spa.traineddata.gz'));
 fs.copyFileSync(path.join(root,'node_modules','tesseract.js-core','LICENSE'),path.join(vendor,'LICENSE-core.txt'));
 fs.writeFileSync(path.join(vendor,'NOTICE.txt'),'Tesseract.js 7.0.0 and Tesseract.js-core 7.0.0: Apache-2.0. Spanish model package @tesseract.js-data/spa 1.0.0: MIT (package metadata). Models/code load on demand from this origin; no document upload.\n');
 for(const page of ['juridica-registro.html']){const file=path.join(output,page);let html=fs.readFileSync(file,'utf8');html=html.replace('</head>','<link rel="stylesheet" href="/assets/document-reader.css">\n</head>');fs.writeFileSync(file,html);}
 console.log('Local Spanish OCR assets copied; no documents or API keys bundled.');
}
