import fs from 'node:fs';
const css='assets/report-centre.css',rule='\n/* Hidden controls stay out of layout even when enhanced with flex/grid. */\n.rc-filter[hidden],[data-analysis-result][hidden],[data-result][hidden]{display:none!important}\n';
let s=fs.readFileSync(css,'utf8');if(!s.includes('.rc-filter[hidden]'))fs.appendFileSync(css,rule);
const p='.vercelignore',line='!scripts/migrations/053-payroll-source-report.sql';s=fs.readFileSync(p,'utf8');if(!s.split(/\r?\n/).includes(line))fs.appendFileSync(p,'\n'+line+'\n');
// The pinned reader returns all sheets, not rows. Assert the selected sheet explicitly.
const test='scripts/verify-report-centre-browser.mjs';s=fs.readFileSync(test,'utf8');
if(!s.includes('async function readNamedSheet')){
 s=s.replace("const root=path.resolve('public')", "async function readNamedSheet(file,name){const sheets=await readXlsxFile(file);const selected=sheets.find(s=>s.sheet===name);assert.ok(Array.isArray(selected?.data),'Named sheet missing: '+name);return selected.data}\nconst root=path.resolve('public')");
 s=s.replace("readXlsxFile(out+'/analysis-sectors.xlsx',{sheet:'Datos'})","readNamedSheet(out+'/analysis-sectors.xlsx','Datos')").replace("readXlsxFile(out+'/analysis-sectors.xlsx',{sheet:'Control'})","readNamedSheet(out+'/analysis-sectors.xlsx','Control')");
 fs.writeFileSync(test,s);
}
