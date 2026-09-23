# Noelia — recibos y estructura presupuestaria (23/09/2026)

## Fuentes y límites

Requisitos tomados de los adjuntos privados `9º MODULO RECIBOS DE HABERES.pdf`, `10º MODULO ESTRUCTURA PRESUPUESTARIA DE CARGOS.pdf` y el reporte de estructura actualizado al 23/09/2026 (51 páginas). No se incorporan documentos nominales, respaldos SQL ni datos municipales de prueba al repositorio.

Este incremento mejora un circuito existente; no certifica el reemplazo completo de GRH, la importación del último respaldo, una liquidación nativa ni la aceptación de Noelia. Las tareas de módulos 1–8 mantienen sus gates y pendientes anteriores.

## Módulo 9 — circuito individual de consulta

La biblioteca autorizada del legajo conserva su API y el control de versión del detalle. El índice continúa incluyendo liquidaciones que no tienen tarjeta en el resumen mensual anterior.

- Paginación local de 24 tarjetas. Los filtros de año, mes y tipo se aplican a todos los metadatos recibidos, no sólo a la página visible. El límite del servidor de 1.000 documentos permanece explícito y no se presenta como el archivo histórico completo.
- Primera/anterior/siguiente/última página y salto directo. Cambiar de página o filtro no requiere otra lectura de la API. Esto reduce creación de nodos, no el tamaño de la respuesta de metadatos.
- Actualizar mantiene filtros y página cuando existen. Si desaparece un valor de filtro se conserva la selección y se muestra vacío, sin ampliar silenciosamente el alcance. Una actualización fallida elimina los datos anteriores y permite reintentar.
- Cambiar la selección o cerrar el panel invalida detalles y exportaciones pendientes. Las descargas siguen reautorizando la versión exacta consultada. Cerrar detalle/biblioteca restituye el foco a su control de origen.
- No se incorporan nombres, resultados, filtros ni documentos al almacenamiento del navegador.

### Aceptación por requisito de Noelia

| Requisito del módulo 9 | Alcance de este incremento |
|---|---|
| Desde/hasta legajo y repartición | Pendiente del circuito de emisión por lote, con filtros y autorización del servidor. No simularlo filtrando sólo una página de empleados. |
| Período y tipos de liquidación | Consulta individual existente, filtros conservados y paginación verificable. Período de origen y fecha informada de liquidación no se confunden. |
| Fecha de acreditación o pago | No se deriva de la fecha de liquidación. Requiere evidencia propia y campo autorizado. |
| PDF | Detalle informativo existente y exportación reautorizada. No se declara recibo oficial por cambiar su título. |
| Firma digital | Pendiente de emisión, certificado, validación e integridad verificables. No equivale a firma gráfica ni a iniciar sesión. |
| Descarga por cada agente | Pendiente de identidad vinculada al sujeto, permisos propios y publicación del recibo autorizado; no heredar permisos de RR.HH. |

## Módulo 10 — mantener la semántica del reporte

Noelia necesita controlar **cargos liquidados contra cargos presupuestados del ejercicio**, con detalle y PDF. La segunda página de su solicitud muestra vista simple/detallada, legajos activos Sí/No/Todos y orden por número de legajo o alfabético.

El reporte adjunto contiene Id, JUR, REG, AGR, TRAM, SUBT, CARGO, Denominación, Cant, Clas, Estado y Vacante, con legajos/nombres en el detalle. Deben conservarse sus códigos, ceros iniciales y categorías tal como figuran en la fuente.

No convertir automáticamente `Cant`, `CantMaxPuesto`, dotación observada o cantidad de legajos en cupo presupuestario aprobado. El reporte incluye filas con cantidad cero y estado `Ocupado`; tampoco deben renombrarse como vacantes por inferencia. La comparación requiere separar tres evidencias: crédito/cupo aprobado del ejercicio, asignación administrativa vigente y corrida salarial concreta. Un legajo no equivale necesariamente a una persona única.

Este incremento no crea una pantalla nominal paralela a la fuente ni declara instalado el módulo 10. Su cierre requiere mapeo homologado, consulta tenant-bound, conciliación por cargo/ejercicio/corrida, vista simple/detallada y PDF con los mismos filtros y totales, pruebas de permisos y aceptación municipal.

## Datos y continuidad

El último respaldo recibido se perfila y compara **fuera del repositorio**. Registrar un perfil conocido de origen no autoriza promoverlo. El preflight también debe distinguir varias corridas de la misma fecha y un mismo legajo en más de un tipo: no deduplicar por legajo solo ni propagar el cierre de una corrida a todo el mes. El extractor vigente exige una sola cohorte de `histolegajo` y un estado de cierre uniforme en la fecha actual; un origen que no cumpla esas condiciones requiere adaptación del contrato y sus consumidores, no desactivar controles ni usar modo fixture. Ningún respaldo debe sobrescribir operaciones nativas, expedientes, novedades, permisos ni marcaciones. PM10 permanece como dispositivo de la flota compartida; esta entrega no cambia su recepción ni mueve servicios.

## Verificación reproducible

- `node --test tests/payroll-document-library*.test.js`
- `node scripts/verify-document-library-pagination.mjs`: 1.000 documentos sintéticos, 42 páginas, cobertura sin duplicados, filtros, actualización, foco, exportación pendiente y móvil.
- `node scripts/verify-payroll-document-library-browser.mjs`: recorridos existentes y descargas reales PDF/XLSX con datos sintéticos.
- `npm run build`: runtime fijado en `.nvmrc`, pruebas completas y compilación.

CI, promoción a `master`, despliegue y comprobación de los archivos servidos se informan por separado. Ninguna prueba de navegador sintética representa una sesión municipal real.
