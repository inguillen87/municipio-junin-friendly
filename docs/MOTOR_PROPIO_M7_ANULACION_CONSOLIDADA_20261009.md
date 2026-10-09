# M7: anulación por período y tipo

En Nómina → **Anular período**, el revisor consulta todas las corridas propias calculadas del período y tipo elegidos. Selecciona legajos, reparticiones, convenios o todos los legajos actualmente confirmados. Búsqueda y páginas sólo filtran la revisión visible; el comando conserva el conjunto completo y sus totales exactos.

Una única decisión registra, dentro de una transacción, los eventos individuales de todas las corridas afectadas y su comprobante consolidado. Conserva cada captura, fecha declarada, resultado, importe y decisión anterior. Las preparaciones sin confirmar y las versiones ya anuladas permanecen en el historial. No se presentan como liquidaciones vigentes ni se convierten en ceros.

Un legajo cerrado requiere reapertura. Falta de revisión independiente, destinos repetidos, selección inexistente, cambio de versión o exceso de capacidad impiden la decisión completa. No se omiten destinos ni se divide silenciosamente una anulación. Se mantienen las capacidades nominales y la autoridad de aprobación existentes; no se asignan permisos nuevos a personas.

El comprobante enlaza los eventos originales. Una respuesta incierta conserva cuerpo, clave y pares revisados en memoria: se consulta o reintenta el mismo envío. Al ocultar la página, cambiar de tarea, cerrar sesión o revocarse permisos, se retiran las vistas nominales. No hay almacenamiento local de la revisión.

**Preparar nueva liquidación** requiere una acción adicional y una consulta fresca del comprobante y de los estados. Conserva los contratos exactos. Si las corridas originales tenían distintas fechas declaradas, ofrece grupos explícitos por fecha; una fecha histórica ausente debe declararse en Calcular. No inicia un cálculo ni modifica un intento pendiente. Calcular sigue requiriendo revisión expresa de período, fecha, tipo, alcance, programa y novedades.

SQL146 añade una tabla vacía y cinco funciones, tres de ellas fachadas privadas. No reemplaza funciones anteriores, calcula haberes, modifica empleados, cierra, contabiliza ni paga. La instalación se revisa contra la composición publicada y verifica conservación y durabilidad. Las pruebas de escritura utilizan únicamente PostgreSQL local o servicios efímeros de CI con actores y contratos sintéticos.

Este incremento completa el alcance técnico de anular sobre varias corridas. La aceptación municipal, la adopción del padrón real y la homologación de reglas salariales siguen siendo condiciones separadas. No acredita la autonomía integral de los diez módulos, los relojes ni la presentación fiscal.
