#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo 'Ejecutar una vez con sudo en el host municipal.' >&2; exit 1; }
[ -x /usr/bin/node ] || { echo 'Instalar Node.js 22+ en /usr/bin/node antes de continuar.' >&2; exit 1; }
[ "$(/usr/bin/node -p 'Number(process.versions.node.split(".")[0])')" -ge 22 ] || exit 1
for p in /opt/municontrol-pm10 /etc/municontrol-pm10 /var/lib/municontrol-pm10 /etc/systemd/system/municontrol-pm10.service; do
 [ ! -e "$p" ] || { echo "Existe $p; no se sobrescribe una instalacion." >&2; exit 1; }
done
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo 'Captura local PM10; todavia NO sube datos a Neon. Un solo colector municipal por reloj.'
read -r -p 'Escriba AUTORIZO para instalar: ' approval
[ "$approval" = AUTORIZO ] || exit 1
if ! id municontrol-pm10 >/dev/null 2>&1; then useradd --system --no-create-home --shell /usr/sbin/nologin municontrol-pm10; fi
install -d -m 0755 /opt/municontrol-pm10
install -d -m 0750 -o root -g municontrol-pm10 /etc/municontrol-pm10
install -d -m 0700 -o municontrol-pm10 -g municontrol-pm10 /var/lib/municontrol-pm10
for f in service.mjs store.mjs config.mjs package.json LICENSE; do install -m 0644 "$source_dir/$f" /opt/municontrol-pm10/; done
cp -R "$source_dir/reader" /opt/municontrol-pm10/
chmod -R go-w /opt/municontrol-pm10
read -r -s -p 'CommKey YA VALIDADA (oculta): ' key; printf '\n'
[[ "$key" =~ ^[0-9]{1,6}$ ]] || { unset key; echo 'Formato incorrecto; no se probo.' >&2; exit 1; }
[ "$((10#$key))" -le 4294967295 ] || { unset key; exit 1; }
umask 0077
printf '%s' "$key" > /etc/municontrol-pm10/commkey
unset key
chown municontrol-pm10:municontrol-pm10 /etc/municontrol-pm10/commkey
cat > /etc/municontrol-pm10/config.json <<'JSON'
{"schema":"pm10-capture-agent.v1","mode":"capture_only","approved":true,"host":"172.100.97.131","port":4370,"serial":"CQTU225360168","stateDir":"/var/lib/municontrol-pm10","credentialFile":"/etc/municontrol-pm10/commkey","pollSeconds":60,"maxQueueMiB":256,"minFreeMiB":64}
JSON
chown root:municontrol-pm10 /etc/municontrol-pm10/config.json
chmod 0640 /etc/municontrol-pm10/config.json
install -m 0644 "$source_dir/install/municontrol-pm10.service" /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/municontrol-pm10.service
systemctl daemon-reload
systemctl enable --now municontrol-pm10.service
echo 'Instalado. Revisar /var/lib/municontrol-pm10/estado.html y status.json. No acredita recepcion de Neon.'
