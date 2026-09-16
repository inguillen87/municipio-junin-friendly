// Candidate-only diagnostic. Sources restored before later hash verification.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const file='scripts/verify-payroll-parameters-browser.mjs';
const original=fs.readFileSync(file,'utf8');
let source=original.replace('const checks = [], errors = [], writes = [], calls = [], store = [], receipts = new Map();','let debugPage; const networkFailures=[], consoleErrors=[]; const checks = [], errors = [], writes = [], calls = [], store = [], receipts = new Map();');
source=source.replace("const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));", "const page = await context.newPage(); debugPage=page; page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message)); page.on('requestfailed', r=>networkFailures.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText})); page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text().slice(0,700));});");
source=source.replace('} finally { await browser.close(); }',` } catch(error) {
 const state=debugPage?await debugPage.evaluate(async()=>({url:location.pathname+location.hash, mainHidden:document.querySelector('#mainContent')?.hidden,task:document.querySelector('#payrollTaskWorkspace')?.dataset.activeTask,parameterText:document.querySelector('#task-parametros')?.innerText.slice(0,1800),gateState:document.documentElement.dataset.mcCapabilityState,capabilities:[...((await globalThis.MuniControlCapabilityGate?.ready)?.tenantCapabilities||[])]})).catch(e=>({error:e.message})):null;
 const diagnostic={checks,errors,calls,networkFailures,consoleErrors,state,error:String(error.stack),apiResponsesSynthetic:true,actualWritesSent:0};
 fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(diagnostic,null,2)); console.log('PARAMETER_BROWSER_FAILURE '+JSON.stringify(diagnostic));
 if(debugPage)await debugPage.screenshot({path:path.join(out,'failure.png')}).catch(()=>{}); throw error;
 } finally { await browser.close(); }`);
try{fs.writeFileSync(file,source);const r=spawnSync(process.execPath,[file],{stdio:'inherit',timeout:180000});process.exitCode=r.status??1;}finally{fs.writeFileSync(file,original);}
