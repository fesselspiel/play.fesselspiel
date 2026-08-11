# Optionale MQTT-TLS-Zertifikate

Der Mosquitto-Container erzeugt automatisch ein selbstsigniertes Zertifikat, wenn hier keine Dateien liegen.

Für ein eigenes Zertifikat können diese Dateien gemountet werden:

- `fullchain.pem`
- `privkey.pem`

Die Dateien gehören nicht ins Repository.
