# Playplaner MCP Memory

- Der MCP-Server ist ein eigener Docker-Service `mcp`.
- Er spricht nur mit der Playplaner-App über `MCP_PORTAL_BASE_URL`, standardmäßig `http://app:8097`.
- Er greift nicht direkt auf PostgreSQL, Uploads, Prisma, Dateisysteme oder Container-Volumes zu.
- Authentifizierung erfolgt ausschließlich per `Authorization: Bearer <Playplaner API Token>`.
- Tokens werden in Playplaner verwaltet und nicht in MCP-`.env` gespeichert.
- Fachliche Rechte, Feature-Schalter und Mandantengrenzen prüft die Playplaner-API.
- Der kontrollierte Fallback erlaubt nur relative Pfade unter `/api/external/...`.
- Öffentliche Links werden aus `MCP_PUBLIC_BASE_URL` erzeugt.
- Interne URLs wie `http://app:8097` werden vor MCP-Antworten ersetzt.
- Der Host-Port auf dem VPS ist `8129`, Container-Port `8090`.
