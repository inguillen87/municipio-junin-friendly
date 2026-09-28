# Publicación coherente del Módulo 10

## Incidente verificado
La PR #51 pasó sus pruebas previas, pero el workflow de producción `36371167479` falló en `verify-budget-cotejo-publication.mjs`: a las 02:49:26 UTC el modelo publicado no coincidió byte a byte con el build esperado. Las pruebas de aplicación, los recorridos sintéticos y las otras verificaciones públicas del mismo job habían pasado.

El control anterior del catálogo no bastaba para esperar esta entrega: sus archivos no habían cambiado. La consulta posterior comprobó que Git, copia local, build y modelo servido ya compartían SHA-256 `9dcf63844d9d687734bbfef4cb0a02d1c8d83b8b2ed7d9932c7473ab6ea7e6ca`. No era una diferencia de saltos de línea. El fallo original se conserva; no se reetiqueta como aprobado.

## Cambio de comportamiento
La verificación ahora exige el `release-info.json` del commit exacto, con identidad de origen confirmada, antes de leer los nueve archivos del cotejo. Todos deben coincidir byte a byte en una misma ronda. Se vuelve a comprobar la identidad después de los archivos y de los dos rechazos anónimos.

No se reúnen éxitos parciales de distintas rondas. Un despliegue diferente, un modelo anterior o una transición mientras se consulta invalidan la ronda completa. La espera está acotada a 12 intentos, 15 segundos entre intentos y un máximo global de cuatro minutos. Una discrepancia permanente sigue terminando con código de salida 1.

Las redirecciones, acceso denegado a archivos públicos, cookies inesperadas, respuestas HTML/JSON inválidas y controles anónimos que entreguen datos no se aceptan. Se limitan los cuerpos y los plazos de red. No se envían credenciales, sesiones ni identificadores de legajo/dataset, y sólo se usa GET.

El informe de evidencia se reemplaza por un estado pendiente al comenzar y por el resultado fallido o aprobado al terminar. No conserva un éxito antiguo cuando falla una nueva ejecución. Los errores contienen códigos y rutas fijas, no respuestas municipales ni mensajes crudos de conexión.

## Pruebas
41 escenarios nuevos de verificación, más tres regresiones del comparador publicado: 44 aprobados. Incluyen despliegue previo, activos mezclados, cambios de versión durante lectura, discrepancia permanente, límites de cuerpo, redirección, denegación, datos anónimos, red y cancelación.

Construcción completa: 5.479 pruebas aprobadas, cero fallos y dos omitidas. El workflow existente contempla la nueva prueba en ambos filtros de cambios; no se creó otro pipeline ni se redujeron los controles funcionales.

## Alcance
Este incremento corrige la aceptación técnica de publicación; no añade una pantalla ni integra los cargos históricos. No cambia datos, permisos, fuentes, haberes, sesiones o firmas. PR #50 y el trabajo del Módulo 9 permanecen separados. La evidencia de CI y producción del commit integrado se registra al terminar la publicación.
