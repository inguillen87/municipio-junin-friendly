import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {gzipSync} from 'node:zlib';import {build} from 'esbuild';
import {publicBuildResolution} from './lib/public-build-resolution.mjs';
export async function buildLegalWork(root,output){
 const source='src/islands/legal-work-entry.tsx';
 const result=await build({...publicBuildResolution,absWorkingDir:root,entryPoints:{'legal-work':source},outdir:path.join(output,'assets/islands'),entryNames:'[name]-[hash]',bundle:true,minify:true,jsx:'automatic',format:'esm',platform:'browser',target:['es2020'],sourcemap:false,legalComments:'linked',metafile:true,logLevel:'warning',define:{'process.env.NODE_ENV':'"production"'}});
 const entry=Object.entries(result.metafile.outputs).find(([,m])=>m.entryPoint?.replaceAll('\\','/')===source)?.[0];assert.ok(entry,'Work tracking entry missing');
 const absolute=path.resolve(root,entry),size=gzipSync(await fs.readFile(absolute)).length;assert.ok(size<90000,'Work tracking exceeds 90KB gzip');
 const href='/'+path.relative(output,absolute).split(path.sep).join('/');
 await fs.copyFile(path.join(root,'assets/legal-work.css'),path.join(output,'assets/legal-work.css'));
 const launcher=`let busy=false;async function open(){if(busy)return;busy=true;const b=document.getElementById('legalWorkOpen');b.disabled=true;try{(await import(${JSON.stringify(href)})).openLegalWork();}catch{document.getElementById('legalWorkLoadStatus').textContent='No se pudo abrir Asuntos. Recargá la página y reintentá.';}finally{busy=false;b.disabled=false;}}document.getElementById('legalWorkOpen')?.addEventListener('click',open);if(new URLSearchParams(location.search).get('area')==='asuntos')open();`;
 await fs.writeFile(path.join(output,'assets/legal-work-launcher.js'),launcher);
 const file=path.join(output,'juridica-registro.html');let html=await fs.readFile(file,'utf8');const marker='<button class="button" type="button" id="logoutButton">';assert.equal(html.split(marker).length,2,'Legal header changed');
 html=html.replace(marker,'<button class="button" type="button" id="legalWorkOpen">Asuntos y actuaciones</button><span role="status" id="legalWorkLoadStatus"></span>'+marker).replace('</head>','<link rel="stylesheet" href="/assets/legal-work.css">\n</head>').replace('</body>','<script type="module" src="/assets/legal-work-launcher.js"></script>\n</body>');await fs.writeFile(file,html);
 console.log('Legal work tracking: '+size+' bytes gzip, lazy-loaded on demand.');return{href,gzipBytes:size};
