import fs from 'node:fs';
function edit(file, transform) { const old=fs.readFileSync(file,'utf8'), next=transform(old); if(next!==old)fs.writeFileSync(file,next); }
function replace(s,old,next) {if(!s.includes(old))throw Error('EXPORT_ROSTER_ANCHOR_MISSING: '+old.slice(0,90));return s.replace(old,next);}
edit('api/internal-data.js',s=>s.includes("resource === 'payrollexportroster'")?s:"import { internalPayrollRoster } from '../lib/internal-payroll-roster.js';\n"+replace(s,"      if (resource === 'payrollsourcereport') {","      if (resource === 'payrollexportroster') {\n        const result = await internalPayrollRoster(await getPayrollSql(env), req, access.principal, getTenantSession(access, env));\n        return send(res,result.status,result.payload);\n      }\n      if (resource === 'payrollsourcereport') {"));
edit('lib/internal-resource-access.js',s=>s.includes('payrollexportroster:')?s:replace(s,'  payrollsourcereport:',"  payrollexportroster: Object.freeze([C.WORKFORCE_EMPLOYEE_READ,C.PAYROLL_READ]),\n  payrollsourcereport:"));
edit('assets/payroll-source-reports.js',s=>{
 if(s.includes('mountPayrollRoster'))return s;
 s="import { mountPayrollRoster } from './payroll-roster-panel.js';\n"+s;
 s=replace(s," let current=null,version=0,busy=false;"," const rosterHost=e('section');host.append(rosterHost);const roster=mountPayrollRoster(rosterHost);\n let current=null,version=0,busy=false;");
 s=replace(s,'const clear=()=>{current=null;result.hidden=true}',"const clear=()=>{current=null;result.hidden=true;roster.setDataset(null)}");
 s=replace(s,'current=d;render();','current=d;render();roster.setDataset(d.datasetId);');
 return s;
});
edit('scripts/build-friendly.mjs',s=>s.includes("'assets/payroll-roster-panel.js'")?s:replace(s,"  'assets/payroll-source-reports.js',","  'assets/payroll-source-reports.js',\n  'assets/export-sex-code.js',\n  'assets/payroll-roster-model.js',\n  'assets/payroll-roster-panel.js',"));
edit('assets/report-document.js',s=>s.includes('d.rows.length>2000')?s:replace(s,'d.rows.length>1000','d.rows.length>2000'));
edit('assets/report-centre.css',s=>s.includes('.rc-roster{')?s:s+'\n.rc-roster{margin-top:28px;border-top:2px solid #d5e7e4;padding-top:22px}.rc-roster h3{font-size:22px;margin:4px 0 12px}.rc-roster [hidden]{display:none!important}.rc-roster td{overflow-wrap:anywhere}.rc-roster [data-roster-status]{min-height:20px}\n');
edit('.vercelignore',s=>s.includes('!scripts/migrations/054-payroll-export-roster.sql')?s:s+'\n!scripts/migrations/054-payroll-export-roster.sql\n');
