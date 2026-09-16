// Synthetic integration diagnostic; restore the reviewed verifier before creating a candidate.
import fs from 'node:fs';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const file='scripts/verify-native-employee-browser.mjs',source=fs.readFileSync(file,'utf8');
const marker="const page=await context.newPage();observedPage=page;page.setDefaultTimeout(12000);";
assert.equal(source.split(marker).length-1,1);
const code=`const page=await context.newPage();observedPage=page;page.setDefaultTimeout(12000);
 page.on('framenavigated',f=>{if(f===page.mainFrame())console.log('QA_NAV',f.url());});
 page.on('request',r=>{if(r.isNavigationRequest())console.log('QA_DOCUMENT',r.method(),r.url());});
 page.on('console',m=>{if(m.text().startsWith('QA_DOM'))console.log(m.text());});
 await page.addInitScript(()=>{
  const describe=n=>n?{tag:n.tagName,id:n.id,type:n.type,form:n.form?.id,href:n.getAttribute?.('href'),text:n.tagName==='BUTTON'?n.textContent.slice(0,65):undefined}:null;
  document.addEventListener('click',e=>console.log('QA_DOM_CLICK',JSON.stringify({target:describe(e.target.closest('button,a')),defaultPrevented:e.defaultPrevented})),true);
  document.addEventListener('submit',e=>console.log('QA_DOM_SUBMIT',JSON.stringify({form:describe(e.target),submitter:describe(e.submitter),defaultPrevented:e.defaultPrevented})),true);
  window.addEventListener('beforeunload',()=>console.log('QA_DOM_UNLOAD'));
 });`;
try{fs.writeFileSync(file,source.replace(marker,()=>code));const result=spawnSync(process.execPath,[file],{stdio:'inherit',timeout:180000});process.exitCode=result.status??1;}finally{fs.writeFileSync(file,source);}
