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
const packageManifest = JSON.parse(read("package.json"));
const mobileLoginDocs = read("docs/07-mobile-app-login.md");
const implementationLog = read("docs/03-implementierungslog.md");
const contentSpaces = read("src/lib/content-spaces.ts");
const contentSpaceRoute = read("src/app/api/external/content-spaces/route.ts");
const contentSpaceDetailRoute = read("src/app/api/external/content-spaces/[spaceId]/route.ts");
const dataTransfer = read("src/lib/data-transfer.ts");
const profileSettings = read("src/app/profile/page.tsx");
const privacySettingsRoute = read("src/app/api/external/account/privacy-settings/route.ts");

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
check(!capabilities.match(/token-(?:query|url)|als Feld `token`/i), "Capabilities duerfen Query- oder Multipart-Token nicht empfehlen");
check(!apiConsole.match(/token-query|bearer token oder token/i), "API-Konsole darf Query-Token nicht als Uploadoption anzeigen");
check(!mobileLoginDocs.includes("?token=fsp_"), "Mobile-Dokumentation darf keine regulaeren Query-Token-Beispiele enthalten");
check(!mobileLoginDocs.includes("URL-Token (`?token"), "Mobile-Dokumentation darf regulaere URL-Token nicht empfehlen");
check(!mobileLoginDocs.includes("erzeugt `downloadUrlWithToken`"), "Mobile-Dokumentation darf keine tokenhaltigen Download-URLs empfehlen");
check(!implementationLog.match(/\?token=\.\.\.|\?token=fsp_|files\/\{fileId\}\?token=/), "Implementierungslog enthaelt noch aktive Query-Token-Beispiele");
check(passwordPolicy.includes("PASSWORD_MIN_LENGTH = 12") && passwordPolicy.includes("PASSWORD_MAX_LENGTH = 128"), "Zentrale Passwortregel muss 12 bis 128 Zeichen verlangen");
check(schema.includes("model ContentSpace {") && schema.includes("model ContentEntry {") && schema.includes("model ContentEntryAttachment {"), "Generische Inhaltsbereiche und Eintraege muessen additiv modelliert sein");
check(contentSpaces.includes("LEGACY_WIKI_SPACE_ID") && contentSpaces.includes("LEGACY_IDEAS_SPACE_ID"), "Bestehende Tagebuch-/Wiki- und Ideeninhalte muessen als verlustfreie virtuelle Bereiche sichtbar bleiben");
check(contentSpaceRoute.includes("allowedUserIds") && contentSpaceRoute.includes("allowedCircleIds") && contentSpaceDetailRoute.includes("archivedAt: new Date()"), "Inhaltsbereiche brauchen Freigaben und verlustfreies Archivieren");
check(dataTransfer.includes("contentSpaces:") && dataTransfer.includes("contentSpaceEntries:") && dataTransfer.includes("contentEntryAttachments:"), "Datenexport muss Inhaltsbereiche, Eintraege und Anlagen enthalten");
check(schema.includes("showSensitiveMedia") && profileSettings.includes('name="showSensitiveMedia"'), "Sensible Medien brauchen eine persoenliche Web-Einstellung");
check(privacySettingsRoute.includes("showSensitiveMedia"), "iOS muss die Web-Einstellung fuer sensible Medien lesen koennen");
check(!privacySettingsRoute.includes("showSensitiveMedia: z.boolean"), "Die iOS-API darf sensible Medien nicht selbst freischalten");

// There are no paid digital features in the reviewed iOS product. Shopify is
// a catalogue for physical products. Introducing payment SDKs, subscription
// models or checkout API routes must fail this audit until Guideline 3.1 and
// StoreKit have been reviewed explicitly.
const dependencies = {
  ...(packageManifest.dependencies || {}),
  ...(packageManifest.devDependencies || {})
};
for (const dependency of ["stripe", "@stripe/stripe-js", "paddle", "@paddle/paddle-node-sdk", "revenuecat", "@revenuecat/purchases-js"]) {
  check(!dependencies[dependency], `Payment-/Abo-SDK ${dependency} vorhanden; Guideline 3.1 muss neu geprueft werden`);
}
for (const model of ["Subscription", "DigitalPurchase", "AppStoreTransaction", "InAppPurchase"]) {
  check(!schema.includes(`model ${model} {`), `Digitales Kaufmodell ${model} vorhanden; Guideline 3.1 muss neu geprueft werden`);
}
for (const route of ["src/app/api/billing", "src/app/api/subscriptions", "src/app/api/checkout", "src/app/api/external/purchases"]) {
  check(!fs.existsSync(path.join(root, route)), `Digitaler Zahlungsweg ${route} vorhanden; Guideline 3.1 muss neu geprueft werden`);
}

if (failures.length) {
  console.error(`COMPLIANCE_STATIC_FAILED (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("COMPLIANCE_STATIC_OK");
