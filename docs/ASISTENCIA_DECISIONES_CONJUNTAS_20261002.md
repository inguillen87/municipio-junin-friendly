# Asistencia · revisión conjunta de asignaciones

En **Tiempo y asistencia → Catálogo de asistencia**, filtrar asignaciones en borrador para enviar a revisión, o en revisión para aprobar/rechazar. Seleccionar las necesarias individualmente o con **Seleccionar asignaciones de esta página**. Cambiar de página o filtro conserva la selección completa. El límite es cien asignaciones; una página que lo exceda se rechaza entera, sin recorte. Contratos distintos no se deduplican por compartir legajo.

**Revisar selección** permite elegir la acción y su fundamento. **Comparar decisiones** reconsulta el acceso y cada asignación. Todavía no escribe. La comparación muestra todos los destinatarios, fechas, revisiones/versiones y las configuraciones completas de turno, calendario y reglas; los valores exactos y sus unidades se conservan. Una configuración compartida se muestra una vez y cada asignación indica su referencia dentro de la comparación.

Después de comparar, revisar el conjunto completo y marcar la confirmación. Cambiar acción o fundamento retira la comparación. Enviar a revisión usa el permiso de proponer; aprobar o rechazar exige el permiso existente de aprobar y la separación de funciones del servidor. La aprobación declara revisión manual de la documentación municipal autorizada. Seleccionar un conjunto no concede permisos ni permite autoaprobarlo.

Cada decisión utiliza un comando individual existente, con su versión esperada y clave de reintento. Antes de cada envío se verifican nuevamente acceso, contrato y configuraciones. Si algo cambia, se detienen las siguientes. Después del acuse se consulta el vínculo. El resultado distingue decisiones confirmadas, vínculos pendientes y asignaciones sin enviar. **Detener próximas decisiones** permite concluir sólo el envío ya iniciado. Las decisiones confirmadas se conservan; las demás requieren otra revisión voluntaria.

Un acuse incierto bloquea nuevas escrituras. Ocultar la página o retirar el acceso elimina selección, identidades, fundamento y resultados visibles. Sólo se conserva en memoria el cuerpo y la clave del envío ya iniciado. Para recuperar su comprobante se exige el mismo acceso original y una consulta nueva de esa asignación; el operador reintenta explícitamente. No se reanudan las otras decisiones. Recargar por completo pierde esa memoria; corresponde consultar el estado antes de proponer otra operación. No se persiste información en el navegador ni se incorpora otra API.

Este circuito termina la revisión de configuraciones, sobre SQL116 ya instalada. No calcula minutos, pausas ni horas extra, no liquida haberes y no homologa reglas municipales. El evaluador y la aceptación física/cloud de los relojes mantienen sus pendientes separados.

## Verificación

Fixtures sintéticos comprueban26 asignaciones en dos páginas, filtro sin filas que conserva las26, comparación sin escrituras y confirmación voluntaria. Otro actor aprueba las26; se prueba también rechazo, cambio de configuración antes del envío, detención, acuse incierto, revocación, ocultamiento y recuperación exacta sin decidir por los demás. Se conserva el recorrido individual y la preparación anterior, además de controles de accesibilidad y ancho390/320px.

PostgreSQL17/18 descartables verifican el circuito real de comandos sobre dos contratos creados únicamente en MuniControl: envío, revisión independiente, aprobación, vínculos y reintentos sin duplicación. Otro borrador se rechaza explícitamente y se recupera sin un segundo evento. La conservación del padrón y el rollback forman parte de la regresión. Pruebas y publicación se acreditan en el resultado del incremento; no equivalen a aceptación municipal.
