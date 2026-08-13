const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed de datos RRHH a SQLite...');
  
  // Create default tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'junin' },
    update: {},
    create: {
      name: 'Municipio de Junín',
      slug: 'junin',
      shortName: 'Junín'
    }
  });

  console.log(`Tenant listo: ${tenant.id}`);

  // Read JSON data
  const dataPath = path.join(__dirname, '../rrhh-data/empleados.json');
  let rawData = fs.readFileSync(dataPath, 'utf8');
  rawData = rawData.replace(/^\uFEFF/, '');
  let empleados = [];
  try {
    empleados = JSON.parse(rawData);
  } catch (e) {
    console.error('Error parseando empleados.json:', e);
    process.exit(1);
  }

  console.log(`Leídos ${empleados.length} empleados desde JSON.`);

  // Create Sectors and Categories caching
  const sectorCache = {};
  const categoryCache = {};

  for (const emp of empleados) {
    // Upsert Sector
    let sector = null;
    if (emp.sector) {
      if (!sectorCache[emp.sector]) {
        sector = await prisma.sector.findFirst({ where: { tenantId: tenant.id, nombre: emp.sector } });
        if (!sector) {
          sector = await prisma.sector.create({ data: { tenantId: tenant.id, nombre: emp.sector, codigo: emp.sector.replace(/\s+/g, '-').toUpperCase() + '-' + Math.random().toString(36).substr(2,4) } });
        }
        sectorCache[emp.sector] = sector;
      }
      sector = sectorCache[emp.sector];
    }

    // Upsert Categoria
    let categoria = null;
    if (emp.categoria) {
      if (!categoryCache[emp.categoria]) {
        categoria = await prisma.categoria.findFirst({ where: { tenantId: tenant.id, nombre: emp.categoria } });
        if (!categoria) {
          categoria = await prisma.categoria.create({ data: { tenantId: tenant.id, nombre: emp.categoria, codigo: emp.categoria.replace(/\s+/g, '-').toUpperCase() + '-' + Math.random().toString(36).substr(2,4) } });
        }
        categoryCache[emp.categoria] = categoria;
      }
      categoria = categoryCache[emp.categoria];
    }

    const legajoStr = emp.legajo ? String(emp.legajo) : Math.random().toString().slice(2, 8);
    await prisma.empleadoGRH.upsert({
      where: {
        tenantId_legajo: { tenantId: tenant.id, legajo: legajoStr }
      },
      update: {
        nombre: emp.nombre,
        sueldoBasico: typeof emp.sueldoBasico === 'number' ? emp.sueldoBasico : parseFloat((emp.sueldoBasico || '0').toString().replace(/[^\d]/g, '')),
        activo: emp.activo === true || emp.activo === 'true' || emp.activo === 1 || emp.activo === '1' || emp.activo === 'ACTIVO',
        sectorId: sector ? sector.id : null,
        categoriaId: categoria ? categoria.id : null,
        fechaIngreso: emp.fechaIngreso ? new Date(emp.fechaIngreso) : new Date('2015-01-01'),
      },
      create: {
        tenantId: tenant.id,
        legajo: legajoStr,
        nombre: emp.nombre,
        sueldoBasico: typeof emp.sueldoBasico === 'number' ? emp.sueldoBasico : parseFloat((emp.sueldoBasico || '0').toString().replace(/[^\d]/g, '')),
        activo: emp.activo === true || emp.activo === 'true' || emp.activo === 1 || emp.activo === '1' || emp.activo === 'ACTIVO',
        sectorId: sector ? sector.id : null,
        categoriaId: categoria ? categoria.id : null,
        fechaIngreso: emp.fechaIngreso ? new Date(emp.fechaIngreso) : new Date('2015-01-01'),
      }
    });
  }
  
  console.log('Seeded Empleados successfully.');
  
  // Seed random Ausencias for analytics
  console.log('Generando historial de ausencias simulado para analíticas ricas...');
  
  const todosLosEmpleados = await prisma.empleadoGRH.findMany();
  const motivos = ['ENFERMEDAD', 'PERSONAL', 'VACACIONES', 'LLEGA TARDE'];
  
  let ausenciasCreadas = 0;
  for (const emp of todosLosEmpleados) {
    // Create 0 to 5 absences per employee
    const n = Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const diasAtras = Math.floor(Math.random() * 365);
      const start = new Date();
      start.setDate(start.getDate() - diasAtras);
      
      const end = new Date(start);
      end.setDate(end.getDate() + Math.floor(Math.random() * 5)); // 0 to 4 days long
      
      const hs = Math.floor(Math.random() * 8) + 1; // 1 to 8 hours if 1 day
      
      await prisma.ausencia.create({
        data: {
          tenantId: tenant.id,
          empleadoId: emp.id,
          fecha: start,
          dias: Math.floor(Math.random() * 5) + 1,
          fechaRegreso: end,
          motivoCodigo: motivos[Math.floor(Math.random() * motivos.length)],
          periodo: start.getFullYear().toString() + "-" + String(start.getMonth() + 1).padStart(2, '0')
        }
      });
      ausenciasCreadas++;
    }
  }
  
  console.log(`Seeded ${ausenciasCreadas} ausencias para métricas.`);
  console.log('SEED FINALIZADO CON ÉXITO.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
