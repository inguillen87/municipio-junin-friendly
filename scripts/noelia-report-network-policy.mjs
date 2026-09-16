// Read-only allowlist shared by local rehearsal and the production browser smoke.
// The public aggregate is required by the existing report shell. No private API
// request, credential, external host or write is forwarded to the deployment.
export const REPORT_SMOKE_ORIGIN = 'https://municipio-junin-friendly.vercel.app';
const pages = new Set(['/reportes', '/reportes-rrhh', '/reportes-rrhh.html']);
const publicFiles = new Set(['/friendly-data.json', '/manifest.webmanifest', '/favicon.ico']);

export function reportSmokeRequestPolicy(rawUrl, method = 'GET') {
  if (typeof rawUrl !== 'string' || typeof method !== 'string' || /[\\\s]/u.test(rawUrl)) return 'blocked';
  let url;
  try { url = new URL(rawUrl); } catch { return 'blocked'; }
  if (url.origin !== REPORT_SMOKE_ORIGIN || url.username || url.password) return 'blocked';
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return 'synthetic-api';
  if (method !== 'GET' || url.hash || /%/u.test(url.pathname)) return 'blocked';
  if (pages.has(url.pathname) || publicFiles.has(url.pathname)) return url.search ? 'blocked' : 'public-get';
  if (url.pathname.startsWith('/assets/') && /\.(?:js|mjs|css|svg|png|jpe?g|webp|ico|woff2?|ttf|txt)$/iu.test(url.pathname)) return 'public-get';
  return 'blocked';
}
