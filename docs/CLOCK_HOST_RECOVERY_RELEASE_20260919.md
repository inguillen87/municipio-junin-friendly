# Cierre de trabajo: continuidad de relojes y proyecto integral - 19/09/2026

## Cambio real observado en PM10

La inspeccion inicial encontro PM10 bloqueado por LAYOUT_NOT_CONFIRMED, con ultima captura del 18/09. No se limpio el estado ciegamente ni se modifico el parser. Se solicito detencion normal del supervisor, se espero su cierre y se adquirio la propiedad exclusiva de la cola. Una lectura unica con los modulos instalados, ruta municipal, clave ya conocida y serie esperada obtuvo 11.738 registros, formato legacy-40-byte-candidate, autenticacion y transferencia completas; ensureCapture paso sin cambios.

El diagnostico termino a las 13:17:06.849 UTC. Su hash de captura es 593ac32d28772a0142d3a8e4d52ea755273a6a39347ad6cf300e552c51f63835. Con esa evidencia se realizo una recuperacion manual revisada a las 13:18:58.502 UTC mediante el comando resume existente, sin red en ese paso y sin habilitar un rearmado automatico. El supervisor original se reinicio conservando sus archivos y credenciales; no se sustituyo por el nuevo coordinador.

Neon confirmo despues **144 acuses y 11.738 registros** para el equipo, frente a 143 acuses y 11.706 registros al inicio: un acuse nuevo con 32 registros adicionales. Ultima captura declarada recibida 13:19:11.523 UTC; nuevo acuse 13:20:01.545 UTC. La lectura local posterior mostro captured_locally, blocked=false, lastError=null y otra captura a las 13:22:49.694 UTC, con cola confirmada y cero partes pendientes. Son hechos de captura/recepcion, no jornadas liquidadas.

No se establecio la causa original del evento de formato: el diagnostico actual demuestra una captura valida, no reconstruye bytes fallidos que no se conservaron. Las reglas de bloqueo por formato, serie y autenticacion siguen intactas. No se cambiaron la hora, usuarios, huellas o marcaciones del dispositivo.

## Lo que no esta terminado

Los cinco equipos adicionales conservan capturas locales recientes, pero no remitentes habilitados. La consulta productiva encontro cero inscripciones attendance_zk40_enrollment y solo un dispositivo registrado con acuses. No se registraron dispositivos ficticios ni se reutilizo el token de PM10 para otra serie.

Las tareas instaladas en la PC siguen como Interactive bajo el usuario guill. Esta intervencion recupera un punto existente; **no elimina todavia la dependencia de la PC personal**. No se identifico otro host municipal autorizado para instalar y probar el software. Las credenciales de aplicaciones GRH/GAF/GAT no se interpretan como acceso administrativo a su servidor.

## Codigo entregado

`gateway-config.mjs` y `gateway.mjs` coordinan los workers existentes con host aprobado, rutas absolutas, identidad/cola exclusivas, un bloqueo de coordinador, inicio sin shell y estados por worker. Reutilizan captura multirreloj, captura PM10 y remitente PM10. Un fallo de worker no detiene los demas; salidas de configuracion requieren revision. Los registros de estado no contienen argumentos, cuentas, claves ni marcaciones.

`install-machine-windows.ps1` prepara Task Scheduler con LocalService/ServiceAccount limitado y disparador al iniciar el sistema, sin contraseña personal. Restringe la instalacion a una carpeta dedicada ProgramData/MuniControl, valida runtime firmado, rechaza enlaces/tareas previas habilitadas y limita escritura a state. Por defecto deja la tarea DESHABILITADA. Se comprobo sintaxis y contratos, no se ejecuto la instalacion elevada ni el reinicio de un host municipal.

Se entrega una unidad Linux systemd de referencia con cuenta dedicada y aislamiento del sistema de archivos. No fue instalada ni ensayada en una distribucion municipal. Los protocolos, claves, formatos y acuses de PM10 permanecen sin cambios. La guia `local-agents/clock-fleet/MUNICIPAL_HOST.md` documenta limites y transferencia de colas.

El nuevo remitente ZK40 se intento desarrollar, pero su escritura fue bloqueada por la herramienta. El borrador incompleto se retiro y no se integra ni se presenta como terminado. Tambien quedo fuera una ampliacion de estado del coordinador que no pudo conectarse. No se usaron alternativas para ejecutar los cambios bloqueados.

## Pruebas y alcance de publicacion

Preflight ejecutado contra los archivos de configuracion instalados, sin abrir sockets ni leer sus secretos: seis identidades de captura y una de envio; allSendersConfigured=false, networkTested=false y operationWhileLoggedOutVerified=false. Su configuracion temporal esta en evidencia privada y no es una instalacion del coordinador ni una habilitacion de servicios.

Se agregaron 12 pruebas del coordinador/configuracion/instaladores: host equivocado, comandos no permitidos, rutas, doble lector, entrega sin captura, reintentos, fallo independiente, detencion, preflight sin claves ni red, configuracion Windows y Linux. Suite de agentes: **324 pruebas, 319 aprobadas, cinco omitidas por condiciones de plataforma, cero fallos**. Regresion de aplicacion: **3.760 pruebas aprobadas, cero fallos u omisiones**, compilacion completa correcta. Parser PowerShell nativo: instalador sin errores de sintaxis. Los procesos del nuevo coordinador se comprobaron con fixtures, no con una sesion cerrada real.

La recuperacion real del PM10 es evidencia independiente de esas pruebas. Se preservaron tareas, colas, recibos, direcciones, claves y la semantica de bloqueos; el unico rearmado fue el del punto revisado despues de una captura estrictamente valida. No se incrementaron planes, cuotas o limites, ni se cambiaron conexiones de base.

El proyecto integral `PROYECTO_INTEGRAL_JUNIN_20260919.md` integra los seis modulos de Mariano, la bandeja de asuntos, responsabilidades, vigencia/citas, importacion historica, los modulos 1-7 de Noelia, la cadena horario-novedad-liquidacion, perfiles bancarios, matriz de avisos/roles y campos propuestos. Especificacion no equivale a tablas o pantallas implementadas. La siguiente condicion fisica es identificar el host municipal permanente y su acceso autorizado; en software siguen pendientes envio/inscripcion de los cinco equipos, rutas de los otros puntos, homologacion de reglas, conciliacion salarial y aceptacion de los archivos de entrega.

La publicacion de codigo/documentacion en GitHub/Vercel se verifica por separado. Ningun despliegue web instala el agente en el municipio ni convierte una recepcion en asistencia aprobada. Este incremento no cambia interfaces web ni crea operaciones juridicas, liquidaciones o pagos nuevos.

Referencias de plataforma: https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal?view=windowsserver2025-ps y https://learn.microsoft.com/en-us/windows/win32/services/localservice-account. La viabilidad del modo ServiceAccount no sustituye el ensayo de red/permisos/logout en el host que se elija.
