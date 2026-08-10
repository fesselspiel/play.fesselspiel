#!/bin/sh
set -eu

RAW_PASSWORDS="/mosquitto/runtime/passwords.raw"
PASSWORDS="/mosquitto/runtime/passwords"
ACL="/mosquitto/runtime/acl"
CHECKSUM="/tmp/playplaner-mqtt-runtime.sha256"

mkdir -p /mosquitto/runtime
touch "$RAW_PASSWORDS" "$ACL"

render_passwords() {
  cp "$RAW_PASSWORDS" "$PASSWORDS"
  if [ -s "$PASSWORDS" ]; then
    mosquitto_passwd -U "$PASSWORDS"
  fi
  chmod 600 "$PASSWORDS" "$ACL" || true
  sha256sum "$RAW_PASSWORDS" "$ACL" > "$CHECKSUM"
}

runtime_changed() {
  [ ! -f "$CHECKSUM" ] && return 0
  sha256sum -c "$CHECKSUM" >/dev/null 2>&1 && return 1
  return 0
}

render_passwords
/docker-entrypoint.sh "$@" &
MOSQUITTO_PID="$!"

while kill -0 "$MOSQUITTO_PID" >/dev/null 2>&1; do
  sleep 20
  if runtime_changed; then
    render_passwords
    kill -HUP "$MOSQUITTO_PID" >/dev/null 2>&1 || true
  fi
done

wait "$MOSQUITTO_PID"
