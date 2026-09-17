#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Adds a sender to an existing collector. Does not enable/start it or edit networking.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo 'Ejecutar con sudo en el host del colector.' >&2; exit 1; }
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f /etc/municontrol-pm10/config.json ] && [ -d /var/lib/municontrol-pm10/pending ] || { echo 'Se requiere una captura local ya instalada.' >&2; exit 1; }
for file in /etc/municontrol-pm10/sender.json /etc/municontrol-pm10/api-token /etc/systemd/system/municontrol-pm10-sender.service; do
 [ ! -e "$file" ] || { echo 'Ya existe configuracion de envio; no se sobrescribe.' >&2; exit 1; }
done
read -r -p 'Escriba AUTORIZO ENVIO para preparar el servicio: ' approval
[ "$approval" = 'AUTORIZO ENVIO' ] || exit 1
read -r -p 'Clave publica del conector (external_key, no token): ' connector
[[ "$connector" =~ ^[a-z0-9][a-z0-9._-]{7,127}$ ]] || exit 1
# Code dependencies must match the reviewed collector, not arbitrary installed files.
for file in store.mjs file-replacement.mjs config.mjs; do cmp -s "$source_dir/$file" "/opt/municontrol-pm10/$file" || { echo "Revisar version de $file antes de instalar." >&2; exit 1; };done
umask 0077
/usr/bin/node --input-type=module - "$connector" <<'JS'
import {randomBytes,createHash} from 'node:crypto';import fs from 'node:fs';
const token=randomBytes(32).toString('base64url');
fs.writeFileSync('/etc/municontrol-pm10/api-token',token,{mode:0o600,flag:'wx'});
fs.writeFileSync('/etc/municontrol-pm10/sender.json',JSON.stringify({schema:'pm10-delivery-config.v1',approved:true,stateDir:'/var/lib/municontrol-pm10',tokenFile:'/etc/municontrol-pm10/api-token',connectorKey:process.argv[2],pollSeconds:60},null,2),{mode:0o600,flag:'wx'});
console.log('SHA-256 para registrar en el conector autorizado (no es el token): '+createHash('sha256').update(token).digest('hex'));
JS
chown municontrol-pm10:municontrol-pm10 /etc/municontrol-pm10/{sender.json,api-token}
install -d -m 0700 -o municontrol-pm10 -g municontrol-pm10 /var/lib/municontrol-pm10/delivery
for file in delivery.mjs sender.mjs; do install -m 0644 "$source_dir/$file" /opt/municontrol-pm10/; done
install -m 0644 "$source_dir/install/municontrol-pm10-sender.service" /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/municontrol-pm10-sender.service
systemctl daemon-reload
echo 'Preparado, no iniciado. Registrar el hash y habilitar el conector con un administrador autorizado.'
echo 'Despues: systemctl enable --now municontrol-pm10-sender.service'
echo 'El token queda local. No enviar la CommKey, el token o la cola por chat.'
