// Adds diagnostics only AFTER the unmodified initial assertion fails.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const file='scripts/verify-payroll-parameters-browser.mjs';
const original=fs.readFileSync(file,'utf8');
const marker="await w.getByText('Parámetros disponibles.', { exact: false }).waitFor();";
if(!original.includes(marker))throw Error('Missing startup assertion');
const probe=original.replace(marker,marker.slice(0,-1)+`.catch(async(error)=>{
 const state=await page.evaluate(()=>({url:location.pathname+location.hash,ready:document.readyState,mainHidden:document.querySelector('#mainContent')?.hidden,task:document.querySelector('#payrollTaskWorkspace')?.dataset.activeTask,parameterHTML:document.querySelector('#task-parametros')?.innerHTML.slice(0,3500),parameterText:document.querySelector('#task-parametros')?.innerText.slice(0,2000),gateState:document.documentElement.dataset.mcCapabilityState,gateReady:document.documentElement.dataset.mcCapabilityReady,selected:[...document.querySelectorAll('[role=tab][aria-selected=true]')].map(n=>n.textContent),pageError:document.querySelector('#errorHost')?.innerText}));
 const diagnostic={state,calls,errors,error:String(error.stack),actualWritesSent:0};
 console.log('STARTUP_FAILURE '+JSON.stringify(diagnostic));
 fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(diagnostic,null,2));
 await page.screenshot({path:path.join(out,'failure.png')});throw error;
 });`);
try{fs.writeFileSync(file,probe);const r=spawnSync(process.execPath,[file],{stdio:'inherit',timeout:90000});process.exitCode=r.status??1;}finally{fs.writeFileSync(file,original);}
