#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Stage a verified municipal clock release on a Linux cloud host (Ubuntu 24.04 aarch64 on OCI).
# Runs as root over SSH. It prepares code, runtime and empty private roots; it never writes
# configuration values, credentials, tokens, VPN profiles or queues, and never enables a unit.
# Usage: stage-municipal-clock-host.sh <release.tgz> <release-sha256> [<node.tar.xz> <node-sha256>]
set -euo pipefail
fail() { printf '%s\n' "$1" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || fail STAGE_ADMIN_REQUIRED
[ "$#" -eq 2 ] || [ "$#" -eq 4 ] || fail STAGE_USAGE_RELEASE_SHA_[NODE_SHA]
release="$1"; release_sha="$2"; node_tar="${3:-}"; node_sha="${4:-}"
# STAGE_PREFIX is for rehearsals on a disposable host only; production uses the real roots.
prefix="${STAGE_PREFIX:-}"
base="$prefix/opt/municontrol"
config_root="$prefix/etc/municontrol"
state_root="$prefix/var/lib/municontrol/clock-gateway"
unit="$prefix/etc/systemd/system/municontrol-clock-gateway.service"
account=municontrol-clock
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
for command in tar sha256sum install getent useradd systemctl stat find mktemp; do command -v "$command" >/dev/null || fail STAGE_PLATFORM_NOT_READY; done
[ -f "$release" ] || fail STAGE_RELEASE_FILE_MISSING
[ "$(sha256sum "$release" | cut -d' ' -f1)" = "$release_sha" ] || fail STAGE_RELEASE_SHA_MISMATCH
# A gateway unit that already exists or runs is reviewed by a person, never replaced here.
[ ! -e "$unit" ] || fail STAGE_SERVICE_EXISTS_REVIEW_REQUIRED
! systemctl list-units --all --no-legend --no-pager 'municontrol*' | grep -q . || fail STAGE_STOP_PREVIOUS_COLLECTORS_FIRST
# Technical account: system account, no interactive shell, no home creation.
if ! getent passwd "$account" >/dev/null; then useradd --system --shell /usr/sbin/nologin --no-create-home --user-group "$account"; fi
case "$(getent passwd "$account" | cut -d: -f7)" in */nologin|*/false) ;; *) fail STAGE_SERVICE_ACCOUNT_INTERACTIVE;; esac
# Runtime: keep an existing Node >= 22, otherwise install the verified tarball.
node="$base/runtime/node"
if [ -x "$node" ] && [ "$("$node" -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)" -ge 22 ]; then
 runtime_action=kept
else
 [ -n "$node_tar" ] || fail STAGE_RUNTIME_REQUIRED
 [ "$(sha256sum "$node_tar" | cut -d' ' -f1)" = "$node_sha" ] || fail STAGE_RUNTIME_SHA_MISMATCH
 tmp="$(mktemp -d)"; tar -xJf "$node_tar" -C "$tmp" --strip-components=1
 install -d -o root -g root -m 0755 "$base" "$base/runtime"
 install -o root -g root -m 0755 "$tmp/bin/node" "$node"
 [ -f "$tmp/LICENSE" ] && install -o root -g root -m 0644 "$tmp/LICENSE" "$base/runtime/LICENSE"
 rm -rf "$tmp"; runtime_action=installed
fi
[ "$("$node" -p 'Number(process.versions.node.split(".")[0])')" -ge 22 ] || fail STAGE_RUNTIME_VERSION_INVALID
# Code: a previous release is kept next to the new one as a recovery copy, never deleted.
previous=none
if [ -d "$base/app" ]; then previous="$base.prev-$stamp"; mkdir -m 0755 "$previous"; mv "$base/app" "$base/verify-release.mjs" "$base/release-manifest.json" "$previous"/ 2>/dev/null || true; fi
tmp="$(mktemp -d)"; tar -xzf "$release" -C "$tmp"
src="$tmp"; [ -d "$tmp/app" ] || src="$(find "$tmp" -maxdepth 2 -type d -name app -printf '%h\n' | head -1)"
[ -n "$src" ] && [ -f "$src/release-manifest.json" ] && [ -f "$src/verify-release.mjs" ] || fail STAGE_RELEASE_LAYOUT_INVALID
install -d -o root -g root -m 0755 "$base"
(cd "$src" && find app -type d -exec install -d -o root -g root -m 0755 "$base/{}" \; && find app -type f -exec install -o root -g root -m 0644 "{}" "$base/{}" \;)
install -o root -g root -m 0644 "$src/verify-release.mjs" "$base/verify-release.mjs"
install -o root -g root -m 0644 "$src/release-manifest.json" "$base/release-manifest.json"
rm -rf "$tmp"
chmod 0755 "$base/app/clock-fleet/install-machine-linux.sh"
report="$("$node" "$base/verify-release.mjs" "$base")" || fail STAGE_RELEASE_VERIFICATION_FAILED
printf '%s' "$report" | "$node" -e 'let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{const r=JSON.parse(s);if(r.ok!==true||r.sourceDirty!==false)process.exitCode=1;});' || fail STAGE_RELEASE_NOT_CLEAN
# Private roots: created empty with the exact modes the strict readers require. Nothing inside is written here.
install -d -o root -g root -m 0755 "$config_root" "$prefix/var/lib/municontrol"
install -d -o "$account" -g "$account" -m 0700 "$state_root" "$state_root/coordinator" "$state_root/fleet" "$state_root/pm10"
# OpenVPN client package only; profile, certificate and key arrive through the operator channel.
vpn=absent; command -v openvpn >/dev/null && vpn=present
if [ "$vpn" = absent ] && command -v apt-get >/dev/null; then DEBIAN_FRONTEND=noninteractive apt-get install -y -q openvpn >/dev/null 2>&1 && vpn=installed || vpn=install_failed; fi
printf '{"schema":"municipal-clock-host-stage.v1","host":"%s","release":"%s","runtime":"%s","nodeVersion":"%s","previousRelease":"%s","configRoot":"%s","stateRoot":"%s","openvpn":"%s","unitRegistered":false,"activated":false,"credentialsWritten":false}\n' \
 "$(hostname)" "$(sed -n 's/.*"sourceCommit": *"\([a-f0-9]*\)".*/\1/p' "$base/release-manifest.json" | head -1)" "$runtime_action" "$("$node" --version)" "$previous" "$config_root" "$state_root" "$vpn"
