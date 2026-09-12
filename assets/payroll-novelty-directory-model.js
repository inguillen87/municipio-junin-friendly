/** Directory selection is preparation, not payroll eligibility or an approval. */
export const DIRECTORY_PAGE_SIZE = 25;
export const DIRECTORY_SELECTION_MAX = 500;
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const id = /^(?:0|[1-9]\d{0,19})$/;
const count = n => Number.isSafeInteger(n) && n >= 0;
const text = (s, max = 240) => typeof s === 'string' && s.length <= max && !/[\u0000-\u001f\u007f]/.test(s);
const clean = s => typeof s === 'string' ? s.trim() : '';
const date = s => s === null || s === undefined || typeof s === 'string' && /^\d{4}-\d{2}-\d{2}(?:T[^\s]{1,30})?$/.test(s);
export function directoryContext(bootstrap) {
  const p = bootstrap?.principal, l = bootstrap?.limits;
  if (!uuid.test(p?.tenantId || '') || !uuid.test(p?.membershipId || '')
      || !uuid.test(p?.certifiedBindingId || '') || !p?.capabilities?.includes('payroll.novelty.prepare')
      || l?.contractVersion !== 'payroll-novelty-batch.v1' || !count(l?.maxRows)
      || l.maxRows < 1 || l.maxRows > 500 || !Array.isArray(l.payrollTypes)) {
    throw Error('No está disponible el contexto de preparación. Actualizá Novedades.');
  }
  return JSON.stringify([p.tenantId.toLowerCase(),p.membershipId.toLowerCase(),p.certifiedBindingId.toLowerCase(),l]);
}
export function directorySession(auth, bootstrap, previous = null) {
  directoryContext(bootstrap);
  if (auth?.ok !== true || auth.authenticated !== true || auth.sessionVersion !== 2
      || !uuid.test(auth.user?.id || '') || !text(auth.user?.email,254) || !auth.user.email.trim()
      || auth.access?.context !== 'tenant'
      || auth.access.tenant?.id?.toLowerCase() !== bootstrap.principal.tenantId.toLowerCase()
      || !Array.isArray(auth.access.tenantCapabilities)
      || !['workforce.employee.read','payroll.novelty.prepare'].every(c=>auth.access.tenantCapabilities.includes(c))) {
    throw Error('El buscador requiere la misma sesión municipal y permiso para consultar personas y preparar novedades.');
  }
  const key = JSON.stringify([auth.user.id.toLowerCase(),auth.user.email.trim().toLowerCase(),auth.access.tenant.id.toLowerCase()]);
  if (previous !== null && key !== previous) throw Error('Cambió la sesión. Actualizá Novedades antes de seleccionar personas.');
  return key;
}
export function directoryQuery({search='',sector='',agreement='',page=1}={}) {
  if (![search,sector,agreement].every(v=>text(v,160)) || search.length>100 || !count(page) || page<1 || page>100000) throw Error('Revisá los filtros del padrón.');
  // Literal search only: SQL wildcard characters are not a "select everybody" shortcut.
  if (/[%_\\]/.test(search)) throw Error('Buscá por nombre o legajo, sin comodines.');
  const qs = new URLSearchParams({resource:'employees',status:'administrative_active',page:String(page),limit:String(DIRECTORY_PAGE_SIZE),includeFacets:'1'});
  if (search.trim()) qs.set('search',search.trim());
  if (sector) qs.set('sector',sector);
  if (agreement) qs.set('agreement',agreement);
  return qs;
}
/** Keep only fields needed by the picker. DNI, CUIL, sex, addresses and financial data are discarded. */
export function directoryPage(payload, expectedPage=1) {
  const p=payload?.pagination, o=payload?.operational;
  if(payload?.ok!==true || !Array.isArray(payload.data) || !p || !count(p.total)
      || p.page!==expectedPage || p.limit!==DIRECTORY_PAGE_SIZE
      || p.pages!==Math.max(1,Math.ceil(p.total/p.limit))
      || payload.data.length!==Math.max(0,Math.min(p.limit,p.total-(p.page-1)*p.limit))
      || o?.version!=='workforce-operational.v1' || o.selectedStatus!=='administrative_active'
      || payload.scope?.grain!=='employment_contract' || payload.scope?.authority!=='GRH'
      || !date(o.sourceCutoffFrom) || !date(o.sourceCutoffTo)) {
    throw Error('El padrón no devolvió una página completa de legajos activos. Volvé a consultar.');
  }
  const seen=new Set(), legajos=new Set(), companies=new Set();
  const rows=payload.data.map(r=>{
    const company=typeof r.companyId==='number'&&Number.isSafeInteger(r.companyId)?String(r.companyId):r.companyId;
    if(!uuid.test(r.contractId||'') || !id.test(r.legajo||'') || typeof r.legajo!=='string'
        || typeof company!=='string' || !/^[1-9]\d{0,19}$/.test(company)
        || !text(r.nombre) || !r.nombre.trim() || r.activo!==true
        || !['active','suspended','leave_without_pay','pending_termination'].includes(r.administrativeStatus)
        || ![r.sector,r.convenio].every(v=>v==null||text(v,160))
        || seen.has(r.contractId) || legajos.has(r.legajo)) throw Error('Hay identidades incompletas o repetidas en esta página. No se seleccionan automáticamente.');
    seen.add(r.contractId);legajos.add(r.legajo);companies.add(company);
    return Object.freeze({contractId:r.contractId,legajo:r.legajo,nombre:r.nombre.trim(),sector:clean(r.sector)||'Sin sector informado',convenio:clean(r.convenio)||'Sin convenio informado',companyId:company,administrativeStatus:r.administrativeStatus});
  });
  if(companies.size>1)throw Error('El padrón mezcla empresas de origen. No se agregaron legajos.');
  function facet(key) {
    const values=payload.facets?.[key];
    if(!Array.isArray(values)||values.length>2000)throw Error('No se pudieron validar los filtros del directorio.');
    const seen=new Set();return values.map(r=>{
      if(!text(r.value,160)||!r.value||seen.has(r.value)||!count(r.count))throw Error('Filtro del directorio inconsistente.');
      seen.add(r.value);return r.value;
    });
  }
  return Object.freeze({rows,pagination:{...p},sectors:facet('sectors'),agreements:facet('agreements'),cutoffFrom:o.sourceCutoffFrom||null,cutoffTo:o.sourceCutoffTo||null,companyId:[...companies][0]||null});
}
export function addDirectorySelection(selected, candidates, { maximum=500, existing=[] }={}) {
  if(!Array.isArray(selected)||!Array.isArray(candidates)||!Array.isArray(existing)
      || !count(maximum)||maximum<1||maximum>DIRECTORY_SELECTION_MAX)throw Error('La selección no es válida.');
  const next=[...selected], seen=new Set(next.map(r=>r.legajo)), contracts=new Set(next.map(r=>r.contractId)), prior=new Set(existing);
  const companies=new Set(next.map(r=>r.companyId));
  for(const row of candidates) {
    if(!uuid.test(row?.contractId||'')||typeof row.legajo!=='string'||!id.test(row.legajo)||!text(row.nombre)||!row.nombre)throw Error('Seleccioná un legajo del padrón consultado.');
    if(prior.has(row.legajo))throw Error(`El legajo ${row.legajo} ya está en la preparación.`);
    if(seen.has(row.legajo)||contracts.has(row.contractId))throw Error(`El legajo ${row.legajo} ya fue seleccionado.`);
    seen.add(row.legajo);contracts.add(row.contractId);companies.add(row.companyId);next.push(row);
  }
  if(companies.size>1)throw Error('No se pueden mezclar empresas de origen en la selección.');
  if(next.length+existing.length>maximum)throw Error(`Quedan ${Math.max(0,maximum-existing.length-selected.length)} lugares. Reducí la selección; no se agregó una parte del grupo.`);
  return next;
}
