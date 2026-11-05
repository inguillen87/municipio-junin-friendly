# Relojes en Oracle Cloud: estado del huésped y staging (2026-11-05)

Informe previo de lectura del huésped `municontrol-relojes-01`, reportado por Claude el 2026-11-05 entre 02:38 y 02:55 UTC con **Run command** de la consola de Oracle (sesión iniciada por Marcelo). Los valores siguientes corresponden a ese informe; la revisión del script de staging no volvió a consultar ni modificó la VM. No constituyen una verificación del estado actual ni una certificación de captura activa.

## Observaciones del informe previo de la VM

| Campo | Valor observado |
|---|---|
| Host / SO | `municontrol-relojes-01`, Ubuntu 24.04.5 LTS, aarch64, 45 GB disco (7 % usado), 5,9 GB RAM |
| Runtime | `/opt/municontrol/runtime/node` = **v24.21.0** (cumple Node ≥ 22). No hay `node` en PATH. |
| Código | `/opt/municontrol/app/{clock-fleet,pm10}`, `verify-release.mjs`, `release-manifest.json` de **2026-09-23**, `sourceCommit 77bf1546…`, `contentSha256 b45c427b…`. Es un release **anterior** a `master` (`dda648f`); hay que reemplazarlo por el release actual conservando copia. |
| Cuenta técnica | `municontrol-clock` existe: uid 996, gid 989. |
| Configuración privada | `/etc/municontrol` existe (root, no legible por `ocarun`); contenido desconocido. |
| Estado | `/var/lib/municontrol` existe (root). `/var/lib/municontrol/clock-gateway` no se pudo listar. |
| Unidades | Ninguna unidad `municontrol*` cargada. `openvpn-client@municontrol.service` y `openvpn.service` existen en `/etc/systemd/system` pero están **masked** (inactivas); `/etc/openvpn/client` y `/etc/openvpn/server` están **vacíos**; `tun=0`; journal sin entradas. Es decir: el paquete `openvpn` está instalado (`/usr/sbin/openvpn`) pero **no hay perfil ni certificado** para la VM. |
| Egreso | HTTPS a nodejs.org, github.com y municontrol.com responde 200. Uptime 6 semanas 23 h. Usuarios interactivos: `ubuntu`, `opc`. |
| Run command | Corre como **`ocarun` sin sudo** («a password is required»). Por este canal no se puede instalar, escribir en `/opt`, `/etc/municontrol` ni registrar unidades. |
| Salida de Run command | Limitada a ~1 KB en la consola. |

Conclusión: **para instalar hace falta root por SSH** (usuario `ubuntu`, 168.129.178.223) con la clave privada con la que se creó la instancia. Claude no busca ni copia claves privadas; Marcelo la aporta mañana (o la carga en su agente SSH) y Claude ejecuta los pasos.

## Staging de código (root; activación separada)

Antes de ejecutarlo, el operador debe verificar el acceso administrativo, un `PATH` confiable y la cuenta no interactiva `municontrol-clock` ya creada. El script no crea cuentas ni instala paquetes. Para una actualización, primero corresponde pedir `gateway.mjs stop` como la cuenta técnica y esperar la salida de todos los procesos. Cualquier unidad `municontrol*` cargada o instalada, incluso inactiva, deshabilitada o enmascarada, bloquea este staging y exige revisión del operador; el script no la detiene ni la elimina.

El código existente y todos sus ancestros deben ser directorios/archivos de root, sin symlinks ni escritura grupal/pública. Los padres de configuración y estado deben estar protegidos por root. Las configuraciones/secretos existentes deben pertenecer a la cuenta técnica y tener modo 0600 o 0400; el estado debe pertenecer a esa cuenta, con directorios 0700 y archivos 0600 o 0400. Un modo o propietario incorrecto provoca rechazo: no se corrige mediante `chmod`/`chown` automático. `STAGE_PREFIX` permite un ensayo desechable y mantiene las mismas comprobaciones sobre todos los ancestros.

1. Copiar a la VM: `CLOCK_RELEASE_LINUX_dda648f_20261105.tgz` (sha256 `acaadc3a14995851c24397b84684ed8d87db13bb16fd354fb47d6e2ca5d7ff41`) y `scripts/stage-municipal-clock-host.sh`.
2. `sudo bash stage-municipal-clock-host.sh /tmp/CLOCK_RELEASE_LINUX_dda648f_20261105.tgz acaadc3a14995851c24397b84684ed8d87db13bb16fd354fb47d6e2ca5d7ff41`
   - copia el paquete a un temporal hermano privado (0700), comprueba su SHA-256, admite rutas/tipos del archivo, valida el layout y prepara allí el candidato completo;
   - copia el runtime existente si es confiable y su versión es ≥ 22. Si falta o es anterior, requiere tarball y SHA-256 de Node como 3.º y 4.º argumento; prepara únicamente `bin/node` y su licencia dentro del candidato, sin reemplazar el runtime anterior durante la admisión;
   - ejecuta `verify-release.mjs` en el candidato y exige `ok=true` y `sourceDirty=false`, mientras el release anterior sigue intacto en su ubicación;
   - comprueba separadamente el resultado y el estado de salida de `systemctl list-units` y `list-unit-files`, tanto antes de preparar como antes de sustituir código. Una consulta fallida bloquea;
   - crea solamente las raíces vacías que falten: `/etc/municontrol` (root 0755) y `/var/lib/municontrol/clock-gateway/{coordinator,fleet,pm10}` (`municontrol-clock` 0700). Conserva bytes, propietarios y modos de todo contenido privado existente;
   - mueve **todo** `/opt/municontrol`, incluidos runtime y archivos adicionales, a `/opt/municontrol.prev-<fecha>-<identificador>`, y después coloca el candidato mediante rename en el mismo sistema de archivos. Si falla el reemplazo, intenta restaurar la base completa;
   - informa si `openvpn` está presente en el `PATH`, sin ejecutarlo ni instalarlo. Si la conectividad requiere OpenVPN y falta, su provisión administrativa es un requisito separado previo a activar, incluidos los efectos de hooks del gestor de paquetes;
   - **no** escribe configuraciones, credenciales, tokens, perfiles VPN ni colas; **no** ejecuta el instalador de servicios, registra unidades o activa colectores.

   Un `STAGE_ROLLBACK_FAILED`/`STAGE_RECOVERY_REVIEW_REQUIRED` es un fallo: el operador debe revisar la ruta de recuperación informada. Se conservan el árbol anterior completo y el temporal para recuperación; no se publica un JSON de éxito. El bloqueo `municontrol.stage-lock` de otro intento también exige revisión, nunca se borra automáticamente para continuar.

   La revisión R1 del 2026-11-05 prueba staging, rechazo y rollback en prefijos sintéticos desechables con tar, archivos, permisos, symlinks, renames y Node reales; NSS/systemd, fallos de rename y presencia de OpenVPN son fixtures explícitos. El contenedor de revisión solo mapea UID/GID 0, por lo que los atributos de propiedad de la cuenta técnica se representan mediante fixtures `stat`/`find`/`install`. Eso no valida un `chown` nativo, la VM Oracle, su paquete oficial ni la activación. El ensayo anterior del script previo no certifica esta corrección.
3. Configuración privada (operador, como `municontrol-clock`, modo 0600): `gateway.json`, `fleet-capture.json`, `fleet-delivery.json` o `fleet-source.json`, credenciales por reloj y tokens de ingesta. Plantillas abajo. Los valores reales (CommKey, tokens) salen de la instalación actual de la PC por el canal del operador; nunca por Run command, chat, Git ni CI.
4. `sudo bash /opt/municontrol/app/clock-fleet/install-machine-linux.sh` → registra la unidad **deshabilitada**.
5. VPN: perfil propio para la VM (`client-oracle-municontrol`) emitido por Cómputos en `/etc/openvpn/client/municontrol.conf` (root 0600); `systemctl unmask openvpn-client@municontrol` y habilitarla; comprobar `ip route get 172.100.96.x` por el túnel. Con el certificado de Marcelo no se puede: el servidor no acepta dos sesiones con la misma identidad y la PC lo usa.
6. Traspaso: `gateway.mjs stop` en la PC, copiar `pending`, `delivery/receipts`, `delivery-zk40` y estados con manifiesto de hashes (nunca `process.lock`), `runuser -u municontrol-clock -- /opt/municontrol/runtime/node /opt/municontrol/app/clock-fleet/gateway.mjs start --config /etc/municontrol/gateway.json`, `systemctl enable --now municontrol-clock-gateway`.
7. Cierre requerido, todavía no acreditado por este staging: primer acuse nuevo en municontrol.com **con la PC apagada**, primero PM-02, después el resto. Hugo debe comprobar cada acuse en `/relojes`; la cadencia configurada por reloj (`pollSeconds`, 900 = 15 min) debe verificarse en operación. Los pasos 3–7 son una fase separada y no son ejecutados por el script de staging.

## Plantillas (valores de ejemplo, sin secretos)

`/etc/municontrol/gateway.json`
```json
{"schema":"municipal-clock-gateway.v1","approved":true,"approvedHost":"municontrol-relojes-01",
 "stateDir":"/var/lib/municontrol/clock-gateway/coordinator",
 "workers":[{"kind":"fleet-capture","configFile":"/etc/municontrol/fleet-capture.json","enabled":true},
            {"kind":"fleet-delivery","configFile":"/etc/municontrol/fleet-delivery.json","enabled":true}]}
```

`/etc/municontrol/fleet-capture.json` (hosts dentro de `172.100.96.0/19`, puerto 4370, `pollSeconds` 60–3600)
```json
{"schema":"municontrol-clock-fleet.v1","approved":true,"stateDir":"/var/lib/municontrol/clock-gateway/fleet",
 "maxQueueMiB":512,"minFreeMiB":1024,
 "clocks":[{"clockId":"pm02","label":"PM-02","host":"172.100.96.X","port":4370,"serial":"<serie>",
            "credentialFile":"/etc/municontrol/secrets/pm02.commkey","pollSeconds":900,"enabled":true}]}
```

`/etc/municontrol/fleet-delivery.json`
```json
{"schema":"clock-fleet-delivery-config.v1","approved":true,"stateDir":"/var/lib/municontrol/clock-gateway/fleet",
 "pollSeconds":300,
 "clocks":[{"clockId":"pm02","serial":"<serie>","tokenFile":"/etc/municontrol/secrets/pm02.token",
            "connectorKey":"junin-pm02-zk40","enabled":true}]}
```

Los nombres de archivo y rutas son ejemplos; lo que fija el contrato es `gateway-config.mjs`, `runner.mjs` y `delivery.mjs`. `gateway.mjs check --config /etc/municontrol/gateway.json` valida sin abrir relojes ni enviar.

## Lo que sigue necesitando una persona
- Clave SSH de la instancia (Marcelo) para obtener root.
- Certificado VPN propio para la VM (Cómputos) y rutas para PM-04/07/08/11/12 y PM-13 sin IP.
- Ventana de corte PC → Oracle (Hugo), porque durante el traspaso no hay captura.
