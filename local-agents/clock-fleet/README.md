# MuniControl · flota de relojes

Reutiliza el transporte de lectura 4.1 de PM-10; no es otro lector independiente. Un proceso puede atender hasta 16 identidades aprobadas con estado, bloqueo, cola y tiempos propios. Una autenticación fallida, pérdida de ruta o serie distinta no permite descargar ni atribuir datos a otro equipo.

**La captura local incorpora ahora un remitente ZK40 separado y opcional.** `sender.mjs` lee los lotes `clock-local-batch.v1` y los entrega al receptor existente con identidad y acuses por equipo. Esos lotes siguen sin ser compatibles con el remitente específico de PM-10: la separación evita atribuir marcaciones a Edificio Viejo por accidente. Tener el software preparado no equivale a tenerlo instalado, inscrito o recibiendo en el municipio.

## Operación
`runner.mjs once --config <ruta-absoluta>` hace un ciclo de cada reloj que esté habilitado y haya llegado a su próxima fecha. `run` mantiene los ciclos. Ambos tienen bloqueo global y por equipo. Nunca se borran marcaciones del dispositivo ni se leen plantillas biométricas o el directorio de personas.

`control.mjs start --base <ruta>` habilita ciclos futuros. `tick` consulta el estado deseado y ejecuta un ciclo; `stop` impide los ciclos siguientes y deja terminar el actual. La detención persiste frente al siguiente disparo de Windows. Un estado inválido no se interpreta como habilitación.

El instalador de Windows crea una tarea limitada al usuario actual, al iniciar sesión y cada cinco minutos. El intervalo efectivo de captura se configura por reloj; el despliegue inicial utiliza 15 minutos desde el último ciclo completo. `IgnoreNew` y los bloqueos evitan la superposición. Es una instalación dependiente de la sesión, alimentación y ruta municipal, no un servicio 24/7 certificado con sesión cerrada.

El panel `estado.html` reúne los cinco nuevos equipos y la evidencia local del PM-10 ya instalado. No consulta Internet ni muestra nombres, DNI, PIN, direcciones de red o claves. Las fechas indican la antigüedad de cada evidencia; captura no equivale a recepción, asistencia aprobada ni liquidación.

## Integridad y recuperación
Se comprueba la serie antes de descargar. Se verifica el tamaño anunciado, los bloques, las cabeceras y la finalización del protocolo. El presupuesto de transferencia configurada es de hasta 15 minutos; PM-10 conserva su límite de tres minutos. Los errores persistentes y las colas corruptas quedan bloqueados para revisión, sin reinicio que borre evidencia.

Cada cola deduplica registros binarios exactos dentro de su propia identidad. Una misma secuencia de bytes en dos equipos sigue perteneciendo a dos fuentes diferentes. Se conservan registros candidatos, incluso los que necesitan revisar su identidad antes de utilizarlos en asistencia.

La configuración y claves son privadas y externas al repositorio. El estado tiene cuota por equipo y mínimo de espacio libre; falta de espacio detiene la captura sin descartar pendientes. No exponer los relojes directamente a Internet.

## Activación pendiente
Registrar o reconciliar punto, equipo y serie en el servidor; emitir credencial de ingesta por equipo; verificar capacidad antes de enviar históricos; obtener acuse íntegro e idempotente y comprobar recuperación y métricas visibles en `/relojes`. El remitente limita cada equipo a cuatro partes de hasta 500 registros por ciclo y conserva los originales. Mantener los identificadores sin correspondencia en revisión. Ningún registro se convierte en ausencia u hora liquidable por el solo hecho de haber sido recibido. Una cola vacía sin acuses tampoco acredita conectividad o inscripción.

Licencia: GPL-2.0-only, como el lector compartido. Se conserva su documentación de protocolo en `../pm10/reader/REFERENCIAS.md`.

## Recuperación de comunicación — 18/09/2026

El supervisor distingue ahora un fallo probado ANTES de abrir TCP/autenticar de un error durante el protocolo. Cuando el lector informa que no abrió conexión, no presentó credenciales y falló en TCP_CONNECT, reintenta con espera progresiva hasta quince minutos sin consumir el presupuesto de seis fallos posteriores a la sesión. No borra bloqueos previos ni supone que todo timeout sea previo a la autenticación.

Clave rechazada, serie diferente, transferencia incompleta y estados corruptos conservan sus controles. La clave configurada sigue siendo única: esta mejora no prueba alternativas, no cambia la clave del reloj ni captura plantillas biométricas. La clave `0` se utilizó en pruebas sintéticas del recorrido; no se incorpora a la configuración pública ni sustituye un archivo de credencial real.

`capture-policy.mjs` y `operator-help.mjs` son dependencias de esta versión del supervisor y panel. El instalador `scripts/install-fleet-capture-release.mjs` actualiza sólo esos dos archivos y runner/overview, verificando manifiesto, archivos anteriores y copia privada de recuperación. No cambia servicios, tareas, colas, claves ni el lector de PM-10. Las tareas ya registradas cargan la versión nueva en el siguiente ciclo.

El panel local incluye conteos de equipos, capturas guardadas y revisiones pendientes; explica la diferencia entre espera de red, reintento antes de sesión y bloqueo de protocolo. Las cifras no se anuncian como conectividad en vivo. El envío de los equipos adicionales a Neon sigue sin estar configurado por esta entrega.

## Host municipal permanente - 19/09/2026

El coordinador preparado el 19/09 se amplía el 21/09 con `fleet-delivery`, cierre ordenado por IPC e instaladores Windows/Linux. Alcance, configuración y transferencia en [MUNICIPAL_HOST.md](MUNICIPAL_HOST.md). El preflight informa cuántos lectores y remitentes están configurados. La instalación municipal y la prueba con la PC personal apagada permanecen pendientes; los instaladores dejan el servicio deshabilitado por defecto. La captura y las colas anteriores permanecen compatibles, sin cambiar sus claves o formatos.

## Archivo separado de fuentes — 21/09/2026

`source-sender.mjs once|run --config <ruta-absoluta>` usa una configuración privada `clock-fleet-source-config.v1` con `approved`, `enabled`, `stateDir`, `tenantId`, `windowSeconds` y `clocks`. Los relojes conservan los campos validados de la configuración de entrega de flota. El intervalo debe ser múltiplo de 900 segundos, entre 900 y 3600. El destino está fijado en el código; no se acepta una URL proporcionada por la configuración.

Este modo requiere enrolamiento y credenciales propias en la base de relojes. Queda deshabilitado hasta completar esos controles. Guarda `clock-source-receipt.v1` en `delivery-source`; no convierte un acuse canónico previo ni borra los originales. El tenant, serie, hashes, parte y cantidad deben coincidir. El estado `source_stored` sólo significa fuente guardada, con conciliación laboral pendiente.

Un único coordinador reclama una ventana durable antes de enviar y atiende los equipos de forma serial, rotando el primero. Los reintentos esperan la siguiente ventana; un reinicio no adelanta ese plazo. La actividad tiene presupuesto temporal y cada equipo envía hasta cuatro partes por ventana. Un bloqueo requiere revisar la causa y `resume --config <ruta-absoluta> --clock <id>`, que tampoco envía inmediatamente. Una ventana no garantiza un costo: debe observarse el consumo real del proyecto y conservar su plan gratuito.

El gateway reconoce `fleet-source-delivery`. No permite configurarlo junto a otro remitente sobre la misma cola. PM10 conserva su circuito actual. El paquete contiene el código, nunca la configuración privada, los tokens ni las colas municipales.
