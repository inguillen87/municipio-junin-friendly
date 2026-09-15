# Recuperación de la instalación provisional PM10

Comprobación del 15 de septiembre de 2026, horas UTC. Este registro describe la PC provisional autorizada; no certifica un host municipal permanente ni funcionamiento con la PC apagada.

## Interrupción y recuperación observadas

El supervisor anterior y sus dos trabajadores ya no estaban presentes en el sistema operativo. La causa de la terminación no fue determinada. No se atribuye a Codex ni a una política de Windows sin evidencia adicional.

Después del arranque solicitado a las 01:56 UTC se verificaron los tres procesos, y la captura de las 01:56:28.951 UTC volvió a leer 11.344 registros, con cero registros únicos nuevos. El remitente reconstruyó la cola con 11.344 registros confirmados y cero partes pendientes. El último acuse conservado seguía siendo de las 00:31:30.925006 UTC; no hubo un acuse nuevo porque no había registros nuevos para enviar.

## Recuperación independiente instalada

Se detuvo ordenadamente la instalación y se verificó la ausencia de los tres procesos antes de reemplazar código. Se compararon internamente las huellas de 30 archivos de configuración, secretos, captura y acuses antes y después: todos permanecieron iguales. No se guardaron ni publicaron sus contenidos ni huellas privadas.

Windows aceptó la tarea `MuniControl-PM10-Provisional-D44B74C3C536` para el usuario actual con `Interactive` y `Limited`. Tiene un disparador cada minuto sin fecha de fin y otro al iniciar sesión, `IgnoreNew` y tiempo de ejecución sin límite. El lanzador WScript oculta el proceso y espera su finalización. El modo `watchdog` nunca escribe `desired.json`; conserva la detención manual y usa los bloqueos atómicos existentes para impedir supervisores, capturadores o remitentes duplicados.

El arranque de las 02:01:40.898 UTC se solicitó al Programador de tareas. Se comprobó en el sistema operativo la cadena supervisor → WScript → `svchost.exe`, junto con ambos trabajadores; ese arranque no procede de una familia de procesos de Codex. La captura posterior de las 02:02:32.877 UTC confirmó nuevamente 11.344 registros, sin duplicados ni error. El remitente actualizado a las 02:02:40.996 UTC conservó cero partes pendientes.

La tarea se registró sin administrador, elevación, contraseña de Windows ni cambios de políticas, energía, red o reloj. El resultado queda localmente en `control/watchdog-install.json`. Una tarea ajena o cuya identidad/programación haya cambiado no se sobreescribe. Si el registro se rechaza, se conserva el error real y el inicio de sesión existente.

Para diagnosticar continuidad se cruzan tarea, procesos presentes y fechas reales de captura/remisión. Un intento periódico mientras la tarea ya corre puede ser ignorado por `IgnoreNew`; su resultado aislado no determina si el supervisor está vivo. [Microsoft documenta esta política de instancias](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-multipleinstancespolicy-settingstype-element).

## Validación

- Suite local PM10: 245 pruebas; 240 aprobadas, 5 omitidas por diferencias de permisos/enlaces de Windows, ninguna fallida.
- Pruebas del supervisor: 8 aprobadas, incluidas concurrencia entre procesos reales, recuperación después de terminar un proceso, intención detenida/malformada, transición de bloqueo incompleta y detención entre comprobación y adquisición del bloqueo.
- La primera CI Linux detectó que la prueba de caída enviaba SIGTERM: el supervisor atendía esa señal y liberaba correctamente el bloqueo, por lo que no quedaba uno abandonado para recuperar. La prueba se corrigió a SIGKILL exclusivamente sobre su proceso sintético para representar una terminación abrupta también en POSIX. No se cambió el comportamiento de cierre del colector real; la CI del commit corregido se verifica por separado.
- Integración real del Programador de tareas de Windows aprobada en una instalación sintética: inicio automático por el disparador de un minuto, recuperación en el siguiente disparo tras terminar su supervisor y cero reinicios tras guardar una detención manual. La tarea y la carpeta temporales se eliminaron al finalizar. El gateway real permaneció funcionando durante esta prueba.
- El instalador nuevo se incorporó a la validación de sintaxis Windows de CI. La prueba de registro de tareas es opcional y local; no se ejecuta en CI, donde ese permiso no está garantizado.
- Los casos sintéticos no usan configuración de reloj ni remitente, credenciales municipales o datos personales.

La comprobación física acredita capturas y cola conservada en los momentos indicados. No certifica autonomía con la PC suspendida, apagada o sin sesión, ni una recepción nueva en Neon. La continuidad prolongada y el traslado posterior al host definitivo siguen siendo verificaciones independientes.
