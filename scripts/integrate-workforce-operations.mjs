/** Deterministic source integration; edits only audited application sources. */
import fs from 'node:fs';
const edit=(file,fn)=>{const before=fs.readFileSync(file,'utf8'),after=fn(before);if(before!==after)fs.writeFileSync(file,after)};
function once(s,a,b){if(!s.includes(a))throw new Error('INTEGRATION_ANCHOR_MISSING: '+a.slice(0,100));return s.replace(a,b)}
edit('api/internal-data.js',s=>{
 if(s.includes('operationalScopeFromRow(scope, status)'))return s;
 s="import { DEFAULT_WORKFORCE_STATUS, WORKFORCE_STATUSES, directorySourceBinding, operationalDirectorySql, operationalScopeSelectSql, operationalScopeFromRow } from '../lib/workforce-operational-scope.js';\n"+s;
 s=s.replace(/const DIRECTORY_STATUS = new Set\(\[[\s\S]*?\]\);/,'const DIRECTORY_STATUS = new Set(WORKFORCE_STATUSES);');
 s=once(s,'function directoryBaseSql() {','function directoryBaseSql(sourceBound = false) {');
 s=once(s,'contract.status AS "contractStatus",\n             latest_status.administrative_status AS "administrativeStatus",',`contract.status AS "contractStatus",
             contract.source_system AS "sourceSystem", contract.source_batch_id AS "sourceBatchId",
             source_batch.source_cutoff AS "sourceCutoff",
             CASE WHEN contract.status IN ('inactive','state_error') THEN contract.status
                  ELSE latest_status.administrative_status END AS "administrativeStatus",`);
 s=once(s,`COALESCE(latest_status.administrative_status IN (
               'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
             ), false) AS activo,`,`COALESCE(contract.status = 'active' AND latest_status.administrative_status IN (
               'active', 'suspended', 'leave_without_pay', 'pending_termination'
             ), false) AS activo,`);
 // Only the directory CTE is changed: other employee-detail readers retain their contracts.
 const start=s.indexOf('function directoryBaseSql('),end=s.indexOf('\nexport async function employees',start);
 let base=s.slice(start,end);
 base=once(base,'JOIN person_identity identity ON identity.id = contract.person_id',`JOIN person_identity identity ON identity.id = contract.person_id
      JOIN source_import_batch source_batch ON source_batch.id = contract.source_batch_id`);
 base=once(base,') latest_assignment ON true',`) latest_assignment ON true
      WHERE contract.source_system='GRH' AND source_batch.source_system='GRH'
        AND source_batch.validation_state='published' AND source_batch.legacy_import_run_id IS NOT NULL
        \${sourceBound ? 'AND source_batch.source_database=$1::text AND contract.legacy_company_id=$2::bigint' : ''}`);
 s=s.slice(0,start)+base+s.slice(end);
 s=once(s,'export async function employees(sql, req) {','export async function employees(sql, req, binding = null) {');
 s=once(s,"const requestedStatus = boundedQueryValue(req, 'status', 32).toLowerCase() || 'all';","const requestedStatus = boundedQueryValue(req, 'status', 32).toLowerCase() || DEFAULT_WORKFORCE_STATUS;");
 const a=s.indexOf('export async function employees('),b=s.indexOf('\nexport async function employeePayroll',a);let body=s.slice(a,b);
 body=once(body,'const values = [];',"const sourceValues = binding ? [binding.database, binding.companyId] : [];\n  const values = [...sourceValues];");
 body=once(body,"if (status === 'inactive')",`if (status === 'multiple_active') conditions.push('directory.activo IS TRUE AND directory."canonicalPersonId" IN (SELECT * FROM multiple_active_people)');
  if (status === 'last_closed') conditions.push('directory."contractId" IN (SELECT employment_contract_id FROM closed_contracts)');
  if (status === 'inactive')`);
 body=once(body,'const baseSql = directoryBaseSql();','const baseSql = operationalDirectorySql(directoryBaseSql(Boolean(binding)));');
 const q1=body.indexOf('    sql.query(`\n      SELECT (SELECT count(*)::int FROM employment_contract)');
 const q2=body.indexOf('\n  ]);',q1);if(q1<0||q2<0)throw new Error('scope block missing');
 body=body.slice(0,q1)+`    sql.query(operationalScopeSelectSql(baseSql), sourceValues),
    includeFacets ? sql.query(\`\${baseSql} SELECT COALESCE(sector, 'Sin sector informado') AS value,count(*)::int AS count FROM directory GROUP BY 1 ORDER BY value\`, sourceValues) : Promise.resolve([]),
    includeFacets ? sql.query(\`\${baseSql} SELECT COALESCE(organizacion, 'Sin organización informada') AS value,count(*)::int AS count FROM directory GROUP BY 1 ORDER BY value\`, sourceValues) : Promise.resolve([]),
    includeFacets ? sql.query(\`\${baseSql} SELECT COALESCE(convenio, 'Sin convenio informado') AS value,count(*)::int AS count FROM directory GROUP BY 1 ORDER BY value\`, sourceValues) : Promise.resolve([])`+body.slice(q2);
 body=once(body,'      data,',`      data: data.map(({sourceSystem, sourceBatchId, sourceCutoff, ...row}) => row),
      operational: operationalScopeFromRow(scope, status),`);
 s=s.slice(0,a)+body+s.slice(b);
 s=s.replace('latest_status.administrative_status AS "administrativeStatus",', "CASE WHEN contract.status IN ('inactive','state_error') THEN contract.status ELSE latest_status.administrative_status END AS \"administrativeStatus\",");
 s=s.replace("control.estado_control AS \"controlState\",", "CASE WHEN contract.status='state_error' THEN 'estado_contrato_inconsistente' ELSE control.estado_control END AS \"controlState\",");
 s=s.replace("COALESCE(latest_status.administrative_status IN (\n             'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'\n           ), false) AS activo,", "COALESCE(contract.status='active' AND latest_status.administrative_status IN (\n             'active', 'suspended', 'leave_without_pay', 'pending_termination'\n           ), false) AS activo,");
 s=s.replace("COALESCE(\n               control.estado_control,", "COALESCE(\n               CASE WHEN contract.status='state_error' THEN 'estado_contrato_inconsistente' ELSE control.estado_control END,");
 s=once(s,'const result = await employees(sql, req);','const result = await employees(sql, req, directorySourceBinding(env));');return s;
});
edit('internal-dashboard.html',s=>{
 if(s.includes('id="workforceWorkspace"'))return s;
 s=once(s,'</head>','<link rel="stylesheet" href="assets/workforce-operations.css">\n<script type="module" src="assets/workforce-operations.js"></script>\n</head>');
 s=s.replace("status: 'all', crosswalk: 'all'","status: 'administrative_active', crosswalk: 'all'");
 s=once(s,'<p class="eyebrow">Directorio interno · GRH como fuente laboral</p>','<p class="eyebrow">Gestión de personal · MuniControl</p>');
 s=once(s,'<p class="page-lead">Encontrá una ficha por nombre, legajo, DNI o CUIL. PERSONAS sólo amplía identidad y territorio cuando el vínculo está validado.</p>','<p class="page-lead">El padrón activo primero. Desde cada legajo consultá haberes, gestioná novedades o iniciá una licencia. El archivo histórico se consulta por separado.</p>');
 const anchor='<div class="directory-scope" id="directoryScope"';s=once(s,anchor,fs.readFileSync('assets/workforce-operations-panel.html','utf8')+'\n<details class="workforce-history"><summary>Cobertura del archivo histórico y calidad de identidad</summary>\n'+anchor);
 s=once(s,'<form class="filters directory-filters"','</details>\n            <form class="filters directory-filters"');
 s=s.replace('<span>Personas GRH</span>','<span>Personas con legajo</span>');
 s=once(s,'<span>Legajos</span><strong id="scopeContracts">','<span>Legajos del archivo</span><strong id="scopeContracts">');
 s=once(s,'<option value="all">Todas</option>\n                  <option value="administrative_active">Activos administrativos</option>',`<option value="administrative_active" selected>Activos del padrón</option>
                  <option value="all">Archivo completo · activos e histórico</option>
                  <option value="multiple_active">Varios legajos activos por persona</option>
                  <option value="last_closed">Liquidados del último mes cerrado</option>`);
 s=s.replace('<option value="liquidable">Incluidos en liquidación</option>','<option value="liquidable">Incluidos en la corrida informada</option>').replace('<option value="inactive">Inactivos administrativos</option>','<option value="inactive">Histórico · legajos inactivos</option>').replace('id="clearFilters" type="button">Limpiar</button>','id="clearFilters" type="button">Restablecer activos</button>');
 s=once(s,'renderDirectoryScope(result.scope);','renderDirectoryScope(result.scope);\n          window.dispatchEvent(new CustomEvent(\'municontrol:workforce-scope\', {detail:result.operational}));');
 s=once(s,'scope: payload && payload.scope',"operational: payload.operational && typeof payload.operational === 'object' ? payload.operational : {},\n          scope: payload && payload.scope");
 s=s.replace("detailField('Control 882 / 854'", "detailField('Inclusión en corrida'").replace("inactivo_administrativo: 'Inactivo administrativo',", "inactivo_administrativo: 'Inactivo administrativo',\n          estado_contrato_inconsistente: 'Estado de contrato inconsistente',");
 s=s.replace("els.statusFilter.value = 'all';","els.statusFilter.value = 'administrative_active';");
 s=once(s,'function renderEmployeesError(error) {',"function renderEmployeesError(error) {\n        window.dispatchEvent(new Event('municontrol:workforce-reset'));");return s;
});
edit('scripts/build-friendly.mjs',s=>s.includes("'assets/workforce-operations.js'")?s:once(s,"  'assets/action-language.js',","  'assets/action-language.js',\n  'assets/workforce-operations.js',\n  'assets/workforce-operations.css',"));
