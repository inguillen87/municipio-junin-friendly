// Public task metadata only. Never store queries, payroll data or session state.
export const CATALOG_AREAS = Object.freeze([
  { id: 'all', label: 'Todas' },
  { id: 'RR. HH.', label: 'Personal' },
  { id: 'Nómina', label: 'Nómina' },
  { id: 'Asistencia', label: 'Asistencia' },
  { id: 'Institucional', label: 'Institucional' },
  { id: 'Controles', label: 'Controles externos' },
]);
export const CATALOG_FORMATS = Object.freeze(['PDF', 'Excel', 'CSV']);

const TASKS = Object.freeze({
  '#analizar-sectores': { aliases: 'dotacion personal agentes planta sectores reparticiones areas', origin: 'Datos agregados del corte', action: 'Consultar dotación' },
  '#analizar-movimientos': { aliases: 'altas bajas ingresos egresos movimientos personal', origin: 'Datos agregados del corte', action: 'Revisar movimientos' },
  '#analizar-ausencias': { aliases: 'ausentismo inasistencias ausencias eventos', origin: 'Datos agregados del corte', action: 'Analizar ausencias' },
  '#certificados-escolares': { aliases: 'escolaridad escolares hijos familiares certificados presentacion vencimiento', origin: 'Consulta interna', action: 'Consultar certificados' },
  '#haberes': { aliases: 'retenciones mutuales descuentos conceptos haberes liquidaciones', origin: 'Liquidaciones conservadas', action: 'Consultar conceptos' },
  '#resumen-mensual': { aliases: 'resumen mensual suplementarias consolidado liquidaciones', origin: 'Liquidaciones conservadas', action: 'Generar resumen' },
  '#planilla-bancaria': { aliases: 'bancarizacion banco cuentas credicoop santander nacion netos jurisdiccion', origin: 'Liquidaciones conservadas', action: 'Generar planilla de control' },
  '#comparar': { aliases: 'comparacion diferencias variaciones liquidaciones', origin: 'Liquidaciones conservadas', action: 'Comparar liquidaciones' },
  '/relojes': { aliases: 'fichadas marcaciones jornadas tramos tiempos reloj asistencia', origin: 'Consulta interna', action: 'Revisar jornadas' },
  '/personal#legajos': { aliases: 'recibos documentos detalle legajos personal', origin: 'Consulta interna', action: 'Abrir legajos' },
  '#descargas': { aliases: 'informe ejecutivo completo hojas trazabilidad', origin: 'Datos agregados del corte', action: 'Abrir informe' },
  '#formatos': { aliases: 'f931 f 931 arca afip txt formatos bancarios fiscales archivos validacion precontrol externos', origin: 'Control de archivos externos', action: 'Abrir controles', external: true },
});

export function normalizeCatalogSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function taskKey(href) {
  if (href === 'relojes-marcaciones.html' || href === '/relojes-marcaciones.html') return '/relojes';
  if (href === 'internal-dashboard.html#legajos' || href === '/internal-dashboard.html#legajos') return '/personal#legajos';
  return href;
}

export function catalogEntries(cards) {
  return cards.map(([title, description, tag, href, kind]) => {
    const task = TASKS[taskKey(href)] || {};
    const formats = CATALOG_FORMATS.filter(format => new RegExp(`\\b${format}\\b`, 'i').test(tag));
    return {
      title, description, tag, href, kind, formats,
      origin: task.origin || 'Consultar alcance',
      action: task.action || 'Abrir',
      external: task.external === true,
      searchable: normalizeCatalogSearch(`${title} ${description} ${kind} ${tag} ${task.aliases || ''}`),
    };
  });
}

export function filterCatalog(entries, { query = '', area = 'all', format = 'all' } = {}) {
  const terms = normalizeCatalogSearch(query).split(' ').filter(Boolean);
  return entries.filter(entry =>
    (area === 'all' || entry.kind === area) &&
    (format === 'all' || entry.formats.includes(format)) &&
    terms.every(term => entry.searchable.includes(term))
  );
}

// Counts respect search and format, not the currently selected area.
export function catalogAreaCounts(entries, filters = {}) {
  const matching = filterCatalog(entries, { ...filters, area: 'all' });
  return Object.fromEntries(CATALOG_AREAS.map(({ id }) => [id,
    id === 'all' ? matching.length : matching.filter(entry => entry.kind === id).length,
  ]));
}
