# B2.1 · eventos de ausencia que cruzan el período

## Base y necesidad operativa

Se continúa desde GitHub y la producción verificada `814cb372bfa04d1d6d1d0e4eba7e538f753ee0bd`, conservando el cierre de identidad del preparte. Los cambios del paquete sucesor de otro árbol se dejaron intactos.

El historial consultaba sólo eventos cuya fecha inicial estaba dentro del período. Se agrega una consulta explícita para encontrar eventos que comenzaron antes y cuyo fin de origen alcanza la ventana. Es una ampliación de lectura, no una regla de licencias o de pago atribuida a los documentos de Noelia.

## Recorrido y semántica

Ausentismo → Ver caso → Ver historial de ausencias → Criterio de fechas.

**Comienzan en el período** conserva el comportamiento y respuesta v1. **Cruzan el período** incluye inicios de la ventana y eventos anteriores cuyo fin informado alcanza su primer día. Los límites son inclusivos. Se conserva el contrato exacto del agente y la fuente autorizada.

Sin fecha final o con fechas invertidas, sólo se incluye el evento si su inicio está dentro del período. No se supone continuidad indefinida. Un fin extenso, como 2033, se conserva y señala para revisión; no se valida ni corrige su duración.

Las fechas de consulta se acotan al corte de la fuente. Las fechas originales y las cantidades completas no se recortan ni prorratean. La suma no equivale a jornadas perdidas, licencia aprobada o descuento salarial. La fuente no certifica cobertura completa de asistencia.

## Contrato y operación

El parámetro opcional `rangeMode=starts|overlaps` del recurso existente `absenceperson` devuelve `absence-person.v2`. Sin el parámetro se mantiene v1. No se añaden endpoints, permisos ni migraciones. Filas, cantidad y resumen individual comparten un predicado SQL fijo con fechas, compañía y legajo parametrizados. Los gráficos del ausentismo general siguen contando inicios.

La tabla agrega Comenzó antes / Comienza dentro y mantiene 25 filas por página. Los totales se calculan antes de paginar; el panel distingue eventos anteriores y eventos incluidos sin fin informado. Cambiar el criterio retira los resultados anteriores; cancelar, perder el permiso o cambiar de fuente no deja datos parciales. Cerrar restaura el contexto y los borradores del listado.

## Verificación y límites

Se agregaron 42 pruebas y seis recorridos al navegador existente. Incluyen límites inclusivos, año bisiesto, intervalos sin fin/invertidos, cantidades no prorrateadas, SQL común, paginación completa, conflictos de fuente y revocación. El escenario sintético compara 10 inicios con 40 eventos que cruzan el rango, conservando sus cantidades y 30 fechas anteriores. No representa cifras municipales.

La prueba SQL generada usa exclusivamente `payroll_selection_qa`, tablas y funciones temporales, nueve controles y rollback. La ejecución local en PostgreSQL 17 terminó con los nueve controles aprobados y ROLLBACK. El CI repite esa prueba en su contenedor desechable. El build local integrado con la base remota 6478f9a aprobó 5.084 pruebas, cero fallos y dos omitidas; la publicación y los totales del CI final se verifican por separado.

Este cierre B2.1 es de consulta, no resolución administrativa. No justificó faltas, no modificó haberes, no incorporó otros relojes ni promovió el respaldo del 22/09. Reglas, aprobación, novedades definitivas y aceptación de Noelia/Hugo siguen separadas. El expediente de proveedores permanece diferido hasta la autonomía G-AUT-01.


Se rebasó el incremento sobre `6478f9abdf61e4da133fac06f6c6171dc1bb92d8`, preservando el constructor de los diez dominios del paquete sucesor publicado en paralelo. La regresión de navegador integrada aprobó 32 recorridos con APIs sintéticas, seis específicos de este criterio. La publicación se acredita por su commit y no supone aceptación de Noelia/Hugo con datos reales.
