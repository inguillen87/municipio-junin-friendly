# 056 · Revisión completa de novedades antes de guardar

## Alcance
Base: master 06cf2d68ae91367cbfe81b3e2eb082a2161cfd27, árbol 572da90c18f1f1a8ef84804b9abd831160affac7. Mejora acotada a Novedades. No modifica API, migraciones, IAM, liquidaciones, importes de origen ni relojes. Sin dependencias nuevas.

Responde al apartado 5.2 de Noelia: validar cargas masivas y revisar el lote completo; también a la reunión del 09/09/2026: importe opcional, no convertir su ausencia en cero. Mantiene las condiciones existentes para novedades forzadas.

- Reemplaza el truncamiento de 25 filas por paginación de 25/50/100 sobre hasta 500 filas, búsqueda y filtros de importe informado/ausente y forzadas.
- Muestra los campos completos de cada fila, sin suprimir instrumento legal, centro, ajuste, movimiento u observación. El filtro no modifica el lote que se envía: se indica expresamente el total a guardar.
- Valida todas las filas estructuralmente legibles; informa una causa por fila inválida y cada duplicado detectable, con ordinal de datos y línea física de CSV. Un error de estructura CSV irrecuperable bloquea el documento completo. Nunca genera un borrador parcial ni elimina duplicados silenciosamente.
- Exporta las incidencias a CSV local sin crear un lote. Escapa celdas y neutraliza prefijos de fórmula.
- Reconoce BOM, comillas escapadas y campos CSV multilínea. Se mantiene el encabezado exacto de diez columnas, 480 KiB, 500 filas y el parseo monetario decimal existente.
- Invalida resultados antes de leer/rechazar un nuevo archivo; exige UTF-8 estricto; cancela lecturas obsoletas tras edición o selección posterior. Limpia el contenido nominal de la revisión cuando pierde validez o permiso.

## Entrega y seguridad
Los módulos privados están en la lista explícita del build y fuera de caché del service worker. La creación sigue usando la misma API gobernada, mismo payload e idempotencia. No aprueba ni ejecuta una liquidación por validar localmente.

Pruebas: tests/payroll-novelty-review-056.test.js; scripts/verify-novelty-review-056.mjs; regresiones completas npm test y build. El navegador intercepta **todas** las peticiones API, incluidos los POST, sólo con datos sintéticos. No se inserta una identidad falsa ni una novedad de prueba en producción. scripts/verify-novelty-production-056.mjs compara SHA-256 del dominio canónico y verifica rechazo anónimo. No certifica una sesión municipal real con MFA.

Pendiente fuera de este sprint: Excel directo, formatos GRH/TXT homologados, escolaridad, motor de valoración y anulación masiva de registros persistidos. La revisión no se presenta como reemplazo completo de GRH.
