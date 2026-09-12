#!/usr/bin/env bash
set -euo pipefail
# Run from a locally reviewed package as root. No runtime dependencies are downloaded.
if [[ ${EUID} -ne 0 ]]; then echo 'Ejecutar con sudo.' >&2; exit 1; fi
if [[ $# -gt 1 || ( $# -eq 1 && $1 != '--enable-capture' ) ]]; then echo 'Uso: linux.sh [--enable-capture]' >&2; exit 1; fi
if [[ ! -x /usr/bin/node ]]; then echo 'Falta /usr/bin/node (22 o superior).' >&2; exit 1; fi
major=$(/usr/bin/node -p 'Number(process.versions.node.split(".")[0])')
if [[ "$major" -lt 22 ]]; then echo 'Node.js 22 o superior es obligatorio.' >&2; exit 1; fi
package=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
root=/var/lib/municontrol-pm10
code=/opt/municontrol-pm10
unit=/etc/systemd/system/municontrol-pm10.service
if [[ -e $root || -e $code || -e $unit ]]; then echo 'Instalacion existente. No se sobrescriben claves ni capturas.' >&2; exit 1; fi
getent group municontrol-pm10 >/dev/null || groupadd --system municontrol-pm10
id municontrol-pm10 >/dev/null 2>&1 || useradd --system --gid municontrol-pm10 --home-dir "$root" --no-create-home --shell /usr/sbin/nologin municontrol-pm10
install -d -m 0755 "$code"
cp -R "$package"/. "$code"/
chown -R root:root "$code"
chmod -R go-w "$code"
install -d -m 0750 -o root -g municontrol-pm10 "$root"
install -m 0640 -o root -g municontrol-pm10 "$code/config.example.json" "$root/config.json"
echo 'Ingrese SOLO la CommKey conocida. No se prueban claves ni se consulta el reloj durante init.'
/usr/bin/node "$code/cli.mjs" init --root "$root"
chown -R municontrol-pm10:municontrol-pm10 "$root/secrets" "$root/data"
chmod 0700 "$root/secrets" "$root/data" "$root/data/captures"
# Service sandbox makes secrets read-only even though the dedicated identity can read them.
if [[ ${1:-} == '--enable-capture' ]]; then
 /usr/bin/node --input-type=module -e 'import fs from "node:fs";const p="/var/lib/municontrol-pm10/config.json";const c=JSON.parse(fs.readFileSync(p));c.enabled=true;fs.writeFileSync(p,JSON.stringify(c,null,2)+"\n");'
fi
install -m 0644 "$code/install/municontrol-pm10.service" "$unit"
systemctl daemon-reload
systemctl enable municontrol-pm10.service
if [[ ${1:-} == '--enable-capture' ]]; then
 systemctl start municontrol-pm10.service
 echo 'Servicio iniciado. Comprobar status: iniciar no demuestra una lectura ni subida a Neon.'
else echo 'Servicio preparado. Lectura deshabilitada; no se ha consultado el reloj.'; fi
