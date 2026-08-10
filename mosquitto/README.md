# Mosquitto fuer Playplaner

Dieser Container ist nur der MQTT-Broker. Die Benutzer, Passwoerter und ACLs werden nicht ueber `.env` verwaltet, sondern vom Playplaner-Backend aus der Datenbank in die Dateien `mosquitto_config/passwords` und `mosquitto_config/acl` geschrieben.

Der Broker ist in Docker Compose standardmaessig nur lokal auf `127.0.0.1:18883` veroeffentlicht. Fuer externe Adapter sollte der Reverse Proxy oder ein gesicherter Tunnel/TLS-Endpunkt davorgeschaltet werden.
