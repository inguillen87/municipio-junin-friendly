/** Deterministic tracked-code integration. No database writes or personnel data. */
import fs from 'node:fs';
const edit=(p,f)=>{const s=fs.readFileSync(p,'utf8'),v=f(s);if(s!==v)fs.writeFileSync(p,v)};
edit('lib/internal-resource-access.js',s=>s.includes('employeepayrolldetail:')?s:s.replace('  employeepayroll: Object.freeze',"  employeepayrolldetail: Object.freeze([C.WORKFORCE_EMPLOYEE_READ, C.PAYROLL_READ]),\n  employeepayroll: Object.freeze"));
edit('api/internal-data.js',s=>{if(s.includes("resource === 'employeepayrolldetail'"))return s;return "import { employeePayrollDetail } from '../lib/internal-payroll-detail.js';\n"+s.replace("      if (resource === 'employeepayroll') {","      if (resource === 'employeepayrolldetail') {\n        const result = await employeePayrollDetail(await getPayrollSql(env), req, access.principal, getTenantSession(access, env));\n        return send(res, result.status, result.payload);\n      }\n      if (resource === 'employeepayroll') {")});
edit('internal-dashboard.html',s=>{if(s.includes('detailButton.dataset.payrollDetailOpen'))return s;return s.replace('</head>','  <link rel="stylesheet" href="assets/payroll-detail-panel.css">\n</head>').replace('        actions.append(actionContext, summaryDownload, novelty);',`        const detailButton=create('button','button','Ver conceptos y descuentos');
        detailButton.type='button';detailButton.dataset.payrollDetailOpen='true';
        const canReadDetail=()=>state.tenantCapabilities.has('workforce.employee.read')&&state.tenantCapabilities.has('payroll.read')&&card.isConnected;
        detailButton.disabled=summaryDownload.disabled;
        detailButton.addEventListener('click',async function(){
          if(!canReadDetail())return;detailButton.disabled=true;
          try{const module=await import('./assets/payroll-detail-panel.js');if(canReadDetail())await module.openPayrollDetail({host:card,employee,item,request:requestJSON,canRead:canReadDetail});}
          catch(error){toast('No se pudo abrir el detalle: '+error.message,'error');}
          finally{detailButton.disabled=!canReadDetail();}
        });
        actions.append(actionContext, detailButton, summaryDownload, novelty);`)});
edit('scripts/build-friendly.mjs',s=>s.includes("'assets/payroll-detail-model.js'")?s:s.replace("  'assets/payroll-summary-pdf.js',","  'assets/payroll-summary-pdf.js',\n  'assets/payroll-detail-model.js',\n  'assets/payroll-detail-panel.js',\n  'assets/payroll-detail-panel.css',\n  'assets/payroll-detail-export.js',"));
edit('vercel.json',s=>s.includes('api/payroll-source-delivery.js')?s:s.replace('"functions": {','"functions": {\n    "api/payroll-source-delivery.js": { "maxDuration": 60 },'));
for(const [p,marker] of [['internal-dashboard.html','detailButton.dataset.payrollDetailOpen'],['api/internal-data.js',"resource === 'employeepayrolldetail'"],['lib/internal-resource-access.js','employeepayrolldetail:'],['scripts/build-friendly.mjs',"'assets/payroll-detail-model.js'"]])if(!fs.readFileSync(p,'utf8').includes(marker))throw new Error('Integration marker absent: '+p);
