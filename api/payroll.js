import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let dataCache = {};

function loadJson(filename) {
  if (dataCache[filename]) return dataCache[filename];
  try {
    const raw = readFileSync(join(__dirname, '..', 'rrhh-data', filename), 'utf-8');
    dataCache[filename] = JSON.parse(raw);
    return dataCache[filename];
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { legajo, period } = req.query || {};

  if (req.method === 'GET') {
    if (legajo) {
      const legStr = String(legajo).trim();
      const empleados = loadJson('empleados.json') || [];
      const embargos = loadJson('embargos.json') || [];
      const gremios = loadJson('gremios_por_legajo.json') || [];
      const estudios = loadJson('estudios_por_legajo.json') || [];

      // Find target employee
      const emp = empleados.find(e => String(e.legajo) === legStr || String(e.id) === legStr) || {
        legajo: legStr,
        nombre: `EMPLEADO LEGAJO #${legStr}`,
        cuil: `20-30${legStr.padStart(6, '0')}-9`,
        sector: 'ADMINISTRATIVO',
        categoria: 'Cat. 10',
        activo: true,
        fechaIngreso: '2015-03-15'
      };

      const empEmbargos = Array.isArray(embargos)
        ? embargos.filter(e => String(e.legajo) === legStr)
        : (embargos && embargos[legStr] ? (Array.isArray(embargos[legStr]) ? embargos[legStr] : [embargos[legStr]]) : []);

      const empGremios = Array.isArray(gremios)
        ? gremios.filter(g => String(g.legajo) === legStr)
        : (gremios && gremios[legStr] ? (Array.isArray(gremios[legStr]) ? gremios[legStr] : [gremios[legStr]]) : []);

      const empEstudios = Array.isArray(estudios)
        ? estudios.filter(e => String(e.legajo) === legStr)
        : (estudios && estudios[legStr] ? (Array.isArray(estudios[legStr]) ? estudios[legStr] : [estudios[legStr]]) : []);

      // Calculations
      const antAnios = parseInt(emp.antiguedadAnios) || 8;
      const sueldoBasico = parseFloat(emp.sueldoBasico) || 450000;
      const antPct = antAnios * 0.02; // 2% per year of service
      const adicionalAntiguedad = sueldoBasico * antPct;
      
      const tieneEstudio = empEstudios.length > 0;
      const adicionalTitulo = tieneEstudio ? sueldoBasico * 0.10 : 0; // 10% title bonus
      const presentismo = 18500;

      const subtotalRemunerativo = Math.round(sueldoBasico + adicionalAntiguedad + adicionalTitulo + presentismo);
      const subtotalNoRemunerativo = tieneEstudio ? 25000 : 15000; // Asignación familiar / asignación especial

      // Deductions
      const jubilacion = Math.round(subtotalRemunerativo * 0.11); // 11% Ley 6082
      const osep = Math.round(subtotalRemunerativo * 0.045);       // 4.5% OSEP Mendoza

      let cuotaGremial = 0;
      let gremioNombre = 'Ninguno';
      if (empGremios.length > 0) {
        gremioNombre = empGremios[0].sindicato || 'SOEM';
        const pctGremio = (parseFloat(empGremios[0].cuotaPct) || 2) / 100;
        cuotaGremial = Math.round(subtotalRemunerativo * pctGremio);
      }

      let descuentoEmbargo = 0;
      let embargoDetalle = null;
      if (empEmbargos.length > 0) {
        embargoDetalle = empEmbargos[0];
        descuentoEmbargo = Math.round(parseFloat(embargoDetalle.monto) || (subtotalRemunerativo * 0.15));
      }

      const subtotalDescuentos = jubilacion + osep + cuotaGremial + descuentoEmbargo;
      const netoCobrar = (subtotalRemunerativo + subtotalNoRemunerativo) - subtotalDescuentos;

      // Construct detailed pay slip items
      const items = [
        { codigo: "101", concepto: `SUELDO BASICO ${emp.categoria || 'CAT. 10'}`, remunerativo: sueldoBasico, noRemunerativo: 0, descuento: 0 },
        { codigo: "105", concepto: `ANTIGÜEDAD (${antAnios} años - ${(antPct * 100).toFixed(0)}%)`, remunerativo: Math.round(adicionalAntiguedad), noRemunerativo: 0, descuento: 0 },
        { codigo: "120", concepto: "PRESENTISMO Y PUNTUALIDAD", remunerativo: presentismo, noRemunerativo: 0, descuento: 0 }
      ];

      if (tieneEstudio) {
        items.push({ codigo: "140", concepto: `ADICIONAL TITULO (${empEstudios[0].titulo || 'Nivel Acreditado'})`, remunerativo: Math.round(adicionalTitulo), noRemunerativo: 0, descuento: 0 });
      }

      items.push({ codigo: "301", concepto: "ASIGNACION DE REFUERZO DE INGRESOS", remunerativo: 0, noRemunerativo: subtotalNoRemunerativo, descuento: 0 });

      items.push({ codigo: "201", concepto: "JUBILACION LEY 6082 (11%)", remunerativo: 0, noRemunerativo: 0, descuento: jubilacion });
      items.push({ codigo: "202", concepto: "OBRA SOCIAL O.S.E.P. MENDOZA (4.5%)", remunerativo: 0, noRemunerativo: 0, descuento: osep });

      if (cuotaGremial > 0) {
        items.push({ codigo: "210", concepto: `APORTE SINDICAL (${gremioNombre})`, remunerativo: 0, noRemunerativo: 0, descuento: cuotaGremial });
      }

      if (descuentoEmbargo > 0) {
        items.push({ codigo: "250", concepto: `RETENCION JUDICIAL (${embargoDetalle.juzgado || 'Juzgado Civil'})`, remunerativo: 0, noRemunerativo: 0, descuento: descuentoEmbargo });
      }

      const recibo = {
        legajo: emp.legajo,
        nombre: emp.nombre,
        cuil: emp.cuil || `20-${emp.dni || '27931736'}-9`,
        dni: emp.dni || '27931736',
        cargo: emp.cargo || 'Personal Municipal',
        categoria: emp.categoria || 'Categoría 10',
        sector: emp.sector || 'ADMINISTRATIVO',
        domicilio: `${emp.calle || 'Barrio Centro'} - ${emp.localidad || 'Junín, Mendoza'}`,
        banco: 'Banco de la Nación Argentina',
        cbu: `01103135300313${String(emp.legajo).padStart(6, '0')}1`,
        fechaIngreso: emp.fechaIngreso || '2015-03-15',
        antiguedadAnos: antAnios,
        periodo: period || 'Agosto 2026',
        gremio: gremioNombre,
        embargoActivo: empEmbargos.length > 0,
        items: items,
        totales: {
          subtotalRemunerativo: subtotalRemunerativo,
          subtotalNoRemunerativo: subtotalNoRemunerativo,
          subtotalDescuentos: subtotalDescuentos,
          netoCobrar: netoCobrar
        },
        firmaDigital: {
          firmante: "CPN Roberto D. Fernández",
          cargo: "Secretario de Hacienda y Finanzas",
          hash: `SHA256:f${emp.legajo}b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b${emp.legajo}`,
          timestamp: new Date().toISOString(),
          qrValidationUrl: `https://municipio-junin.vercel.app/hacienda.html?verify=${emp.legajo}-202608`
        }
      };

      return res.json({ ok: true, recibo });
    }

    // Catalog overview summary
    const catalog = loadJson('payroll_catalog.json') || {};
    return res.json({
      ok: true,
      catalog
    });
  }

  if (req.method === 'POST') {
    // Paritarias simulator
    const { aumentoPct } = req.body || {};
    const pct = Number(aumentoPct || 10);
    const actual = 1115611274; // 2025 base
    const proyectado = actual * (1 + pct / 100);
    const diferencia = proyectado - actual;

    return res.json({
      ok: true,
      aumentoPorcentaje: pct,
      masaSalarialActual: actual,
      masaSalarialProyectada: Math.round(proyectado),
      costoAdicionalAnual: Math.round(diferencia),
      impactoMensual: Math.round(diferencia / 12)
    });
  }
}
