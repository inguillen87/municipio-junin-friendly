import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public');
const shellFiles = [
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
  'gestion-comparativa.html',
  'presupuesto-control.html',
  'ausentismo-control.html',
  'licencias-control.html',
  'calidad-operativa.html',
  'asistente.html',
  'centro-ayuda.html',
  'assets/internal-guide.js',
  'assets/municontrol-enterprise.css',
  'assets/identity-security.css',
  'assets/product-guidance.js',
  'assets/mendoza-title-vi.js',
  'assets/junin-budget-2026.js',
  'datos-personales.html',
  'friendly-data.json'
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
  'friendly-dashboard.html',
  'modulos.html',
  'reportes-rrhh.html',
  'calidad-datos.html',
  'control-horario-readiness.html',
  'attendance-readiness-evidence.v1.json',
  'control-horario-homologacion.html',
  'attendance-policy-candidates.v1.json',
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

const versionHash = crypto.createHash('sha256');
for (const file of publicCacheInputs) {
  versionHash.update(file);
  versionHash.update('\0');
  versionHash.update(normalizeTextForHash(fs.readFileSync(path.join(root, file), 'utf8')));
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

console.log(`Friendly static shell built (PWA ${cacheVersion}).`);
