# 059.1 · PM-10: adquisición autónoma local y continuidad

## Decisión y alcance

Retomado desde master `e784ebfeb785722a824f0c7e3f2c37ecd4d0c6bf`. Prioridad: eliminar la descarga manual del reloj antes de agregar otra pantalla de nómina.

Este incremento entrega el **servicio de captura local**, no una recepción automática ya funcionando en Neon. Cómputos debe instalarlo en un host municipal; no hay en el contexto un host permanente identificado con acceso de administración para hacerlo remotamente. No se usó la VPN personal de Marcelo.

## Verificación previa (13/09/2026)

La consulta de sólo lectura en la rama `br-plain-dust-acpjgebb` confirmó un equipo `zk-pm10-cqtu225360168`, serie CQTU225360168, 172.100.97.131:4370. Su conector `junin-pm10-verified-snapshot` permanece suspendido, sin `last_accepted_at`. Hay una captura y 11.111 filas de evidencia. No se cambió ese estado.

El agente del repositorio `scripts/attendance-gateway-agent.mjs` (blob `6ad08e74443de8a0ff856a3bbd15ef12ac5be4ea`) procesa un archivo de entrada; no implementa consulta periódica al reloj. La ingesta genérica y la carga inicial no son intercambiables:

- La ingesta inicial usa el driver `zk40-snapshot.v1`, una clave de identidad privada guardada en `attendance_clock_identity_key` y el mensaje `clock-v1:<tenant>:<identificador>` para el HMAC.
- Los eventos iniciales usan `zk40-v1:<serie en minúsculas>:<sha256 del registro de 40 bytes>`.
- La ingesta genérica usa otro contexto y `ATTENDANCE_IDENTITY_PEPPER`. Enviar por allí el mismo DNI sin adaptar el contrato puede perder el vínculo o duplicar eventos.
- La consulta operativa principal selecciona una captura. Aceptar nuevos eventos en otra tabla sin adaptar su lectura no vuelve actual esa pantalla.

Por eso no se agregó un cron que llame al receptor equivocado ni se habilitó el conector suspendido para aparentar funcionamiento.

## Implementación

`local-agents/pm10/`: lector v4.1 aportado sin alteración, servicio sin dependencias npm, verificación de serie/longitud/cierre de transporte, exclusión de instancias, clave local protegida, cola incremental por registro crudo y estado recuperable. Reintentos acotados y detención persistente ante clave rechazada o seis fallos de transporte. Sin borrado de fichadas, deshabilitación del reloj, cambios de usuarios/hora ni plantillas biométricas.

Instaladores: tarea Windows LocalService al arranque y unidad Linux systemd con cuenta restringida. Sin password de Windows del operador. Panel local accesible con ACL, con estados en español y separación visible entre captura local y recepción en nube. Los instaladores requieren revisión/ejecución en el host municipal; las pruebas automatizadas no prueban ese host.

La cola conserva registros exactos nuevos, hash de la captura observada y ordinales de los nuevos registros; no promete reconstruir cada captura completa. Un registro idéntico se conserva una vez; no se deduplica por minuto, DNI o sentido de fichada. Ningún registro se elimina por agotamiento del espacio. El lector mantiene el límite de 4 MiB por descarga.

## Compatibilidad comprobada sin red municipal

Replay local del binario aportado: 444.444 bytes, 11.111 registros, SHA-256 `ee5e16fcd3e784fc1f0f7d6dfacdc8dd5d18a20585d33ea999ce36999ba01771`. Tras guardar, reiniciar el almacén y volver a procesar la misma captura, no se generó otro lote. No hubo llamada al reloj real, publicación de datos personales ni escritura en Neon.

## Criterio de cierre siguiente

059.2: receptor incremental autenticado, mismos HMAC/event keys de origen, conflicto explícito cuando la misma identidad cambia, acuse idempotente, cola enviada sólo tras confirmación y control de frescura separado de la fecha de la última marca. Preservar los registros observados sin convertirlos en horas pagables.

059.3: instalación municipal, prueba de nueva fichada con Marcelo desconectado, recuperación de caída/reinicio y recepción en dashboard. Sólo ahí cerrar "PM-10 automático". Después ampliar a los otros puntos, no extrapolar por modelo.

## Relación con Noelia

La automatización de fichadas alimenta evidencia de tiempo. Los códigos de reloj 4/5 no son los conceptos 44/95. El módulo 3 aportado describe Mayor dedicación (44) y Full Time (95) como novedades recibidas desde secretarías; este sprint no asigna esas cantidades ni altera fórmulas. Los módulos 5, 6 y 7 siguen en la matriz de aceptación de Noelia, con sus propios criterios.

No se aplicaron migraciones ni modificaciones de datos, identidades, permisos de nómina, firmas o cierres.
