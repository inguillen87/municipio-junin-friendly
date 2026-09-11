/** Reuse the established synthetic detail journey with missing closure evidence. */
import fs from 'node:fs';import {pathToFileURL} from 'node:url';
let source=fs.readFileSync('scripts/verify-payroll-detail-browser.mjs','utf8');
const anchor="const data=syntheticDetail();";if(!source.includes(anchor))throw Error('CLOSURE_BROWSER_ANCHOR');
source=source.replace(anchor,anchor+"data.closureStatus='unknown';");
const check="assert.equal(await page.locator('.pd-table').first().locator('tbody tr').count(),2);checks++;";
if(!source.includes(check))throw Error('CLOSURE_BROWSER_CHECK_ANCHOR');
source=source.replace(check,check+"\nassert.ok(await page.getByText(/Estado de cierre no informado/).first().isVisible());checks++;\nassert.equal(await page.getByText(/Abierta \\/ preliquidación/).count(),0);checks++;\n");
source=source.replaceAll('detalle-sintetico','closure-unknown-synthetic').replaceAll('browser-detalle','closure-unknown-download').replaceAll('detalle-desktop-qa','closure-unknown-desktop-qa').replaceAll('detalle-mobile-qa','closure-unknown-mobile-qa').replace('payroll-detail-browser.json','payroll-closure-browser.json');
const target='scripts/.closure-browser-qa.mjs';fs.writeFileSync(target,source);try{await import(pathToFileURL(process.cwd()+'/'+target).href)}finally{fs.rmSync(target,{force:true})}
