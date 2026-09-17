# MuniControl · flota de relojes

Reutiliza el transporte de lectura 4.1 de PM-10; no es otro lector independiente. Un proceso puede atender hasta 16 identidades aprobadas con estado, bloqueo, cola y tiempos propios. Una autenticación fallida, pérdida de ruta o serie distinta no permite descargar ni atribuir datos a otro equipo.

**Este incremento automatiza captura local. No tiene remitente a Neon para los nuevos equipos.** Los lotes `clock-local-batch.v1` no son compatibles con el remitente específico de PM-10: esa separación evita atribuir marcaciones a Edificio Viejo por accidente. La recepción remota y sus acuses constituyen el siguiente cierre, no un estado supuesto.

## Operación
`runner.mjs once --config <ruta-absoluta>` hace un ciclo de cada reloj que esté habilitado y haya llegado a su próxima fecha. `run` mantiene los ciclos. Ambos tienen bloqueo global y por equipo. Nunca se borran marcaciones del dispositivo ni se leen plantillas biométricas o el directorio de personas.

`control.mjs start --base <ruta>` habilita ciclos futuros. `tick` consulta el estado deseado y ejecuta un ciclo; `stop` impide los ciclos siguientes y deja terminar el actual. La detención persiste frente al siguiente disparo de Windows. Un estado inválido no se interpreta como habilitación.

El instalador de Windows crea una tarea limitada al usuario actual, al iniciar sesión y cada cinco minutos. El intervalo efectivo de captura se configura por reloj; el despliegue inicial utiliza 15 minutos desde el último ciclo completo. `IgnoreNew` y los bloqueos evitan la superposición. Es una instalación dependiente de la sesión, alimentación y ruta municipal, no un servicio 24/7 certificado con sesión cerrada.

El panel `estado.html` reúne los cinco nuevos equipos y la evidencia local del PM-10 ya instalado. No consulta Internet ni muestra nombres, DNI, PIN, direcciones de red o claves. Las fechas indican la antigüedad de cada evidencia; captura no equivale a recepción, asistencia aprobada ni liquidación.

## Integridad y recuperación
Se comprueba la serie antes de descargar. Se verifica el tamaño anunciado, los bloques, las cabeceras y la finalización del protocolo. El presupuesto de transferencia configurada es de hasta 15 minutos; PM-10 conserva su límite de tres minutos. Los errores persistentes y las colas corruptas quedan bloqueados para revisión, sin reinicio que borre evidencia.

Cada cola deduplica registros binarios exactos dentro de su propia identidad. Una misma secuencia de bytes en dos equipos sigue perteneciendo a dos fuentes diferentes. Se conservan registros candidatos, incluso los que necesitan revisar su identidad antes de utilizarlos en asistencia.

La configuración y claves son privadas y externas al repositorio. El estado tiene cuota por equipo y mínimo de espacio libre; falta de espacio detiene la captura sin descartar pendientes. No exponer los relojes directamente a Internet.

## Próximo cierre
Registrar o reconciliar punto, equipo y serie en el servidor; emitir credencial de ingesta por equipo; enviar lote con huella y versión; obtener acuse íntegro e idempotente; comprobar recuperación y métricas visibles en `/relojes`. Mantener los identificadores sin correspondencia en revisión. Ningún registro se convierte en ausencia u hora liquidable por el solo hecho de haber sido recibido.

Licencia: GPL-2.0-only, como el lector compartido. Se conserva su documentación de protocolo en `../pm10/reader/REFERENCIAS.md`.
