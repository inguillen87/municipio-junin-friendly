# PM-10: colector municipal de captura local · 059.1

**Estado:** software de captura local preparado para instalación. **No se ha instalado en la municipalidad. La captura no envía por sí sola; el nuevo remitente 059.2 se configura por separado al final de este documento.** No es el cierre del circuito automático de asistencia. No sustituye al proveedor de nómina ni calcula horas.

## Qué hace

Ejecuta el lector v4.1 que ya logró descargar el reloj, sin una consola interactiva en cada lectura. Una sola conexión por instalación; entre capturas espera 60 segundos, configurables. Verifica serie y transporte; sólo conserva capturas completas con liberación de buffer y salida de protocolo confirmadas. El equipo permanece habilitado para fichar: no se envía deshabilitación, borrado, reinicio, cambios de hora, altas de usuarios ni lectura de plantillas biométricas.

El destino está limitado en el código a PM-10, Edificio Viejo, 172.100.97.131:4370, serie CQTU225360168. No hay escaneo de red ni lista de claves. Usa una CommKey **ya validada**, de 1 a 6 dígitos según el perfil v4.1, por un archivo local protegido. Una negativa de autenticación detiene los intentos hasta revisión humana. Los fallos acreditados antes de establecer TCP, sin intentos de autenticación, se reintentan con esperas de 1 a 15 minutos sin consumir el límite de fallos de protocolo. Los fallos ambiguos durante el protocolo se detienen después de seis intentos consecutivos; el apagado ordenado cancela la lectura sin bloquear el siguiente arranque ni guardar una captura parcial. Ver [recuperación del servicio](../../docs/PM10_SERVICE_RECOVERY.md).

**No necesita la computadora de Marcelo. Sí necesita un host municipal encendido y con ruta al reloj.** No deben operar dos instalaciones de este colector, ni otro software recolector, simultáneamente sobre PM-10. El bloqueo implementado es local; no se lo presenta como un bloqueo distribuido entre equipos.

## Cola incremental y evidencia

La primera captura guarda los registros crudos únicos de 40 bytes. Las siguientes conservan sólo los registros no vistos, identificados por SHA-256 del registro completo (incluye secuencia, hora con segundos y códigos). Dos marcas del mismo minuto no se deduplican por minuto ni por persona.

Cada lote tiene `records.bin` y `manifest.json`, con huella del contenido, huella de la descarga completa, ordinales de los nuevos registros y fecha de captura. Los ficheros se escriben y sincronizan antes de publicar el lote por renombrado. El índice se reconstruye desde lotes confirmados localmente después de un reinicio; no se adelanta un cursor antes de guardar datos. Una escritura interrumpida queda retenida, fuera del índice y pendiente de revisión.

No se conserva una copia completa repetida de las 11.111 filas en cada ciclo, ni se guarda el mismo lote una segunda vez. Tampoco se afirma poder reconstruir todas las instantáneas completas a partir de los deltas. La identificación compatible con la ingesta inicial se documenta en `docs/SPRINT_059_PM10_CAPTURA_LOCAL.md`; este servicio no crea identificadores salariales ni vincula personas.

El límite predeterminado de cola es 256 MiB, con 64 MiB de reserva de disco. Al acercarse al límite detiene nuevas consultas antes de borrar datos. No elimina lotes: aún no hay confirmación remota. **La cola contiene DNI y otros identificadores de origen dentro del binario. No compartir `state/pending`, archivos de claves ni capturas crudas en GitHub, tickets o correos.** Las ACL/permisos protegen el acceso; esto no es cifrado de disco. El host debe disponer de la protección y copia que defina Cómputos.

## Instalación Windows (una vez, por Cómputos)

1. Asignar un equipo o VM municipal permanente con Node.js 22 o superior instalado para todo el equipo. Verificar la ruta hacia el reloj. No abrir el puerto del reloj a Internet ni instalar el colector en el servidor de GRH sin aprobación de Cómputos.
2. Descomprimir este paquete. Ejecutar `INSTALAR_WINDOWS.cmd` **como administrador**. La ventana de instalación no se cierra sin mostrar el resultado.
3. Escribir `AUTORIZO` y la CommKey ya conocida. No se solicita la contraseña de Windows ni de Microsoft. La tarea se ejecuta con la cuenta no interactiva **LocalService**, no con el usuario personal.
4. Abrir como administrador `C:\ProgramData\MuniControl\PM10\state\estado.html` o revisar `status.json`. La tarea se inicia al terminar y en cada arranque. La marca "captura local" no acredita subida a la nube.

Archivos de código y claves: bajo `C:\ProgramData\MuniControl\PM10`, con ACL restringidas. El servicio puede leer código/clave y modificar únicamente su estado. El instalador se niega a sobreescribir una instalación o tarea existente.

Detener:

```powershell
Stop-ScheduledTask -TaskName 'MuniControl-PM10-CapturaLocal'
```

Después de resolver un bloqueo, con la tarea detenida:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\ProgramData\MuniControl\PM10\app\service.mjs' resume --config 'C:\ProgramData\MuniControl\PM10\config.json'
Start-ScheduledTask -TaskName 'MuniControl-PM10-CapturaLocal'
```

`resume` no prueba una contraseña ni inicia una lectura. No borrar la carpeta de cola para solucionar un error. Un `LOCK_NEEDS_REVIEW` se revisa comprobando que ningún proceso esté leyendo el equipo antes de intervenir el bloqueo.

## Instalación Linux (alternativa)

Requiere un host con systemd y `/usr/bin/node` 22+. Ejecutar `sudo bash install/install-linux.sh`. Se crea la cuenta de servicio sin login, se restringen los directorios y se registra `municontrol-pm10.service`. No sobreescribe instalaciones existentes. La unidad usa `Restart=on-failure`, cuenta sin privilegios, `ProtectSystem=strict`, `ProtectHome=true` y escritura sólo en su directorio de estado.

```sh
sudo systemctl status municontrol-pm10
sudo cat /var/lib/municontrol-pm10/status.json
sudo systemctl stop municontrol-pm10
# Sólo después de resolver el error:
sudo -u municontrol-pm10 /usr/bin/node /opt/municontrol-pm10/service.mjs resume --config /etc/municontrol-pm10/config.json
sudo systemctl start municontrol-pm10
```

No cambiar rutas del servicio a mano ni agregar credenciales a sus argumentos.

## Instalación provisional en la sesión de Windows (opcional)

Cuando se haya elegido temporalmente una PC del operador, `install/install-user-windows.ps1` prepara una instalación separada en `%LOCALAPPDATA%\MuniControl\Gateways\PM10`, sin administrador, UAC ni contraseña de Windows. Copia Node.js 22+ a `runtime/node.exe` y el programa a `app`, restringe permisos al usuario, SYSTEM y administradores, y crea accesos **Iniciar PM10** y **Detener PM10**. No modifica `config.json`, `sender.json`, `private`, capturas ni acuses, ni inicia lecturas. `-NodePath` permite indicar el ejecutable existente; `-NoStartup` omite el acceso de inicio de sesión.

La configuración de captura se prepara en `config.json`, con `stateDir` apuntando a `state` y la CommKey protegida en `private/commkey`. El remitente usa `sender.json` y un token propio en `private`; se prepara después de registrar su hash y habilitar el conector. Se conserva el destino exclusivo PM-10 del lector: esta opción no incorpora otros relojes.

**Requiere la PC encendida y su sesión disponible. No funciona con la PC apagada ni acredita operación al cerrar sesión.** No modifica suspensión, red, energía ni las tareas municipales LocalService. El acceso de inicio de sesión abre el supervisor oculto y respeta una detención guardada. **Iniciar PM10** habilita ambos procesos configurados; **Detener PM10** solicita su cierre ordenado y conserva la cola. No debe coexistir con otro colector del mismo reloj.

El supervisor guarda `control/status.json`; los estados del capturador y remitente siguen en `state/status.json` y `state/delivery/status.json`. Desde la carpeta de instalación:

```powershell
& .\runtime\node.exe .\app\user-supervisor.mjs status --base $PWD.Path
```

Un proceso iniciado no acredita captura ni recepción. El supervisor conserva los bloqueos existentes, solicita cierre mediante IPC y limita a tres los arranques automáticos por proceso en cada ejecución; los reintentos de red continúan siendo responsabilidad del capturador y remitente. No elimina bloqueos de revisión ni rearma rechazos de autenticación. Antes de actualizar o trasladar, detener ambos y comprobar estado `stopped`; conservar configuraciones, cola y acuses. En el host definitivo se vuelve a comprobar ruta, permisos y exclusividad antes de arrancar.

## Aceptación del circuito completo

- Host municipal concreto e instalación comprobada, con ruta permanente al reloj y una única instancia.
- Receptor incremental compatible, remitente con acuses persistidos y tablero continuo implementados. La publicación y la migración aplicadas se registran en `docs/13_CONTINUIDAD.md` del repositorio principal; no se infieren por la presencia de este paquete.
- Sólo un acuse validado y conservado confirma una recepción. La cola y los reintentos permanecen separados de la captura; un acuse anterior no acredita conectividad actual.
- El tablero distingue captura histórica de histórico más recepciones confirmadas. Tabla, gráficos y exportación comparten corte; las jornadas siguen usando la captura histórica.
- Prueba completa: fichada controlada → recepción en Neon → pantalla; luego reinicio y corte de red. No está cumplida por las pruebas con simulador.

## Pruebas y licencia

`node --test tests/*.test.mjs` ejecuta pruebas sintéticas, conexiones sólo a 127.0.0.1 y verificaciones de persistencia. No usa credenciales municipales. El lector 4.1.1 añade al informe el código de error de limpieza para distinguir una parada solicitada de una falla previa. Conserva los comandos, pausas, validaciones y bytes de captura del 4.1.0 aportado, cuyo original sigue en Git y en el paquete fuente. La serie/IP fijas son las del piloto, no una homologación de otros K20.

Este agente separado usa **GPL-2.0-only**, como el lector aportado, con atribuciones y referencias en `reader/REFERENCIAS.md`. No se importa en el código del navegador ni se incluye en el sitio estático.

Referencias técnicas consultadas el 13/09/2026: Node.js `fs` (sincronización y modos; permisos POSIX no aplican a Windows), Microsoft `New-ScheduledTaskPrincipal` (LocalService/ServiceAccount). La unidad systemd fue revisada como configuración de instalación, no ejecutada en un host municipal. El diseño y las pruebas de la cola son de este sprint; no constituyen una garantía del fabricante.

## Protección de ruta 059.1.1

No se elige una IP libre ni se cambia la del equipo o reloj. La opción preferida es un host municipal asignado, usando su dirección existente; una VM nueva obtiene dirección desde el DHCP/IPAM institucional. No basta que una IP no responda.

Los instaladores comprueban la ruta local antes de crear cuentas, directorios y tareas. Cada captura vuelve a comprobarla antes de leer la CommKey y abrir una conexión. Se exige el prefijo municipal /19 o más específico; se rechaza salida por defecto, rutas amplias, inactivas o ambiguas. Si falta la ruta, el agente entra en network_wait y sólo repite el chequeo local; retoma al volver una ruta aceptada. No elimina un bloqueo anterior de autenticación. El panel mantiene separadas captura local y recepción en Neon.

Diagnóstico sin conexión al reloj: `node check-host.mjs`. Lee metadatos locales del equipo, la ruta real del ejecutable Node, su dependencia de un perfil de usuario, los privilegios del proceso y la presencia de archivos/tareas o unidades PM10. No abre configuraciones ni claves, no asigna direcciones y no cambia servicios. Un Node fuera del perfil tampoco demuestra que la cuenta del servicio pueda ejecutarlo. Una tarea registrada o en ejecución no acredita captura ni recepción.

Por compatibilidad con los instaladores, `localPrerequisitesReady`, `nodeAndRouteAvailable` y el código de salida sólo evalúan Node 22+ y ruta municipal (`exitCodeScope: route_node_only`): 0 si ambos están disponibles, 2 si falta alguno. No constituyen permiso de instalación ni acreditan un equipo institucional. El resultado separa `installationReady: false`, `installationReadiness: not_established`, `hostAssignment: not_evidenced` y `autonomyVerified: false` porque este diagnóstico no puede demostrar asignación municipal, disponibilidad continua ni exclusividad entre equipos. Un fallo de lectura de metadatos se informa como desconocido, sin modificar ese contrato del CLI.

No se requiere una nueva autorización por este diagnóstico: hay que contrastar los insumos técnicos que todavía no estén acreditados en el host seleccionado. La prueba de autonomía sigue siendo una captura nueva con acuse persistido, reinicio y recuperación del enlace, con la computadora personal apagada. `operatorChecks` enumera el alcance pendiente; no ejecuta esas verificaciones.

Es un prechequeo, no un firewall: debe validarse la ruta y la restricción de salida por interfaz ante cambios durante una conexión ya iniciada. La unidad Linux permite AF_NETLINK para consultas locales, sin privilegios extra. No se instaló en la municipalidad. Ver docs/SPRINT_059_1_1_RUTA_MUNICIPAL.md.

## Envío confirmado 059.2 (servicio separado)

La captura descrita arriba sigue funcionando igual. Este paquete agrega `sender.mjs` y `delivery.mjs` para enviar la cola al receptor PM-10. **No está instalado en el municipio por incluirse en este paquete.** La recepción requiere el receptor publicado, migración aplicada y activación administrativa del conector. No utiliza la CommKey como token de API.

Tras instalar/comprobar la captura 059.1.1, Cómputos puede preparar el remitente:

- Windows: ejecutar `install/install-sender-windows.ps1` como administrador, con el Node.js 22+ instalado para el equipo.
- Linux: ejecutar `sudo bash install/install-sender-linux.sh`.

Se solicita la clave pública `external_key` del conector, se genera un token local aleatorio y se muestra únicamente SHA-256 para registrarlo administrativamente. **La tarea queda deshabilitada en Windows; la unidad Linux no queda habilitada ni arrancada.** Comprobar registro del hash, ruta, exclusividad, permisos y espacio antes de activar. No repetir instalaciones para cambiar un token: la rotación debe ser coordinada.

El estado del remitente está en `state/delivery/status.json` (Windows) o `/var/lib/municontrol-pm10/delivery/status.json` (Linux). `state/estado.html` describe la captura local y, por separado, los acuses conservados por el remitente. Cuando faltan contadores muestra “Sin dato”; no transforma una lectura anterior en conexión actual. El panel web autenticado muestra las recepciones de Neon. Las confirmaciones locales se guardan en `delivery/receipts` sin modificar ni borrar `pending`.

La adquisición, recuperación y liberación del bloqueo local usan una guarda exclusiva breve. Si el proceso se interrumpe durante esa transición, se detiene con `LOCK_NEEDS_REVIEW`: comprobar los procesos y conservar la evidencia antes de intervenir. El bloqueo sigue siendo local a la instalación.

```text
node sender.mjs once --config /ruta/absoluta/sender.json
node sender.mjs run --config /ruta/absoluta/sender.json
node sender.mjs resume --config /ruta/absoluta/sender.json
```

`once` efectúa un ciclo; `run` repite cada intervalo; `resume` elimina únicamente un bloqueo de envío después de revisión humana, no inicia la captura ni borra acuses. No ejecutar dos remitentes para la misma carpeta. Los errores de red reintentan con espera persistida; un rechazo de autenticación o datos incompatibles detiene el envío. Los registros siguen conservados localmente, por lo que también hace falta monitorear el espacio. Este incremento no activa eliminación automática ni certifica días/horas de liquidación.

Más detalle: `docs/SPRINT_059_2_RECEPCION_CONTINUA.md` del repositorio principal. El instalador no cambia direcciones, firewall, DNS ni GRH. El token y los datos locales requieren protección del host; permisos no equivalen a cifrado de disco.
