# Publicación S11: contratos de lectura y controles técnicos

Estado de partida: `1ee4ab2`, fuente operativa GRH del 06/08/2026. S11 es el respaldo del **10/09/2026 15:17:30**, con referencia de nómina septiembre abierta; no acredita información posterior al día 10. La autorización del usuario ya existe. Este documento no agrega aprobaciones ni un circuito administrativo: identifica incompatibilidades que debe resolver el publicador.

**Esta entrega es preparación verificable, no activación.** No cambia lectores productivos, fuentes activas, bases, conexiones ni planes. Los resultados locales y el inventario no sustituyen la prueba de publicación completa.

## Preflight ejecutable, sin conexión

```text
node scripts/lib/grh-publication-consumers.mjs --require-covered
node --test tests/grh-publication-consumers.test.js
```

El módulo inspecciona `api/`, `lib/` y `scripts/migrations/`, sin leer entornos, respaldos ni credenciales. El inventario inicial cubre **26 consumidores y 65 sitios FROM/JOIN** de las cinco tablas históricas y sus vistas. Informa archivo, función/vista, relación y línea; falla ante un consumidor nuevo, una referencia adicional o un archivo esperado ausente. Reducir referencias al adaptar un lector es válido. Las migraciones históricas no deben reescribirse para dejar verde el control.

`coverageComplete:true` significa únicamente que las referencias detectadas están inventariadas. El informe mantiene `publicationReady:false` y `databaseChecked:false`: no certifica que una definición histórica sea la instalada ni que esté adaptada. No usa comentarios, marcas, permisos nuevos o firmas manuales como prueba de adaptación. Es análisis léxico de SQL literal; SQL construido dinámicamente, llamadas indirectas y cuerpos instalados se verifican con PostgreSQL. Las referencias que permanecen se muestran incluso cuando la cobertura pasa.

## Inventario y cambio requerido

Los nombres exactos y multiplicidades están en `GRH_PUBLICATION_CONSUMERS`. Los siguientes grupos indican el comportamiento que debe demostrar cada adaptación.

| Archivo / contrato | Lectura actual | Resultado requerido |
|---|---|---|
| `api/internal-data.js`: `payrollControl` | `vw_liquidacion_mensual`, `vw_nomina_totales`; fuente por fecha máxima | Totales y metadatos de la misma selección explícita; septiembre abierto nunca publicable como gasto cerrado. |
| `api/internal-data.js`: `managementAnalytics` | Hechos/corridas/movimientos originales | Comparaciones temporales dentro de una única revisión; no sumar base y candidato. Preservar límites de calidad y denominadores. |
| `api/internal-data.js`: `integrationQuality`, `directoryBaseSql`, `employee` | Estado/foto por fecha máxima; movimientos originales | Cohorte actual publicada y foto correspondiente; historial de movimientos de la revisión elegida. Mantener rama `MUNICONTROL` y UUID de cada persona/contrato. |
| `lib/workforce-operational-scope.js`: `operationalDirectorySql` | Igualdad de lote contrato/corrida/hecho | Último cierre y sus contratos desde la selección efectiva. Rotar sólo el lote del contrato dejaría este conjunto vacío. |
| `002`: `vw_nomina_totales`, `vw_liquidacion_mensual`, `vw_dotacion_cierre_mensual`, `vw_movimientos_legajo` | Tablas base completas | Fachadas equivalentes sobre una revisión. Conservar `numeric`, NULL, grano de negocio, cierre y procedencia. |
| `002`: `vw_empleado_actual`, `vw_dotacion_mensual`, `vw_payroll_snapshot_actual`, `vw_estructura_actual`, `vw_employment_status_control` | Snapshot/estado más reciente sin selección común | Foto y conciliación actuales verificadas; el historial administrativo anterior permanece. No convertir ausencia de foto salarial en baja. |
| `031`: `employee_payroll_history_v1` → recurso `employeepayroll` | `payroll_monthly_fact` + `payroll_run` | Página, total y corte de la misma revisión, restringidos al contrato autorizado; reglas de cierre y conciliación actuales. |
| `048`: `employee_payroll_detail_v1`; `lib/internal-payroll-detail.js` | `historyTotals` de hechos originales | Comparar con resumen de revisión explícita y mostrar su procedencia. El detalle mantiene su propio `sourceHash` y corte; no reetiquetarlo S11. |
| `051`: `employee_payroll_documents_v1` → recurso `employeepayrolldocuments` | `historySummaryAvailable` de hechos originales | Disponibilidad según revisión elegida; un documento independiente sigue visible aunque no tenga resumen comparable. |
| `026`: `payroll_novelty_prepare_v1`; parche `032` | Movimientos para concepto, centro de costo, tipo, duplicado, conflicto y homologación faltante | Mismas comprobaciones sobre movimientos efectivos. No aceptar una novedad usando exclusivamente agosto cuando septiembre contiene un duplicado/conflicto. |
| `002`: `validate_payroll_run_link`; `035`: `payroll_reprocessing_snapshot_v1`, `payroll_reprocessing_prepare_v1` | Identificador/FK real `payroll_run` | Conservar referencia histórica real. Una corrida virtual no recibe UUID de escritura ficticio; toda operación debe resolver una corrida persistida y su revisión verificable. |
| `057`: `school_certificate_current_family_v1`; `064`: `school_certificate_current_family_v2` | Conciliación actual ligada al lote | Seguir el lote publicado y conservar tokens/evidencia de identidad. No adaptar certificados convirtiéndolos en filas importadas. |
| `061`: `grh_core_source_base_rows_v1` | Base original para reconstrucción y sellos | **Conservar esta lectura de base**. Apuntarla a la revisión efectiva produciría recursión o invalidaría la reconstrucción. |

También deben cambiar los metadatos seleccionados mediante `latest completed` o `max(source_cutoff)` en `api/internal-data.js`: `summary`, `structure`, `integrationQuality`, el contexto de ausencias, `managementAnalytics` y `payrollControl`. No son hechos históricos y quedan fuera del detector FROM/JOIN anterior. Usar la misma selección que los datos; un import de otro dominio o un lote candidato no cambia el corte operativo. `api/internal-assistant.js` debe conservar esa procedencia en sus hechos derivados.

Los reportes de detalle `048/051/053/054/058`, bancos `060` y catálogos homologados `066` tienen fuentes propias. Cambiar el padrón no los actualiza ni certifica homologaciones. Familias, ausencias, licencias y catálogos curados se reemplazan por la etapa transaccional existente, ligados a la nueva corrida de importación.

## Contrato mínimo de selección

`assertGrhSourceSelection(selection, expected)` valida exactamente:

```text
version: grh-source-selection.v1
tenantId, sourceBindingId, sourceDatabase, companyId
baselineBatchId, sourceVersionId
revision: baseline | candidate
sourceSha256, sourceDeclaredCutoff, sourcePayrollDate
```

`expected` debe obtenerse separadamente del binding autenticado y de la versión sellada. No se obtiene del mismo pedido validado. No hay `latest`, revisión predeterminada, destino SQL del navegador o fallback silencioso. `sourceDeclaredCutoff` conserva el timestamp sin zona de 061; no agregar `Z` ni trasladar las tres horas históricas por inferencia. El contexto operativo publicado puede aportar, por separado, el timestamp del lote canónico.

`assertGrhComparableSelections(baseline,candidate)` exige mismo tenant/binding/base/versión, huellas distintas y corte creciente. Distingue **revisión de fuente** de **mes de nómina**; no certifica cierre. Los endpoints conservan sus capacidades existentes. Las consultas de detalle requieren además la identidad exacta del contrato; los dos legajos nuevos de S11 no deben desaparecer de totales por un INNER JOIN prematuro ni convertirse en personas canónicas por aproximación.

El lector debe resolver su selección una sola vez por respuesta. Las cuatro consultas paralelas actuales de `payrollControl` no garantizan por sí solas un snapshot común durante una publicación. Usar una fachada SQL de una sentencia o una transacción del mismo snapshot; comprobar cambio de selección concurrente. Las páginas/exportaciones deben mantener esa selección o rechazar el cambio.

## Reconstrucción mínima; sin duplicar historia

Reutilizar el algoritmo 061: filas base cuya `source_id` no aparece en los deltas, UNION ALL de `add/replace`; `remove` no aparece en candidato, pero permanece en baseline. Las claves de unión de corridas son `(empresa,fecha,periodo,mes,tipo)`, y las de hechos incorporan legajo. Nunca unir sólo por mes o legajo.

La adaptación puede centralizarse en tres fachadas tipadas: corridas, hechos mensuales y movimientos. Deben conservar `source_id`, revisión y huella, importes `numeric`/strings exactos y los campos de la proyección 061. Si una pantalla expone `rawFields`, recuperar el payload literal correspondiente de la base o del delta, no fabricar un payload a partir de la proyección normalizada.

No hace falta materializar los 216.411 hechos y 495.237 movimientos. Evaluar únicamente foto/conciliación actuales (847/2.452 filas en los artefactos) y las corridas persistidas necesarias para sus FK. No deducir estado laboral granular de los dos booleanos de `employmentReconciliation` de 061. La promoción/conciliación existente y el artefacto completo son la evidencia para esas filas. Esta alternativa requiere medición antes de elegirla; este incremento no crea vistas ni materializaciones.

Rendimiento pendiente real: `grh_core_source_version_rows_v1` verifica huellas completas y devuelve todo ordenado antes del filtro exterior. `WHERE contrato` o `LIMIT` sobre esa función PL/pgSQL no acredita lectura acotada. Evitar llamarla por fila o por cada subtotal: probar una validación por selección/snapshot y el overlay SQL filtrado, conservando detección de deriva. Medir PostgreSQL real sobre los volúmenes completos antes de prometer latencia interactiva.

## Bloqueos de publicación y prueba que los cierra

| Bloqueo concreto | Prueba requerida, sin nuevas aprobaciones |
|---|---|
| `SOURCE_REPLACEMENT_COORDINATION_REQUIRED` en importador core; `RRHH_IMPORT_REFRESH_COORDINATION_REQUIRED` en importador curado | Una única transacción del publicador con etapas existentes, versión explícita y fallo inyectado después de cada etapa. No quitar guards para ejecutar importadores sueltos. |
| PK mensual omite lote; 214.163 claves comunes | Demostrar por clave y digest la igualdad de las cinco reconstrucciones contra artefactos, incluidas 811 correcciones y una ausencia mensual. Sin UPDATE de hechos base ni duplicación financiera. |
| Lectores anteriores y controles026/032 | Cobertura estática; después, QA de SQL instalado y APIs mostrando totales/páginas/duplicados coherentes con selección. Las definiciones viejas en Git no prueban las funciones activas. |
| Dependencia baseline061 | Crear/reutilizar versión **antes** de promover contratos. Después usar assertions/lector sellado; el importador061 vuelve a exigir contratos baseline incluso para replay. Su replay no es el replay del publicador. |
| Capacidad | Lectura operativa aportada por root al cierre de esta preparación: **todas las DB/templates PG17=518.807.552bytes; PG18=483.631.104bytes**. Bajo512MiB y después de reservar16MiB quedan **PG17=1.286.144bytes; PG18=36.462.592bytes**. `readSourceCapacity` usa ese alcance completo, no sólo neondb. El crecimiento combinado del publicador sigue sin medirse; los16,66MiB del delta histórico no lo acreditan. No reducir reserva ni cambiar plan/conexión para ocultarlo. Revalidar antes de ejecutar. |
| Consulta histórica de acciones059 | Caso DNI crudo de nueve dígitos frente a DNI canónico NULL, además de casos actuales y fuente/identidad cambiadas. Conservar staging y acciones/eventos; no ampliar una coincidencia dudosa. |
| Recuperación escolar094 ligada al lote | Preservar recovery agosto y generar recovery S11 propio. Extractor real nuevo:2686 hijos,2684 compartidos,8 hashes094 distintos,81 pares de fechas cambiados,+2 hijos y0 cambios empresa/legajo. Los4 cambios nombre/nacimiento del informe anterior eran un subconjunto. No son automáticamente8 certificados afectados: cotejar tokens SQL y documentos reales. |
| Familias/certificados/manuales/nativos091–095 | Casos de identidad igual/distinta, certificado anterior, registro manual con fecha NULL, historial, replay, alta propia y colisión de legajo/DNI; igualdad de tablas/eventos que no deben cambiar. Manual091 conserva precedencia completa. |
| Frontera de transacción escolar | Usar `importSchoolingSourceWithinTransaction` cuando esté disponible, o SQL094 directo. El wrapper autónomo `importSchoolingSource` abre/cierra su transacción y no debe anidarse en el publicador. |
| Resguardo restaurable | Root obtuvo un respaldo PG17 de73.940.602bytes y comprobó que `pg_restore` puede interpretar su estructura. Eso todavía no prueba restauración: falta restaurar una copia descartable y comprobar contenido, funciones, restricciones y datos propios antes del ensayo integral. La evidencia y huella completas permanecen privadas. |
| Fuentes independientes | Un detalle/banco previo conserva su corte; comparación de resumen declara ambas procedencias. No convertir la apertura de septiembre en cierre, pago o recibo oficial. |

## Matriz de comparabilidad agosto/septiembre

Las cantidades son expectativas de los artefactos ya verificados, no mediciones nuevas de producción:

| Entidad | Baseline | Candidato | Casos que el QA debe observar |
|---|---:|---:|---|
| Corridas |620|624|2 cambiadas,4 nuevas; agosto cerrado en candidato y septiembre abierto.|
| Foto salarial |854|847|847 altas y854 ausencias de claves entre fotos; no son bajas laborales.|
| Movimientos |489459|495237|2 cambios,5791 altas,13 ausencias; preflight de novedades usa la misma revisión.|
| Hechos mensuales |214164|216411|811 cambios,2248 altas,1 ausencia; decimales exactos y NULL distintos de cero.|
| Conciliación |2450|2452|855 cambios,2 altas;875 activos,847 incluidos y28 activos fuera de la foto según fuente.|

QA PostgreSQL17/18: reconstrucción completa y sus digests; tenant/binding ajenos, versión desconocida/no sellada, deriva de baseline/delta, fuente cambiada entre páginas; orden/paginación/exportación estables; funciones restringidas sin lectura directa nueva del runtime. QA de API/navegador: cortes explícitos, ausencia/error sin ceros fabricados, revocación, septiembre abierto no financiero, selección consistente entre resumen y detalle. Conservar evidencias de rollback y también lectura independiente posterior al COMMIT real cuando root publique.

## Alternativa menor válida

Se puede entregar primero consulta autenticada del candidato y comparación agosto/S11 con `revision` visible, sin cambiar padrón, acciones ni documentos. Es útil y reduce el alcance de la primera interfaz, pero **no actualiza la operación municipal**. No hay una alternativa completa consistente que se limite a cambiar el rótulo de fuente o el lote del contrato. El candidato requiere reconstrucción seleccionada y publicación coordinada para convertirse en fuente operativa.
