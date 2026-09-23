# MuniControl · cinco relojes · Windows 11

Este kit contiene el código fuente ejecutable, instalador municipal, verificación de integridad, diagnóstico y modelos de configuración para cinco equipos. No contiene contraseñas, tokens, fichadas, nombres de personas, bases de datos ni una configuración activa. No incluye Node.js: se reutiliza una instalación oficial compatible del equipo de destino. No hace falta npm ni descargar bibliotecas para ejecutar el lector.

**No ejecutar una segunda instalación sobre la PC que ya recoge esos relojes.** El traspaso necesita detener el origen, conservar sus colas y comprobar su salida antes de activar el destino. Un bloqueo de archivos no evita que otro servidor descargue el mismo reloj.

## 1. Qué queda funcionando y qué requiere preparación

La cadena es: reloj → lector en Windows → cola durable local → HTTPS en Vercel → archivo original en Neon → consulta autorizada en MuniControl. La aplicación web no abre por sí sola una conexión a un reloj de la red municipal.

El instalador registra una tarea de Windows bajo LocalService, sin depender de una sesión de escritorio, pero la deja **deshabilitada**. El host debe permanecer encendido, sin suspensión durante la operación, con disco suficiente y acceso autorizado a la red de relojes e Internet. La ruta/VPN debe funcionar para esa cuenta y después de reiniciar, no solamente durante la sesión de una persona.

Esta entrega prepara la instalación. No certifica haber instalado el nuevo host, conectado los cinco equipos ni recibido una nueva fichada con la PC anterior apagada. Esa aceptación se realiza al final, por equipo.

## 2. Antes de copiar

- Elegir un único Windows 11 administrado por la institución y un responsable técnico.
- Reservar espacio para las colas y respaldos. El programa se detiene si alcanza su cuota o el mínimo libre; no descarta pendientes. Los 300 MB libres de una PC casi llena no son una capacidad de operación aceptada.
- Obtener la ficha autorizada de los cinco relojes: identificador estable, dirección, puerto, serie comprobada y ubicación. No usar una serie supuesta ni una identidad de otro equipo.
- Obtener por canal privado la clave de comunicación de cada reloj. Este kit no descubre ni cambia esas claves.
- Coordinar la inscripción de cada equipo y emisión de un token distinto para el archivo de fuentes. Se necesitan tenant, conector, punto/dispositivo y vínculo ya autorizados por el servidor. No se envía una conexión de Neon al lector.
- Si se traslada una instalación: acordar una ventana, parada ordenada y respaldo. No ejecutar el kit como un actualizador de la instalación existente.

## 3. Verificar el ZIP y preparar el runtime

Comparar la huella SHA-256 del ZIP con el archivo `.sha256` entregado y, antes de una distribución externa, con un canal independiente del proveedor. Una huella junto al archivo comprueba igualdad, no autoría.

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\ruta\MuniControl-Cinco-Relojes-Windows11.zip'
```

Descargar Node.js LTS desde **https://nodejs.org/en/download**, según la arquitectura de Windows. El instalador exige Node 22 o superior y una firma válida de `node.exe`; esta entrega se prueba con Node 24. El runtime tiene su propia licencia y no se redistribuye aquí. No instalar gestores, Python ni dependencias npm para este kit.

Extraer la carpeta del ZIP a una carpeta nueva. El destino definitivo debe quedar, por ejemplo, así:

```text
C:\ProgramData\MuniControl\ClockGateway\
  app\clock-fleet\...
  app\pm10\...                 dependencias compartidas; no activa PM10
  verify-release.mjs
  release-manifest.json
  runtime\node.exe              runtime oficial firmado
  config\gateway.json
  config\fleet-capture.json
  config\source-delivery.json
  secrets\                     archivos privados; nunca dentro de state
  state\coordinator\
  state\fleet\
```

Si ya existe esa carpeta o una tarea MuniControl habilitada, no sobreescribir ni forzar el instalador. Seguir el apartado de transferencia/actualización. Copiar el `node.exe` oficial a `runtime` en el host de destino sólo cuando corresponda; no copiar node_modules.

## 4. Completar la configuración privada

Los tres archivos en `modelos` son plantillas incompletas y desactivadas, no configuraciones de ejemplo ejecutables. Copiarlos a `config`, quitar `.example` del nombre y completar todos los valores `REEMPLAZAR_...` con información autorizada. No guardar claves en esta guía ni en la planilla de instalación.

**Para trasladar la instalación que ya funciona en esta PC no hace falta inventar ni volver a crear sus claves.** El responsable conserva la configuración y secretos privados existentes, verifica su identidad y los transfiere por un canal protegido junto a las colas completas. Adapta únicamente las rutas absolutas y el nombre del nuevo host con revisión; no cambia `clockId`, serie, tenant, conector ni contenido de tokens para eludir un bloqueo. Esos archivos no forman parte de este ZIP compartible. Las plantillas sirven para documentar el formato o preparar una instalación nueva autorizada, no para reemplazar identidades ya inscritas.

- `gateway.json`: nombre exacto del host, estado del coordinador y dos workers: `fleet-capture` y `fleet-source-delivery`.
- `fleet-capture.json`: cinco equipos con identidades diferentes y sus archivos de clave. Captura cada 900 segundos como configuración inicial; la capacidad debe dimensionarse según los históricos reales.
- `source-delivery.json`: el mismo `clockId`, serie y raíz de cola que captura; un `connectorKey` y archivo de token distintos por equipo; tenant exacto. `windowSeconds: 900` agrupa los envíos en una ventana compartida.
- Los archivos de clave contienen únicamente la clave de comunicación en texto, sin comillas. Los archivos de token contienen únicamente el token emitido para ese equipo, sin JSON ni `Bearer`. No generar valores de prueba para sortear el preflight.
- Crear los directorios de estado vacíos antes de instalar. Mantener las credenciales fuera del ZIP y de carpetas sincronizadas/compartidas. El instalador restringe la carpeta dedicada a administradores, SYSTEM y LocalService, con escritura de LocalService sólo en estado.

Mientras se prepara, conservar `approved:false` y `enabled:false`. Cuando los valores e inscripciones estén revisados, establecer `approved:true` en los tres archivos y `enabled:true` en los dos workers, el remitente y los cinco equipos correspondientes. Esto sólo declara la configuración: **no activa una tarea**. PM10 sigue con su instalación y credenciales anteriores; no agregar workers `legacy-*` a este traspaso sin un plan separado.

No cambiar el destino HTTPS ni el prefijo de red compilado para intentar aceptar otro cliente. Esta edición está vinculada al entorno MuniControl actual; ver `LICENCIA-Y-DISTRIBUCION.md`.

## 5. Diagnóstico sin abrir relojes ni enviar fichadas

Desde PowerShell en la carpeta extraída:

```powershell
.\diagnostico-windows11.ps1 -BasePath 'C:\ProgramData\MuniControl\ClockGateway'
```

El diagnóstico no instala, inicia, para ni cambia tareas; no abre relojes, no lee tokens ni consulta Neon. Comprueba Windows, espacio libre, archivos, firma/runtime, manifiesto, configuración si está preparada y estado de la tarea. `configurada=false` significa que falta preparar una instalación, no que el ZIP esté dañado. La falta de runtime/configuración aparece como pendiente.

Para repetir las comprobaciones del programa:

```powershell
$Base = 'C:\ProgramData\MuniControl\ClockGateway'
$Node = Join-Path $Base 'runtime\node.exe'
$Gateway = Join-Path $Base 'app\clock-fleet\gateway.mjs'
$Config = Join-Path $Base 'config\gateway.json'
& $Node (Join-Path $Base 'verify-release.mjs') $Base
& $Node $Gateway check --config $Config
```

Esperar `ok:true`, `sourceDirty:false`, `captureIdentities:5`, `deliveryIdentities:5` y `allSendersConfigured:true` cuando estén configurados los cinco. `check` comprueba correspondencias, no autentica relojes ni valida el token en el servidor. Cualquier error debe corregirse antes de instalar; no reducir controles ni borrar bloqueos.

## 6. Instalar y activar con el origen detenido

En PowerShell **como administrador**, tras terminar el preflight:

```powershell
& (Join-Path $Base 'app\clock-fleet\install-machine-windows.ps1') -BasePath $Base
Get-ScheduledTask -TaskName 'MuniControl-MunicipalClockGateway' |
  Select-Object TaskName, State
```

La tarea recién registrada queda deshabilitada. Si la política de ejecución institucional bloquea el script, pedir a su administrador la revisión/firma correspondiente; no cambiar la política de toda la máquina para omitirla.

**Piloto de un equipo:** completar primero los valores reales de los cinco equipos; dejar `enabled:true` sólo para el mismo equipo en `fleet-capture.json` y `source-delivery.json`, y `enabled:false` en los otros cuatro de ambos archivos. Mantener ambos workers habilitados y el remitente general `enabled:true`. Repetir `check`: ahora lo correcto es `captureIdentities:1`, `deliveryIdentities:1`, `allSendersConfigured:true`. Para ese paso ejecutar el diagnóstico con `-ExpectedClocks 1`. Tras aceptar la recepción del piloto, hacer una parada ordenada y ampliar las mismas parejas de captura/entrega a los cinco, repetir `check` con resultado 5/5 y volver a iniciar. No mantener un reloj capturando si su entrega falta por un error de configuración.

Activar sólo después de comprobar que el lector anterior terminó y no tiene una descarga en curso:

```powershell
& $Node $Gateway start --config $Config
Enable-ScheduledTask -TaskName 'MuniControl-MunicipalClockGateway'
Start-ScheduledTask -TaskName 'MuniControl-MunicipalClockGateway'
& $Node $Gateway status --config $Config
```

`start` guarda la intención de funcionar; no crea un proceso. La tarea ejecuta el coordinador y sus dos workers. El remitente espera su ventana, de modo que iniciarlo no garantiza un envío inmediato. No iniciar además `runner run`, `sender run` ni `source-sender run` manualmente.

## 7. Cómo comprobar Vercel/Neon sin confundir estados

| Evidencia | Qué demuestra |
|---|---|
| Proceso/tarea en ejecución | El coordinador está ejecutándose; no demuestra lectura |
| Captura guardada en la cola | Los bytes quedaron en el host; todavía puede faltar envío |
| Recibo `clock-source-receipt.v1`, `persisted:true`, `scope:source_only` | El servidor confirmó esa parte guardada en el archivo fuente |
| Lote completo y acuse visible en `/relojes`, con la serie/punto correctos | Recepción consultable; todavía no aprueba asistencia ni salarios |
| Nueva fichada física recibida con la PC anterior apagada, después de reiniciar/cerrar sesión del host | Prueba de autonomía del nuevo host para ese equipo |

Consultar el portal habitual con la cuenta autorizada. No introducir tokens del lector en el navegador. El API está alojado en Vercel y recibe por HTTPS; el host no abre conexiones PostgreSQL ni contiene claves de Neon. El recibo fuente no es el acuse canónico de PM10, ni convierte registros en ausencias, horas pagables o liquidaciones.

La captura sigue guardando localmente ante un corte de Internet, dentro de su cuota. Al restablecerse, el envío utiliza las mismas identidades/partes para evitar duplicados; los originales se conservan. El intervalo de 15 minutos limita actividad, pero **no garantiza operación cloud gratuita permanente**: revisar uso, almacenamiento y condiciones vigentes de Vercel/Neon. El kit no cambia planes ni conexiones.

## 8. Parar, respaldar, actualizar y volver atrás

Parada ordenada:

```powershell
& $Node $Gateway stop --config $Config
& $Node $Gateway status --config $Config
```

Esperar a que todos los workers terminen y la tarea deje de estar ejecutándose. Después deshabilitar el disparador con `Disable-ScheduledTask`. No usar terminar proceso como parada habitual ni eliminar `process.lock` para forzar una segunda instancia. La orden `stop` persiste frente a futuros disparos de Windows.

Respaldar **con la instalación detenida**: código/manifest/runtime de la versión anterior, toda la configuración y secretos por canal privado, y toda la raíz de estado. Conservar todos los `pending`, incluidos confirmados, `delivery-source/receipts`, `.delivery-source/schedule.json`, identidades, estados y, si existieran, recibos `delivery`/`delivery-zk40`. Copiar hashes e inventario; no exponer el contenido nominal de las colas. Mantener bloqueos de seguridad y diagnósticos de corrupción. Los bloqueos de proceso del host origen se conservan como evidencia aparte; no se trasplantan como una autorización de ejecución.

Para actualizar: extraer y verificar la nueva versión en otra carpeta, detener y respaldar, sustituir sólo `app`, `verify-release.mjs` y `release-manifest.json` por el conjunto completo de esa versión. Mantener `runtime`, `config`, `secrets` y `state`; no mezclar módulos de dos releases. Revisar ACL de los archivos nuevos para conservar sólo lectura de LocalService en código/config/secretos. Repetir `check` antes de `start` y habilitación. El instalador inicial rechaza tareas existentes: no es un actualizador y no debe forzarse.

Para volver atrás: detener de nuevo y restaurar el conjunto de código verificado anterior. **No restaurar una cola antigua encima de la cola actual**: se perderían capturas nuevas. Sólo volver a código cuyo formato sea compatible con el estado existente; si no lo es, dejar detenido y revisar con el responsable. Nunca activar origen y destino a la vez.

## 9. Problemas frecuentes

| Código/síntoma | Siguiente acción |
|---|---|
| `GATEWAY_APPROVED_HOST_MISMATCH` | Revisar el host autorizado; no copiar ciegamente la aprobación de otra PC |
| `GATEWAY_RUNTIME_SIGNATURE_INVALID` | Usar runtime oficial firmado, de arquitectura correcta |
| `GATEWAY_RELEASE_NOT_CLEAN` / `RELEASE_CONTENT_MISMATCH` | Recuperar el paquete verificado completo; no regenerar hashes para encubrir modificaciones |
| `GATEWAY_DUPLICATE_CAPTURE` / `GATEWAY_DUPLICATE_DELIVERY` | Revisar series, colas, conectores e instancias anteriores |
| `MUNICIPAL_ROUTE_REQUIRED` / espera de red | Comprobar ruta/VPN bajo la cuenta de servicio; no crear una ruta por defecto de toda la VPN |
| Clave rechazada o serie distinta | Detener revisión de ese equipo y comprobar información con su responsable; no probar otras claves |
| `CLOCK_SOURCE_DELIVERY_AUTH_BLOCKED` | Revisar inscripción y token exactos con el servidor; no reutilizar el de otro reloj |
| `CLOCK_SOURCE_DELIVERY_REJECTED` | Pedir revisión del código seguro del receptor; no borrar cola/recibos |
| Falta de espacio/cuota | Detener nuevas capturas según el control; ampliar espacio o acordar retención verificada sin perder pendientes |
| Recibo inválido/corrupción | Conservar originales y evidencias; no marcar recibido manualmente |

Los bloqueos requieren revisión humana. `resume` del remitente únicamente procede una vez corregida la causa y no borra la evidencia ni envía al instante. Compartir con soporte sólo versión del paquete, fecha, códigos y conteos; nunca claves, tokens, nombres/PIN ni archivos `.bin` de fichadas.

## 10. Aceptación del responsable

Registrar por cada equipo: serie verificada, captura nueva, parte/lote completo con acuse, visualización en el portal correcto y recuperación ante corte de red. Ensayar reinicio, cierre de sesión y PC origen apagada. Anotar pendientes; un estado verde de pruebas sintéticas o integridad no sustituye ese ensayo físico.
