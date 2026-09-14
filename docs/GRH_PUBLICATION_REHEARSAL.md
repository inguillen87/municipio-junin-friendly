# Ensayo coordinado de personal y nómina

La promoción canónica y la carga del núcleo GRH ahora pueden participar en una sola transacción controlada por el integrador. Cada etapa recibe una importación y un lote explícitos; ya no elige la última corrida disponible. Una repetición conserva las identidades que ya enriqueció el maestro GRH.

Esta entrega comprueba la compatibilidad y la reversión con la fuente de agosto existente. **No habilita reemplazarla por septiembre ni certifica una actualización completa de fuente.** La etapa curated exige una repetición exacta sin escrituras. Continúa el rechazo `RRHH_IMPORT_REFRESH_COORDINATION_REQUIRED` para un respaldo nuevo sobre datos inicializados.

## Contratos

- `readAndVerifySources()` y `prepareCuratedImport()` verifican los artefactos privados y generan las mismas cinco proyecciones tipadas del importador existente.
- `inspectCuratedReplayWithinTransaction()` comprueba procedencia, manifiesto, cohorte y contenido tipado sin abrir ni cerrar la transacción del integrador.
- `promoteCanonicalGrhWithinTransaction()` exige corrida explícita, bloquea sus tablas y personas, verifica staging y rechaza cambios de identidad, reasignaciones de contrato y colisiones de corte. Admite las dos proyecciones completas ya documentadas: curated y maestro de identidad GRH. No admite mezclar sus campos y no sobrescribe personas existentes.
- `preflightGrhCore()` verifica el perfil cerrado de agosto, nombres de archivo, rutas reales confinadas, huellas y cantidades. `importGrhCoreWithinTransaction()` recibe lote y corrida, exige procedencia compatible y limita las uniones al lote seleccionado. Revisa los archivos al principio y al final. No abre ni cierra conexiones ni transacciones.
- Los cuatro bloqueos comunes excluyen a los importadores curated, promoción, núcleo y maestro de identidad anteriores. El rechazo requiere reintentar la transacción completa después de resolver la causa.

El CLI de promoción exige `--import-run-id` y `--sources-dir` absoluto. El CLI del núcleo exige `--batch-id` y `--import-run-id`; `--data-dir` acepta una URL local de directorio. Ambos conservan la guarda de destino canónico y revierten por defecto; aplicar requiere `--apply`. Estos CLI siguen siendo operaciones independientes: ejecutarlos consecutivamente no equivale a publicar una fuente de forma atómica.

## Ensayo privado

`rehearseGrhPublication()` es un módulo de operación local, sin endpoint ni conexión automática. Recibe una conexión dedicada a la copia restaurada existente y dos URL locales de fuentes verificadas. Comprueba en el servidor host de loopback, puerto, base, rol y ausencia de rama Neon antes de ejecutar etapas. Rechaza conexiones con trabajo pendiente. No acepta un modo de aplicación.

El arnés toma huellas y cantidades de todas las tablas públicas y registra las secuencias por separado. Abre la transacción, establece un centinela propio y entrega a las etapas una conexión que impide instrucciones de cierre. Tras éxito o error revierte hasta el centinela y luego toda la transacción. Si pierde la propiedad de la transacción o no confirma la reversión, informa resultado no verificado; no afirma `committed: false` ante un cierre incierto.

La opción `failAfter` acepta únicamente los puntos declarados por el módulo. Inyecta un fallo después de la etapa elegida y comprueba la conservación posterior. Los informes devuelven estados agregados; no incluyen filas, nombres, documentos, credenciales, fuentes ni sus rutas.

Las incidencias existentes se omiten antes de generar su identificador, manteniendo la protección final de duplicados. PostgreSQL no revierte los avances de secuencias, incluso si un `INSERT` termina en conflicto; por eso el ensayo verifica también ese estado y no supone que `ROLLBACK` conserve los números. [Documentación de PostgreSQL](https://www.postgresql.org/docs/current/functions-sequence.html).

## Alcance de la evidencia

El ensayo requiere una copia local sin otros escritores. Sus huellas acreditan conservación de filas y secuencias públicas, no una comparación lógica completa de todos los dominios GRH ni la aceptación municipal de importes. El núcleo mantiene su validación de artefactos, procedencia y conteos; la equivalencia de cada hecho canónico preexistente con una nueva extracción queda fuera de esta certificación.

Para habilitar un corte nuevo todavía faltan la escritura curated coordinada sin truncado independiente, el perfil de septiembre, la resolución de cambios de identidad y claves históricas, la preservación comprobada de acciones/certificados y la comparación del resultado de todos los dominios. Los pedidos exactos de Noelia y sus criterios de aceptación siguen en el backlog privado.

El ensayo y la publicación del código no modifican Neon, no autorizan sueldos, firmas, pagos ni cierres, y no acreditan autonomía del reloj. Los resultados ejecutados, commits y despliegues comprobados se registran en `13_CONTINUIDAD.md`.
