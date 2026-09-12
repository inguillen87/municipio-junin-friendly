# PM-10 · Capturador residente 059

**Estado de entrega: captura periódica LOCAL. No envía a Neon.**

Este paquete envuelve, sin alterar sus bytes, el lector 4.1 que descargó fichadas de
Edificio Viejo. Lo transforma en un proceso residente con respaldo cifrado y estado
persistente. No debe confundirse con el circuito completo de marcación en la nube.

## Qué hace

- Consulta sólo PM-10, TCP 4370, comprobando la serie acordada. No escanea redes.
- Usa exclusivamente la CommKey ya conocida, ingresada una vez en el servidor.
- Espera 60 segundos DESPUÉS de terminar cada ciclo. No solapa lecturas.
- Conserva los bytes de asistencia en capturas comprimidas y cifradas AES-256-GCM.
- Una captura sin cambios no genera otro archivo. Recupera el primer commit interrumpido.
- Mantiene la captura cuando disminuye el contador y bloquea lecturas para revisión.
- Reintenta fallos de red con espera exponencial de hasta 15 minutos.
- Una autenticación rechazada o un cambio de serie/protocolo bloquean el proceso
  persistentemente. Reiniciarlo NO dispara otra serie de intentos.
- Se detiene al llegar al límite de espacio o cantidad de capturas, sin borrar evidencia.
- Distingue última lectura local, última captura nueva y confirmación cloud (siempre falsa aquí).

No descarga plantillas de huellas/rostros, no cambia fecha, usuarios o parámetros,
no deshabilita el terminal ni borra fichadas. Los eventos de fecha/identidad dudosas
se preservan en el original: este servicio no los transforma en ausencias ni en horas pagables.

## Qué falta para la nube

El receptor HTTP actual admite drivers específicos; `zk40-snapshot.v1` NO está
registrado en `createDefaultAttendanceDriverRegistry`. La carga inicial se hizo
mediante un bootstrap de mantenimiento con HMAC de identidad propio. El dashboard
lee esa captura, no las capturas locales de este servicio.

Antes de habilitar transmisión hay que completar: receptor autenticado específico,
identidad compatible con el bootstrap, deduplicación por registro incluso tras
resets de contador, preservación de observaciones, acuse verificable y consulta
incremental del tablero. Debe transmitirse el delta, no guardar una copia completa
cada minuto en Neon. El conector cloud permanece suspendido durante esta fase.

## Preparación con Cómputos

Asignar una VM/PC MUNICIPAL encendida continuamente, disco disponible y ruta LAN a
PM-10. No usar la PC personal de Marcelo. Debe coordinarse una ventana sin otro
software descargando simultáneamente ese reloj. La IP del host municipal y su sistema
operativo aún deben confirmarse. No abrir 4370, Telnet ni MySQL a Internet.

Node.js 22 o superior, instalado a nivel del equipo. No requiere `npm install`.
Los scripts deben revisarse y ejecutarse por un administrador del host municipal.
Los instaladores **no descargan programas, no cambian firewall ni activan envío cloud**.

### Windows

Descomprimir el paquete. En PowerShell elevado, desde la carpeta `pm10`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install\windows.ps1
```

Esto prepara la tarea al inicio bajo **Servicio local**, sin pedir la contraseña de
Windows y con acceso sólo de lectura a código/configuración/secretos; puede escribir
el directorio de datos. No requiere una consola abierta ni sesión interactiva después
de la instalación. La política Bypass alcanza sólo este proceso instalador; no cambia
la política global. La clave ingresada es la CommKey del reloj, NO la de Windows.

La captura viene DESHABILITADA. Para una instalación nueva con captura explícitamente
aprobada, añadir `-EnableCapture`. No repetir el instalador sobre una carpeta existente.

Comprobar posteriormente, en PowerShell elevado:

```powershell
& "$env:ProgramFiles\nodejs\node.exe" "$env:ProgramData\MuniControl\PM10\app\cli.mjs" status --root "$env:ProgramData\MuniControl\PM10"
Get-ScheduledTask -TaskName MuniControl-PM10-Captura
```

Para habilitar una instalación preparada: editar como administrador `config.json`,
poner `enabled` en `true` y ejecutar `Start-ScheduledTask -TaskName MuniControl-PM10-Captura`.
Para detenerla: `Stop-ScheduledTask -TaskName MuniControl-PM10-Captura`.

### Linux con systemd

```sh
sudo bash install/linux.sh
```

Prepara la unidad `municontrol-pm10.service`, usuario dedicado sin login, configuración
en `/var/lib/municontrol-pm10/config.json` y código en `/opt/municontrol-pm10`.
Requiere Node en `/usr/bin/node`. Para una instalación nueva autorizada a capturar,
añadir `--enable-capture`. No inicia la lectura en la modalidad de preparación.

```sh
sudo /usr/bin/node /opt/municontrol-pm10/cli.mjs status --root /var/lib/municontrol-pm10
sudo systemctl status municontrol-pm10.service
```

Para habilitar después: editar `enabled` en la configuración y arrancar la unidad.
Para detener: `sudo systemctl stop municontrol-pm10.service`.

## Estado y recuperación

`RECENT_LOCAL_READ` significa una lectura reciente guardada en este host.
**No significa reloj conectado al SaaS.** `cloudTransmission` permanece
`NOT_IMPLEMENTED` y `cloudAccepted` permanece `false` en esta entrega.

`AUTH_NOT_ACCEPTED`, `PROTOCOL_REVIEW` y `COUNTER_DECREASE` exigen revisión humana.
Una vez DETENIDA la tarea/unidad y corregida la causa, ejecutar `cli.mjs resume
--root <directorio absoluto> --ack-reviewed` y reiniciar. Ese comando no prueba una
clave ni conecta al reloj. No usarlo para probar contraseñas desconocidas.

`STORAGE_FULL`: los originales no se borran. Archivar y verificar una copia cifrada
antes de liberar espacio mediante un procedimiento administrativo. El paquete no
incluye borrado automático. Capturas por defecto: máximo 512 MiB / 2048 archivos,
con 32 MiB de reserva de espacio libre. No garantiza una duración en días.

El bloqueo usa exclusivamente `127.0.0.1:19470` para impedir dos instancias locales;
no brinda panel web ni acceso desde otras máquinas. No impide que otro servidor
municipal descargue el mismo reloj: esa exclusión debe coordinarse con Cómputos.

Guardar copia independiente de `secrets/storage.key`: perderla impide descifrar
las capturas. Protegerla por separado del respaldo de datos. El cifrado con clave
disponible para el servicio protege archivos copiados sin clave, pero NO un host
comprometido ni a un administrador con acceso a los secretos. No sustituye BitLocker,
cifrado de disco, respaldo independiente ni una prueba de restauración.

## Pruebas y aceptación municipal pendiente

```sh
node --test tests/resident.test.mjs vendor/tests/original.test.mjs vendor/tests/regression.test.mjs
```

Pruebas sintéticas del lector real sobre loopback, del cifrado, recuperación,
contador decreciente, capacidad, bloqueo, cancelación y reintentos. Los instaladores
se validan sintácticamente; su ejecución con privilegios y el reinicio del host real
siguen pendientes. No se han usado credenciales reales ni contactado la LAN desde CI.

Aceptar en el municipio sólo después de ver una captura nueva, reiniciar el host,
cortar/restablecer la conexión y confirmar preservación/idempotencia local. La etapa
posterior debe además demostrar una fichada nueva en Neon y en el tablero con la PC
personal apagada. Hasta entonces, automatización END-TO-END = PENDIENTE.

## Licencia y procedencia

Servicio separado distribuido bajo GPL-2.0-only. Lector, núcleo y pruebas del piloto
4.1 conservados del archivo aportado `MuniControl_v4_1_Lectura_Fichadas_Edificio_Viejo.zip`.
Véase `vendor/REFERENCIAS.md` y `LICENSE-GPL-2.0.txt`. No es un SDK oficial de ZKTeco.
