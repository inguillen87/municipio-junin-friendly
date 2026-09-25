# D1.5 · capacidad recuperada y carga privada del sucesor

## Referencia y cuota comprobadas

El trabajo parte del commit remoto `ecb250a77de6aea4e5deb822338703affb9093f8`, cotejado con GitHub master y el alias real de Vercel. La API oficial de Neon identificó el proyecto operativo `municipio-junin-friendly-internal`, su organización administrada por Vercel, plan **Free** y límite por rama de **536.870.912 bytes (512 MiB)**. La incertidumbre anterior sobre el plan de este proyecto quedó resuelta; no se trasladaron conclusiones de otros proyectos.

No se cambió el plan, la cuota, el tamaño de cómputo, las credenciales ni otra base. Se mantuvieron los límites del cargador: 512 MiB de techo, reserva de 16 MiB y crecimiento máximo previsto de 24 MiB.

## Mantenimiento físico comprobado

Se ejecutaron dos planes medidos y separados: ocho índices primero y cinco adicionales para dejar un MiB extra sobre el umbral necesario para ensayar la carga. Cada plan fijó destino, OID, definición, tamaño y caducidad; no se reutilizaron comandos ya confirmados. Se reconstruyeron **13 índices** mediante `REINDEX INDEX CONCURRENTLY`, uno por vez, sin cambiar sus definiciones ni las huellas/conteos de las filas verificadas antes y después.

La medida de todas las bases de la rama pasó de **500.154.368** a **493.756.416 bytes**: **6.397.952 bytes recuperados físicamente en Neon**. La base de aplicación pasó de 477.224.960 a 470.827.008 bytes. El margen después de la reserva pasó de 19.939.328 a **26.337.280 bytes**, por encima de los 25.165.824 requeridos. A diferencia del ensayo anterior de restauración, estos tamaños corresponden al servicio real.

El algoritmo sólo admite índices btree válidos, listos, pertenecientes al dueño actual, sin expresiones, exclusiones ni particiones. El tamaño individual máximo es 8 MiB. Antes de cada reconstrucción mide otra vez destino, definición y capacidad; reserva una estimación temporal de dos veces el índice más 2 MiB. Fija tiempos máximos de sentencia/bloqueo y no ejecuta REINDEX de toda una tabla, base o esquema.

Una respuesta incierta o índice transitorio inválido detiene el plan: no se reintenta ni elimina automáticamente un índice. La operación concurrente no es una transacción única reversible; los comprobantes conservan los índices ya terminados. No se afirma ausencia absoluta de carga o espera: se emplea el modo concurrente y sus comprobaciones de seguridad.

## Código y pruebas

Se incorporan `scripts/lib/grh-index-capacity.mjs`, `scripts/maintain-grh-index-capacity.mjs` y el ensayo SQL `verify-grh-index-capacity-postgres.mjs`. El ejecutor requiere un plan local absoluto, su hash exacto y `--execute`; no es llamado por las APIs ni por el despliegue. La planificación no cambia datos ni cuotas.

Las 36 pruebas unitarias cubren destino, cuota fija, reservas, tipos de índice, caducidad, cambios concurrentes, cancelación, confirmación y resultados inciertos. El ensayo SQL local de PostgreSQL 17 aprobó ocho controles: contenido, definición, validez, reducción física, vínculo de restricción, unicidad, filas intactas y ausencia de índices transitorios. Sus datos fueron inventados y la tabla se retiró al terminar. La matriz CI repite la prueba en PostgreSQL 17 y 18.

Referencia técnica: PostgreSQL 17, `REINDEX` y su sección de reconstrucción concurrente. El tamaño de una restauración se usó únicamente para priorizar candidatos; la capacidad liberada se midió de nuevo en la base operativa.

## Primera carga real del paquete del 22/09

Se utilizó el cargador transaccional ya publicado, sin rebajar sus validaciones ni cambiar sus límites. El paquete se reconstruyó desde las cuatro extracciones verificadas y mantuvo el SHA-256 `325ec95153bfa0cd052ea7c02f43d24bfbe305a888cddc7596c77d2840073ff3`.

Primero se instalaron las estructuras 106, cargaron las 3.260 diferencias y verificaron los diez dominios y sus sellos dentro de un ensayo real con ROLLBACK. El crecimiento transaccional observado fue de 4.931.584 bytes; la fuente seleccionada y las cabeceras nativas permanecieron iguales.

Después se repitió el procedimiento con COMMIT explícito. A las 03:30:42 UTC quedó guardada una preparación privada sellada con **3.260 diferencias de diez dominios**. Se instaló la estructura de 106, sin cambiar tablas operativas ni el puntero de selección. El crecimiento de esta carga fue de **4.939.776 bytes**, inferior al techo de 24 MiB.

Se volvió a ejecutar el mismo paquete como comprobación de idempotencia: devolvió el mismo identificador, `replayed=true`, `inserted=false`, `schemaInstalled=false` y el mismo sello de preservación. No duplicó diferencias ni preparaciones. La verificación posterior de sólo lectura confirmó el sello, las 3.260 filas y las tres tablas con RLS y sin privilegios de tabla para PUBLIC ni los roles de aplicación identificados.

El corte candidato es **22/09/2026 15:16:58**. El corte activo sigue siendo **10/09/2026 15:17:30**. Esa separación es intencional: el staging no habilita por sí solo una sustitución de la fuente, un cálculo salarial o una aprobación de novedades.

## Estado final y próximos criterios

Después de la verificación, la rama ocupa **498.810.880 bytes** y conserva **21.282.816 bytes disponibles después de la reserva de 16 MiB**. Este margen no habilita automáticamente otra carga con crecimiento máximo de 24 MiB: cada operación vuelve a medir su necesidad. La permanencia del plan Free y su capacidad ajustada quedan explícitas; no se prometen crecimiento ilimitado ni costos de otro plan.

La comprobación del cargador conserva `nativeHeadsPreserved=true`, `nativeReviewRequired=true`, `nativeConflictsResolved=false`, `operational=false` y `sourcePromoted=false`. Se cierra capacidad para este ensayo y esta primera carga privada, no revisión integral de las dependencias nativas ni promoción. Continúan el mapeo canónico, la revisión de solicitudes/novedades/reproceso y la validación de consumidores antes de seleccionar el sucesor. La autonomía completa, los módulos de cálculo/cierre y el expediente de proveedores diferido mantienen sus propios criterios.

Hubo mantenimiento físico de índices y escrituras en las tablas privadas de preparación: no se informa «cero escrituras productivas». No se borraron registros, recalcularon haberes, aprobaron solicitudes ni modificaron cuotas, firmas, pagos o relojes. Las huellas, plan de mantenimiento y comprobantes técnicos permanecen en la carpeta privada de operaciones; no se publicaron filas de los respaldos.

El build local integrado terminó con **5.274 pruebas aprobadas, cero fallos y dos omitidas**. El CI y el despliegue del commit final se acreditan por separado.
