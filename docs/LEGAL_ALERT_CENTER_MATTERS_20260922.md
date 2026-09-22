# Centro de Alertas: asuntos y coordinación registrada

El Centro de Alertas reúne los asuntos jurídicos, los seguimientos normativos y las obligaciones contractuales. Permite buscar por área, responsable y siguiente acción, y abrir el recurso exacto para continuar su gestión.

Los asuntos asignados, en revisión, devueltos, respondidos y revisados siguen pendientes. Sólo cerrados y cancelados salen de las categorías de fechas pendientes. Los estados de obligaciones mantienen su clasificación anterior: no equivalen a una certificación automática de cumplimiento. Una fecha pasada describe lo registrado; no determina vencimiento legal, mora ni incumplimiento.

## Contrato y permisos

- La migración `100` añade exclusivamente `legal_alert_center_v2(jsonb)`, su permiso de ejecución y comentario. Conserva `089` y la fachada v1 para clientes anteriores.
- La nueva pantalla solicita explícitamente `resource=alerts&version=2`. No degrada silenciosamente a v1 si la nueva consulta falla. Consultas duplicadas, ambiguas o con contexto externo se rechazan.
- Cada fila conserva la versión normativa o contractual que dio origen al recurso. Los asuntos enlazan por su identificador exacto.
- La coordinación muestra el responsable y la siguiente acción de su último registro. Si el seguimiento cambió desde esa coordinación, la pantalla pide revisarla sin reasignar ni modificar datos.
- La habilitación del responsable se consulta con el control existente de `081`. Si perdió habilitación, se informa sin borrar la asignación histórica. Su cambio modifica la revisión del resultado.
- La consulta exige sesión gestionada, pertenencia vigente y `legal.norm.read` mediante el contexto existente de `069`. No devuelve historial privado, actores, documentos ni evidencia.
- La revocación de acceso oculta resultados, filtros y contadores, incluso ante una respuesta que llega después. Una actualización fallida elimina los datos anteriores.
- La búsqueda y los contadores trabajan sobre toda la población; las páginas muestran 25 filas. Más de 1.500 filas o 2 MB de contenido SQL se rechazan sin truncar resultados.

## Validación previa a publicar

- Compilación completa local: 4.352 pruebas correctas, cero fallidas y dos omitidas por requerir artefactos privados.
- API y modelo: 26 pruebas, incluidas compatibilidad v1, contrato v2, parámetros estrictos y revocación.
- Navegador: 17 grupos de comprobaciones; escritorio de 1.440 px y móviles de 390/320 px, tres fuentes, filtros, paginación, responsables y respuestas tardías.
- PostgreSQL 17 local: 81 comprobaciones y reversión completa de la transacción. Usa el contexto `069`, el control de responsable `081`, tablas, restricciones, disparadores y fachadas reales. Las filas de IAM, el resolvedor de capacidades y el interruptor de separación de funciones son apoyos sintéticos declarados; no certifican una sesión municipal real.
- El workflow `Legal alert center release` ejecuta compilación, navegador y SQL en PostgreSQL 17 y 18 para el mismo commit.

Las pruebas de navegador interceptan las API privadas, también cuando verifican los archivos publicados. Sus resultados certifican el comportamiento de la interfaz con respuestas controladas, no una lectura autenticada de datos municipales.

## Instalación y cierre

El orden de publicación es: CI verde del commit exacto, instalación de `100` en PG18 y PG17, comprobación independiente de cuerpos y permisos, promoción del mismo commit a master, Vercel correcto y comparación de archivos servidos. Los recibos de instalación y despliegue se conservan fuera del repositorio y se generan al completar esos pasos; este documento no adelanta su resultado.

La instalación conserva las conexiones y los planes existentes. Los datos de prueba se limitan a transacciones locales o de CI que se revierten y a respuestas de navegador interceptadas. Esta fase no crea registros municipales, envía notificaciones ni cambia estados de negocio. La aceptación del recorrido privado requiere una sesión municipal válida y se registra por separado.
