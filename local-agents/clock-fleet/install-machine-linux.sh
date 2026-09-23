#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Register a prepared municipal release only. Never enable/start, copy a queue,
# generate credentials, change network routes or replace an existing service.
set -euo pipefail
fail() { printf '%s\n' "$1" >&2; exit 1; }
[ "$#" -eq 0 ] || fail GATEWAY_INSTALL_ARGUMENTS
[ "$(id -u)" -eq 0 ] || fail GATEWAY_ADMIN_REQUIRED
base=/opt/municontrol
config_root=/etc/municontrol
state_root=/var/lib/municontrol/clock-gateway
unit=/etc/systemd/system/municontrol-clock-gateway.service
account=municontrol-clock
for command in systemctl systemd-analyze runuser getent readlink find stat install cut; do command -v "$command" >/dev/null || fail GATEWAY_PLATFORM_NOT_READY; done
getent passwd "$account" >/dev/null || fail GATEWAY_SERVICE_ACCOUNT_REQUIRED
service_uid="$(id -u "$account")"
[ "$service_uid" -ne 0 ] || fail GATEWAY_SERVICE_ACCOUNT_INVALID
case "$(getent passwd "$account" | cut -d: -f7)" in */nologin|*/false) ;; *) fail GATEWAY_SERVICE_ACCOUNT_INTERACTIVE;; esac
[ ! -e "$unit" ] && [ ! -L "$unit" ] || fail GATEWAY_SERVICE_EXISTS_REVIEW_REQUIRED
# Reject any configured predecessor that could start itself, or is still active.
# Some systemd versions return 1 for an unmatched name filter. Query the full
# inventory so an empty matching set remains distinct from a scheduler failure.
units="$(systemctl list-unit-files --no-legend --no-pager)" || fail GATEWAY_SCHEDULER_UNAVAILABLE
while read -r name state _; do
 case "${name:-}" in municontrol*) ;; *) continue;; esac
 case "$state" in enabled|enabled-runtime|linked|linked-runtime|alias|generated|transient) fail GATEWAY_STOP_PREVIOUS_COLLECTORS_FIRST;; esac
 case "$(systemctl is-active "$name" 2>/dev/null || true)" in active|activating|deactivating|reloading) fail GATEWAY_STOP_PREVIOUS_COLLECTORS_FIRST;; esac
done <<< "$units"
for directory in "$base" "$base/app" "$base/runtime" "$config_root" /var/lib/municontrol; do
 [ -d "$directory" ] && [ "$(readlink -f "$directory")" = "$directory" ] || fail GATEWAY_PATH_UNSAFE
 ancestor="$directory"
 while :; do
  [ "$(stat -c %u "$ancestor")" -eq 0 ] || fail GATEWAY_CODE_OWNER_INVALID
  [ -z "$(find "$ancestor" -maxdepth 0 -perm /022 -print)" ] || fail GATEWAY_CODE_PERMISSIONS_UNSAFE
  [ "$ancestor" = / ] && break
  ancestor="$(dirname "$ancestor")"
 done
done
node="$base/runtime/node"
[ -x "$node" ] && [ -f "$base/verify-release.mjs" ] && [ -f "$base/release-manifest.json" ] || fail GATEWAY_RELEASE_MISSING
# Check ownership before running the verifier or any staged JavaScript as root.
unsafe="$(find "$base/app" "$base/runtime" "$base/verify-release.mjs" "$base/release-manifest.json" -xdev \( -type l -o ! -user root -o -perm /022 \) -print -quit)"
[ -z "$unsafe" ] || fail GATEWAY_CODE_PERMISSIONS_UNSAFE
[ "$("$node" -p 'Number(process.versions.node.split(".")[0])')" -ge 22 ] || fail GATEWAY_RUNTIME_VERSION_INVALID
report="$("$node" "$base/verify-release.mjs" "$base")" || fail GATEWAY_RELEASE_VERIFICATION_FAILED
printf '%s' "$report" | "$node" -e 'let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{const r=JSON.parse(s);if(r.ok!==true||r.sourceDirty!==false)process.exitCode=1;});' || fail GATEWAY_RELEASE_NOT_CLEAN
# Metadata and configuration only: no clock sockets, credential bytes or sends.
"$node" --input-type=module - "$base" "$config_root" "$state_root" "$service_uid" <<'JS'
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
const [base,configRoot,stateRoot,uidText]=process.argv.slice(2),uid=Number(uidText);
const fail=code=>{throw Error(code);},inside=(parent,value)=>value.startsWith(parent+path.sep);
async function item(file){const resolved=path.resolve(file),s=await fs.lstat(resolved);if(await fs.realpath(resolved)!==resolved||s.isSymbolicLink())fail('GATEWAY_PATH_UNSAFE');return s;}
async function privateFile(file){if(!inside(configRoot,file))fail('GATEWAY_PRIVATE_PATH_INVALID');const s=await item(file);if(!s.isFile()||s.uid!==uid||(s.mode&0o077)||!(s.mode&0o400))fail('GATEWAY_PRIVATE_PERMISSIONS_UNSAFE');}
async function stateDirectory(dir){if(dir!==stateRoot&&!inside(stateRoot,dir))fail('GATEWAY_STATE_MUST_BE_ISOLATED');const s=await item(dir);if(!s.isDirectory()||s.uid!==uid||(s.mode&0o077)||(s.mode&0o700)!==0o700)fail('GATEWAY_STATE_PERMISSIONS_UNSAFE');}
try{
 const {loadGateway,inspectGateway}=await import(pathToFileURL(path.join(base,'app/clock-fleet/gateway-config.mjs')).href);
 const file=path.join(configRoot,'gateway.json');await privateFile(file);const config=await loadGateway(file);await stateDirectory(stateRoot);await stateDirectory(config.stateDir);
 for(const worker of config.workers){await privateFile(worker.configFile);const raw=JSON.parse(await fs.readFile(worker.configFile,'utf8'));await stateDirectory(raw.stateDir);
  for(const secret of [raw.credentialFile,raw.tokenFile,...(raw.clocks??[]).flatMap(c=>[c.credentialFile,c.tokenFile])].filter(Boolean))await privateFile(secret);
 }
 const report=await inspectGateway(config);if(report.captureIdentities<1)fail('GATEWAY_NO_CAPTURE_CONFIGURED');
}catch(error){console.error(/^[A-Z_]+$/.test(error.message)?error.message:'GATEWAY_PREFLIGHT_FAILED');process.exitCode=1;}
JS
# Test configuration readability under the actual account without starting workers.
runuser -u "$account" -- "$node" "$base/app/clock-fleet/gateway.mjs" check --config "$config_root/gateway.json" >/dev/null || fail GATEWAY_SERVICE_PREFLIGHT_FAILED
source_unit="$base/app/clock-fleet/municontrol-clock-gateway.service"
systemd-analyze verify "$source_unit" || fail GATEWAY_UNIT_INVALID
# Every preflight above precedes the first installation mutation.
install -o root -g root -m 0644 "$source_unit" "$unit"
systemctl daemon-reload
state="$(systemctl is-enabled municontrol-clock-gateway.service 2>/dev/null || true)"
[ "$state" = disabled ] || fail GATEWAY_SERVICE_NOT_DISABLED
printf '%s\n' '{"schema":"municipal-clock-machine-install.v1","installed":true,"activated":false,"loggedOutTested":false,"networkVerified":false,"queuesModified":false}'
