#!/bin/sh
set -eu

RAW_PASSWORDS="/mosquitto/runtime/passwords.raw"
PASSWORDS="/mosquitto/runtime/passwords"
ACL="/mosquitto/runtime/acl"
CHECKSUM="/tmp/playplaner-mqtt-runtime.sha256"
TLS_DIR="/mosquitto/runtime/tls"
TLS_CERT="$TLS_DIR/server.crt"
TLS_KEY="$TLS_DIR/server.key"
MOUNTED_CERT="/playplaner-tls/fullchain.pem"
MOUNTED_KEY="/playplaner-tls/privkey.pem"

mkdir -p /mosquitto/runtime "$TLS_DIR"
touch "$RAW_PASSWORDS" "$ACL"

prepare_tls() {
  if [ -s "$MOUNTED_CERT" ] && [ -s "$MOUNTED_KEY" ]; then
    cp "$MOUNTED_CERT" "$TLS_CERT"
    cp "$MOUNTED_KEY" "$TLS_KEY"
  fi
  if [ ! -s "$TLS_CERT" ] || [ ! -s "$TLS_KEY" ]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
      -keyout "$TLS_KEY" \
      -out "$TLS_CERT" \
      -subj "/CN=playplaner-mqtt" \
      -addext "subjectAltName=DNS:playplaner.com,DNS:play.fesselspiel.com,DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1
  fi
  chmod 600 "$TLS_KEY" || true
  chmod 644 "$TLS_CERT" || true
}

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

prepare_tls
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
