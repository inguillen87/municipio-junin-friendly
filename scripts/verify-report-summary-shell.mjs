/** Extend full-shell test with the reported ISO-date download; no real employee/session. */
import fs from 'node:fs';import {pathToFileURL} from 'node:url';
let s=fs.readFileSync('scripts/verify-document-library-legajo.mjs','utf8');
const old="payload={ok:true,data:{items:[]},meta:{pagination:{total:0,page:1,pages:1}}}";
const item={payrollDate:'2026-08-31T00:00:00.000Z',subjectEarnings:'1000.00',nonSubjectEarnings:'0.00',familyAllowance:'50.00',employeeWithholdings:'100.00',netPayable:'950.00',employerContributions:'200.00',canonicalPayrollType:'monthly',payrollType:'M',sourcePeriod:2026,sourceMonth:8,presentationStatus:'open',closureStatus:'open',sourceCutoff:'2026-08-06',distinctConcepts:8};
if(!s.includes(old))throw Error('SUMMARY_QA_SOURCE_ANCHOR');s=s.replace(old,'payload={ok:true,data:{items:['+JSON.stringify(item)+']},meta:{pagination:{total:1,page:1,pages:1}}}');
const at=" await page.locator('#employeeDialog').screenshot";if(!s.includes(at))throw Error('SUMMARY_QA_DOWNLOAD_ANCHOR');
s=s.replace(at," await page.getByRole('button',{name:'Ver liquidaciones',exact:true}).click();\n await page.locator('[data-payroll-summary-download]').waitFor();\n const pdfEvent=page.waitForEvent('download');await page.locator('[data-payroll-summary-download]').click();const summaryFile=await pdfEvent;await summaryFile.saveAs(path.join(out,'summary-iso-date-fixed-qa.pdf'));\n assert.match(await page.locator('.payroll-summary-status').innerText(),/generado/);checks.push('reported white summary PDF button works through real legajo UI with API ISO date');\n"+at);
s=s.replace("empty legacy history","independent legacy history");s=s.replace("document-library-shell-browser.json","summary-fixed-shell-browser.json");
const file='scripts/.summary-fixed-qa.mjs';fs.writeFileSync(file,s);try{await import(pathToFileURL(process.cwd()+'/'+file).href)}finally{fs.rmSync(file,{force:true})}
