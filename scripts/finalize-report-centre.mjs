import fs from 'node:fs';
const css='assets/report-centre.css',rule='\n/* Hidden controls stay out of layout even when enhanced with flex/grid. */\n.rc-filter[hidden],[data-analysis-result][hidden],[data-result][hidden]{display:none!important}\n';
let s=fs.readFileSync(css,'utf8');if(!s.includes('.rc-filter[hidden]'))fs.appendFileSync(css,rule);
const p='.vercelignore',line='!scripts/migrations/053-payroll-source-report.sql';s=fs.readFileSync(p,'utf8');if(!s.split(/\r?\n/).includes(line))fs.appendFileSync(p,'\n'+line+'\n');
