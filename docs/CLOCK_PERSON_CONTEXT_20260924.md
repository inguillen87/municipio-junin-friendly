# Jornadas: período del vínculo sin salir del espacio de trabajo

## Base y alcance

Continúa desde `09ee30f`, que ya publicó la central de recepción compuesta. Este incremento no vuelve a implementar esa central ni presenta como incorporados los archivos originales de los otros cinco equipos.

Cierra un recorrido de consulta: desde una jornada nominal autorizada, abrir todos los días del vínculo seleccionado dentro del punto y período actuales; revisar tiempos e incidencias, filtrar y exportar; regresar a la página anterior sin perder la búsqueda que aún no se había aplicado. El legajo general deja de ser un paso necesario para esta tarea.

## Identidad exacta, no búsqueda por nombre

El enlace usa una referencia calculada en servidor, ligada al municipio, punto, revisión de la fuente y secuencia de identidad/equipo/contrato. No se usa el texto del nombre ni el número de legajo como una búsqueda aproximada para componer el resultado. Dos contratos o equipos distintos no se fusionan aunque tengan nombres o números coincidentes.

La referencia es un identificador de consulta, no una credencial. Se conserva la validación real de sesión, municipio y `attendance.read` de la fachada SQL existente. Consultar el contexto nominal requiere además el permiso nominal devuelto por esa fachada. Las lecturas seudonimizadas no reciben estas referencias y no habilitan el botón.

La consulta `clock-workdays-v2` admite `context=person` y, al seleccionar un vínculo, `personRef` junto con `snapshot`. Una referencia inválida o sin corte se rechaza antes de consultar SQL. Otra revisión, un vínculo que ya no aparece o un cambio de autorización no se convierten en un cero silencioso ni en datos de otra persona.

## Qué ocurre en la interfaz

- **Ver período del agente:** aparece junto a la persona en una jornada con vínculo y permiso nominal. Mantiene punto y fechas; limpia únicamente los filtros internos de Jornadas para mostrar el contexto completo del vínculo.
- **Métricas y revisión:** los totales, causas, filas y tiempos corresponden a todo el filtro individual antes de paginar. El tablero superior de marcaciones conserva su alcance general y se aclara esa diferencia.
- **Volver al listado de jornadas:** recupera página, búsqueda aplicada, estado, causa y texto de búsqueda sin aplicar. Restaura foco y posición de lectura; no abre otra página de legajos.
- **Exportaciones:** CSV y Excel conservan la referencia y el alcance del vínculo, además del corte y la evidencia originales. Se exporta todo el filtro, no sólo la página visible; no se alteran las duraciones.
- **Actualización:** la consulta automática del tablero no interrumpe la vista individual. Actualizar el corte, cambiar punto/período, salir o perder el permiso nominal retira el contexto anterior.

La reconstrucción sigue ocurriendo sobre la ventana completa con días adyacentes, antes de filtrar persona, estado, causa o página. Esto conserva entradas, salidas, pausas y cruces de fecha; no completa marcas faltantes ni aprueba tiempo extra.

## Compatibilidad y verificación

No requiere una migración, un rol nuevo, cambio de plan pago, nueva base, modificación del reloj o reimportación. La respuesta histórica v1 y las consultas v2 sin contexto conservan su forma anterior. Una interfaz durante un despliegue progresivo puede omitir el botón si su servidor aún no devuelve la extensión; una consulta individual explícita, en cambio, exige comprobar la referencia de respuesta.

Pruebas específicas: identidad igual en treinta fechas, contrato distinto, equipo distinto, municipio/punto/revisión distintos; paginación 25+5; referencia desconocida o no fijada; permiso nominal ausente; respuesta mezclada; CSV y Excel con alcance individual. Se amplía el verificador de navegador existente, sin crear otro servidor o consultar cuentas municipales reales.

## Límites y siguiente cierre

El alcance es el vínculo de una identidad en un equipo y punto, no una consolidación automática de todos los contratos y relojes de una persona civil. Esa consolidación requiere el vínculo temporal y la conciliación pendiente. El historial completo de ausencias por contrato tampoco se declara implementado por esta entrega: Ausentismo conserva el caso en línea y las mejoras del sprint anterior.

Se mantienen como prioritarios: incorporar y conciliar los originales pendientes de los demás equipos; cerrar calendarios/turnos, licencias, decisiones y entrega aprobada a Noelia; completar la fuente sucesora del 22/09; y comprobar el colector en un host municipal independiente de la PC personal. Esta entrega no cambia nómina, contratos, permisos, firmas ni fuentes publicadas.

Los documentos de Noelia siguen separados por su función: el módulo 9 pide recibos por rangos, período, fecha de pago, tipo, PDF, firma digital y acceso individual; el módulo 10 exige cargos liquidados contra los presupuestados del año y reporte detallado. La estructura del 23/09 mantiene sus legajos y jerarquía. Un filtro individual de asistencia no emite recibos ni demuestra esa conciliación presupuestaria.

La publicación se acredita por el commit, CI y despliegue verificados en el recibo de entrega. Las respuestas sintéticas de navegador prueban el recorrido y las negativas; no sustituyen la operación con las cuentas reales ni una aprobación municipal.
