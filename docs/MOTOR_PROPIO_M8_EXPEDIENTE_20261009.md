# M8-03 · Informe de liquidación para expediente de sueldos

En **Nómina → Reportes → Consultar liquidaciones propias**, elegir meses y tipos, consultar y seleccionar **Informe para expediente de sueldos**. La agrupación admite convenio/repartición, convenio, repartición, jurisdicción o todo el alcance elegido. Los rangos inclusivos y los contratos exactos gobiernan tanto la pantalla como las descargas; la búsqueda y la página sólo modifican la vista.

Continúa el pedido de la página 4 del módulo 8 de Noelia: resumen para la primera hoja del expediente y control con estadísticas de conceptos. Fuente privada de nueve páginas, SHA-256 `3eafe9bf6f3190a8aebf2cadab77b2507c285c6c08035d5c1e360aa6b9951ec2`. El original permanece fuera de Git, CI y Vercel. Este incremento no copia un documento institucional ni acredita aprobación de Noelia.

## Conciliación y cobertura

El informe toma exclusivamente grupos propios actualmente cerrados, con sus cantidades, dimensiones e importes originales verificados. Para cada alcance suma por separado remunerativo, no remunerativo, retenciones y aportes patronales de los conceptos conservados. Compara esas sumas y el bruto/neto resultante con los seis totales del mismo conjunto de participaciones. Los auxiliares quedan fuera de los haberes y los aportes patronales no se descuentan del neto. No evalúa nuevamente ninguna fórmula salarial.

Los seis controles muestran total cerrado, suma desde conceptos y diferencia exacta. Se conserva la precisión original, hasta ocho decimales, mediante la aritmética exacta existente, sin convertir importes a números de planilla. Un concepto alterado o una conciliación contradictoria bloquea la generación; no se descarga un subconjunto que parezca correcto.

Se distinguen grupos que aportan al alcance, grupos cuyo cierre original es parcial, grupos reducidos por filtros explícitos y períodos/tipos solicitados sin grupo cerrado. Sin participaciones, los importes permanecen ausentes; no se presume cero. Incluso con diferencia cero, el documento no certifica por sí solo la cobertura de toda la nómina municipal.

Convenio, repartición y jurisdicción proceden del cierre original. Se mantienen separados 42, 55, jurisdicción sin informar y jurisdicción no capturada. El control existente rechaza filtrar 42/55 si el conjunto contiene jurisdicciones desconocidas; nunca las completa desde el padrón actual ni las omite silenciosamente. Cada contrato, mes y tipo conserva su participación; contratos distintos y participaciones no se presentan como el mismo conteo.

## Descargas y sesión

- **PDF:** primera hoja A4 vertical con alcance, seis conciliaciones y cobertura; después, detalle agrupado completo y notas de procedencia. Una capacidad o un carácter no admitido se informa explícitamente, conservando Excel/CSV como opciones.
- **Excel:** mantiene Datos, Totales y Control, y agrega Expediente y Conciliación. Importes exactos como texto; sólo los conteos existentes pueden utilizar fórmulas de planilla.
- **CSV:** contiene todas las filas agrupadas del alcance elegido; no agrega la carátula. UTF-8 con BOM, CRLF, campos entre comillas y neutralización de fórmulas.

La descarga es voluntaria y vuelve a consultar todas las fuentes y la autorización antes de guardar. Un cambio de tarea, alcance, cierre, cuenta, visibilidad o permisos cancela el archivo pendiente y retira la revisión anterior. No se persiste el informe en localStorage. La interfaz móvil contiene las tablas desplazables y conserva controles accesibles.

Se reutilizan las fachadas privadas GET existentes. No agrega API, migración, permisos, guardado, cálculo, anulación, confirmación, imputación, firma o pago. No crea un expediente administrativo ni emite un recibo de M9. Las firmas de Hugo/Noelia y la operación de los relojes continúan en sus frentes separados.

## Verificación y estado

Regresión sintética: meses/tipos, grupos parciales, contratos exactos y rangos, jurisdicciones, ausencia distinta de cero, ocho decimales, conceptos alterados, conciliación contradictoria, 31 reparticiones y descargas completas. El recorrido del producto construido usa Chrome y las fachadas HTTP/SQL reales sobre PostgreSQL local 17/18, con COMMIT sintético y retiro posterior del esquema. Conserva los controles anteriores de variables, reapertura, respuestas tardías, revocación SQL y cero POST de negocio desde el navegador.

Implementación, pruebas, publicación y aceptación se acreditan por separado en `verification/CODEX_OWN_REPORT_STATEMENT_RESULT_20261009.md`. La aceptación municipal del formato, las planillas institucionales M8-04, sus firmas y otros pendientes de los diez módulos siguen abiertos. Este incremento no acredita autonomía integral.
