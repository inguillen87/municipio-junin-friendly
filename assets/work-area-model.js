// Presentation only. Roles, access decisions and data remain server-owned.
export const WORK_AREAS = Object.freeze([
  ['personas','Personas y RRHH','RH'], ['asistencia','Tiempo y asistencia','AS'],
  ['liquidaciones','Liquidaciones','LI'], ['hacienda','Hacienda','HA'],
  ['control','Reportes y control','CO'], ['sistema','Sistema y ayuda','SI'],
].map(([id,label,code])=>Object.freeze({id,label,code})));
const FILE_AREA = Object.freeze({
  'internal-dashboard.html':'personas','centro-acciones.html':'personas',
  'estructura.html':'personas','licencias-control.html':'personas',
  'relojes-marcaciones.html':'asistencia','fuentes-tiempo.html':'asistencia',
  'ausentismo-control.html':'asistencia','control-horario-readiness.html':'asistencia',
  'control-horario-homologacion.html':'asistencia',
  'nomina-control.html':'liquidaciones','novedades-nomina.html':'liquidaciones',
  'presupuesto-control.html':'hacienda','integracion-datos.html':'control',
  'gestion-comparativa.html':'control','calidad-operativa.html':'control',
  'reportes-rrhh.html':'control','calidad-datos.html':'control',
  'friendly-dashboard.html':'control','datos-personales.html':'control',
  'administracion-plataforma.html':'sistema','asistente.html':'sistema',
  'modulos.html':'sistema','centro-ayuda.html':'sistema','seguridad-cuenta.html':'sistema',
});
export function classifyWorkItem({view='',file=''}={}) {
  if(view==='inicio')return 'inicio';
  if(view==='legajos')return 'personas';
  if(view==='calidad')return 'control';
  return FILE_AREA[file]||null;
}
export const normalizeMenuText=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export function matchesMenuQuery(text,query){const value=normalizeMenuText(text);return normalizeMenuText(query).split(' ').filter(Boolean).every(term=>value.includes(term));}
