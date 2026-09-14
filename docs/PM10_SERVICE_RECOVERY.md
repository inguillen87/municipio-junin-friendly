# PM-10: recuperación del colector 0.1.2

Un apagado ordenado durante una lectura recibía `CANCELLED` del lector y dejaba `blocked=true` en el estado persistido. En el arranque siguiente, el colector esperaba una intervención manual. Ahora una cancelación asociada a la señal de parada del propio proceso conserva la cola, la última captura completa y el presupuesto de errores anterior. Programa el siguiente intento sin publicar bytes parciales ni declarar otra captura.

Los bloqueos anteriores no se levantan automáticamente. Un rechazo de autenticación sigue bloqueando incluso si coincide con una señal de parada. Un código `CANCELLED` sin esa señal requiere revisión.

## Conexión caída antes de autenticar

La revisión 4.1.1 del lector añade únicamente el código exacto del error de limpieza al informe. Conserva el protocolo, comandos, pausas y bytes de captura; el original 4.1.0 permanece disponible. El colector usa ese código para distinguir una cancelación solicitada durante EXIT de un cierre TCP anterior a la parada. Un informe anterior ambiguo no obtiene esa excepción. Sólo se reintenta sin el límite de seis fallos cuando el informe confirma simultáneamente:

- Formato v4.1, estado `CONNECTION_OR_AUTH_FAILED` y fase `TCP_CONNECT` en error y diagnóstico.
- TCP no establecido, autenticación no aceptada y cero intentos de AUTH.
- Error de conexión dentro de la lista explícita: timeout, rechazo, reset o falta de ruta de transporte.

Estos fallos tienen un contador separado, persistido y limitado a 1.000. La espera crece hasta 15 minutos; se conserva al reiniciar. La ruta municipal se vuelve a verificar antes de cada intento. Si falta, sólo se consulta la tabla local de rutas. Un error lanzado sin informe suficiente conserva el tratamiento anterior; no se presume que ocurrió antes de autenticar. Las interrupciones de protocolo siguen limitadas a seis fallos, y autenticación, identidad, integridad y almacenamiento requieren revisión inmediata.

El panel local muestra el estado de espera y conserva separadas captura y recepción. El tablero web describe el indicador legado `hardwareConnected` como un acuse reciente observado en la última consulta: un lote antiguo recién enviado no prueba una conexión física ni autonomía.

## Evidencia de validación

Catorce pruebas nuevas usan registros sintéticos y conexiones exclusivamente a `127.0.0.1`: diez fallos previos a AUTH con reinicios entre intentos y recuperación real del protocolo; rechazo TCP; parada durante transferencia parcial, EXIT y su espera previa; captura completa después de recargar el estado; preservación byte a byte de la cola anterior; bloqueo de clave rechazada; cancelación no solicitada; informes insuficientes; compatibilidad con estados anteriores y contador inválido. La regresión de cierre TCP antes de la parada confirma que ese error real conserva su contador y bloqueo, sin confundirse con una cancelación propia.

Esto no acredita que un servicio municipal haya sido instalado o reiniciado. La aceptación física continúa pendiente hasta verificar una nueva fichada en Neon y en pantalla con la PC personal apagada. La reversión del software conserva estado, cola y acuses; no se borran carpetas para reiniciar una instalación.
