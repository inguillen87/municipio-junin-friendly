import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanFriendlyRouteReferences } from './clean-friendly-route-references.mjs';
import { applyFriendlyPwaIdentity, applyFriendlySocialMetadata } from './apply-friendly-social-metadata.mjs';
import { buildReactIslands } from './build-react-islands.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public');
const shellFiles = [
  'assets/report-workspace.css',
  'assets/access.css',
  'assets/install-share.css',
  'login.html',
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
  'recibos-sueldo.html',
  'novedades-nomina.html',
  'gestion-comparativa.html',
  'presupuesto-control.html',
  'ausentismo-control.html',
  'licencias-control.html',
  'calidad-operativa.html',
  'asistente.html',
  'centro-ayuda.html',
  'assets/internal-capability-gate.js',
  'assets/internal-guide.js',
  'assets/internal-work-today.js',
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
  'assets/payroll-formula-proposal.js',
  'assets/grh-source-preview.js',
  'assets/payroll-post-close-exporter.js',
  'assets/payroll-post-close-reconciler.js',
  'assets/payroll-control-import-workflow.js',
  'assets/payroll-reprocessing-workflow.js',
  'assets/payroll-art-report.js',
  'assets/payroll-art-noelia-adapter.js',
  'assets/payroll-art-report-exporter.js',
  'assets/payroll-art-report-workbench.js',
  'assets/payroll-bank-fixed-width-profiles.js',
  'assets/payroll-bank-report-workbench.js',
  'assets/payroll-health-fixed-width.js',
  'assets/payroll-health-fixed-width-workbench.js',
  'assets/payroll-schooling-report.js',
  'assets/payroll-schooling-report-workbench.js',
  'assets/payroll-f931-prevalidator.js',
  'assets/payroll-f931-workbench.js',
  'assets/payroll-bank-control-exporter.js',
  'assets/payroll-bank-control-xlsx-adapter.js',
  'assets/payroll-bank-control-xlsx-worker.js',
  'assets/monthly-close-jurisdiction-xlsx-adapter.js',
  'assets/monthly-close-jurisdiction-xlsx-worker.js',
  'assets/payroll-concept-breakdown-exporter.js',
  'assets/monthly-close-grh-summary-adapter.js',
  'assets/monthly-close-grh-summary-worker.js',
  'assets/monthly-close-local-precheck.js',
  'assets/payroll-monthly-close-approved-report.js',
  'assets/payroll-monthly-close-folder.js',
  'assets/payroll-monthly-close-workflow.js',
  'assets/payroll-type-presentation.js',
  'assets/payroll-receipt-preview.js',
  'assets/payroll-receipt-center.js',
  'assets/payroll-novelty-exporter.js',
  'assets/payroll-novelty-xlsx-exporter.js',
  'assets/payroll-novelty-workbench.js',
  'assets/payroll-novelty-retro-import.js',
  'assets/payroll-guarantee-xlsx-import.js',
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
  'assets/municontrol-enterprise.css',
  'assets/report-workspace.css',
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
  'assets/payroll-bank-control-exporter.js',
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

const htmlRouteFiles = shellFiles.filter((file) => file.endsWith('.html'));
const cleanReferenceFiles = [
  ...shellFiles.filter((file) => file.endsWith('.html') || file.endsWith('.js')),
  'sw.js'
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

// Old icon URLs were immutable for a year. New content-addressed URLs avoid
// asking users to clear browser caches or reinstall their municipal app.
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
  const destination = path.join(output, file);
  const fileSource = fs.readFileSync(destination, 'utf8');
  const source = file.endsWith('.html') ? applyFriendlyPwaIdentity(fileSource) : fileSource;
  const versioned = source.replaceAll('assets/pwa/', `assets/pwa/${identityVersion}/`)
    .replaceAll('url("pwa/', `url("pwa/${identityVersion}/`);
  fs.writeFileSync(destination, versioned);
}

// El repositorio conserva nombres .html para permitir abrir cada pantalla de
// forma aislada durante desarrollo. El artefacto publicado enlaza únicamente
// las rutas canónicas sin extensión, evitando una redirección 308 en cada clic.
for (const file of cleanReferenceFiles) {
  const destination = path.join(output, file);
  const source = fs.readFileSync(destination, 'utf8');
  const routeCleaned = cleanFriendlyRouteReferences(source, htmlRouteFiles);
  const cleaned = file.endsWith('.html') ? applyFriendlySocialMetadata(routeCleaned) : routeCleaned;
  if (cleaned !== source) fs.writeFileSync(destination, cleaned);
}

const islands = await buildReactIslands(root, output);
const reportIsland = islands.find(island => island.name === 'report-workspace');
if (!reportIsland) throw new Error('Falta la navegación compilada de reportes.');
// Only the public report navigation is cached. Login and identity remain excluded.
publicCacheInputs.push(reportIsland.href.slice(1));
const versionHash = crypto.createHash('sha256');
for (const file of publicCacheInputs) {
  versionHash.update(file);
  versionHash.update('\0');
  versionHash.update(normalizeTextForHash(fs.readFileSync(path.join(output, file), 'utf8')));
  versionHash.update('\0');
}
const swOutput = path.join(output, 'sw.js');
const swTemplate = fs.readFileSync(swOutput, 'utf8')
  .replace('/* MC_REPORT_WORKSPACE_PRECACHE */', `${JSON.stringify(reportIsland.href)},`);
const versionToken = '__PWA_CACHE_VERSION__';
if (!swTemplate.includes(versionToken)) {
  throw new Error(`Service worker sin token de versión ${versionToken}.`);
}
versionHash.update(normalizeTextForHash(swTemplate.replaceAll(versionToken, '')));
const cacheVersion = `build-${versionHash.digest('hex').slice(0, 16)}`;
fs.writeFileSync(swOutput, swTemplate.replaceAll(versionToken, cacheVersion));

console.log(`Friendly static shell built (PWA ${cacheVersion}).`);
