# Asistencia · preparar asignaciones para varios contratos

En **Tiempo y asistencia → Catálogo de asistencia**, preparar una asignación y marcar **Preparar para varios contratos**. Buscar contratos, seleccionar individualmente o seleccionar la página visible, avanzar y continuar la selección. Una búsqueda posterior conserva los contratos elegidos de otras páginas. **Quitar esta página** retira sólo los contratos de esa página; cada destinatario seleccionado también puede quitarse individualmente.

Se eligen explícitamente las fechas de vigencia, el código común, el nombre y respaldo de la configuración, y las revisiones aprobadas de turno, calendario y reglas. Las tres deben cubrir toda la vigencia y usar la zona municipal. La selección admite de uno a cien contratos y el código común hasta47 caracteres; cada contrato recibe su código estable independiente. Superar la cantidad rechaza el conjunto sin recortarlo ni seleccionar parcialmente una página. No se deduplican contratos distintos por compartir legajo.

**Revisar asignaciones** muestra todos los destinatarios, fechas y las tres configuraciones. Todavía no guarda. Para guardar, revisar el conjunto completo, marcar la confirmación y pulsar **Crear borradores revisados**. Cambiar un campo o destinatario retira esa comparación y exige revisar nuevamente.

El proceso reconsulta el acceso y las tres configuraciones antes de cada envío. Crea un borrador por contrato usando el escritor existente de SQL116; cada acuse se comprueba y el vínculo se consulta de nuevo. El resultado enumera todos los contratos, con borradores registrados, vínculos pendientes de consulta y contratos sin enviar. Una falla o un cambio detiene los siguientes. **Detener próximos envíos** permite terminar únicamente el envío ya iniciado; los borradores confirmados se conservan. No hay transacción masiva ni aprobación automática.

Si no llega el acuse, queda bloqueado un nuevo guardado. Ocultar/cerrar la página o retirar el acceso elimina las identidades, selección y resultados visibles. Sólo el intento ya enviado permanece en memoria: después de verificar el mismo acceso original, su recuperación voluntaria conserva exactamente cuerpo y clave. No reanuda los otros destinatarios. Al recargar completamente el documento esa memoria se pierde; corresponde consultar los borradores antes de preparar otra operación. No se usa almacenamiento del navegador ni otra API de escritura.

Cada borrador continúa después por revisión y aprobación independientes. Preparar estas asignaciones no activa horarios, evalúa marcas, reconoce horas extras ni entrega novedades salariales. No sustituye la homologación municipal de reglas ni la aceptación física de los relojes. No incorpora migraciones, cambios de permisos o reconstrucción de evaluadores rechazados. Los contratos propios pueden participar sin existir en GRH.

## Verificación y cierre

Los fixtures son sintéticos: selección21 en dos páginas conservada al filtrar una fila, comparación sin escritura,21 borradores separados con vínculo consultado, pausa voluntaria, cambio de dependencia después del primer envío, revocación, ocultamiento y recuperación exacta. Se conservan los recorridos previos y se comprueba móvil390/320px, controles de44px, ausencia de solicitudes externas, persistencia local y errores de navegador.

La regresión PostgreSQL17/18 usa comandos reales existentes sobre dos contratos creados sólo en MuniControl y confirma códigos distintos, vínculos, estado borrador, permisos de revisión, dos eventos pese a los reintentos y conservación del padrón canónico. Todo se revierte en bases descartables. Pruebas, commit y publicación efectivos se acreditan en el resultado del incremento; este documento no acredita aceptación municipal ni autonomía integral.
