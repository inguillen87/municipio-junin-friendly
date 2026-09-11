/** Full legajo-shell integration using synthetic API responses only. */
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const source='scripts/verify-workforce-operations-browser.mjs',target='scripts/.document-library-shell-qa.mjs';
function once(s,a,b){if(!s.includes(a))throw Error('QA_ANCHOR_MISSING');return s.replace(a,b)}
let s=fs.readFileSync(source,'utf8');
s="import {syntheticDetail} from './payroll-detail-synthetic.mjs';\n"+s;
s=once(s,"else if(resource==='employees')",`else if(resource==='employeepayrolldocuments')payload={ok:true,data:{version:'payroll-document-library.v1',found:true,total:1,truncated:false,officialReceipt:false,signatureApplied:false,items:[{datasetId:syntheticDetail().datasetId,payrollDate:'2026-07-31',sourcePeriod:2026,sourceMonth:7,payrollType:'M',closureStatus:'closed',sourceLabel:'Fuente sintética QA',importedAt:'2026-09-11T08:00:00Z',conceptCount:11,versionsAvailable:1,historySummaryAvailable:false}]}};
else if(resource==='employeepayrolldetail')payload={ok:true,data:syntheticDetail()};
else if(resource==='employeepayroll')payload={ok:true,data:{items:[]},meta:{pagination:{total:0,page:1,pages:1}}};
else if(resource==='employees')`);
// Use the real API shape (nombre), never inject a fictitious name alias.
s=once(s," assert.equal(requests[0].status",` await page.locator('#employeeRows button').first().click();
 await page.getByRole('button',{name:'Liquidaciones detalladas',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Liquidaciones detalladas',exact:true}).isEnabled(),true);
 await page.getByRole('button',{name:'Liquidaciones detalladas',exact:true}).click();
 await page.locator('#employeeDialog .pdl-card').waitFor();
 assert.match(await page.locator('#employeeDialog .pdl-summary').innerText(),/1 sin tarjeta/);
 checks.push('full legajo shell opens independently authorized library with an empty legacy history');
 await page.getByRole('button',{name:/Ver conceptos y exportar · Julio de 2026/}).click();
 await page.locator('#employeeDialog .pd-table').first().waitFor();
 assert.equal(await page.getByRole('button',{name:'Descargar detalle · PDF',exact:true}).isEnabled(),true);
 assert.match(await page.locator('#employeeDialog .pd-table').first().innerText(),/Descuento A de prueba/);
 checks.push('full legajo-library-detail navigation enables complete itemized export');
 await page.locator('#employeeDialog').screenshot({path:path.join(out,'document-library-legajo-qa.png')});
 await page.getByRole('button',{name:'Cerrar ficha',exact:true}).click();
 assert.ok(!new URL(page.url()).searchParams.has('contractId'));
 checks.push('legajo navigation keeps personal identifiers out of the browser address');
 assert.equal(requests[0].status`);
s=s.replace("'workforce-browser.json'","'document-library-shell-browser.json'");
fs.writeFileSync(target,s);
try{await import(pathToFileURL(process.cwd()+'/'+target).href)}finally{fs.rmSync(target,{force:true})}
