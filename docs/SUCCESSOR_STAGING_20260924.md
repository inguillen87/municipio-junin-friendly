# Sucesor GRH: almacenamiento de preparación, separado de la operación

## Estado de la entrega

Se implementó la migración aditiva 106 y su prueba SQL aislada. La migración crea tres tablas privadas: candidato, diferencias y sello. No sustituye la selección operativa ni modifica las tablas de legajos, nómina, fichadas, permisos o importaciones anteriores.

**Esta entrega no instala la migración en Neon ni carga el respaldo del 22/09.** Las herramientas bloquearon la preparación del nuevo proceso de extracción y del instalador. Se conserva sólo el código efectivamente escrito y probado; no se declara una carga real ni una publicación de datos que no ocurrió. La fuente operativa comprobada al iniciar el trabajo sigue siendo la del 10/09/2026.

## Contrato implementado

El candidato referencia exactamente la versión salarial, la versión de personal y la huella de la publicación anterior. Admite el perfil conocido del 22/09 y requiere evidencia de diez dominios de almacenamiento: cinco salariales y cinco proyecciones de personal. Los quince archivos originales de personal se proyectan en esas cinco entidades; no se confunden archivos de entrada con tablas.

La inserción y el sello deben completarse en una transacción. Se comparan conteos, huellas de la fuente previa y del candidato, y el contenido anterior de cada reemplazo o ausencia. Se conserva una asignación por tipo de liquidación; duplicar una misma asignación semántica no equivale a agregar otro contrato.

Los registros sellados son inmutables. Las tablas tienen seguridad por filas y no se conceden lecturas ni escrituras al rol de aplicación. El resumen distingue explícitamente `operational=false` y `publication_authorized=false`: un candidato validado no autoriza su incorporación ni un pago.

## Verificación y límites

`node scripts/verify-grh-successor-staging-postgres.mjs --expected-major=17 --write-sql=RUTA_QA`

El SQL generado sólo admite una base vacía llamada `successor_stage_qa` en loopback. Construye las funciones reales de versiones anteriores con datos sintéticos, prueba una preparación completa y coteja que la selección, los contratos y los registros de importación no cambien. El cierre hace rollback del esquema y de los datos de prueba. No consulta personas reales ni utiliza copias de sesiones municipales.

La prueba local de PostgreSQL 17 aprobó 72 comprobaciones en total, incluyendo las de la infraestructura anterior. La matriz de CI agrega PostgreSQL 17 y 18; su resultado debe verificarse por separado. Esto no sustituye pruebas de carga con el respaldo real ni el cierre de todos los casos adversos del nuevo contrato.

## Siguiente aceptación necesaria

Completar el constructor del paquete privado, sus verificaciones adversas y el instalador; ensayar los datos reales contra la fuente elegida; registrar discrepancias con operaciones nativas; verificar capacidad y restauración; instalar y cargar la preparación; después realizar la selección sucesora explícita. No se modifican los mecanismos de inmutabilidad anteriores para forzar ese paso.

Los recibos del módulo 9 y el contraste de cargos liquidados contra presupuesto anual del módulo 10 siguen siendo circuitos independientes de esta preparación técnica.
