import fs from 'node:fs';
// read-excel-file v9 returns named sheets. Keep value/type assertions unchanged.
const p='scripts/verify-export-roster-browser.mjs';let source=fs.readFileSync(p,'utf8');
if(!source.includes('async function readNamedSheet')){
 const anchor="import readXlsxFile from 'read-excel-file/node';";
 if(!source.includes(anchor))throw Error('ROSTER_READER_ANCHOR_MISSING');
 source=source.replace(anchor,anchor+"\nasync function readNamedSheet(file,name){const sheets=await readXlsxFile(file);const selected=sheets.find(s=>s.sheet===name);assert.ok(Array.isArray(selected?.data),'Named sheet missing: '+name);return selected.data;}");
 source=source.replace("await readXlsxFile(out+'/roster-fm-qa.xlsx',{sheet:'Datos'})","await readNamedSheet(out+'/roster-fm-qa.xlsx','Datos')");
 source=source.replace("await readXlsxFile(out+'/art-base-qa.xlsx',{sheet:'Datos'})","await readNamedSheet(out+'/art-base-qa.xlsx','Datos')");
 fs.writeFileSync(p,source);
}
const css='assets/report-centre.css',marker='/* Export roster readiness */';
if(!fs.readFileSync(css,'utf8').includes(marker))fs.appendFileSync(css,'\n'+marker+'\n.rc-roster .rc-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.rc-roster .rc-kpis>div{padding:18px;background:#f3faf8;border:1px solid #d5e7e4;border-top:3px solid #087f77;border-radius:10px}.rc-roster .rc-kpis span{font-size:13px;color:#425d69;display:block}.rc-roster .rc-kpis strong{display:block;font-size:30px;line-height:1.4;color:#163e50;margin-top:6px;font-variant-numeric:tabular-nums}.rc-roster .rc-kpis>div:last-child{border-top-color:#aa7416;background:#fffaf0}@media(max-width:620px){.rc-roster .rc-kpis{grid-template-columns:1fr}.rc-roster .rc-kpis>div{padding:12px}.rc-roster .rc-kpis strong{font-size:25px}}\n');
