# Escolaridad manual completa · ESC-IA-01

La ficha de hijos permitía adjuntar un PDF con presentación y vencimiento. Ahora también permite registrar una presentación en papel sin adjunto y conservar institución, nivel, curso/sala/grado, ciclo lectivo y fecha de emisión. Los datos que no constan quedan sin informar: no se deducen curso, año ni fechas. La fecha de presentación es una declaración administrativa obligatoria; emisión, vencimiento y momento de carga se conservan por separado.

Cada alta agrega un registro inmutable con motivo, operador y referencia exacta al registro anterior. La ficha permite consultar todo el historial y descargar los PDF originales, incluidos los anteriores a este incremento. El Excel del filtro completo incorpora los datos escolares y distingue PDF de presentación en papel. Registrar y exportar siguen siendo control interno: no aprueban escolaridad, elegibilidad ni haberes.

## Trabajo concurrente y recuperación

El servidor compara el último registro antes de aceptar otro. Si alguien se adelantó, conserva la propuesta local y pide revisar explícitamente la nueva versión. Una respuesta perdida conserva cuerpo y clave del intento; reintentar recupera el acuse sin crear otro registro. Una consulta de intento con respuesta 404 no demuestra que el envío original terminó: podría seguir validando su PDF. El formulario conserva el intento sin cambios hasta poder confirmarlo.

Los vínculos GRH y propios mantienen su identidad y origen. Las coincidencias familiares pendientes bloquean nuevos registros; no se fusionan hijos ni reasignan documentos. La revocación de acceso retira del DOM los datos consultados, documentos e historial, conservando únicamente el borrador local cuando existe. No se copian datos nominales a almacenamiento persistente del navegador.

## Datos y permisos

La migración aditiva `091-schooling-administrative-records.sql` conserva 057/064 y las API v1/v2. V3 reutiliza sesión, MFA, municipio, membresía y fuente certificada; lectura requiere `workforce.employee.read` y registro/consulta de intento añade `employee.record.propose`. Las tablas nuevas tienen RLS y prohibición de actualización, borrado y truncado. El runtime accede mediante las fachadas autorizadas.

La presentación en papel no requiere cuota PDF. Los PDF siguen usando el almacenamiento privado existente, límites, deduplicación y reserva de capacidad. Este incremento no amplía cuotas, cambia planes, conexiones, fuente activa ni incorpora proveedores. No abre fotos, extracción IA ni autoservicio. No genera datos municipales ficticios para probar producción.

## Validación y entrega

El workflow `schooling-records-release.yml` ejecuta la regresión completa, compilación, recorridos de escritorio/móvil y migraciones reales sobre PostgreSQL 17 y 18 desechables. El generador SQL aísla las identidades y datos sintéticos y revierte el ensayo; sus límites se describen en la evidencia generada. Dos conexiones verifican contención de escritura. Esos servicios de CI no son Neon.

Sólo después de gates verdes se instala la misma migración en la copia PG18 y en la rama operacional PG17, comprobando permisos, huellas, capacidad y ausencia de registros de prueba. Luego se promueve el commit a master y se espera éxito de Vercel. El job de producción compara ocho archivos servidos, verifica denegación anónima de las rutas privadas y repite el navegador con APIs privadas interceptadas. Esto certifica publicación y comportamiento con casos sintéticos, no una sesión real de Noelia ni aceptación municipal.

La reversión consiste en restaurar el deployment anterior conservando todas las tablas, archivos y registros nuevos. No restaurar una base completa ni borrar la historia para revertir una interfaz.

## Continuidad

Se responde a ESC-IA-01 y se amplía la planilla manual. ESC-IA-02/03/04, los avisos y la salida desde registros aprobados de ESC-IA-05 siguen pendientes. El alcance integral y sus otras dependencias están en `ESTADO_INTEGRAL_NOELIA_HUGO_MARIANO_20260921.md`. Los módulos 4, 5, 6 y 7 de Noelia no quedan completos por esta entrega.
