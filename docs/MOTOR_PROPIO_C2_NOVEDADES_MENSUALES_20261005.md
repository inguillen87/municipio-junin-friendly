# C2 · novedades mensuales aprobadas del padrón propio

Continuación de [captura y resultado propio123](MOTOR_PROPIO_C2_CAPTURA_Y_RESULTADO_20261005.md). El motor sigue en desarrollo local. Esta corrección no acredita instalación productiva, homologación municipal, aprobación de haberes ni pago.

## Problema y comportamiento

Un empleado registrado sólo en MuniControl puede preparar y obtener revisión independiente de su novedad mensual por las fachadas101 publicadas. El escritor conserva una advertencia no bloqueante `concept_not_observed`: ese concepto nunca se observó en movimientos históricos de GRH. El adaptador de cálculo exigía una lista de incidencias vacía y rechazaba también esa advertencia, aunque el catálogo salarial propio y su programa ya estaban aprobados.

El adaptador admite exclusivamente esa observación, con su código, severidad, indicador no bloqueante, campo y base originales. Sigue exigiendo identidad actual, catálogo/programa propios compatibles y aprobados, definición que cubra toda la vigencia, reglas que traten cada novedad, unidades y combinación expresas. No elimina la advertencia: forma parte de la captura y del hash de las fuentes. Cualquier error, incidencia bloqueante, advertencia desconocida o centro/tipo de movimiento sin homologar detiene el conjunto. Tampoco se aceptan ajustes anteriores, modo forzado o prorrateo sin una política expresa.

No cambia el escritor101, su exportador, las transiciones administrativas, las capacidades municipales ni SQL122/123. Las capturas pendientes conservan su algoritmo original: no se recalculan automáticamente después de esta corrección. Los resultados ya guardados se recuperan con sus fuentes originales.

## Prueba de integración

La composición mensual opcional instala los scripts originales026/029/032/097/101 en el esquema sintético, antes de las adaptaciones104/110. Conserva las648 regresiones anteriores y los controles originales de instalación, sesión, identidad, autoridad, revisión independiente, inmutabilidad, cantidad e idempotencia. La composición original de novedades fijas sigue disponible.

El caso crea un empleado propio, prepara dos lotes individuales con importes sintéticos de20,00 y0,25, los presenta y obtiene aprobación de otra persona. No inserta ese empleado ni sus movimientos en GRH. Captura ambos lotes y las dos advertencias; la entrada usa20,25 con suma explícita. El verificador externo vuelve a construir toda la entrada y las seis filas del resultado con el adaptador y motor reales, y compara los hashes contra PostgreSQL. Las fórmulas y los importes son inventados para QA; no representan una norma municipal.

Las pruebas SQL de esta composición terminan conROLLBACK. La recuperación dentro de esa transacción no demuestra durabilidad trasCOMMIT ni concurrencia de conexiones independientes. El navegador prueba el contrato del resultado, no una pantalla operativa del producto. Los resultados ejecutados y sus logs están en `verification/CODEX_OWN_MONTHLY_RESULT_20261005.md`.

## Siguiente cierre de C2

1. Sembrar el circuito real en PostgreSQL aislado y comprobarCOMMIT, recuperación desde otra conexión, concurrencia y reintentos por la API real.
2. Completar preparación/consulta de la corrida en la UI municipal y validar escritorio, móvil, permisos y revocación sin persistir datos nominales en el navegador.
3. Auditar y revisar instalación de122/123, empaquetado del algoritmo y candidato de publicación; verificar conservación y durabilidad antes de producción.
4. Homologar las reglas municipales con Noelia y completar versiones, anulación/confirmación/cierre propios y recibos/planillas/informes. El cálculo técnico actual no sustituye esas decisiones.

Los demás cierres del [plan](PLAN_CIERRES_MUNICONTROL_20260930.md), OSEP,95, relojes físicos/cloud y los pedidos de Hugo, Mariano y Marcelo permanecen vigentes. Los borradores rechazados y la operación de firmas siguen excluidos de este frente.
