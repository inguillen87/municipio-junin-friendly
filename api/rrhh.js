import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  const { type, search, sector, categoria, gremio, sexo, activo, page, limit, id, legajo } = req.query || {};
  const tenantId = req.query.tenantId || undefined; // Optional filter

  try {
    // ============================================
    // ANALYTICS
    // ============================================
    if (type === 'analytics') {
      const [totalActivos, totalInactivos, totalAusencias, totalLicencias] = await Promise.all([
        prisma.empleadoGRH.count({ where: { activo: true } }),
        prisma.empleadoGRH.count({ where: { activo: false } }),
        prisma.ausencia.count(),
        prisma.licencia.count(),
      ]);

      const genero = await prisma.empleadoGRH.groupBy({
        by: ['sexo'],
        where: { activo: true },
        _count: true,
      });

      const sectores = await prisma.empleadoGRH.groupBy({
        by: ['sectorId'],
        where: { activo: true, sectorId: { not: null } },
        _count: true,
        orderBy: { _count: { sectorId: 'desc' } },
      });

      // Get sector names
      const sectorIds = sectores.map(s => s.sectorId).filter(Boolean);
      const sectorNames = await prisma.sector.findMany({
        where: { id: { in: sectorIds } },
        select: { id: true, nombre: true },
      });
      const sectorNameMap = Object.fromEntries(sectorNames.map(s => [s.id, s.nombre]));

      const distribucionSector = {};
      sectores.forEach(s => {
        const name = sectorNameMap[s.sectorId] || 'Sin sector';
        distribucionSector[name] = s._count;
      });

      const distribucionGenero = {};
      genero.forEach(g => {
        distribucionGenero[g.sexo || 'N/D'] = g._count;
      });

      // Salary stats
      const sueldos = await prisma.empleadoGRH.aggregate({
        where: { activo: true, sueldoBasico: { gt: 0 } },
        _avg: { sueldoBasico: true },
        _min: { sueldoBasico: true },
        _max: { sueldoBasico: true },
        _sum: { sueldoBasico: true },
      });

      return res.json({
        ok: true,
        data: {
          empleadosActivos: totalActivos,
          empleadosInactivos: totalInactivos,
          totalEmpleados: totalActivos + totalInactivos,
          totalAusencias,
          totalLicencias,
          distribucionGenero,
          distribucionSector,
          sueldoPromedio: sueldos._avg.sueldoBasico || 0,
          sueldoMinimo: sueldos._min.sueldoBasico || 0,
          sueldoMaximo: sueldos._max.sueldoBasico || 0,
          masaSalarial: sueldos._sum.sueldoBasico || 0,
        }
      });
    }

    // ============================================
    // CATALOGS
    // ============================================
    if (type === 'sectores') {
      try {
        const data = await prisma.sector.findMany({ orderBy: { nombre: 'asc' } });
        if (data && data.length > 0) return res.json({ ok: true, data });
      } catch(e) {}
      const data = getSectoresJsonFallback();
      return res.json({ ok: true, data });
    }
    if (type === 'categorias') {
      try {
        const data = await prisma.categoria.findMany({ orderBy: { nombre: 'asc' } });
        if (data && data.length > 0) return res.json({ ok: true, data });
      } catch(e) {}
      return res.json({ ok: true, data: [
        { id: 'Cat. GENERAL', nombre: 'Cat. GENERAL' },
        { id: 'Cat. PROFESIONAL', nombre: 'Cat. PROFESIONAL' },
        { id: 'Cat. TECNICO', nombre: 'Cat. TECNICO' },
        { id: 'Cat. JERARQUICO', nombre: 'Cat. JERARQUICO' }
      ]});
    }
    if (type === 'gremios') {
      try {
        const data = await prisma.gremio.findMany({ orderBy: { nombre: 'asc' } });
        if (data && data.length > 0) return res.json({ ok: true, data });
      } catch(e) {}
      return res.json({ ok: true, data: [
        { id: 'STMJ', nombre: 'Sindicato Trabajadores Municipales Junín (STMJ)' },
        { id: 'ATE', nombre: 'Asociación Trabajadores del Estado (ATE)' },
        { id: 'UPCN', nombre: 'Unión Personal Civil de la Nación (UPCN)' }
      ]});
    }

    // ============================================
    // SINGLE EMPLOYEE DETAIL
    // ============================================
    if (type === 'empleado' && (id || legajo)) {
      let emp = null;
      const targetKey = String(legajo || id || '').trim();

      if (id && id !== 'undefined' && id !== 'null') {
        emp = await prisma.empleadoGRH.findUnique({
          where: { id },
          include: {
            sector: true,
            categoria: true,
            gremio: true,
            convenio: true,
            ausencias: { orderBy: { fecha: 'desc' }, take: 50 },
            licencias: { orderBy: { fechaInicio: 'desc' }, take: 50 },
            familiares: true,
          }
        }).catch(() => null);
      }

      if (!emp && targetKey) {
        const legNum = parseInt(targetKey);
        if (!isNaN(legNum)) {
          emp = await prisma.empleadoGRH.findFirst({
            where: { legajo: legNum },
            include: {
              sector: true,
              categoria: true,
              gremio: true,
              convenio: true,
              ausencias: { orderBy: { fecha: 'desc' }, take: 50 },
              licencias: { orderBy: { fechaInicio: 'desc' }, take: 50 },
              familiares: true,
            }
          }).catch(() => null);
        }
      }

      // Fallback: search empleados.json
      if (!emp && targetKey) {
        try {
          const raw = readFileSync(join(__dirname, '..', 'rrhh-data', 'empleados.json'), 'utf-8');
          const list = JSON.parse(raw);
          const found = list.find(e => String(e.legajo) === targetKey || String(e.id) === targetKey);
          if (found) {
            emp = {
              id: found.id || String(found.legajo),
              legajo: parseInt(found.legajo) || 0,
              nombre: found.nombre || ('Empleado Legajo ' + targetKey),
              sexo: found.sexo || 'M',
              dni: found.dni || '',
              cuil: found.cuil || '',
              fechaNacimiento: found.fechaNacimiento || null,
              fechaIngreso: found.fechaIngreso || null,
              activo: found.activo !== false,
              sector: { nombre: found.sector || 'ADMINISTRATIVO' },
              categoria: { nombre: found.categoria || 'Cat. GENERAL' },
              gremio: { nombre: found.gremio || '-' },
              ausencias: [],
              licencias: [],
              familiares: []
            };
          }
        } catch(e) {
          console.warn('Fallback empleados.json error:', e.message);
        }
      }

      return res.json({ ok: true, data: emp });
    }

    // ============================================
    // AUSENCIAS
    // ============================================
    if (type === 'ausencias') {
      const lim = parseInt(limit) || 100;
      const data = await prisma.ausencia.findMany({
        take: lim,
        orderBy: { fecha: 'desc' },
        include: { empleado: { select: { legajo: true, nombre: true } } },
      });
      const total = await prisma.ausencia.count();
      return res.json({ ok: true, total, data });
    }

    // ============================================
    // LICENCIAS
    // ============================================
    if (type === 'licencias') {
      const lim = parseInt(limit) || 100;
      const data = await prisma.licencia.findMany({
        take: lim,
        orderBy: { fechaInicio: 'desc' },
        include: { empleado: { select: { legajo: true, nombre: true } } },
      });
      const total = await prisma.licencia.count();
      return res.json({ ok: true, total, data });
    }

    // ============================================
    // EMPLEADOS LIST (default)
    // ============================================
    const p = parseInt(page) || 1;
    const lim = parseInt(limit) || 50;
    const skip = (p - 1) * lim;

    try {
      const where = {};
      if (activo !== 'false') where.activo = true;
      if (search) {
        const upSearch = search.toUpperCase();
        where.OR = [
          { nombre: { contains: upSearch } },
          { nombre: { contains: search } },
          { legajo: { contains: search } },
          { dni: { contains: search } },
        ];
      }
      if (sector) where.sector = { nombre: { contains: sector } };
      if (sexo) where.sexo = sexo;

      const [data, total] = await Promise.all([
        prisma.empleadoGRH.findMany({
          where,
          skip,
          take: lim,
          orderBy: { nombre: 'asc' },
          include: {
            sector: { select: { nombre: true } },
            categoria: { select: { nombre: true } },
            gremio: { select: { nombre: true } },
          },
        }),
        prisma.empleadoGRH.count({ where }),
      ]);

      if (data && data.length > 0) {
        return res.json({
          ok: true,
          total,
          page: p,
          pages: Math.ceil(total / lim),
          data: data.map(e => ({
            ...e,
            sectorNombre: e.sector?.nombre || '',
            categoriaNombre: e.categoria?.nombre || '',
            gremioNombre: e.gremio?.nombre || '',
          })),
        });
      }
    } catch (e) {
      console.warn('Prisma list failed, using empleados.json fallback:', e.message);
    }

    // Fallback: empleados.json list with search and pagination
    const fallback = getEmpleadosJsonFallback(search, sector, sexo, activo, p, lim);
    return res.json(fallback);
  } catch (err) {
    console.error('[RRHH API Error]', err);
    const fallback = getEmpleadosJsonFallback(search, sector, sexo, activo, page, limit);
    return res.json(fallback);
  }
}

function getEmpleadosJsonFallback(search, sector, sexo, activo, page, limit) {
  try {
    const raw = readFileSync(join(__dirname, '..', 'rrhh-data', 'empleados.json'), 'utf-8');
    let list = JSON.parse(raw);

    if (search) {
      const q = String(search).toLowerCase();
      list = list.filter(e => 
        (e.nombre && e.nombre.toLowerCase().includes(q)) ||
        (e.legajo && String(e.legajo).includes(q)) ||
        (e.dni && String(e.dni).includes(q))
      );
    }
    if (sector) {
      const secQ = String(sector).toLowerCase();
      list = list.filter(e => e.sector && String(e.sector).toLowerCase().includes(secQ));
    }
    if (sexo) {
      list = list.filter(e => e.sexo === sexo);
    }

    const total = list.length;
    const p = parseInt(page) || 1;
    const lim = parseInt(limit) || 50;
    const start = (p - 1) * lim;
    const pageData = list.slice(start, start + lim).map(e => ({
      id: e.id || String(e.legajo),
      legajo: e.legajo,
      nombre: e.nombre,
      sexo: e.sexo,
      dni: e.dni,
      cuil: e.cuil,
      fechaNacimiento: e.fechaNacimiento,
      fechaIngreso: e.fechaIngreso,
      activo: e.activo !== false,
      sector: { nombre: e.sector || 'ADMINISTRATIVO' },
      categoria: { nombre: e.categoria || 'Cat. GENERAL' },
      gremio: { nombre: e.gremio || '-' },
      sectorNombre: e.sector || 'ADMINISTRATIVO',
      categoriaNombre: e.categoria || 'Cat. GENERAL',
      gremioNombre: e.gremio || '-'
    }));

    return {
      ok: true,
      total,
      page: p,
      pages: Math.ceil(total / lim),
      data: pageData
    };
  } catch (err) {
    console.error('[RRHH JSON Fallback Error]', err);
    return { ok: true, total: 0, page: 1, pages: 1, data: [] };
  }
}

function getSectoresJsonFallback() {
  try {
    const raw = readFileSync(join(__dirname, '..', 'rrhh-data', 'empleados.json'), 'utf-8');
    const list = JSON.parse(raw);
    const set = new Set();
    list.forEach(e => {
      if (e.sector) {
        let sec = String(e.sector).trim();
        sec = sec.replace(/SUE.*OS/g, 'SUEÑOS');
        if (sec) set.add(sec);
      }
    });
    const sorted = Array.from(set).sort().map(s => ({ id: s, nombre: s }));
    if (sorted.length > 0) return sorted;
  } catch (e) {}
  
  return [
    { id: 'ADMINISTRATIVO', nombre: 'ADMINISTRATIVO' },
    { id: 'AMANECER', nombre: 'AMANECER' },
    { id: 'ANGEL DE LA GUARDA', nombre: 'ANGEL DE LA GUARDA' },
    { id: 'CASITA DE CHOCOLATE', nombre: 'CASITA DE CHOCOLATE' },
    { id: 'CASTILLO DE SUEÑOS', nombre: 'CASTILLO DE SUEÑOS' },
    { id: 'COLIBRI', nombre: 'COLIBRI' },
    { id: 'CORAZONES SALTARINES', nombre: 'CORAZONES SALTARINES' },
    { id: 'DEL SOL', nombre: 'DEL SOL' },
    { id: 'DOCENTES JARDINES MATERNALES', nombre: 'DOCENTES JARDINES MATERNALES' },
    { id: 'DULCES SONRISAS', nombre: 'DULCES SONRISAS' },
    { id: 'ELEFANTE TROMPITA', nombre: 'ELEFANTE TROMPITA' },
    { id: 'ESC. DE MUSICA', nombre: 'ESC. DE MUSICA' },
    { id: 'FUNCIONARIOS', nombre: 'FUNCIONARIOS' },
    { id: 'H.C.D. ADMINISTRAT.', nombre: 'H.C.D. ADMINISTRAT.' },
    { id: 'H.C.D. SECRETARIOS', nombre: 'H.C.D. SECRETARIOS' },
    { id: 'H.C.D. TEMPORARIOS', nombre: 'H.C.D. TEMPORARIOS' },
    { id: 'HCD CONCEJALES', nombre: 'HCD CONCEJALES' },
    { id: 'HS. CATEDRAS CULTURA', nombre: 'HS. CATEDRAS CULTURA' },
    { id: 'HS. CATEDRAS DEPORTES', nombre: 'HS. CATEDRAS DEPORTES' },
    { id: 'LUNA LUNERA', nombre: 'LUNA LUNERA' },
    { id: 'MANITOS DE COLORES', nombre: 'MANITOS DE COLORES' },
    { id: 'MI ARCO IRIS', nombre: 'MI ARCO IRIS' },
    { id: 'MI RINCONCITO', nombre: 'MI RINCONCITO' },
    { id: 'OBRERO', nombre: 'OBRERO' },
    { id: 'PATA GARABATA', nombre: 'PATA GARABATA' },
    { id: 'PERSONAL ADSCRIPTO', nombre: 'PERSONAL ADSCRIPTO' },
    { id: 'PICO PICOTERO', nombre: 'PICO PICOTERO' },
    { id: 'RONDA DE ALEGRIA', nombre: 'RONDA DE ALEGRIA' },
    { id: 'TEMPORARIOS', nombre: 'TEMPORARIOS' },
    { id: 'VIVIENDA', nombre: 'VIVIENDA' }
  ];
}
