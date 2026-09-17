# Áreas de trabajo y continuidad del proyecto integral

## A0 · Contenido de este incremento
La navegación agrupa las tareas existentes de 15 pantallas en Personas/RRHH, Tiempo y asistencia, Liquidaciones, Hacienda, Reportes/control y Sistema/ayuda. Inicio permanece directo. Un área se despliega por vez; una búsqueda puede mostrar coincidencias de varias áreas. No se inventan rutas operativas ni permisos.

Se reutilizan los nodos originales: los listeners de Personas, enlaces, anclas y parámetros conservan sus funciones. Liquidaciones conserva sus siete destinos sujetos a las capacidades originales. Fuentes de tiempo ya admite el submenú aunque su sidebar use grupos en lugar de un elemento nav.

Búsqueda tolerante a acentos y mayúsculas, Alt+M, Escape, foco visible, 44 px para controles principales y selector compacto a 1050 px o menos. Respeta movimiento reducido. No guarda búsquedas, datos personales ni permisos en almacenamiento persistente del navegador.

El menú usa el gate de sesión compartido. El build lo incluye una sola vez en las pantallas que lo necesitaban y carecían de su script. No agrega una consulta de sesión por área o por clic. Se conservan las consultas propias que cada pantalla ya hacía. No se altera el control de acceso de ninguna API. Revocación, actualización de permisos y cierre de sesión no deben mostrar enlaces anteriores.

El Centro ejecutivo y Administración global conservan su navegación especializada; no se reorganizan en este corte. El mapa de producto separa explícitamente lo implementado de lo planificado.

## Proyecto de Mariano · Jurídica y Legislativa
Referencia de seguimiento: issue #40. Los seis módulos están registrados en el mapa de producto como **planificados**, no como un sistema jurídico ya operativo. No existe una nueva ruta transaccional /juridica ni se cargaron documentos legales reales en esta intervención.

Próxima entrega J1: registro normativo nativo con identidad de norma (tipo, número, año, órgano y jurisdicción), archivo original privado/versionado, procedencia/hash, fechas de emisión/publicación/efectos y artículos referenciables. El primer criterio de cierre es registrar, buscar y recuperar el mismo original con auditoría, no una respuesta de IA sin documento.

J2: expediente, pases y subcircuito legislativo. J3: contrato, adenda, garantía y obligación. J4: relaciones por artículo y decisiones motivadas de vigencia. J5: plazos y agenda. J6: búsqueda y análisis asistido con norma, artículo, fragmento, versión y revisión humana. La incorporación histórica acompaña cada etapa; se declara cobertura y faltantes.

La IA no modifica vigencia, aprueba contratos ni activa reglas salariales. Los documentos no pueden dar instrucciones al sistema. Accesos por municipio, órgano, área y reserva se aplican antes de recuperar fragmentos. Ningún proveedor externo recibe documentos reservados por defecto. El HCD y el Ejecutivo conservan facultades diferenciadas.

## El frente salarial no se pierde
Seguimiento: issue #37. Se preservan las altas nativas de legajos, los permisos municipales ya asignados, las cuentas con segundo factor y el preparte PM-10 → Novedades. Este incremento no toca usuarios, claves, marcas, fórmulas, haberes ni tablas de la base.

Prioridades funcionales siguientes: (1) límites oficiales individuales con vigencia y fundamento, sin depender únicamente de un tope declarado; (2) turnos, permisos y justificaciones homologados antes de convertir tardanzas/inasistencias en conceptos; (3) catálogo de fórmulas ejecutables con bases, unidades, vigencia, redondeo y trazabilidad; (4) liquidación paralela por concepto y legajo antes de confirmar un mes propio; (5) identificación y vinculación comprobada del resto de los relojes. Una IP accesible no acredita serie ni punto de marcación.

Conexión normativa prevista: artículo revisado → fundamento del parámetro → propuesta → revisión independiente → cálculo explicable. Registrar una norma no cambia sueldos automáticamente.

## Verificación y reversión
Ejecutar `npm run build`, `node scripts/verify-work-area-menu-browser.mjs`, los recorridos de alta nativa, preparte y planilla, y la regresión de jornadas continuas. El nuevo recorrido verifica 15 sidebars, búsqueda, navegación atrás, sesiones reducidas, teclado, revocación, 320/390 px y la página completa de Personas preservando filtros y Nuevo legajo. Las respuestas API son sintéticas, sin datos municipales ni mutaciones.

En producción se reutiliza el runner existente de Novedades. `--published` compara hashes del código y del HTML compilado, verifica rechazo 401/no-store de una consulta nominal anónima y ejecuta el recorrido sobre archivos publicados con API sintéticas. No equivale a la aceptación completa de todas las operaciones con sesiones municipales reales.

No hay migraciones ni cambios de datos que revertir. Reversión: revertir exclusivamente el commit de este incremento, conservando publicaciones posteriores. No resetear master ni restaurar tablas para un cambio de navegación. No crear previews por cada ajuste visual.
