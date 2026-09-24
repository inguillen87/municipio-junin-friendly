# Ausentismo · historial por vínculo sin abandonar el contexto

## Incremento funcional

Desde **Ausentismo → Ver caso → Ver historial de ausencias** se abre una ventana de consulta del vínculo canónico seleccionado. Reutiliza la capacidad `absence.nominal.read` del listado; no otorga acceso por tener permiso de relojes. Consulta todos los motivos de ese vínculo dentro de las fechas aplicadas, independientemente del motivo o borrador de búsqueda del listado general.

El usuario puede consultar otro período dentro de la misma ventana y volver a las fechas iniciales. Se presentan eventos, suma de días efectivamente informados, cantidad de motivos y rangos de fecha que requieren revisión. Las métricas corresponden al período entero; la tabla se pagina en servidor de 25 filas por vez. Un registro con cantidad nula sigue como no informado, no como cero.

El período conserva la semántica previa: incluye eventos cuya fecha inicial cae dentro del rango; no calcula intersección diaria con licencias prolongadas ni días laborables perdidos. Los motivos se muestran como etiquetas administrativas de origen, sin observaciones libres, diagnósticos, documentos de identidad ni datos de contacto.

**Cerrar historial**, Escape, salir de la página o cambiar el contexto elimina el contenido de la ventana. Al cerrar normalmente, el foco vuelve al botón que la abrió, sin modificar la página, los filtros o la búsqueda sin aplicar de Ausentismo. Cancelar una consulta invalida las respuestas tardías.

## Fuente e identidad

El recurso `absenceperson` exige UUID de contrato y fechas civiles; valida página y tamaño, con valores iniciales de 1 y 25. No resuelve una persona por nombre ni mezcla contratos que comparten legajo. Verifica compañía, base de origen y pertenencia al lote efectivo. Cada evento devuelto debe corresponder al vínculo y legajo exactos.

La respuesta se vincula a la revisión efectiva de la fuente mediante el mecanismo existente de lectura certificada. El listado entrega esa referencia al abrir el historial; las páginas siguientes deben conservarla. Antes y después de ensamblar la respuesta se comprueba la misma fuente. Si cambia, la consulta falla sin devolver un resultado mezclado o un cero que parezca válido.

La ventana retira la identidad y las filas anteriores cuando recibe denegación de acceso. Las fechas futuras se limitan al corte disponible y se explicita el ajuste; los rangos sin intersección no se reinterpretan como asistencia completa.

## Navegación desde Relojes

En el tablero se agrega **Ausentismo general del período**, que abre otra pestaña con únicamente las fechas seleccionadas. Mantiene la jornada y filtros de Relojes en la pestaña original. Es una navegación general, no un cruce automático entre identidad del reloj y contrato ni una correlación de ausencia con marcaciones.

## Pruebas y publicación

`tests/absence-person.test.js`: 25 comprobaciones del recurso y contrato, incluyendo identificadores inválidos, huella cambiada, vínculos inexistentes/ambiguos, filas de otro contrato, metadatos inconsistentes y cantidades ausentes.

`verify-time-absence-workspace-browser.mjs`: 26 recorridos en total, incluidos los controles anteriores de jornadas y los nuevos casos de historial. La muestra sintética tiene 61 eventos repartidos en tres páginas; las métricas mantienen su total, los borradores sobreviven al cierre y las respuestas tardías no restauran información retirada. El modo de publicación coteja los bytes reales de los archivos y usa respuestas API sintéticas.

La compilación local del incremento terminó con 4.826 pruebas aprobadas, cero fallos y dos omitidas. La ejecución de CI y la publicación se acreditan por separado con el commit desplegado. No se probó una sesión real de Noelia ni Hugo ni se presenta la muestra sintética como evidencia municipal.

## Límites y siguientes cierres

Esta entrega agrega consulta, no decisiones administrativas: no justifica ausencias, no modifica sus fechas, no define turnos, no aprueba horas extra y no genera novedades salariales. No incorpora el respaldo del 22/09, ni los archivos pendientes de otros relojes, ni el circuito de recibos firmados. No se agregan permisos o migraciones.

Queda completada la consulta individual por vínculo y período dentro de Ausentismo. El cruce exacto entre una identidad del reloj y este historial sigue requiriendo la vinculación autorizada; el acceso desde Relojes conserva sólo fechas y se identifica como general. La resolución de casos, reglas vigentes, aprobaciones independientes y su entrega a novedades permanecen en el plan de operación.

Los siguientes cierres se mantienen en `PLAN_TIEMPO_AUSENTISMO_OPERACION_20260924.md`. Los requisitos documentales de Noelia para recibos y cargos presupuestados no se sustituyen por esta pantalla de historial.
