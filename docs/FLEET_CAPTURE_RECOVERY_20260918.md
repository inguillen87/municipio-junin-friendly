# Multirreloj: recuperación automática y panel local

## Instalación real

El 18/09/2026 a las 14:24:17 UTC se instalaron cuatro módulos en el colector MultiClock de la PC autorizada: `capture-policy.mjs`, `operator-help.mjs`, `runner.mjs` y `overview.mjs`. La herramienta verificó sus huellas, conservó los archivos reemplazados y registró el recibo de instalación. Identificador: `3655a4aa2d6b79a7764c4a6fee3a2417506e21b0f51a3f5d22158b8f5b61643f`.

Una comprobación posterior devolvió cero archivos pendientes de actualizar. El control instalado respondió `state:running`, cinco relojes configurados y `cloudSenderConfigured:false`; se regeneró su panel local, no una simulación del estado real.

La etiqueta local de Edificio Nuevo también fue corregida a **PM-14 · Edificio Nuevo**, con hash previo y copia de respaldo. Los identificadores de reloj, series, endpoints, claves y colas se conservaron. El mapa ya tenía la confirmación PM-14; el colector local todavía mostraba la etiqueta pendiente.

## Comportamiento corregido

Una caída comprobada ANTES de abrir la sesión TCP podía agotar el presupuesto de seis errores y dejar la captura bloqueada incluso al volver la red. Ahora sólo se separan los casos donde el lector informa explícitamente: esquema de reporte esperado, TCP no conectado, autenticación no aceptada, cero intentos de credencial y fallo en TCP_CONNECT. Se conserva la espera progresiva, acotada a quince minutos.

Los errores de autenticación, identidad o protocolo no se convierten en simples caídas de red. No se borran bloqueos existentes ni se cambian claves para intentar recuperarlos. La serie sigue comprobándose antes de atribuir registros. El software de PM-10 no se modificó.

El nuevo recorrido de prueba utiliza la clave **0** y simula ocho ciclos sin red seguidos de captura correcta, demostrando que el supervisor recupera la lectura sin ensayar otra clave. **No es una verificación de la clave almacenada en cada reloj real:** la consulta explícita de esa configuración fue bloqueada por la herramienta y no se repitió por otra vía.

## Operación y límites

La tarea Windows existente quedó habilitada, con disparo cada cinco minutos, política IgnoreNew y última ejecución terminada con resultado 0. Cada reloj conserva su configuración de 900 segundos entre capturas completas; al depender de los disparos de la tarea, el intervalo real puede ser mayor. La tarea es del usuario interactivo: no se presenta como servicio certificado con Windows sin sesión o la PC suspendida.

El resumen guardado de las 14:26:15 UTC ya contiene el nuevo contador separado de fallos de conexión y conserva los cinco estados de captura sin bloqueos. Ese ciclo comprobó el supervisor actualizado; las fechas de transferencia individuales informadas en ese corte eran anteriores a la actualización.

El panel local separa equipos configurados, equipos con captura registrada y revisiones pendientes. Explica siguiente paso, intento/captura, espera de VPN, fallo de conexión y bloqueo de identidad/clave. No presenta una captura antigua como conexión en vivo ni un archivo local como acuse de Neon. Se probaron escritorio, 390 y 320 px con datos sintéticos.

## Cierre de continuidad del mismo día

Se verificaron transferencias posteriores a la instalación. En el corte del 18/09/2026 de las 17:26 UTC, los cinco equipos adicionales tenían captura completa y no estaban bloqueados: PM-02 4.361 registros únicos locales; PM-03 28.240; PM-05 25.227; PM-06 1.302; PM-14 5.941. Total 65.071 registros fuente, no personas, jornadas aprobadas o nuevas liquidaciones. Es un corte acumulado de las colas, no el número de entradas de ese día.

PM-10 conserva el software anterior. Su acuse local de las 17:34 UTC coincide con la consulta agregada del servidor: 11.706 registros, 143 partes recibidas y última recepción del servidor a las 16:14:14 UTC. El estado local indica cero partes pendientes. No se reinició ni se cambió su servicio.

La observación detectó además que un proceso nuevo empezaba el resumen con un mapa vacío y sólo agregaba los relojes a medida que completaban su ciclo. Se corrigió para inicializarlo con las evidencias individuales verificadas de todos los equipos configurados; un reloj lento ya no desaparece del conteo mientras los demás terminan. Estados corruptos se conservan para revisión, sin adoptar otra identidad, borrar la evidencia o dar por realizada una captura.

Esta segunda corrección se instaló a las 17:31:20 UTC, sólo en `runner.mjs`, con identificador `a7172a082f579c5ee8efc3897b96711bc8eaf93643fd5190277e6f7754ac190f`. El instalador exige uno de los dos antecesores revisados o la versión idéntica; conserva una copia y no relaja la comprobación para archivos desconocidos. Las pruebas del resumen abarcan estado ausente, configuración deshabilitada, corrupción y conservación de los datos de otro reloj durante el ciclo.

## Lo que no se activó

Los cinco dispositivos adicionales continúan con `cloudReception:not_configured`. El código del remitente quedó incompleto cuando se bloqueó la escritura de su servicio; esos borradores no se incluyen en el commit, el manifiesto ni la instalación. No se creó una credencial cloud, no se clonó el identificador PM-10 y no se reenviaron sus colas por un conector de otro punto.

Neon consultado a las 17:27:22 UTC mantiene sólo PM-10 registrado y GRH publicado del 06/08/2026, importación 3. El respaldo del 10/09 no está seleccionado como fuente activa. Capacidad observada del conjunto de bases: 517.046.272 bytes. No se cambió el plan ni se borraron históricos.

Los cierres de envío independiente y septiembre siguen siendo necesarios para la autonomía operativa. Los pendientes jurídicos de Mariano y las operaciones de edición/baja/reingreso del legajo conservan su seguimiento separado; no se presentan como implementados en esta entrega del colector.

## Aceptación y publicación de la entrega

El disparo Windows de las 17:36:15 UTC produjo un resumen ordenado con los cinco equipos configurados y las evidencias individuales conservadas, utilizando la segunda corrección. Se comprobó la instalación por huellas y no fue necesario detener ni duplicar la tarea existente.

El cierre de pruebas tiene 3.663 comprobaciones de aplicación aprobadas y build. La suite independiente de agentes ejecutó 308 pruebas: 303 aprobadas y cinco omitidas por condiciones de plataforma; no se cuentan esas omisiones como éxitos. Incluye diez casos nuevos de recuperación, orientación operativa y consistencia de resumen. El panel local pasó cinco comprobaciones de navegador con datos sintéticos y vistas de 390/320 píxeles, sin peticiones de red.

El workflow existente incorpora una sola ejecución de la suite de agentes por job activo y el panel local, sin otro workflow ni previews. Los archivos del software Windows siguen excluidos de los assets públicos de Vercel. La entrega en GitHub y su publicación web se verifican por separado de la instalación local descrita; el despliegue de la web no instala programas en la PC.
