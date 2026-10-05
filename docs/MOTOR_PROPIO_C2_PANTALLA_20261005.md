# C2 · pantalla de cálculo, recuperación y detalle propios

Implementado y probado localmente sobre el paquete construido. Sin instalación productiva, publicación ni aceptación municipal.

La tarea **Calcular**, dentro de Nómina (`/nomina#calculo`), conecta la API de captura/resultado123 con una pantalla de producto. El período, tipo y alcance se eligen expresamente. La búsqueda de legajos conserva el selector existente y admite sólo altas propias de MuniControl; las reparticiones y convenios provienen del catálogo103. También permite seleccionar el conjunto completo de legajos propios elegibles. Una búsqueda o página de consulta nunca define la población del cálculo.

El operador revisa el alcance y solicita calcular voluntariamente. El servidor verifica fuentes, permisos y programa aprobado; la pantalla no admite reglas ni importes aportados desde el formulario. La captura, el cálculo exacto y el resultado se guardan mediante las fachadas existentes. Cada reintento conserva cuerpo y clave originales. Una respuesta desconocida bloquea la edición y permite consultar o reintentar ese mismo envío; no inicia una corrida nueva. Sólo una ausencia comprobada por GET permite revisar una preparación no registrada.

El resultado presenta totales por legajo y conceptos, búsqueda, páginas y versiones de fuentes. La descarga CSV voluntaria incluye todas las filas guardadas, aunque exista búsqueda o paginación. Conserva los decimales exactos, neutraliza fórmulas de planilla y no exporta UUID ni nombres. Es una descarga nominal autorizada de cálculo, distinta del reporte no nominal del importador. El resultado continúa pendiente de confirmación y cierre: no es recibo, contabilización ni pago.

Consultar una corrida o actualizar acceso no calcula. El historial diferencia alcance y fecha. Al ocultar la página, cambiar de tarea, cerrar sesión o retirar permisos se eliminan las vistas nominales y se cancelan las respuestas tardías. Un intento pendiente conserva únicamente en memoria su identidad y contenido originales; no se persiste en localStorage/sessionStorage. Se revalida la sesión y el acceso SQL antes de recuperar o descargar. Otra sesión no reenvía el intento anterior. Una respuesta200 con sesión vencida también retira los datos.

La pantalla tiene etiquetas, navegación por teclado, estado anunciado, tablas desplazables accesibles y controles de al menos44px. Los siete archivos necesarios para sus módulos y estilos se incorporan a la lista explícita del build. El workflow existente conserva sus regresiones SQL y agrega modelo, build y navegador sobre el paquete público en PG17/PG18.

## Evidencia y límites

El navegador ejecuta la página real construida, los handlers reales de corrida y catálogo, el motor y SQL con COMMIT en PostgreSQL aislado. Usa un empleado que existe sólo en MuniControl, programa aprobado y dos novedades mensuales aprobadas mediante los escritores completos. El gateway de autenticación, la proyección del buscador y la indisponibilidad del tablero histórico son fixtures declarados; no se acredita el gateway municipal completo ni se envían datos reales.

Las pruebas cubren los tres alcances ejecutados, CSV completo con filtro, respuesta perdida después del COMMIT, mismo cuerpo/clave pese a edición forzada, tres resultados para cuatro POST, ocultamiento, respuesta tardía, escritorio/móvil, revocación SQL efectiva y cambio/vencimiento de sesión. El resultado y las fallas iniciales se registran en `verification/CODEX_OWN_RUN_UI_RESULT_20261005.md`.

Siguen pendientes la pantalla de autoría/aprobación de programas, homologación normativa, auditoría e instalación de122/123, CI remoto y publicación. Después corresponde completar anulación/recalculo/confirmación/cierre propios, recibos e informes, masivas/OSEP e imputación/cargos anuales. Los diez módulos y los requerimientos de Hugo, Mariano, Marcelo y empleados conservan su alcance. Las fichadas reales diarias constituyen la fuente de asistencia; resta contrastar su recepción actual y completar el circuito de reglas, revisión y entrega a novedades. Esta pantalla no certifica autonomía de relojes ni resuelve el límite500 de otros escritores.
