import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let dataCache = {};

function loadData(filename) {
  const key = filename.replace('.json', '');
  if (dataCache[key]) return dataCache[key];
  try {
    const raw = readFileSync(join(__dirname, '..', 'rrhh-data', filename), 'utf-8');
    dataCache[key] = JSON.parse(raw);
    return dataCache[key];
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');

  const { type } = req.query || {};

  try {
    // Masa salarial anual (historical aggregates)
    if (type === 'masa-salarial') {
      const data = loadData('masa_salarial_anual.json') || [];
      return res.json({ ok: true, data });
    }

    // Pagos totales por período (detailed monthly)
    if (type === 'totpago') {
      const data = loadData('totpago.json') || [];
      return res.json({ ok: true, data });
    }

    // Convenios colectivos
    if (type === 'convenios') {
      const data = loadData('convenios.json') || [];
      return res.json({ ok: true, data });
    }

    // Centros de costos
    if (type === 'costos') {
      const data = loadData('centros_costos.json') || [];
      return res.json({ ok: true, data });
    }

    // Organigrama
    if (type === 'organigrama') {
      const data = loadData('organigrama.json') || [];
      return res.json({ ok: true, data });
    }

    // Códigos de liquidación
    if (type === 'codliq' || type === 'codigos-liquidacion') {
      const data = loadData('codigos_liquidacion.json') || [];
      return res.json({ ok: true, total: data.length, data });
    }

    // Feriados
    if (type === 'feriados') {
      const data = loadData('feriados.json') || [];
      return res.json({ ok: true, data });
    }

    // Escala de licencias
    if (type === 'escala-licencias') {
      const data = loadData('escala_licencias.json') || [];
      return res.json({ ok: true, data });
    }

    // Summary: aggregate stats
    if (type === 'summary' || !type) {
      const masa = loadData('masa_salarial_anual.json') || [];
      const convenios = loadData('convenios.json') || [];
      const costos = loadData('centros_costos.json') || [];
      const organi = loadData('organigrama.json') || [];
      const feriados = loadData('feriados.json') || [];

      // Calculate totals
      const totalBrutoHistorico = masa.reduce((s, m) => s + m.totalBruto, 0);
      const totalNetoHistorico = masa.reduce((s, m) => s + m.totalNeto, 0);
      const totalRetencionesHistorico = masa.reduce((s, m) => s + m.totalRetenciones, 0);
      const current = masa.find(m => m.anio === 2026) || {};
      const previous = masa.find(m => m.anio === 2025) || {};
      const yoy = previous.totalBruto > 0 ? ((current.totalBruto / previous.totalBruto - 1) * 100).toFixed(1) : 0;

      return res.json({
        ok: true,
        data: {
          masaSalarialActual: current,
          masaSalarialAnterior: previous,
          variacionInteranual: yoy + '%',
          totalBrutoHistorico: Math.round(totalBrutoHistorico),
          totalNetoHistorico: Math.round(totalNetoHistorico),
          totalRetencionesHistorico: Math.round(totalRetencionesHistorico),
          aniosHistorial: masa.length,
          conveniosCount: convenios.length,
          centrosCostosCount: costos.length,
          unidadesOrganizativasCount: organi.length,
          feriadosCount: feriados.length,
          masaSalarialHistorica: masa
        }
      });
    }

    return res.status(400).json({ ok: false, error: 'Tipo no válido. Usar: masa-salarial, totpago, convenios, costos, organigrama, feriados, escala-licencias, summary' });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
