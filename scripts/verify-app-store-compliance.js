const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const files = read("src/lib/files.ts");
const scanner = read("src/lib/file-scanner.ts");
const compose = read("docker-compose.yml");
const apiConsole = read("src/app/settings/api-control/page.tsx");
const externalApi = read("src/lib/external-api.ts");
const imagesApi = read("src/app/api/external/images/route.ts");
const schema = read("prisma/schema.prisma");
const rateLimit = read("src/lib/security-rate-limit.ts");
const webLogin = read("src/app/api/auth/login/route.ts");
const mobileLogin = read("src/app/api/external/auth/login/route.ts");
const apiTokenSettings = read("src/app/settings/api/page.tsx");
const capabilities = read("src/lib/capabilities.ts") + read("src/lib/capability-runtime.ts");
const passwordPolicy = read("src/lib/password-policy.ts");

check(files.includes("await assertMalwareFree(bytes)"), "Uploads muessen vor dem Speichern gescannt werden");
check(files.includes('scanStatus: "CLEAN" as const'), "Dateizugriff muss auf CLEAN begrenzt sein");
check(!files.includes('scanStatus: { not: "REJECTED"'), "PENDING-Dateien duerfen nicht abrufbar sein");
check(imagesApi.includes('scanStatus: "CLEAN"'), "Bildfeed muss nur CLEAN-Dateien liefern");
check(scanner.includes('Buffer.from("zINSTREAM\\0"'), "Scanner muss ClamAV INSTREAM verwenden");
check(scanner.includes("FileScanUnavailableError"), "Scanner-Ausfall muss explizit behandelt werden");
check(compose.includes("clamav/clamav@sha256:"), "ClamAV-Image muss per Digest fixiert sein");
check(compose.includes("condition: service_healthy"), "App muss auf einen gesunden Scanner warten");
check(!apiConsole.includes("endpointCurlWithQuery"), "API-Konsole darf keine Query-Token-Beispiele enthalten");
check(!apiConsole.includes("token in URL"), "API-Konsole darf Token nicht in URLs beschreiben");
check(!externalApi.match(/searchParams\.get\(["']token["']\)/), "Externe API darf Token nicht aus Query-Parametern lesen");
check(schema.includes("model SecurityRateLimit"), "Rate-Limits muessen persistent gespeichert werden");
check(rateLimit.includes('createHmac("sha256"'), "Rate-Limit-Schluessel muessen HMAC-hashiert werden");
check(rateLimit.includes('isolationLevel: "Serializable"'), "Rate-Limit-Aktualisierungen muessen konkurrierende Requests behandeln");
check(!webLogin.includes("details: { identifier:"), "Web-Login darf Kennungen nicht im Auditlog speichern");
check(!mobileLogin.includes("details: { identifier:"), "App-Login darf Kennungen nicht im Auditlog speichern");
check(webLogin.includes('status: 429') && mobileLogin.includes('status: 429'), "Web- und App-Login muessen Rate-Limits signalisieren");
check(!apiTokenSettings.includes("params.set(\"token\"") && !apiTokenSettings.includes("searchParams.token"), "API-Token darf nicht in Browser-URLs gelangen");
check(!capabilities.includes("?token=..."), "API-Dokumentation darf reguläre Tokens nicht in URLs empfehlen");
check(passwordPolicy.includes("PASSWORD_MIN_LENGTH = 12") && passwordPolicy.includes("PASSWORD_MAX_LENGTH = 128"), "Zentrale Passwortregel muss 12 bis 128 Zeichen verlangen");

if (failures.length) {
  console.error(`COMPLIANCE_STATIC_FAILED (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("COMPLIANCE_STATIC_OK");
