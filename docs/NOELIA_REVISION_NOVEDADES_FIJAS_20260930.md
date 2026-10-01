# Noelia · revisión completa de novedades fijas

Incremento del apartado 5.4: desde Novedades → Novedades fijas, cada propuesta compara los diez campos con la última versión aprobada. Incluye concepto, centro, tipo de liquidación, unidades, importe, forzado y su fundamento, instrumento, alta y vencimiento. Conserva los decimales declarados y diferencia cero, dato sin informar y ausencia de versión aprobada.

Antes de aprobar o rechazar, el revisor debe confirmar expresamente que revisó los campos, el instrumento y el alcance. Cambiar el fundamento o actualizar el registro retira esa confirmación. En móvil cada campo muestra los valores aprobados y propuestos uno debajo del otro, sin desplazamiento horizontal; en escritorio se comparan en una tabla. La región de comparación admite foco de teclado.

Antes del primer envío se consultan nuevamente los permisos y el detalle completo, incluido su historial. Una diferencia de valores, identidad, derechos o evidencia anterior bloquea la operación aunque la versión numérica coincida. El operador debe actualizar y revisar nuevamente. Para una propuesta inicial se vuelve a consultar el contrato exacto ya elegido; no se reasigna por legajo. El servidor conserva sus controles de autoridad, versión e idempotencia.

Una respuesta incierta mantiene el cuerpo y la clave originales. Consultar el estado o reintentar no cambia la propuesta ni ejecuta una nueva comparación que sustituya esos datos. Un cambio de municipio, membresía o fuente bloquea el reenvío; el intento queda disponible para recuperar desde su ámbito original. La conservación es sólo en memoria: cerrar o recargar exige consultar el historial antes de iniciar otra operación.

Proponer una anulación conserva la versión aprobada hasta que otra persona decida. Aprobarla retira la novedad del control y de futuras exportaciones; conserva propuestas, decisiones, liquidaciones y archivos anteriores. Rechazarla conserva los valores aprobados. La decisión sigue teniendo efecto `control_export_only`: no calcula haberes, no revierte salarios ni cierra una liquidación.

No se agregan APIs, migraciones, dependencias, permisos o almacenamiento persistente. La retirada de datos por revocación u ocultamiento impide que una respuesta tardía restaure la comparación o envíe una decisión. Las verificaciones usan contratos propios y anteriores sintéticos; no son una aprobación municipal ni una sesión personal de Noelia.

Esta mejora no cierra las novedades masivas nativas, OSEP, el límite de 500 ni el motor salarial. El estado de publicación y las pruebas exactas se documentan en el resultado de la entrega. Conserva el circuito descrito en [novedades fijas](NOELIA_NOVEDADES_FIJAS_092.md) y sus [contratos existentes](NOELIA_FIXED_NOVELTIES_CONTRACT.md).
