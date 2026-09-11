import fs from 'node:fs';
function change(file,fn){const source=fs.readFileSync(file,'utf8');const next=fn(source);if(source!==next)fs.writeFileSync(file,next)}
function replace(source,anchor,value){if(!source.includes(anchor))throw Error('INTEGRATION_ANCHOR_MISSING '+anchor.slice(0,80));return source.replace(anchor,value)}
change('api/internal-data.js',s=>{
 if(s.includes("resource === 'employeepayrolldocuments'"))return s;
 s="import { employeePayrollDocuments } from '../lib/internal-payroll-documents.js';\n"+s;
 return replace(s,"      if (resource === 'employeepayrolldetail') {",`      if (resource === 'employeepayrolldocuments') {
        const result = await employeePayrollDocuments(await getPayrollSql(env), req, access.principal, getTenantSession(access, env));
        return send(res, result.status, result.payload);
      }
      if (resource === 'employeepayrolldetail') {`);
});
change('lib/internal-resource-access.js',s=>s.includes('employeepayrolldocuments:')?s:replace(s,'  employeepayrolldetail:',"  employeepayrolldocuments: Object.freeze([C.WORKFORCE_EMPLOYEE_READ, C.PAYROLL_READ]),\n  employeepayrolldetail:"));
change('internal-dashboard.html',s=>{
 if(s.includes('dataPayrollDocumentLibraryOpen'))return s;
 s=replace(s,'</head>','<link rel="stylesheet" href="assets/payroll-document-library.css">\n</head>');
 s=replace(s,'        actions.append(payroll, downloads, novelty, calculate, request, absence);',`        const libraryButton=create('button','button','Liquidaciones detalladas');
        libraryButton.type='button';libraryButton.dataset.dataPayrollDocumentLibraryOpen='true';
        libraryButton.disabled=payroll.disabled;
        libraryButton.title='Ver períodos con conceptos incorporados, incluso si no figuran en el resumen anterior';
        libraryButton.addEventListener('click',async function(){
          const live=()=>section.isConnected&&state.tenantCapabilities.has('workforce.employee.read')&&state.tenantCapabilities.has('payroll.read');
          if(!live())return;libraryButton.disabled=true;
          try{const module=await import('./assets/payroll-document-library.js');if(live())await module.openPayrollDocumentLibrary({host:els.dialogBody,employee,request:requestJSON,canRead:live});}
          catch(error){if(live())toast('No se pudo abrir la biblioteca de liquidaciones.','error');}
          finally{libraryButton.disabled=!live();}
        });
        actions.append(payroll, libraryButton, downloads, novelty, calculate, request, absence);`);
 return s;
});
change('assets/payroll-detail-panel.js',s=>s.includes('DOCUMENT_DATASET_PINNED')?s:replace(s,'  const model=createPayrollDetailModel(payload.data,employee);',`  // DOCUMENT_DATASET_PINNED: do not open a different source version than the selected library item.
  if(item.datasetId&&payload.data?.datasetId!==item.datasetId)throw new Error('Hay una versión distinta de esta liquidación. Actualizá la biblioteca antes de abrirla.');
  const model=createPayrollDetailModel(payload.data,employee);`));
change('scripts/build-friendly.mjs',s=>s.includes("'assets/payroll-document-library.js'")?s:replace(s,"  'assets/payroll-detail-panel.js',","  'assets/payroll-detail-panel.js',\n  'assets/payroll-document-library.js',\n  'assets/payroll-document-library-model.js',\n  'assets/payroll-document-library.css',"));
change('.vercelignore',s=>s.split(/\r?\n/).includes('!scripts/migrations/051-payroll-document-library.sql')?s:s+'\n!scripts/migrations/051-payroll-document-library.sql\n');
