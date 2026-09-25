import crypto from 'node:crypto';
import { buildReleaseIdentity } from './build-release-identity.mjs';
import '../assets/app-routes.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyFriendlyPwaIdentity, applyFriendlySocialMetadata } from './apply-friendly-social-metadata.mjs';
import { buildLegalRegistry } from './build-legal-registry.mjs';
import { buildClockFleet } from './build-clock-fleet.mjs';
import { buildDocumentReader } from './build-document-reader.mjs';
import { buildReactIslands, buildLeaveRulesIsland } from './build-react-islands.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public');
const shellFiles = [
  'assets/release-status-model.js',
  'assets/release-status-panel.js',
  'assets/release-status.css',
  'assets/app-routes.js',
  'login.html',
  'assets/access-portal.css',
  'activar-cuenta.html',
  'seguridad-cuenta.html',
  'friendly-dashboard.html',
  'modulos.html',
  'reportes-rrhh.html',
  'calidad-datos.html',
  'internal-dashboard.html',
  'centro-acciones.html',
  'control-horario-readiness.html',
  'attendance-readiness-evidence.v1.json',
  'control-horario-homologacion.html',
  'attendance-policy-candidates.v1.json',
  'fuentes-tiempo.html',
  'relojes-marcaciones.html',
  'administracion-plataforma.html',
  'estructura.html',
  'integracion-datos.html',
  'nomina-control.html',
  'novedades-nomina.html',
  'gestion-comparativa.html',
  'presupuesto-control.html',
  'ausentismo-control.html',
  'licencias-control.html',
  'calidad-operativa.html',
  'asistente.html',
  'centro-ayuda.html',
  'assets/internal-capability-gate.js',
  'assets/workday-export.js',
  'assets/workday-panel.css',
  'assets/workday-panel.js',
  'assets/absence-person-model.js',
  'assets/absence-window-model.js',
  'assets/absence-person-reader.js',
  'assets/absence-person-panel.js',
  'assets/absence-person-report.js',
  'assets/absence-person-report-view.js',
  'assets/absence-person-report.css',
  'assets/absence-person-panel.css',
  'assets/workday-quick-analysis.js',
  'assets/workday-quick-panel.js',
  'assets/workday-panel-model.js',
  'assets/workday-review-causes.js',
  'assets/payroll-summary-pdf.js',
  'assets/employee-picker.js',
  'assets/employee-picker-model.js',
  'assets/employee-picker.css',
  'assets/payroll-summary-model.js',
  'assets/payroll-history-055.css',
  'assets/civil-date.js',
  'assets/employee-source-seniority-model.js',
  'assets/employee-elapsed-service.js',
  'assets/employee-elapsed-service.css',
  'assets/task-workspace.js',
  'assets/report-analysis.js',
  'assets/report-document.js',
  'assets/report-centre.js',
  'assets/budget-structure-model.js',
  'assets/budget-payroll-model.js',
  'assets/budget-payroll-workbench.js',
  'assets/budget-structure-pdf.js',
  'assets/budget-structure-workbench.js',
  'assets/budget-structure-worker.js',
  'assets/budget-structure.css',
  'assets/structure-task-entry.css',
  'assets/structure-people.js',
  'assets/structure-people.css',
  'assets/payroll-bank-generator.js',
  'assets/payroll-bank-generator-model.js',
  'assets/payroll-bank-generator-export.js',
  'assets/payroll-bank-reconciliation.js',
  'assets/payroll-bank-review-panel.js',
  'assets/payroll-bank-control-package.js',
  'assets/payroll-bank-generator.css',
  'assets/report-centre.css',
  'assets/payroll-comparison-model.js',
  'assets/payroll-comparison.js',
  'assets/payroll-comparison.css',
  'assets/payroll-source-report-model.js',
  'assets/payroll-source-reports.js',
  'assets/export-sex-code.js',
  'assets/payroll-roster-model.js',
  'assets/payroll-roster-panel.js',
  'assets/payroll-navigation.js',
  'assets/payroll-detail-model.js',
  'assets/payroll-detail-panel.js',
  'assets/payroll-document-library.js',
  'assets/payroll-document-batch-model.js',
  'assets/payroll-document-batch-panel.js',
  'assets/payroll-document-batch.css',
  'assets/payroll-document-library-model.js',
  'assets/payroll-document-library.css',
  'assets/payroll-detail-panel.css',
  'assets/payroll-detail-export.js',
  'assets/action-language.js',
  'assets/action-command-recovery.js',
  'assets/action-calendar-date.js',
  'assets/action-workspace-layout.css',
  'assets/workforce-operations.js',
  'assets/workforce-operations.css',
  'assets/native-employee-contract.js',
  'assets/native-employee-create.js',
  'assets/native-employee-create.css',
  'assets/native-employment-catalog.js',
  'assets/native-employment-catalog.css',
  'assets/native-employment-catalog-model.js',
  'assets/employee-detail-navigation.js',
  'assets/employee-detail-navigation.css',
  'assets/payroll-novelty-amount-policy.js',
  'assets/clock-dashboard-zip.js',
  'assets/clock-dashboard-export.js',
  'assets/clock-dashboard-model.js',
  'assets/clock-dashboard.css',
  'assets/pm10-reception.css',
  'assets/pm10-reception.js',
  'assets/clock-dashboard.js',
  'assets/attendance-clock-operations.css',
  'assets/attendance-clock-operations.js',
  'assets/attendance-connector-admin.js',
  'assets/internal-guide.js',
  'assets/liquidaciones-menu.js',
  'assets/liquidaciones-menu.css',
  'juridica-registro.html',
  'assets/legal-registry-model.js',
  'assets/legal-documentary-review.js',
  'assets/legal-documentary-panel.js',
  'assets/legal-registry.css',
  'assets/legal-pdf-text-model.js',
  'assets/document-reader-model.js',
  'assets/document-reader-source.js',
  'assets/legal-pdf-text-worker.js',
  'assets/legal-registry-entry-card.css',
  'assets/work-area-model.js',
  'assets/work-area-menu.js',
  'assets/work-area-menu.css',
  'assets/internal-work-today.js',
  'assets/internal-work-today-sections.css',
  'assets/municontrol-enterprise.css',
  'assets/brand/municontrol-mark.svg',
  'assets/brand/logo-horizontal.svg',
  'assets/brand/logo-horizontal-inverse.svg',
  'assets/brand/avatar.svg',
  'assets/brand/municontrol-social-card-v1.png',
  'assets/identity-security.css',
  'assets/product-guidance.js',
  'assets/mendoza-title-vi.js',
  'assets/junin-budget-2026.js',
  'assets/junin-tardiness-policy.js',
  'assets/payroll-formula-linter.js',
  'assets/grh-source-preview.js',
  'assets/grh-backup-review-model.js',
  'assets/grh-core-review-model.js',
  'assets/grh-successor-review-model.js',
  'assets/grh-successor-review-ui.js',
  'assets/grh-curated-review-model.js',
  'assets/grh-curated-review-ui.js',
  'assets/grh-backup-review.js',
  'assets/grh-backup-review.css',
  'assets/payroll-post-close-exporter.js',
  'assets/payroll-post-close-reconciler.js',
  'assets/payroll-control-import-workflow.js',
  'assets/payroll-reprocessing-workflow.js',
  'assets/payroll-art-report.js',
  'assets/payroll-art-report-exporter.js',
  'assets/payroll-art-report-workbench.js',
  'assets/payroll-bank-fixed-width-profiles.js',
  'assets/payroll-bank-report-workbench.js',
  'assets/payroll-health-fixed-width.js',
  'assets/payroll-health-fixed-width-workbench.js',
  'assets/payroll-schooling-report.js',
  'assets/payroll-schooling-report-workbench.js',
  'assets/family-schooling-model.js',
  'assets/family-schooling-export.js',
  'assets/family-schooling.js',
  'assets/family-schooling.css',
  'assets/payroll-monthly-summary-model.js',
  'assets/payroll-monthly-summary-export.js',
  'assets/payroll-monthly-summary.js',
  'assets/payroll-monthly-summary.css',
  'assets/payroll-f931-prevalidator.js',
  'assets/payroll-f931-workbench.js',
  'assets/payroll-bank-control-xlsx-adapter.js',
  'assets/payroll-bank-control-xlsx-worker.js',
  'assets/monthly-close-jurisdiction-xlsx-adapter.js',
  'assets/monthly-close-jurisdiction-xlsx-worker.js',
  'assets/payroll-concept-breakdown-exporter.js',
  'assets/monthly-close-grh-summary-adapter.js',
  'assets/monthly-close-grh-summary-worker.js',
  'assets/monthly-close-local-precheck.js',
  'assets/payroll-monthly-close-approved-report.js',
  'assets/payroll-monthly-close-workflow.js',
  'assets/payroll-novelty-exporter.js',
  'assets/payroll-novelty-xlsx-exporter.js',
  'assets/payroll-novelty-workbench.js',
  'assets/payroll-native-monthly-model.js',
  'assets/payroll-fixed-novelties.js',
  'assets/payroll-fixed-novelties-model.js',
  'assets/payroll-fixed-novelties-export.js',
  'assets/payroll-junin-638.js',
  'assets/payroll-fixed-novelties.css',
  'assets/payroll-novelty-legajo-list.js',
  'assets/payroll-novelty-legajo-list.css',
  'assets/payroll-novelty-sheet.js',
  'assets/attendance-preparte-panel.js',
  'assets/attendance-preparte-model.js',
  'assets/attendance-preparte-export.js',
  'assets/attendance-preparte.css',
  'assets/payroll-novelty-sheet-model.js',
  'assets/payroll-novelty-sheet.css',
  'assets/payroll-novelty-review.js',
  'assets/payroll-novelty-review-panel.js',
  'assets/payroll-novelty-review.css',
  'assets/rrhh-report-pack.js',
  'datos-personales.html',
  'friendly-data.json'
];
const vendorFiles = [
  {
    source: 'node_modules/read-excel-file/bundle/read-excel-file.min.js',
    destination: 'assets/vendor/read-excel-file.min.js',
  },
  {
    source: 'node_modules/read-excel-file/LICENSE',
    destination: 'assets/vendor/read-excel-file.LICENSE.txt',
  },
  {
    source: 'node_modules/fflate/umd/index.js',
    destination: 'assets/vendor/fflate.min.js',
  },
  {
    source: 'node_modules/fflate/LICENSE',
    destination: 'assets/vendor/fflate.LICENSE.txt',
  },
  {
    source: 'node_modules/pdfjs-dist/build/pdf.min.mjs',
    destination: 'assets/vendor/pdf.min.mjs',
  },
  {
    source: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
    destination: 'assets/vendor/pdf.worker.min.mjs',
  },
  {
    source: 'node_modules/pdfjs-dist/LICENSE',
    destination: 'assets/vendor/pdfjs-dist.LICENSE.txt',
  },
];
const pwaFiles = [
  'manifest.webmanifest',
  'sw.js',
  'assets/pwa/icon.svg',
  'assets/pwa/icon-180.png',
  'assets/pwa/icon-192.png',
  'assets/pwa/icon-512.png',
  'assets/pwa/icon-maskable-512.png'
];
const publicCacheInputs = [
  'assets/app-routes.js',
  'assets/municontrol-enterprise.css',
  'assets/brand/logo-horizontal.svg',
  'assets/brand/logo-horizontal-inverse.svg',
  'friendly-dashboard.html',
  'modulos.html',
  'reportes-rrhh.html',
  'calidad-datos.html',
  'control-horario-readiness.html',
  'attendance-readiness-evidence.v1.json',
  'control-horario-homologacion.html',
  'attendance-policy-candidates.v1.json',
  'assets/junin-tardiness-policy.js',
  'assets/rrhh-report-pack.js',
  'assets/payroll-schooling-report.js',
  'assets/payroll-schooling-report-workbench.js',
  'assets/payroll-f931-prevalidator.js',
  'assets/payroll-f931-workbench.js',
  'assets/payroll-bank-control-xlsx-adapter.js',
  'assets/payroll-bank-control-xlsx-worker.js',
  'assets/vendor/fflate.min.js',
  'friendly-data.json',
  'manifest.webmanifest',
  'assets/pwa/icon.svg',
  'assets/pwa/icon-180.png',
  'assets/pwa/icon-192.png',
  'assets/pwa/icon-512.png',
  'assets/pwa/icon-maskable-512.png'
];

const normalizeTextForHash = (value) => value.replace(/\r\n?/g, '\n');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const file of [...shellFiles, ...pwaFiles]) {
  const destination = path.join(output, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, file), destination);
}
for (const file of vendorFiles) {
  const destination = path.join(output, file.destination);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, file.source), destination);
}

// Restore the verified identity using content-addressed icon URLs; older icon
// URLs may still have a one-year immutable response in a browser cache.
const identityHash = crypto.createHash('sha256');
for (const file of pwaFiles.filter(file => file.startsWith('assets/pwa/'))) {
  identityHash.update(file).update(fs.readFileSync(path.join(root, file)));
}
const identityVersion = `identity-${identityHash.digest('hex').slice(0, 12)}`;
for (const file of pwaFiles.filter(file => file.startsWith('assets/pwa/'))) {
  const destination = path.join(output, file.replace('assets/pwa/', `assets/pwa/${identityVersion}/`));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, file), destination);
}
for (const file of [...shellFiles.filter(file => file.endsWith('.html')), 'manifest.webmanifest', 'sw.js', 'assets/municontrol-enterprise.css']) {
  const destination = path.join(output, file), original = fs.readFileSync(destination, 'utf8');
  const branded = file.endsWith('.html') ? applyFriendlySocialMetadata(applyFriendlyPwaIdentity(original.replaceAll('MuniControl Friendly', 'MuniControl').replaceAll('Friendly · Junín, Mendoza', 'Municipalidad de Junín, Mendoza'))) : original;
  const withGate = file.endsWith('.html') && /<aside\b[^>]*class="[^"]*\bsidebar\b/.test(branded) && !['administracion-plataforma.html','friendly-dashboard.html'].includes(file) && !branded.includes('internal-capability-gate.js')
    ? branded.replace('</head>', '<script src="/assets/internal-capability-gate.js"></script></head>') : branded;
  const navigable = file.endsWith('.html') && /<aside\b[^>]*class="[^"]*\bsidebar\b/.test(withGate)
    ? withGate.replace('</head>', '<link rel="stylesheet" href="/assets/liquidaciones-menu.css"><script type="module" src="/assets/liquidaciones-menu.js"></script><link rel="stylesheet" href="/assets/work-area-menu.css"><script type="module" src="/assets/work-area-menu.js"></script></head>') : withGate;
  const legalLinked = file.endsWith('.html') && /<aside\b[^>]*class="[^"]*\bsidebar\b/.test(navigable) && !['friendly-dashboard.html','administracion-plataforma.html','juridica-registro.html'].includes(file)
    ? navigable.replace('</aside>', '<a class="nav-button" href="juridica-registro.html" data-any-capability="legal.norm.read" data-requires-any-capability="legal.norm.read"><span>Registro normativo</span></a></aside>') : navigable;
  const routed = file.endsWith('.html') ? applyCleanRouteLinks(legalLinked, file) : legalLinked;
  fs.writeFileSync(destination, routed.replaceAll('assets/pwa/', `assets/pwa/${identityVersion}/`).replaceAll('url("pwa/', `url("pwa/${identityVersion}/`));
}

await buildLegalRegistry(root, output);
await buildReactIslands(root, output);
await buildLeaveRulesIsland(root, output);
buildClockFleet(root, output);
buildDocumentReader(root, output);

const versionHash = crypto.createHash('sha256');
for (const file of publicCacheInputs) {
  versionHash.update(file);
  versionHash.update('\0');
  versionHash.update(normalizeTextForHash(fs.readFileSync(path.join(output, file), 'utf8')));
  versionHash.update('\0');
}
const swOutput = path.join(output, 'sw.js');
const swTemplate = fs.readFileSync(swOutput, 'utf8');
const versionToken = '__PWA_CACHE_VERSION__';
if (!swTemplate.includes(versionToken)) {
  throw new Error(`Service worker sin token de versión ${versionToken}.`);
}
versionHash.update(normalizeTextForHash(swTemplate.replaceAll(versionToken, '')));
const cacheVersion = `build-${versionHash.digest('hex').slice(0, 16)}`;
fs.writeFileSync(swOutput, swTemplate.replaceAll(versionToken, cacheVersion));

buildReleaseIdentity(root, output);
console.log(`Friendly static shell built (PWA ${cacheVersion}).`);

// Optional owner-approved operation runs only after the full build succeeds.
if(process.env.MC_EMAIL_FACTOR_PROVISION_EVENT){
  const {approvedEmailFactorBuildStep}=await import("./complete-approved-email-factor.mjs");
  await approvedEmailFactorBuildStep();
}

function applyCleanRouteLinks(html, file) {
  const routes = globalThis.MuniControlRoutes;
  const base = 'https://municontrol.invalid/' + file;
  // Only a page's own fixed login return is replaced. Authentication commands,
  // destinations to other pages and the context allowlist remain source-owned.
  const returnExpression = 'window.MuniControlRoutes.loginHref(window.location.href, window.location.href)';
  const withReturns = html.replace(/(<script\b(?![^>]*\bsrc\s*=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, open, source, close) => {
    const ownReturn = 'login.html?next=' + file;
    let routed = source.replaceAll("'" + ownReturn + "'", returnExpression).replaceAll('"' + ownReturn + '"', returnExpression);
    routed = routed.replaceAll("'login.html?next='", "'/acceso?next='").replaceAll('"login.html?next="', '"/acceso?next="');
    routed = routed.replaceAll("'login.html'", "'/acceso'").replaceAll('"login.html"', '"/acceso"');
    if (file === 'internal-dashboard.html') routed = routed.replace("'internal-dashboard.html' + window.location.hash", 'window.location.pathname + window.location.search + window.location.hash');
    return open + routed + close;
  });
  const linked = withReturns.replace(/(<a\b[^>]*?\bhref\s*=\s*)(["'])([^"']*)\2/gi, (_, prefix, quote, href) => prefix + quote + routes.canonicalHref(href, base) + quote);
  return linked.includes('src="/assets/app-routes.js"') ? linked : linked.replace(/<head([^>]*)>/i, '<head$1>\n  <script src="/assets/app-routes.js"></script>');
}
