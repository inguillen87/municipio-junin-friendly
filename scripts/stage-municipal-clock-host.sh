#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-only
# Stage code on a stopped Linux municipal clock host. Run as root with a trusted PATH.
# The technical account must already exist. No services, packages, account, configuration
# values, credentials, tokens, VPN profiles or queues are created or activated here.
# Usage: stage-municipal-clock-host.sh <release.tgz> <release-sha256> [<node.tar.xz> <node-sha256>]
set -euo pipefail
umask 077
fail() { printf '%s\n' "$1" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || fail STAGE_ADMIN_REQUIRED
[ "$#" -eq 2 ] || [ "$#" -eq 4 ] || fail STAGE_USAGE_RELEASE_SHA_[NODE_SHA]
release="$1"; release_sha="${2,,}"; node_tar="${3:-}"; node_sha="${4:-}"
node_sha="${node_sha,,}"
[[ "$release_sha" =~ ^[a-f0-9]{64}$ ]] || fail STAGE_RELEASE_SHA_INVALID
# STAGE_PREFIX is only for a disposable rehearsal, and does not bypass path admission.
prefix="${STAGE_PREFIX:-}"
if [ -n "$prefix" ]; then
  [[ "$prefix" = /* && "$prefix" != */ && "$prefix" != *//* && "$prefix" != *$'\n'* && "$prefix" != *$'\r'* ]] || fail STAGE_PREFIX_INVALID
  case "$prefix/" in */../*|*/./*) fail STAGE_PREFIX_INVALID;; esac
fi
base="$prefix/opt/municontrol"
base_parent="$prefix/opt"
config_root="$prefix/etc/municontrol"
state_parent="$prefix/var/lib/municontrol"
state_root="$state_parent/clock-gateway"
unit_parent="$prefix/etc/systemd/system"
unit="$unit_parent/municontrol-clock-gateway.service"
lock="$base.stage-lock"
account=municontrol-clock
for command in tar sha256sum install getent systemctl stat find mktemp cp mv chmod mkdir rmdir rm hostname cut date; do
  command -v "$command" >/dev/null || fail STAGE_PLATFORM_NOT_READY
done

# Existing code and every existing ancestor must already be protected. Never chmod or
# chown an existing path to make a failing preflight appear to pass.
root_directory() {
  local path="$1" owner mode metadata
  [ ! -L "$path" ] || fail STAGE_PATH_SYMLINK
  [ -d "$path" ] || fail STAGE_PATH_NOT_DIRECTORY
  metadata="$(stat -c '%u %a' -- "$path")" || fail STAGE_PATH_INSPECTION_FAILED
  read -r owner mode <<< "$metadata"
  [[ "$owner" = 0 && "$mode" =~ ^[0-7]+$ ]] || fail STAGE_PATH_OWNER_INVALID
  (( (8#$mode & 0022) == 0 )) || fail STAGE_PATH_MODE_INVALID
}
root_path() {
  local rest="${1#/}" part current=""
  root_directory /
  while [ -n "$rest" ]; do
    part="${rest%%/*}"; current="$current/$part"
    if [ "$rest" = "$part" ]; then rest=""; else rest="${rest#*/}"; fi
    [ ! -L "$current" ] || fail STAGE_PATH_SYMLINK
    if [ -e "$current" ]; then root_directory "$current"; fi
  done
}
code_tree() {
  local bad
  [ ! -L "$1" ] && [ -d "$1" ] || fail STAGE_CODE_PATH_INVALID
  bad="$(find -P "$1" \( ! -uid 0 -o -perm /7022 -o \( ! -type d -a ! -type f \) \) -print -quit)" || fail STAGE_CODE_INSPECTION_FAILED
  [ -z "$bad" ] || fail STAGE_CODE_UNTRUSTED
}
config_tree() {
  local bad
  [ ! -e "$config_root" ] && return 0
  bad="$(find -P "$config_root" \( \( ! -type d -a ! -type f \) -o \( -type d \( ! -uid 0 -o -perm /7022 \) \) -o \( -type f \( ! -uid "$account_uid" -o ! -gid "$account_gid" -o \( ! -perm 0600 -a ! -perm 0400 \) \) \) \) -print -quit)" || fail STAGE_CONFIG_INSPECTION_FAILED
  [ -z "$bad" ] || fail STAGE_CONFIG_UNTRUSTED
}
state_tree() {
  local bad child
  [ ! -L "$state_root" ] || fail STAGE_STATE_UNTRUSTED
  [ ! -e "$state_root" ] && return 0
  [ -d "$state_root" ] || fail STAGE_STATE_UNTRUSTED
  bad="$(find -P "$state_root" \( ! -uid "$account_uid" -o ! -gid "$account_gid" -o \( ! -type d -a ! -type f \) -o \( -type d ! -perm 0700 \) -o \( -type f ! -perm 0600 ! -perm 0400 \) \) -print -quit)" || fail STAGE_STATE_INSPECTION_FAILED
  [ -z "$bad" ] || fail STAGE_STATE_UNTRUSTED
  for child in coordinator fleet pm10; do
    [ ! -e "$state_root/$child" ] || [ -d "$state_root/$child" ] || fail STAGE_STATE_UNTRUSTED
  done
}
paths_admitted() {
  root_path "$base"; root_path "$config_root"; root_path "$state_parent"; root_path "$unit_parent"
  if [ -e "$base" ]; then
    code_tree "$base"
    [ "$(stat -c '%d' -- "$base")" = "$(stat -c '%d' -- "$base_parent")" ] || fail STAGE_BASE_FILESYSTEM_INVALID
  fi
  config_tree; state_tree
}
collectors_absent() {
  local loaded installed unit_name unit_details
  [ ! -e "$unit" ] && [ ! -L "$unit" ] || fail STAGE_SERVICE_EXISTS_REVIEW_REQUIRED
  # A failed query is not an empty result. No producer/grep pipeline can hide its status.
  loaded="$(systemctl list-units --all --no-legend --no-pager 'municontrol*')" || fail STAGE_SERVICE_QUERY_FAILED_LIST_UNITS
  [[ ! "$loaded" =~ [^[:space:]] ]] || fail STAGE_STOP_PREVIOUS_COLLECTORS_FIRST
  installed="$(systemctl list-unit-files --no-legend --no-pager)" || fail STAGE_SERVICE_QUERY_FAILED_LIST_UNIT_FILES
  while read -r unit_name unit_details; do
    case "$unit_name" in
      municontrol*) fail STAGE_SERVICE_EXISTS_REVIEW_REQUIRED ;;
    esac
  done <<< "$installed"
}

# A failed NSS lookup does not authorize account creation.
entry="$(getent passwd "$account")" || fail STAGE_SERVICE_ACCOUNT_REQUIRED
[[ "$entry" != *$'\n'* ]] || fail STAGE_SERVICE_ACCOUNT_INVALID
IFS=: read -r account_name unused account_uid account_gid unused unused account_shell <<< "$entry"
[[ "$account_name" = "$account" && "$account_uid" =~ ^[0-9]+$ && "$account_gid" =~ ^[0-9]+$ ]] || fail STAGE_SERVICE_ACCOUNT_INVALID
(( 10#$account_uid > 0 && 10#$account_gid > 0 )) || fail STAGE_SERVICE_ACCOUNT_INVALID
case "$account_shell" in /usr/sbin/nologin|/sbin/nologin|/bin/false|/usr/bin/false) ;; *) fail STAGE_SERVICE_ACCOUNT_INTERACTIVE;; esac
paths_admitted
collectors_absent
[ ! -L "$release" ] && [ -f "$release" ] || fail STAGE_RELEASE_FILE_MISSING

work=""; locked=0; previous=none; previous_moved=0; candidate_moved=0; complete=0
created_roots=()
rollback() {
  if [ "$previous_moved" -ne 1 ]; then
    if [ "$candidate_moved" -eq 1 ]; then
      mv -T -- "$base" "$work/failed-candidate" || { printf '%s\n' STAGE_ROLLBACK_FAILED >&2; return 1; }
    fi
    return 0
  fi
  if [ -e "$base" ] || [ -L "$base" ]; then
    if ! mv -T -- "$base" "$previous.failed-candidate"; then
      printf 'STAGE_ROLLBACK_FAILED: previous=%s active=%s\n' "$previous" "$base" >&2
      return 1
    fi
  fi
  if ! mv -T -- "$previous" "$base"; then
    printf 'STAGE_ROLLBACK_FAILED: previous=%s destination=%s\n' "$previous" "$base" >&2
    return 1
  fi
  previous_moved=0
  printf '%s\n' STAGE_PREVIOUS_RESTORED >&2
}
cleanup() {
  local status=$? rollback_ok=1 index
  trap - EXIT
  set +e
  if [ "$complete" -eq 0 ]; then rollback || rollback_ok=0; fi
  if [ "$rollback_ok" -eq 1 ]; then
    [ -z "$work" ] || rm -rf -- "$work"
  else
    printf 'STAGE_RECOVERY_REVIEW_REQUIRED: workspace=%s\n' "$work" >&2
    status=1
  fi
  if [ "$locked" -eq 1 ]; then rmdir -- "$lock" || printf '%s\n' STAGE_LOCK_CLEANUP_REQUIRED >&2; fi
  if [ "$complete" -eq 0 ]; then
    for ((index=${#created_roots[@]}-1; index>=0; index--)); do
      rmdir -- "${created_roots[index]}" 2>/dev/null || :
    done
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
ensure_root_path() {
  local rest="${1#/}" part current=""
  while [ -n "$rest" ]; do
    part="${rest%%/*}"; current="$current/$part"
    if [ "$rest" = "$part" ]; then rest=""; else rest="${rest#*/}"; fi
    [ ! -L "$current" ] || fail STAGE_PATH_SYMLINK
    if [ -e "$current" ]; then root_directory "$current"; else
      mkdir -m 0755 -- "$current" || fail STAGE_ROOT_CREATION_FAILED
      created_roots+=("$current")
    fi
  done
}
ensure_state_directory() {
  [ ! -e "$1" ] || return 0
  install -d -o "$account_uid" -g "$account_gid" -m 0700 -- "$1" || fail STAGE_STATE_ROOT_CREATION_FAILED
  created_roots+=("$1")
}
ensure_root_path "$base_parent"
mkdir -m 0700 -- "$lock" 2>/dev/null || fail STAGE_LOCK_HELD_REVIEW_REQUIRED
locked=1
work="$(mktemp -d "$base.stage.XXXXXXXX")" || fail STAGE_TEMPORARY_ROOT_FAILED
candidate="$work/candidate"
mkdir -m 0755 -- "$candidate"
if [ -e "$base" ]; then
  previous="$base.prev-$(date -u +%Y%m%dT%H%M%SZ)-${work##*.stage.}"
  [ ! -e "$previous" ] && [ ! -L "$previous" ] || fail STAGE_PREVIOUS_DESTINATION_EXISTS
fi
# Copy first, then verify the protected copy: the supplied upload may live in /tmp.
cp -- "$release" "$work/release.tgz" || fail STAGE_RELEASE_COPY_FAILED
[ "$(sha256sum "$work/release.tgz" | cut -d' ' -f1)" = "$release_sha" ] || fail STAGE_RELEASE_SHA_MISMATCH

# Admit archive member paths and types before extraction. Release archives contain only
# ordinary files/directories; names use the release builder's portable path alphabet.
archive_members() {
  local archive="$1" compression="$2" names details line name normalized type index=0
  names="$(tar "-t${compression}f" "$archive" --quoting-style=escape)" || fail STAGE_ARCHIVE_INVALID
  details="$(tar "-tv${compression}f" "$archive" --quoting-style=escape --numeric-owner)" || fail STAGE_ARCHIVE_INVALID
  mapfile -t member_names <<< "$names"
  member_types=()
  while IFS= read -r line; do member_types+=("${line:0:1}"); done <<< "$details"
  [ "${#member_names[@]}" -eq "${#member_types[@]}" ] || fail STAGE_ARCHIVE_INVALID
  declare -A seen=()
  for name in "${member_names[@]}"; do
    type="${member_types[index]}"; index=$((index+1))
    [[ "$name" =~ ^[A-Za-z0-9_./@+-]+$ && "$name" != /* && "$name" != *//* ]] || fail STAGE_ARCHIVE_PATH_INVALID
    normalized="${name#./}"; normalized="${normalized%/}"
    if [ -z "$normalized" ] || [ "$normalized" = . ]; then
      [ "$type" = d ] || fail STAGE_ARCHIVE_PATH_INVALID
      normalized=.
    else
      case "/$normalized/" in */../*|*/./*) fail STAGE_ARCHIVE_PATH_INVALID;; esac
    fi
    [ -z "${seen[$normalized]+present}" ] || fail STAGE_ARCHIVE_DUPLICATE_PATH
    seen["$normalized"]=1
  done
}
archive_members "$work/release.tgz" z
for type in "${member_types[@]}"; do
  [[ "$type" = d || "$type" = - ]] || fail STAGE_RELEASE_ARCHIVE_TYPE_INVALID
done
mkdir -m 0700 -- "$work/extracted"
tar -xzf "$work/release.tgz" -C "$work/extracted" --no-same-owner --no-same-permissions --keep-old-files || fail STAGE_RELEASE_EXTRACTION_FAILED
src="$work/extracted"
if [ ! -d "$src/app" ]; then
  shopt -s nullglob dotglob
  entries=("$src"/*)
  shopt -u nullglob dotglob
  [ "${#entries[@]}" -eq 1 ] && [ -d "${entries[0]}" ] || fail STAGE_RELEASE_LAYOUT_INVALID
  src="${entries[0]}"
fi
[ -d "$src/app" ] && [ -f "$src/release-manifest.json" ] && [ -f "$src/verify-release.mjs" ] && [ -f "$src/app/clock-fleet/install-machine-linux.sh" ] || fail STAGE_RELEASE_LAYOUT_INVALID
cp -R -- "$src/app" "$candidate/app"
install -m 0644 -- "$src/verify-release.mjs" "$src/release-manifest.json" "$candidate/"
find "$candidate/app" -type d -exec chmod 0755 {} + || fail STAGE_CANDIDATE_MODE_FAILED
find "$candidate/app" -type f -exec chmod 0644 {} + || fail STAGE_CANDIDATE_MODE_FAILED
chmod 0755 -- "$candidate/app/clock-fleet/install-machine-linux.sh"

runtime_action=installed
existing_node="$base/runtime/node"
if [ -x "$existing_node" ]; then
  major="$("$existing_node" -p 'Number(process.versions.node.split(".")[0])')" || fail STAGE_RUNTIME_VERSION_INVALID
  [[ "$major" =~ ^[0-9]+$ ]] || fail STAGE_RUNTIME_VERSION_INVALID
  if [ "$major" -ge 22 ]; then
    cp -a -- "$base/runtime" "$candidate/runtime" || fail STAGE_RUNTIME_COPY_FAILED
    runtime_action=kept
  fi
fi
if [ "$runtime_action" = installed ]; then
  [ -n "$node_tar" ] || fail STAGE_RUNTIME_REQUIRED
  [ ! -L "$node_tar" ] && [ -f "$node_tar" ] || fail STAGE_RUNTIME_FILE_MISSING
  [[ "$node_sha" =~ ^[a-f0-9]{64}$ ]] || fail STAGE_RUNTIME_SHA_INVALID
  cp -- "$node_tar" "$work/node.tar.xz" || fail STAGE_RUNTIME_COPY_FAILED
  [ "$(sha256sum "$work/node.tar.xz" | cut -d' ' -f1)" = "$node_sha" ] || fail STAGE_RUNTIME_SHA_MISMATCH
  archive_members "$work/node.tar.xz" J
  node_member=""; license_member=""; node_package=""
  for ((index=0; index<${#member_names[@]}; index++)); do
    name="${member_names[index]}"; normalized="${name#./}"
    case "$normalized" in
      bin/node|*/bin/node)
        [ "${member_types[index]}" = - ] && [ -z "$node_member" ] || fail STAGE_RUNTIME_LAYOUT_INVALID
        node_member="$name"; node_package="${normalized%bin/node}";;
    esac
  done
  [ -n "$node_member" ] || fail STAGE_RUNTIME_LAYOUT_INVALID
  for ((index=0; index<${#member_names[@]}; index++)); do
    name="${member_names[index]}"
    if [ "${name#./}" = "${node_package}LICENSE" ]; then
      [ "${member_types[index]}" = - ] || fail STAGE_RUNTIME_LAYOUT_INVALID
      license_member="$name"
    fi
  done
  mkdir -m 0755 -- "$candidate/runtime"
  # Extract only the two admitted regular members to stdout, never the archive's paths
  # or npm/npx symlinks. No previous runtime is changed during this preparation.
  tar -xJOf "$work/node.tar.xz" -- "$node_member" > "$candidate/runtime/node" || fail STAGE_RUNTIME_EXTRACTION_FAILED
  chmod 0755 -- "$candidate/runtime/node"
  if [ -n "$license_member" ]; then
    tar -xJOf "$work/node.tar.xz" -- "$license_member" > "$candidate/runtime/LICENSE" || fail STAGE_RUNTIME_EXTRACTION_FAILED
    chmod 0644 -- "$candidate/runtime/LICENSE"
  fi
fi
code_tree "$candidate"
node="$candidate/runtime/node"
major="$("$node" -p 'Number(process.versions.node.split(".")[0])')" || fail STAGE_RUNTIME_VERSION_INVALID
[[ "$major" =~ ^[0-9]+$ ]] && [ "$major" -ge 22 ] || fail STAGE_RUNTIME_VERSION_INVALID
report="$(cd "$candidate" && "$node" "$candidate/verify-release.mjs" "$candidate")" || fail STAGE_RELEASE_VERIFICATION_FAILED
printf '%s' "$report" | "$node" -e 'let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{try{const r=JSON.parse(s);if(r.ok!==true||r.sourceDirty!==false)process.exitCode=1;}catch{process.exitCode=1;}});' || fail STAGE_RELEASE_NOT_CLEAN
code_tree "$candidate"

# Only empty roots may be created; existing roots and every existing file retain their
# owners, modes and bytes. Any rejection above leaves the previous installation in place.
paths_admitted
ensure_root_path "$config_root"
ensure_root_path "$state_parent"
ensure_state_directory "$state_root"
for child in coordinator fleet pm10; do ensure_state_directory "$state_root/$child"; done
paths_admitted
collectors_absent
vpn=absent; command -v openvpn >/dev/null && vpn=present
node_version="$("$node" --version)"
host_name="$(hostname)"
stage_report="$("$node" --input-type=module - "$candidate/release-manifest.json" "$runtime_action" "$node_version" "$previous" "$config_root" "$state_root" "$vpn" "$host_name" <<'NODE'
import fs from 'node:fs';
const [manifestPath,runtime,nodeVersion,previousRelease,configRoot,stateRoot,openvpn,host]=process.argv.slice(2);
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(typeof manifest.sourceCommit!=='string'||!/^[a-f0-9]{40}$/i.test(manifest.sourceCommit))throw new Error('STAGE_RELEASE_COMMIT_INVALID');
console.log(JSON.stringify({schema:'municipal-clock-host-stage.v1',host,release:manifest.sourceCommit,runtime,nodeVersion,previousRelease,configRoot,stateRoot,openvpn,openvpnPrerequisiteSatisfied:openvpn==='present',packageInstallationAttempted:false,accountCreated:false,unitRegistered:false,activated:false,credentialsWritten:false,stateContentsWritten:false,clockOperationCertified:false}));
NODE
)" || fail STAGE_REPORT_PREPARATION_FAILED

# Every move is a same-filesystem rename of a whole directory. Keep the complete previous
# base (including runtime and extra files), and restore it if the second move or check fails.
if [ "$previous" != none ]; then
  if mv -T -- "$base" "$previous"; then previous_moved=1; else
    if [ -e "$previous" ] && [ ! -e "$base" ]; then previous_moved=1; fi
    fail STAGE_PREVIOUS_MOVE_FAILED
  fi
fi
if mv -T -- "$candidate" "$base"; then candidate_moved=1; else
  if [ -e "$base" ] && [ ! -e "$candidate" ]; then candidate_moved=1; fi
  fail STAGE_CANDIDATE_MOVE_FAILED
fi
code_tree "$base"
complete=1
printf '%s\n' "$stage_report"
