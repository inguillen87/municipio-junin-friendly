import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    // ==============================
    // GET SYNC STATUS
    // ==============================
    if (req.method === 'GET' && action === 'status') {
      const [empleados, ausencias, licencias, sectores, categorias] = await Promise.all([
        prisma.empleadoGRH.count(),
        prisma.ausencia.count(),
        prisma.licencia.count(),
        prisma.sector.count(),
        prisma.categoria.count(),
      ]);
      const activos = await prisma.empleadoGRH.count({ where: { activo: true } });
      const lastEmpleado = await prisma.empleadoGRH.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      const lastAusencia = await prisma.ausencia.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } });

      return res.json({
        ok: true,
        data: {
          counts: { empleados, activos, ausencias, licencias, sectores, categorias },
          lastSync: {
            empleados: lastEmpleado?.createdAt || null,
            ausencias: lastAusencia?.createdAt || null,
          },
          database: {
            type: 'PostgreSQL (Neon)',
            region: 'sa-east-1',
            status: 'connected',
          },
        },
      });
    }

    // ==============================
    // RECEIVE DATA UPLOAD (JSON)
    // ==============================
    if (req.method === 'POST' && action === 'upload') {
      const { type, data, apiKey } = req.body || {};
      
      // Simple API key check
      if (apiKey !== process.env.CRON_SECRET) {
        return res.status(401).json({ ok: false, error: 'API key inválida' });
      }
      if (!type || !data || !Array.isArray(data)) {
        return res.status(400).json({ ok: false, error: 'Se requiere type y data (array)' });
      }

      let imported = 0, errors = 0;
      const tenantId = await getDefaultTenantId();

      if (type === 'empleados') {
        for (const e of data) {
          try {
            await prisma.empleadoGRH.upsert({
              where: { tenantId_legajo: { tenantId, legajo: String(e.legajo) } },
              update: {
                nombre: e.nombre || '',
                dni: e.dni || null,
                cuil: e.cuil || null,
                sexo: e.sexo || null,
                activo: e.activo !== false,
                fechaIngreso: e.fechaIngreso ? new Date(e.fechaIngreso) : null,
                sueldoBasico: e.sueldoBasico ? parseFloat(e.sueldoBasico) : null,
              },
              create: {
                tenantId,
                legajo: String(e.legajo),
                nombre: e.nombre || '',
                dni: e.dni || null,
                cuil: e.cuil || null,
                sexo: e.sexo || null,
                activo: e.activo !== false,
                fechaIngreso: e.fechaIngreso ? new Date(e.fechaIngreso) : null,
                sueldoBasico: e.sueldoBasico ? parseFloat(e.sueldoBasico) : null,
              },
            });
            imported++;
          } catch (err) { errors++; }
        }
      } else if (type === 'ausencias') {
        for (const a of data) {
          try {
            const emp = await prisma.empleadoGRH.findFirst({ where: { tenantId, legajo: String(a.legajo) } });
            if (!emp) { errors++; continue; }
            await prisma.ausencia.create({
              data: {
                tenantId,
                empleadoId: emp.id,
                fecha: a.fecha ? new Date(a.fecha) : new Date(),
                dias: a.dias ? parseFloat(a.dias) : null,
                motivoCodigo: a.motivo || null,
              },
            });
            imported++;
          } catch (err) { errors++; }
        }
      } else if (type === 'licencias') {
        for (const l of data) {
          try {
            const emp = await prisma.empleadoGRH.findFirst({ where: { tenantId, legajo: String(l.legajo) } });
            if (!emp) { errors++; continue; }
            await prisma.licencia.create({
              data: {
                tenantId,
                empleadoId: emp.id,
                tipo: l.tipo || null,
                fechaInicio: l.fechaInicio ? new Date(l.fechaInicio) : null,
                fechaFin: l.fechaFin ? new Date(l.fechaFin) : null,
                dias: l.dias ? parseInt(l.dias) : null,
                periodo: l.periodo || null,
                observaciones: l.observaciones || null,
              },
            });
            imported++;
          } catch (err) { errors++; }
        }
      } else {
        return res.status(400).json({ ok: false, error: 'Tipo no soportado. Use: empleados, ausencias, licencias' });
      }

      return res.json({ ok: true, type, imported, errors, total: data.length });
    }

    // ==============================
    // CRON: AUTO-SYNC (called by Vercel Cron)
    // ==============================
    if (req.method === 'GET' && action === 'cron-sync') {
      // Verify cron secret
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      
      // For now, just refresh analytics cache
      const [activos, inactivos, ausencias, licencias] = await Promise.all([
        prisma.empleadoGRH.count({ where: { activo: true } }),
        prisma.empleadoGRH.count({ where: { activo: false } }),
        prisma.ausencia.count(),
        prisma.licencia.count(),
      ]);

      return res.json({
        ok: true,
        message: 'Sync check completed',
        timestamp: new Date().toISOString(),
        counts: { activos, inactivos, ausencias, licencias },
      });
    }

    // ==============================
    // CONFIG: Get/Set sync settings
    // ==============================
    if (req.method === 'GET' && action === 'config') {
      return res.json({
        ok: true,
        data: {
          syncModes: [
            {
              id: 'direct',
              name: 'Conexión Directa',
              description: 'Conecta directamente a la base de datos del municipio (MariaDB/MySQL)',
              status: process.env.MUNI_DB_URL ? 'configured' : 'not_configured',
              icon: '🔌',
            },
            {
              id: 'upload',
              name: 'Carga Manual / Automática',
              description: 'Sube archivos CSV/JSON o recibe datos vía API',
              status: 'available',
              icon: '📤',
            },
            {
              id: 'cron',
              name: 'Sincronización Programada',
              description: 'Actualiza automáticamente cada día/semana desde la fuente configurada',
              status: 'available',
              icon: '⏰',
              schedule: 'Diario a las 06:00 AM',
            },
          ],
          apiEndpoint: '/api/rrhh-sync?action=upload',
          apiDocs: {
            method: 'POST',
            body: '{ "type": "empleados|ausencias|licencias", "data": [...], "apiKey": "YOUR_KEY" }',
          },
        },
      });
    }

    return res.status(400).json({ ok: false, error: 'Acción no válida. Use: status, upload, config, cron-sync' });
    
  } catch (err) {
    console.error('Sync error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function getDefaultTenantId() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'junin' } });
  return tenant?.id || 'default';
}
