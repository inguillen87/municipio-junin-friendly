# Un parque municipal de relojes

PM10 corresponde al Edificio Viejo. Fue el primer piloto y pertenece al mismo parque que los otros trece relojes del inventario municipal. La incorporación actual comprende seis equipos; ese número no significa que los catorce estén conectados o que las seis capturas estén funcionando sin incidencias.

El producto debe ofrecer una instalación, un servicio coordinador y un panel de operación compartidos. La sede, el número de serie, la red y el estado se conservan por dispositivo. Una diferencia interna de formato o de recibo no debe aparecer como una aplicación separada para el usuario.

## Contratos que se conservan

El coordinador existente admite cuatro trabajadores para esta instalación: captura del conjunto, envío de fuente del conjunto, captura de Edificio Viejo y su remitente. Verifica que cada serie tenga una sola captura y una sola entrega, con su cola y conector correspondientes. Por eso puede administrar los seis sin convertir registros antiguos ni modificar bases de datos.

El primer lector conserva el protocolo `clock-v1`, sus lotes `pm10-local-batch.v1`, las entregas `pm10-delivery.v1` y sus recibos `pm10-receipt.v1`. Los demás conservan sus lotes originales y recibos de fuente. No se cambia un contrato por otro para uniformar la pantalla. Un recibo de fuente acredita recepción de ese contenido; no aprobación de asistencia ni liquidación de haberes.

La cifra recibida y la fecha del último acuse deben mostrarse separadas de la última captura. Un acuse anterior no confirma registros nuevos aún no enviados; una captura posterior puede no tener novedades. Un proceso en ejecución no demuestra que el reloj responda: una captura bloqueada permanece visible como tal.

El coordinador en ejecución prepara `estado.html` en su directorio privado al iniciar y cada 30 segundos. Consulta metadatos locales y no agrega lecturas físicas ni envíos. Cada corte muestra su fecha. Si no puede verificar los archivos, presenta una consulta no disponible; si no puede reemplazar el panel, conserva su fecha anterior y registra el fallo de publicación. Al detenerse espera que termine la publicación en curso. El comando `overview` también permite generar una consulta puntual.

## Incorporación de los distritos

Wi-Fi es una forma de conexión a la red, no un protocolo de fichadas. Cada nuevo equipo necesita una ruta disponible desde el colector, dirección y puerto, protocolo compatible, serie comprobada e inscripción autorizada. La red municipal hoy autorizada sigue vigente. Agregar redes de distritos requiere una configuración explícita y pruebas; no se eliminan las restricciones de destino ni se abre el servicio a cualquier dirección.

## Traslado de los seis a Oracle

El alcance incluye Edificio Viejo. Se prepara el destino detenido, se validan programa, permisos, configuraciones y espacio, y se conserva un respaldo privado verificable de cada cola, recibo y estado. Antes de activar el destino se detienen ordenadamente todas las capturas y entregas del origen y se comprueba su salida.

Si se reutiliza la misma identidad VPN, la sesión de la PC debe estar desconectada antes de abrir la de Oracle. No se presupone que el servidor admita sesiones simultáneas con el mismo certificado. La autenticación desatendida y la verificación del servidor deben estar resueltas antes del corte.

La prueba empieza con un equipo y luego se amplía. Se conservan los bloqueos que necesitan revisión y no se borran pendientes para obtener un estado favorable. Ante un fallo, el destino se detiene y desconecta antes de restaurar la operación del origen. La aceptación autónoma exige una marca física nueva recibida con la PC anterior apagada y una prueba de reinicio del nuevo host.

## Evidencia y límites

La preparación del servidor, la interfaz, las pruebas con datos sintéticos, la lectura física y la recepción real son verificaciones diferentes. Este documento fija el alcance y los criterios; no declara ejecutado el traslado ni conectados los equipos de distritos todavía pendientes.
