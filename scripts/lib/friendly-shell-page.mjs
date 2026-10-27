// ROOT ASSEMBLY CANDIDATE. Pure extraction of the standard shell transforms;
// no filesystem/build/SQL action occurs on import or when reading this text.
import {createHash} from 'node:crypto';
import {applyFriendlyPwaIdentity,applyFriendlySocialMetadata} from '../apply-friendly-social-metadata.mjs';

export const FRIENDLY_PWA_IDENTITY_FILES=Object.freeze([
 'assets/pwa/icon.svg','assets/pwa/icon-180.png','assets/pwa/icon-192.png',
 'assets/pwa/icon-512.png','assets/pwa/icon-maskable-512.png'
]);
export function friendlyPwaIdentityVersion(read){
 const identityHash=createHash('sha256');
 for(const file of FRIENDLY_PWA_IDENTITY_FILES)identityHash.update(file).update(read(file));
 return `identity-${identityHash.digest('hex').slice(0,12)}`;
}
export function applyCleanRouteLinks(html,file,routes){
 const base='https://municontrol.invalid/'+file;
 const returnExpression='window.MuniControlRoutes.loginHref(window.location.href, window.location.href)';
 const withReturns=html.replace(/(<script\b(?![^>]*\bsrc\s*=)[^>]*>)([\s\S]*?)(<\/script>)/gi,(_,open,source,close)=>{
  const ownReturn='login.html?next='+file;
  let routed=source.replaceAll("'"+ownReturn+"'",returnExpression).replaceAll('"'+ownReturn+'"',returnExpression);
  routed=routed.replaceAll("'login.html?next='","'/acceso?next='").replaceAll('"login.html?next="','"/acceso?next="');
  routed=routed.replaceAll("'login.html'","'/acceso'").replaceAll('"login.html"','"/acceso"');
  if(file==='internal-dashboard.html')routed=routed.replace("'internal-dashboard.html' + window.location.hash",'window.location.pathname + window.location.search + window.location.hash');
  return open+routed+close;
 });
 const linked=withReturns.replace(/(<a\b[^>]*?\bhref\s*=\s*)(["'])([^"']*)\2/gi,(_,prefix,quote,href)=>prefix+quote+routes.canonicalHref(href,base)+quote);
 return linked.includes('src="/assets/app-routes.js"')?linked:linked.replace(/<head([^>]*)>/i,'<head$1>\n  <script src="/assets/app-routes.js"></script>');
}
export function transformFriendlyShellSource(original,file,identityVersion,routes){
 const branded=file.endsWith('.html')?applyFriendlySocialMetadata(applyFriendlyPwaIdentity(original.replaceAll('MuniControl Friendly','MuniControl').replaceAll('Friendly · Junín, Mendoza','Municipalidad de Junín, Mendoza'))):original;
 const withGate=file.endsWith('.html')&&/<aside\b[^>]*class="[^"]*\bsidebar\b/.test(branded)&&!['administracion-plataforma.html','friendly-dashboard.html'].includes(file)&&!branded.includes('internal-capability-gate.js')
  ?branded.replace('</head>','<script src="/assets/internal-capability-gate.js"></script></head>'):branded;
 const navigable=file.endsWith('.html')&&/<aside\b[^>]*class="[^"]*\bsidebar\b/.test(withGate)
  ?withGate.replace('</head>','<link rel="stylesheet" href="/assets/liquidaciones-menu.css"><script type="module" src="/assets/liquidaciones-menu.js"></script><link rel="stylesheet" href="/assets/work-area-menu.css"><script type="module" src="/assets/work-area-menu.js"></script></head>'):withGate;
 const legalLinked=file.endsWith('.html')&&/<aside\b[^>]*class="[^"]*\bsidebar\b/.test(navigable)&&!['friendly-dashboard.html','administracion-plataforma.html','juridica-registro.html'].includes(file)
  ?navigable.replace('</aside>','<a class="nav-button" href="juridica-registro.html" data-any-capability="legal.norm.read" data-requires-any-capability="legal.norm.read"><span>Registro normativo</span></a></aside>'):navigable;
 const routed=file.endsWith('.html')?applyCleanRouteLinks(legalLinked,file,routes):legalLinked;
 return routed.replaceAll('assets/pwa/',`assets/pwa/${identityVersion}/`).replaceAll('url("pwa/',`url("pwa/${identityVersion}/`);
}
