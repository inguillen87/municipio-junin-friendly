# Relojes en Oracle Cloud: estado del huésped y staging (2026-11-05)

Lectura del huésped `municontrol-relojes-01` hecha por Claude el 2026-11-05 entre 02:38 y 02:55 UTC con **Run command** de la consola de Oracle (sesión iniciada por Marcelo). Tres comandos de solo lectura, exit 0. No se escribió nada en la VM.

## Lo que hay en la VM hoy

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

## Staging en un solo paso (root por SSH)

1. Copiar a la VM: `CLOCK_RELEASE_LINUX_dda648f_20261105.tgz` (sha256 `acaadc3a14995851c24397b84684ed8d87db13bb16fd354fb47d6e2ca5d7ff41`) y `scripts/stage-municipal-clock-host.sh`.
2. `sudo bash stage-municipal-clock-host.sh /tmp/CLOCK_RELEASE_LINUX_dda648f_20261105.tgz acaadc3a14995851c24397b84684ed8d87db13bb16fd354fb47d6e2ca5d7ff41`
   - conserva el release anterior en `/opt/municontrol.prev-<fecha>`;
   - mantiene el Node 24.21.0 existente (sólo instala uno si no hay ≥ 22; en ese caso se pasan tarball y sha256 de nodejs.org como 3.º y 4.º argumento);
   - verifica el release con `verify-release.mjs` (ok y `sourceDirty=false`);
   - crea `/etc/municontrol` (root 0755) y `/var/lib/municontrol/clock-gateway/{coordinator,fleet,pm10}` (`municontrol-clock` 0700);
   - instala el paquete `openvpn` si falta;
   - **no** escribe configuraciones, credenciales, tokens ni perfiles VPN; **no** registra ni habilita la unidad.
   Ensayado el 2026-11-05 en contenedor con `STAGE_PREFIX` (release real, Node 22): staging, reinstalación con copia previa, rechazo por sha256 incorrecto y rechazo por unidad existente.
3. Configuración privada (operador, como `municontrol-clock`, modo 0600): `gateway.json`, `fleet-capture.json`, `fleet-delivery.json` o `fleet-source.json`, credenciales por reloj y tokens de ingesta. Plantillas abajo. Los valores reales (CommKey, tokens) salen de la instalación actual de la PC por el canal del operador; nunca por Run command, chat, Git ni CI.
4. `sudo bash /opt/municontrol/app/clock-fleet/install-machine-linux.sh` → registra la unidad **deshabilitada**.
5. VPN: perfil propio para la VM (`client-oracle-municontrol`) emitido por Cómputos en `/etc/openvpn/client/municontrol.conf` (root 0600); `systemctl unmask openvpn-client@municontrol` y habilitarla; comprobar `ip route get 172.100.96.x` por el túnel. Con el certificado de Marcelo no se puede: el servidor no acepta dos sesiones con la misma identidad y la PC lo usa.
6. Traspaso: `gateway.mjs stop` en la PC, copiar `pending`, `delivery/receipts`, `delivery-zk40` y estados con manifiesto de hashes (nunca `process.lock`), `runuser -u municontrol-clock -- /opt/municontrol/runtime/node /opt/municontrol/app/clock-fleet/gateway.mjs start --config /etc/municontrol/gateway.json`, `systemctl enable --now municontrol-clock-gateway`.
7. Cierre: primer acuse nuevo en municontrol.com **con la PC apagada**, primero PM-02, después el resto. Hugo ve cada acuse en `/relojes`; la cadencia por reloj (`pollSeconds`, 900 = 15 min) ya cubre el pedido de 15–30 min.

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
