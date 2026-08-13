import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let enrichment = null;
let extraData = {};

function loadEnrichment() {
  if (enrichment) return enrichment;
  try {
    const raw = readFileSync(join(__dirname, '..', 'rrhh-data', 'enrichment.json'), 'utf-8');
    enrichment = JSON.parse(raw);
    return enrichment;
  } catch (e) {
    console.error('Failed to load enrichment:', e.message);
    return null;
  }
}

function loadExtra(filename) {
  const key = filename.replace('.json', '');
  if (extraData[key]) return extraData[key];
  try {
    const raw = readFileSync(join(__dirname, '..', 'rrhh-data', filename), 'utf-8');
    extraData[key] = JSON.parse(raw);
    return extraData[key];
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const { legajo, type } = req.query || {};
  const data = loadEnrichment();
  
  if (!data) {
    return res.status(500).json({ ok: false, error: 'Enrichment data not loaded' });
  }

  // Load all extra datasets
  const domicilios = loadExtra('domicilios.json') || {};
  const estudiosLeg = loadExtra('estudios_por_legajo.json') || {};
  const gremiosLeg = loadExtra('gremios_por_legajo.json') || {};
  const otrosTrab = loadExtra('otros_trabajos.json') || {};
  const fichadasData = loadExtra('fichadas.json') || {};
  const embargosData = loadExtra('embargos.json') || [];
  const escalaLic = loadExtra('escala_licencias.json') || [];
  const observaciones = loadExtra('observaciones_legajo.json') || {};
  const horariosMap = loadExtra('horarios_map.json') || {};
  const feriadosData = loadExtra('feriados.json') || [];
  const centrosCostos = loadExtra('centros_costos.json') || [];
  const organigramaData = loadExtra('organigrama.json') || [];

  try {
    // Get all enrichment for a specific employee
    if (legajo) {
      const leg = String(legajo);

      // Calculate dias de licencia que corresponden by antiguedad
      let diasLicenciaCorresponden = 14; // default
      // We need to know antiguedad from empleado data to compute properly
      // For now find the closest match from escala
      const escalaOrdenada = escalaLic.sort((a, b) => a.aniosAntiguedad - b.aniosAntiguedad);

      // Find domicilio for this legajo (persona mapping)
      const domicilio = domicilios[leg] || null;

      // Find embargos for this legajo
      const embargosLeg = Array.isArray(embargosData) 
        ? embargosData.filter(e => String(e.legajo) === leg) 
        : [];

      const result = {
        familiares: data.familiares?.[leg] || [],
        fojas: data.fojas?.[leg] || [],
        estudios: data.estudios?.[leg] || [],
        licenciasOrdinarias: data.licencias_ordinarias?.[leg] || [],
        licenciasEspeciales: data.licencias_especiales?.[leg] || [],
        licencias: data.licencias?.[leg] || [],
        // NEW enrichment data
        domicilio: domicilio,
        estudiosAcreditados: estudiosLeg[leg] || [],
        afiliacionGremial: gremiosLeg[leg] || [],
        otrosTrabajos: otrosTrab[leg] || [],
        fichadas: (fichadasData[leg] || []).slice(-20), // Last 20 entries
        embargos: embargosLeg,
        observaciones: observaciones[leg] || [],
        escalaLicencias: escalaOrdenada.slice(0, 35),
      };
      return res.json({ ok: true, legajo: leg, data: result });
    }

    // Get catalog data
    if (type === 'motivos') {
      return res.json({ ok: true, data: data.motivosAusencia || {} });
    }
    if (type === 'sectores-map') {
      return res.json({ ok: true, data: data.sectores || {} });
    }
    if (type === 'gremios-map') {
      return res.json({ ok: true, data: data.gremios || {} });
    }
    if (type === 'obras-sociales') {
      return res.json({ ok: true, data: data.obrasSociales || {} });
    }
    if (type === 'stats') {
      return res.json({ ok: true, data: data.stats || {} });
    }
    if (type === 'feriados') {
      return res.json({ ok: true, data: feriadosData });
    }
    if (type === 'costos') {
      return res.json({ ok: true, data: centrosCostos });
    }
    if (type === 'organigrama') {
      return res.json({ ok: true, data: organigramaData });
    }
    if (type === 'escala-licencias') {
      return res.json({ ok: true, data: escalaLic });
    }
    if (type === 'horarios') {
      return res.json({ ok: true, data: horariosMap });
    }
    if (type === 'incompatibilidades' || type === 'otros-trabajos') {
      return res.json({ ok: true, total: Object.keys(otrosTrab).length, data: otrosTrab });
    }
    if (type === 'embargos') {
      return res.json({ ok: true, total: embargosData.length, data: embargosData });
    }

    // Return general stats
    return res.json({
      ok: true,
      data: {
        stats: data.stats,
        motivosAusencia: data.motivosAusencia,
        sectores: data.sectores,
        gremios: data.gremios,
        obrasSociales: data.obrasSociales,
      }
    });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
