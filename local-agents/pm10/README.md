# PM-10: colector municipal de captura local · 059.1

**Estado:** software de captura local preparado para instalación. **No se ha instalado en la municipalidad y no envía a Neon.** No es el cierre del circuito automático de asistencia. No sustituye al proveedor de nómina ni calcula horas.

## Qué hace

Ejecuta el lector v4.1 que ya logró descargar el reloj, sin una consola interactiva en cada lectura. Una sola conexión por instalación; entre capturas espera 60 segundos, configurables. Verifica serie y transporte; sólo conserva capturas completas con liberación de buffer y salida de protocolo confirmadas. El equipo permanece habilitado para fichar: no se envía deshabilitación, borrado, reinicio, cambios de hora, altas de usuarios ni lectura de plantillas biométricas.

El destino está limitado en el código a PM-10, Edificio Viejo, 172.100.97.131:4370, serie CQTU225360168. No hay escaneo de red ni lista de claves. Usa una CommKey **ya validada**, de 1 a 6 dígitos según el perfil v4.1, por un archivo local protegido. Una negativa de autenticación detiene los intentos hasta revisión humana. Los errores transitorios tienen espera creciente de hasta 15 minutos y se detienen después de seis fallos consecutivos.

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

## Qué falta para cerrar la lectura automática en MuniControl

- Host municipal concreto e instalación comprobada, con ruta permanente al reloj y una única instancia.
- Receptor incremental de PM-10 autenticado, probado contra la identidad HMAC y las claves de evento de la captura inicial; el receptor genérico actual no debe recibir estos lotes.
- Acuses remotos idempotentes, reintentos de subida y métricas de frescura. Sólo un acuse válido puede confirmar una recepción en Neon.
- Dashboard que lea la fuente continua, sin seguir mostrando una captura histórica como si fuera en vivo.
- Prueba completa: fichada controlada → recepción en Neon → pantalla; luego reinicio y corte de red. No está cumplida por las pruebas con simulador.

## Pruebas y licencia

`node --test tests/*.test.mjs` ejecuta pruebas sintéticas, conexiones sólo a 127.0.0.1 y verificaciones de persistencia. No usa credenciales municipales. El lector fue conservado byte por byte del paquete v4.1 aportado; la serie/IP fijas son las del piloto, no una homologación de otros K20.

Este agente separado usa **GPL-2.0-only**, como el lector aportado, con atribuciones y referencias en `reader/REFERENCIAS.md`. No se importa en el código del navegador ni se incluye en el sitio estático.

Referencias técnicas consultadas el 13/09/2026: Node.js `fs` (sincronización y modos; permisos POSIX no aplican a Windows), Microsoft `New-ScheduledTaskPrincipal` (LocalService/ServiceAccount). La unidad systemd fue revisada como configuración de instalación, no ejecutada en un host municipal. El diseño y las pruebas de la cola son de este sprint; no constituyen una garantía del fabricante.
