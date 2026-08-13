process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_lgcnL7OIANk6@ep-cool-heart-ac1615yc-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const count = await prisma.empleadoGRH.count({ where: { activo: true } });
    console.log('Empleados activos:', count);
    
    const aus = await prisma.ausencia.count();
    console.log('Ausencias:', aus);
    
    const lic = await prisma.licencia.count();
    console.log('Licencias:', lic);
    
    const sectores = await prisma.sector.findMany();
    console.log('Sectores:', sectores.length);
    
    const first = await prisma.empleadoGRH.findFirst({
      where: { activo: true, nombre: { not: '' } },
      include: { sector: true, categoria: true, gremio: true },
    });
    if (first) {
      console.log('Sample:', first.legajo, first.nombre, first.sector?.nombre);
    }
    
    // Test analytics query
    const genero = await prisma.empleadoGRH.groupBy({
      by: ['sexo'],
      where: { activo: true },
      _count: true,
    });
    console.log('Genero:', JSON.stringify(genero));
    
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}
test();
