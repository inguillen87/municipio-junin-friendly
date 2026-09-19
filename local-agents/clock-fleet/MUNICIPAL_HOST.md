# Coordinador para un host municipal permanente

Esta entrega agrega `gateway.mjs` y `gateway-config.mjs`, con un instalador Windows de cuenta de servicio y una unidad Linux de referencia. No reemplaza los lectores, no migra colas automaticamente y no incorpora un remitente nuevo para los cinco equipos adicionales. PM10 conserva su adaptador de envio. No declarar toda la flota conectada por arrancar este proceso.

## Configuracion privada

`gateway.json` requiere exactamente schema=`municipal-clock-gateway.v1`, approved=true, approvedHost igual al nombre del host autorizado, stateDir absoluto independiente y workers. Cada worker contiene kind, configFile absoluto y enabled. Tipos permitidos: `fleet-capture`, `legacy-capture`, `legacy-delivery`. No se aceptan ejecutables ni comandos arbitrarios.

`node app/clock-fleet/gateway.mjs check --config <ruta-absoluta>` comprueba configuraciones, propiedad exclusiva por serie/cola y cantidad de remitentes; no abre relojes, no lee secretos de captura y no envia. `run` ejecuta los workers habilitados con Node, sin shell, cada uno con sus bloqueos y estado originales. `status` muestra el ultimo estado local del coordinador; no es una consulta de conectividad ni acuses en vivo.

Un fallo de un worker no termina a los demas. Los reinicios por salida inesperada tienen espera y presupuesto dentro de esa ejecucion. Salida de configuracion 2 detiene ese worker para revision. Los bloqueos de seguridad en las colas originales no se limpian; iniciar el coordinador no hace `resume`. Los contadores del coordinador no son un ledger persistente de reintentos entre reinicios; no confundirlos con los estados durables de los lectores/remitentes.

## Windows

Preparar carpeta dedicada bajo ProgramData/MuniControl, con runtime/node.exe firmado, app/clock-fleet y app/pm10 del release verificado, config y secrets privados, y carpetas de colas bajo state. stateDir del coordinador no puede solaparse con una cola. Copiar los acuses y evidencia originales con manifiesto; no copiar bloqueos activos ni reasignar series.

El instalador necesita administracion del host municipal, no del servidor GRH ni de la PC personal. Rechaza rutas fuera de la carpeta, enlaces, runtime sin firma valida, host distinto y tareas MuniControl previas habilitadas. Ajusta permisos solo en esa carpeta dedicada: administradores/SYSTEM y LocalService; el servicio modifica solo state. No usa contrasena Microsoft personal, no crea rutas de red ni abre puertos de los relojes.

Por defecto registra la tarea DESHABILITADA. El parametro Activate solo corresponde despues de aprobar la transicion. Arranca por Task Scheduler bajo LocalService/ServiceAccount, al inicio del sistema y con recuperacion de tarea; no requiere usuario interactivo. Que el mecanismo permita ese modo no demuestra que ya se haya ensayado en el municipio. Verificar acceso al disco, ruta municipal y HTTPS bajo esa cuenta antes de activarla.

## Linux

La unidad `municontrol-clock-gateway.service` usa usuario dedicado, permisos minimos y ReadWritePaths para el estado. Requiere preparar previamente cuenta, permisos, Node, configuracion y rutas. Es una unidad de referencia, no un instalador completo ni un servicio aplicado en esta intervencion. Probar systemd y red en la distribucion municipal elegida.

## Prueba de transferencia y recuperacion

Registrar host y responsables. Detener los lectores anteriores mediante su circuito; comprobar que no quede una descarga pendiente. Transferir archivos privados y verificar hashes y acuses; revisar cualquier bloqueo recuperado, nunca eliminar evidencia de corrupcion. Preflight en host destino. Activar un punto, confirmar serie/captura/envio/acuse y probar perdida de respuesta, apagado/reinicio, logout y corte de red. Extender a cada PM. Mantener posibilidad de retorno sin dos lectores concurrentes.

El estado actualizado exige observar el nuevo acuse en el servidor con la PC personal apagada. Sin ese ensayo, `operationWhileLoggedOutVerified` y `allClockReceptionVerified` permanecen falsos. La retencion/limpieza automatica de colas no se implementa aqui: una cuota alcanzada bloquea y preserva pendientes, no descarta registros.
