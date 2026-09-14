# 059.2 · PM-10: envío confirmado y recepción compatible

## Alcance implementado
Se agrega recepción de partes del colector PM-10, conservación inmutable, acuses recuperables y consulta continua autenticada. El lector físico v4.1 se conserva; la captura recibe una corrección de exclusividad y su panel separa captura y acuses conservados. No hay instalación municipal en esta entrega ni prueba de una nueva fichada física. La publicación del receptor no activa el conector.

## Circuito
Captura local completa → cola existente → remitente HTTPS separado → validación/transacción PostgreSQL → acuse persistente local → consulta del panel. Cada parte transporta hasta 500 registros originales de 40 bytes, ordinales, fecha de captura declarada y huellas. El límite por solicitud es 64 KiB. El servidor verifica bytes, tamaño, huella de la parte y consistencia de la cabecera. Al completar el lote reconstruye el delta, comprueba su huella global y el orden estricto de ordinales. La huella de la descarga completa identifica la procedencia declarada, pero el delta no demuestra por sí solo cobertura del período ni reconstrucción de aquella descarga. No se presenta como firma digital.

El destino HTTPS está fijo en el agente. No acepta URL elegida en formularios, redirecciones ni desactivar TLS. Un token aleatorio propio del remitente, diferente de la CommKey, se conserva sólo en un archivo protegido; en el conector se registra su SHA-256. La CommKey no se envía a la nube. Las pruebas no registran claves municipales.

El instalador del remitente genera el token localmente e imprime únicamente su huella para registrarla por el circuito administrativo autorizado. Deja el remitente deshabilitado/no iniciado. Hay que comprobar el host, la ruta municipal y que exista una sola instalación de captura antes de activar el conector y arrancar ambos servicios. No hay selección arbitraria de IP, apertura del reloj a Internet ni modificación de GRH.

## Compatibilidad con PM-10 ya incorporado
Se utiliza la misma clave privada `attendance_clock_identity_key` y contexto `clock-v1:<tenant>:<identificador>`. No se regenera esa clave. Las claves de evento siguen siendo `zk40-v1:<serie minúscula>:<SHA-256 del registro>`. Un registro idéntico que ya consta en la captura se reconoce como conocido, incluidas sus observaciones, sin volver a crear la fichada ni cambiar su revisión.

Los registros nuevos válidos alimentan `attendance_raw_event` y `attendance_canonical_punch`. Los datos originales quedan en `attendance_pm10_record`; los acuses, en `attendance_pm10_receipt`. Estas dos tablas son inmutables. Fecha imposible, bytes de identidad inválidos y fecha futura se conservan para revisar, no se corrigen. Un vínculo sólo se asigna por documento explícito, contrato único válido por fecha y fuente municipal verificada; los casos ambiguos quedan pendientes. No se empareja por nombre.

No se deduplica por minuto ni por persona. Dos registros distintos con la misma hora siguen siendo distintos. No se alteran sueldos, licencias, firmas ni cierres; todas las fichadas nuevas permanecen sin aprobación laboral automática.

## Persistencia y reintentos
El servidor confirma cada parte dentro de la misma transacción que conserva sus registros. Repetir parte/identificador con contenido diferente falla; repetir exactamente lo ya confirmado devuelve el mismo acuse. Un corte después del commit y antes del acuse se resuelve mediante reintento, no duplicación.

El remitente guarda el acuse sólo después de validarlo y sincronizar el archivo. Su estado y bloqueo son separados de la captura, por lo que no comparten el bloqueo local. Conserva todas las capturas; no elimina archivos de `pending`. Procesa como máximo cuatro partes por ciclo (configurable por código), leyendo un lote a la vez. El recorrido se ordena por identificador local, no se promete orden cronológico de llegada. El panel separa hora del reloj de hora de recepción.

La espera por fallos transitorios aumenta de uno a quince minutos y persiste después de reiniciar. Un rechazo de autenticación o conflicto permanente bloquea el envío hasta revisión; reiniciar no elimina el bloqueo. Un acuse local corrupto también requiere revisión. La limpieza/archivo de lotes confirmados y el monitoreo de cuota requieren una política posterior: esta entrega no promete retención ilimitada. El límite de espacio del colector continúa deteniendo capturas antes de borrar datos.

## Interfaz
`Relojes y marcaciones → Recepción del colector municipal`: nuevos eventos, registros reconocidos, observaciones, partes confirmadas, última captura declarada y última recepción. Lista hasta 50 registros nuevos, con nombre/legajo sólo con permiso nominal.

El selector de fuente permite consultar la captura histórica o reunirla con la recepción continua. Tabla, gráficos y exportación usan un mismo corte, deduplicado por dispositivo y huella del registro original. Un cambio de fuente o vinculación durante la paginación/exportación pide actualizar el corte (409). Las jornadas conservan la fuente histórica y no se calculan desde el modo continuo. La última captura completa requiere todas las partes; intento local y cola pendiente se muestran como no informados si no hay telemetría del host.

`Habilitado para recibir` es configuración; no equivale a `En línea`. No hay heartbeat del host ni prueba física implícita. El contador conocido incluye reenvíos de registros conocidos en diferentes lotes, no personas únicas. Cada refresco consulta Neon, no el reloj. Los errores limpian las cifras y la pérdida de acceso cancela la lectura.

## Validación y puesta en marcha
Pruebas del agente sólo con respuestas sintéticas y disco temporal. QA de SQL con datos de prueba que se revierten antes de terminar y comparación contra la ingesta anterior; no nuevas capturas físicas. Se preservan controles de sesión y no se concede SELECT directo de tablas privadas al rol de la aplicación. CI comprueba Linux, Windows, API y navegador; las pruebas sobre archivos productivos interceptan respuestas sintéticas únicamente en el navegador.

Cierre físico 059.3 aún necesario: host permanente asignado, instalación, registro del hash del token por el administrador, conector activo, fichada controlada → acuse Neon → panel. Después reinicio y corte de conectividad con la PC personal de Marcelo apagada. Esas condiciones no se dan por cumplidas al aprobar pruebas automatizadas.

## Pedidos de Noelia
Los códigos 44 (Mayor dedicación) y 95 (Full Time), descritos en el módulo 3, siguen siendo conceptos salariales y no códigos de entrada/salida del reloj. Esta recepción aporta evidencia; no asigna esas cantidades ni sustituye las autorizaciones de las secretarías. Los módulos de novedades, parámetros y cierre permanecen en la matriz de aceptación.
