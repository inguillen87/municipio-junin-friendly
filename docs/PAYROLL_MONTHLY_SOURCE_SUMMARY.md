# Resumen mensual de liquidaciones conservadas

MC-E06A implementa el alcance general del control mensual desde fuentes ya incorporadas. El recorrido es elegir el período, seleccionar explícitamente las corridas disponibles, consultar conceptos y descargar el mismo filtro en Excel o PDF. No exige preparar CSV auxiliares ni volver a importar las planillas que originaron esos datos.

Es un incremento parcial de MC-E06. El plan del handoff deriva este trabajo de S12, las muestras privadas de agosto: resumen general por conceptos, control general y controles por jurisdicción. El pedido completo incluye General/J42/J55 y conciliaciones. Este incremento no da por terminadas las jurisdicciones, la conciliación bancaria o de Gobierno, el cierre mensual ni la aceptación del área. La instrucción textual de S01/S07 sobre tres salidas total/J42/J55 corresponde al F.931 y no convierte este resumen en una presentación fiscal.

## Fuentes y selección

Se reutilizan `payroll_detail_dataset` y `payroll_detail_statement`, incorporados por 048/050. No se calculan nuevas liquidaciones ni se modifican los detalles, corridas canónicas, importes o pagos. La migración 058 sólo agrega la fachada de lectura y su auditoría.

El período se obtiene de **`source_period` y `source_month`**, con año entre 1900 y 2100 y mes entre 1 y 12. `payroll_date` es la fecha informada para la corrida y puede pertenecer a otro mes. No se usa esa fecha para decidir el período de imputación.

Cada fuente conserva:

| Campo del contrato | Significado |
|---|---|
| `datasetId` | Identificador de la fuente incorporada que se seleccionó. |
| `sourcePeriod`, `sourceMonth` | Año y mes de origen usados para seleccionar. |
| `date`, `type` | Fecha y código de tipo de la corrida, conservados por separado. |
| `closureStatus` | `closed` cuando la fuente informa 1; `open` cuando informa 0; `unknown` si no informa cierre. |
| `statementCount`, `lineCount` | Participaciones de legajos y líneas conservadas en esa corrida. |
| `sourceLabel`, `sourceSha256`, `payloadHash` | Referencia del origen, huella del respaldo y huella del contenido incorporado. |
| `importedAt` | Momento de incorporación. No reemplaza la fecha de corte del respaldo. |

Una selección contiene entre 1 y 24 UUID distintos. Todas las fuentes deben corresponder al municipio, binding certificado, base de origen, empresa, período y `sourceSha256` de la selección. Dos revisiones de la misma clave `(date, source_period, source_month, type)` no se consolidan juntas. No se elige silenciosamente una revisión ni se mezclan respaldos diferentes.

`scope.kind` es `selected_available_general`. Los indicadores `completeMonthCertified`, `payrollCalculated`, `payrollPosted` y `official` son siempre `false`. Seleccionar todo lo que muestra el catálogo sólo selecciona las fuentes disponibles; no acredita que estén todas las liquidaciones del mes. El cierre informado de una corrida tampoco certifica cierre mensual, aprobación administrativa o acreditación de pago.

## Contrato de consulta y exactitud

`GET /api/internal-payroll-monthly-source-summary` ofrece catálogo y resumen. La respuesta exitosa es `{ok:true,data}`; `data.version` es `payroll-monthly-source-summary.v1`.

- Catálogo: `mode`, `period` opcional, `items`, `total` y `scope`. Admite hasta 240 fuentes; superar el límite produce un error explícito, sin truncamiento silencioso.
- Resumen: `mode`, `period`, `sources`, `counts`, `rows`, `reportHash` y `scope`. La selección de fuentes es explícita. Admite hasta 1.000 conceptos.
- Cada concepto expone código, descripción, unidad y grupo de totalización; ocurrencias y legajos únicos; cantidades e importes con sus respectivos conteos de faltantes.

La fachada es `payroll_monthly_source_summary_v1(principal6, period, dataset_ids)`. `dataset_ids = NULL` pide el catálogo. Un resumen requiere período y selección no vacía. Las validaciones de API y respuesta mantienen una lista exacta de campos permitidos.

Antes de agregar, SQL verifica los conteos completos de cada fuente, el hash de cada detalle, los formatos numéricos, la existencia de los conceptos y la ausencia de líneas duplicadas. Las definiciones efectivamente usadas no pueden discrepar por código, descripción, unidad o grupo de totalización. Un concepto no recibe una definición de otro respaldo para suplir un catálogo faltante.

Cantidades e importes se suman con `numeric(24,2)` y salen como texto decimal canónico de dos posiciones, con hasta 22 dígitos enteros. La aplicación conserva esa precisión sin convertir el importe a `Number`. Un desborde o un dato incompatible bloquea el resumen.

Si falta una cantidad en alguna línea del concepto, su cantidad agregada es `null`; lo mismo ocurre con los importes. Los conteos `missingQuantities` y `missingAmounts` permiten ver esa limitación. No se suman sólo las líneas conocidas presentándolas como resultado completo. Un concepto ausente tampoco se presume cero.

Las medidas tienen significados diferentes:

- `statementParticipations` cuenta las participaciones en las corridas seleccionadas. Un legajo puede participar varias veces.
- `distinctLegajos` cuenta `DISTINCT source_legajo` en la selección; no equivale a personas únicas, porque una persona puede tener varios legajos.
- `sourceRows` cuenta ocurrencias del concepto. El `distinctLegajos` de cada concepto no se suma entre conceptos para obtener población.
- La cantidad conserva la unidad del concepto; no se interpreta automáticamente como días, personas u horas.

Componentes y totalizadores siguen siendo filas diferentes. No se crea un total monetario sumando todos los conceptos, porque volvería a contar componentes ya incluidos en sus totalizadores. El resumen no sustituye las conciliaciones posteriores contra snapshots canónicos o fuentes externas.

## Acceso, auditoría y exportaciones

La API sólo admite GET y exige sesión municipal gestionada, membresía activa, fuente certificada y `payroll.read`. No agrega capacidades ni acepta el acceso heredado. PostgreSQL vuelve a comprobar sesión, release, tenant, binding y autoridad mediante las guardas existentes. Una fuente desconocida o ajena no se entrega.

El runtime sólo puede ejecutar la fachada. No obtiene acceso directo a las tablas de detalle o auditoría. Cada lectura exitosa deja una fila pequeña en `payroll_monthly_source_read_event`: contexto de acceso, modo, período, conteos y hash del resultado. La auditoría no guarda PDFs, planillas, nombres, documentos personales ni líneas nominales. Sus triggers rechazan UPDATE, DELETE y TRUNCATE.

La pantalla filtra el resultado completo. Antes de descargar, vuelve a consultar las fuentes seleccionadas y verifica la misma respuesta, huella y estado de cierre. Un cambio de autoridad o fuente invalida la descarga del resultado anterior.

Excel contiene las hojas **Conceptos**, **Fuentes** y **Control**. PDF contiene esas mismas secciones. Ambos incluyen todas las filas del filtro, no sólo la página visible, y se generan en el navegador sin almacenamiento externo de archivos. Son documentos propios de control interno; no incorporan firma, autorización contable, formato bancario ni presentación fiscal.

Excel guarda como números los decimales de hasta 15 cifras significativas; los mayores permanecen como texto exacto y no ejecutable para evitar pérdida de precisión. PDF conserva los importes formateados como texto. Si un carácter de la fuente no puede representarse fielmente en el PDF, esa exportación se rechaza y se ofrece Excel para conservarlo; no se sustituye silenciosamente el texto.

## Validación realizada

### Pruebas sintéticas de SQL

`scripts/tests/058-payroll-monthly-source-summary.test.sql` se ejecutó contra PostgreSQL 17.11 en una copia local restaurada, con usuario y sesión sintéticos y ROLLBACK al finalizar. El script exige localhost, puerto 55439 y nombres de base local explícitamente permitidos.

Se verificaron período distinto de fecha de corrida, cierre desconocido, decimales exactos, faltantes, participaciones frente a legajos únicos, hash estable al reordenar la selección, límites 24/240/1.000 y rechazo al superarlos. También se probaron revisiones duplicadas, distinto respaldo, catálogo incompatible, fuente incompleta, empresa ajena, hash alterado, capacidad ausente, release incorrecto, tenant incorrecto y sesión revocada. Una suma de `99999999999999.90` verificó el caso que excede el entero seguro de JavaScript expresado en centavos.

El intento de TRUNCATE sobre la auditoría fue rechazado. Los marcadores finales fueron `QA_MONTHLY_SOURCE_TRANSACTIONAL_CHECKS_PASSED` y `QA_MONTHLY_SOURCE_ROLLBACK_VERIFIED`; los conteos de fuentes, identidad, nómina y auditoría coincidieron con el estado anterior.

### Lectura de datos reales restaurados

El 14/09/2026 se consultaron catálogo y resumen de julio y agosto en `restore_check`, usando una sesión sintética dentro de una transacción que terminó en ROLLBACK. No se consultó ni escribió producción para esta prueba. Los DTO completos y sus evidencias permanecen privados, fuera de Git.

| Período de origen | Fuentes | Participaciones | Legajos únicos | Líneas | Conceptos | Catálogo | Resumen |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2026-07 | 3 | 1.396 | 856 | 29.395 | 96 | 15,078 ms | 618,332 ms |
| 2026-08 | 3 | 1.397 | 854 | 29.439 | 92 | 3,548 ms | 608,817 ms |

Los hashes de los 2.793 detalles coincidieron con `digest(lines::text)`. Las 249 definiciones utilizadas no presentaron grupos de totalización, unidades o descripciones inválidos. Ambos resúmenes terminaron por debajo de 20 segundos. Son mediciones de esa copia local y ese volumen; no constituyen una garantía de latencia del servicio desplegado.

## Pendientes y continuidad

No se declara publicación ni aceptación municipal a partir de estas pruebas. La integración, validación del servicio desplegado y revisión del área deben registrarse por separado.

Para completar MC-E06 falta la correspondencia histórica comprobada de las jurisdicciones J42/J55 con cada corrida y corte, además de las conciliaciones requeridas. Esa dimensión no está directamente en las dos tablas de detalle. La lista fija del adaptador de agosto no acredita por sí sola la asignación histórica. Las planillas de Gobierno también contienen ajustes y referencias externas que no se pueden reconstruir como si fueran datos salariales ya almacenados.

MC-D02 sigue condicionando las relaciones operativas y su continuidad frente a nuevos cortes. Este incremento reutiliza las fuentes presentes sin exigir completar el motor salarial, pero no sustituye esa homologación ni habilita nuevas importaciones, cierres o pagos.
