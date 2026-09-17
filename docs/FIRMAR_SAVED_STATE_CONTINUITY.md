# FD-UX2 · Continuidad de estados guardados al iniciar o retomar

Continúa #42 y el servidor duradero de FD-P1. Este incremento modifica únicamente los coordinadores de interfaz y agrega nueve pruebas. No agrega endpoints, HTTP público, migraciones, roles ni una operación de emisión.

## Dos fallos de integración detectados

El inicio de la interfaz admitía exclusivamente `awaiting_authorization`. La operación de reserva duradera puede devolver un intento ya existente o un archivo recibido antes de completar la respuesta inicial. Mostrar ese resultado como un fallo genérico era incorrecto. Ahora se valida la respuesta, se conserva el intento y se representa su estado guardado. La ventana de preparación se cierra cuando ya no corresponde autorizar, y no se vuelve a enviar el PDF.

El retorno trataba todo HTTP 409 como vínculo inválido. Cuando el servidor informa específicamente `FIRMAR_BUSY`, la actualización concurrente es temporal: se conserva el retorno en memoria y se permite reintentar la consulta de manera acotada. Los demás conflictos, vencimientos y errores de sesión mantienen sus controles anteriores. No se duplica la reserva ni se solicita una nueva firma.

También se rechazan URLs de autorización vencidas o enviadas junto a estados que ya no admiten autorización. Una URL del dominio correcto no basta para iniciar una acción sobre un intento vencido.

## Alcance probado

Nueve pruebas nuevas: resultado inicial incierto, recibido, pendiente de recepción, cancelado o vencido; autorización vigente; URL vencida; URL incompatible con estado; retorno temporalmente ocupado y recuperación posterior. Sólo dobles de servicio y ventanas sintéticas. Se vuelve a ejecutar el workflow existente con la regresión completa, PostgreSQL sintético y las tres suites previas de navegador. Los resultados de Actions, no este documento, acreditan el cierre.

## Separación respecto del servidor HTTP

Se desarrolló en el entorno local un bloque separado para adaptadores HTTP, cliente de navegador y composición con sesión/repositorio; 126 pruebas focalizadas locales incluyeron ese bloque y estas nueve pruebas de interfaz. La herramienta rechazó la publicación del bloque HTTP: **no está incluido en este commit**, no se publicó por otra vía y no se ejecutó el nuevo ensayo completo navegador/HTTP/PostgreSQL. Se debe recuperar y revisar esa implementación antes de volver a proponerla en una entrega independiente.

Siguen pendientes: el circuito autorizado de preparación de documentos y facultades, los adaptadores HTTP conectados y ensayados con la identidad municipal, el validador criptográfico independiente, la habilitación institucional y el piloto con un titular real. La interfaz no se presenta como firma productiva y `officialEmissionEnabled` permanece false. No se modificaron documentos, claves personales, empleados, haberes ni relojes.
