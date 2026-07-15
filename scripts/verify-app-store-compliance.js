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
const apiTokens = read("src/lib/api-tokens.ts");
const imagesApi = read("src/app/api/external/images/route.ts");
const schema = read("prisma/schema.prisma");
const rateLimit = read("src/lib/security-rate-limit.ts");
const webLogin = read("src/app/api/auth/login/route.ts");
const mobileLogin = read("src/app/api/external/auth/login/route.ts");
const auth = read("src/lib/auth.ts");
const apiTokenSettings = read("src/app/settings/api/page.tsx");
const capabilities = read("src/lib/capabilities.ts") + read("src/lib/capability-runtime.ts");
const passwordPolicy = read("src/lib/password-policy.ts");
const packageManifest = JSON.parse(read("package.json"));
const reviewRolesLive = read("scripts/verify-app-review-roles-live.js");
const blockedSharingLive = read("scripts/verify-blocked-sharing-live.js");
const fileScanBackfill = read("scripts/backfill-file-scan-status.js");
const mediaAccessLive = read("scripts/verify-media-access-live.js");
const viewContextLive = read("scripts/verify-view-context-isolation-live.js");
const mobileLoginDocs = read("docs/07-mobile-app-login.md");
const implementationLog = read("docs/03-implementierungslog.md");
const contentSpaces = read("src/lib/content-spaces.ts");
const contentSpaceRoute = read("src/app/api/external/content-spaces/route.ts");
const contentSpaceDetailRoute = read("src/app/api/external/content-spaces/[spaceId]/route.ts");
const contentEntriesRoute = read("src/app/api/external/content-spaces/[spaceId]/entries/route.ts");
const contentEntriesDetailRoute = read("src/app/api/external/content-spaces/[spaceId]/entries/[entryId]/route.ts");
const ugcSafety = read("src/lib/compliance/ugc.ts");
const eventCommentsRoute = read("src/app/api/external/events/[eventId]/comments/route.ts");
const packing = read("src/lib/packing.ts");
const packingSafety = read("src/lib/packing-safety.ts");
const packingListsRoute = read("src/app/api/external/packing/lists/route.ts");
const packingEventsRoute = read("src/app/api/external/packing/events/route.ts");
const calendarEventSafety = read("src/lib/calendar-event-safety.ts");
const calendarEvents = read("src/lib/external-calendar-events.ts");
const calendarEventsRoute = read("src/app/api/external/calendar-events/route.ts");
const dataTransfer = read("src/lib/data-transfer.ts");
const profileSettings = read("src/app/profile/page.tsx");
const privacySettingsRoute = read("src/app/api/external/account/privacy-settings/route.ts");
const nativePush = read("src/lib/native-push-notifications.ts");
const nativePushDevices = read("src/lib/native-push-devices.ts");
const nativePushDeviceDeleteRoute = read("src/app/api/external/push/devices/[id]/route.ts");
const nativePushDevicesRoute = read("src/app/api/external/push/devices/route.ts");
const eventsRoute = read("src/app/api/external/events/route.ts");
const appNavigation = read("src/lib/app-navigation.ts");
const shopifyProductsPage = read("src/app/bondage-system/page.tsx");

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
check(apiTokens.includes('if (bearer) return bearer;') && apiTokens.includes('url.searchParams.get("token")'), "Externe API muss Bearer- und bewusst aktivierte URL-Tokens unterstuetzen");
check(auth.includes("authenticateCredentials") && mobileLogin.includes("requestedMembership") && mobileLogin.includes("primaryTenantDomain(tenant)"), "Mobile Login muss erst gueltige Zugangsdaten pruefen und danach die zulaessige Seitendomain aufloesen");
check(mobileLogin.includes("createApiToken(user.id, tokenName, tenant.id)") && apiTokens.includes("tenantId: tenantId || (await currentTenant()).id"), "Automatisch aufgeloeste App-Logins muessen den Token an die bestaetigte Zielseite binden");
check(schema.includes("model SecurityRateLimit"), "Rate-Limits muessen persistent gespeichert werden");
check(rateLimit.includes('createHmac("sha256"'), "Rate-Limit-Schluessel muessen HMAC-hashiert werden");
check(rateLimit.includes('isolationLevel: "Serializable"'), "Rate-Limit-Aktualisierungen muessen konkurrierende Requests behandeln");
check(!webLogin.includes("details: { identifier:"), "Web-Login darf Kennungen nicht im Auditlog speichern");
check(!mobileLogin.includes("details: { identifier:"), "App-Login darf Kennungen nicht im Auditlog speichern");
check(webLogin.includes('status: 429') && mobileLogin.includes('status: 429'), "Web- und App-Login muessen Rate-Limits signalisieren");
check(webLogin.includes("blockMs: 15_000") && mobileLogin.includes("blockMs: 15_000"), "Web- und App-Login muessen nach zu vielen Versuchen eine kurze 15-Sekunden-Sperre verwenden");
check(apiTokenSettings.includes("Bearer") && apiTokenSettings.includes("?token=…") && apiTokenSettings.includes("Zugriffslogs"), "Tokenverwaltung muss Bearer, URL-Token und das URL-Leak-Risiko erklaeren");
check(!capabilities.includes("?token=..."), "API-Dokumentation darf reguläre Tokens nicht in URLs empfehlen");
check(!capabilities.match(/token-(?:query|url)|als Feld `token`/i), "Capabilities duerfen Query- oder Multipart-Token nicht empfehlen");
check(!apiConsole.match(/token-query|bearer token oder token/i), "API-Konsole darf Query-Token nicht als Uploadoption anzeigen");
check(!mobileLoginDocs.includes("?token=fsp_"), "Mobile-Dokumentation darf keine regulaeren Query-Token-Beispiele enthalten");
check(!mobileLoginDocs.includes("URL-Token (`?token"), "Mobile-Dokumentation darf regulaere URL-Token nicht empfehlen");
check(!mobileLoginDocs.includes("erzeugt `downloadUrlWithToken`"), "Mobile-Dokumentation darf keine tokenhaltigen Download-URLs empfehlen");
check(!implementationLog.match(/\?token=\.\.\.|\?token=fsp_|files\/\{fileId\}\?token=/), "Implementierungslog enthaelt noch aktive Query-Token-Beispiele");
check(passwordPolicy.includes("PASSWORD_MIN_LENGTH = 12") && passwordPolicy.includes("PASSWORD_MAX_LENGTH = 128"), "Zentrale Passwortregel muss 12 bis 128 Zeichen verlangen");
check(schema.includes("model ContentSpace {") && schema.includes("model ContentEntry {") && schema.includes("model ContentEntryAttachment {"), "Generische Inhaltsbereiche und Eintraege muessen additiv modelliert sein");
check(contentSpaces.includes("ensureDefaultContentSpace") && contentSpaces.includes("syncLegacyContentEntriesForUser"), "Bestehende Tagebuch-/Wiki- und Ideeninhalte muessen in echte Standardbereiche migriert werden");
check(contentSpaceRoute.includes("allowedUserIds") && contentSpaceRoute.includes("allowedCircleIds") && contentSpaceDetailRoute.includes("archivedAt: new Date()"), "Inhaltsbereiche brauchen Freigaben und verlustfreies Archivieren");
check(contentSpaces.includes("owner:") && contentSpaces.includes("own,") && contentSpaces.includes("canReport") && contentSpaces.includes("canHide"), "Inhaltsbereich-Eintraege brauchen typisierte Eigentums- und Schutzfelder");
check(contentSpaces.includes("canEditContentEntry(viewer, entry, entry.space)") && contentEntriesDetailRoute.includes("canEditContentEntry(auth.user, resolved.entry, resolved.space)"), "Bearbeitungsrechte fuer Inhaltsbereich-Eintraege duerfen nicht pauschal true sein");
check(contentSpaces.includes("blockedContentOwnerIds") && contentEntriesRoute.includes('ownerId: { notIn: excludedOwnerIds }'), "Blockierte Personen muessen aus Inhaltsbereichen und Eintraegen verschwinden");
check(contentSpaces.includes("hiddenContentIds") && contentEntriesRoute.includes('hiddenContentIds(auth.user, \"contentEntry\")'), "Moderierte Inhaltsbereich-Eintraege muessen aus Listen und Details verschwinden");
check(ugcSafety.includes('type === "contententry"') && ugcSafety.includes('entityType: "contentEntry"'), "ContentEntry-Meldungen muessen serverseitig auf sichtbare Urheber aufgeloest werden");
check(ugcSafety.includes('"feedcomment", "eventcomment"') && ugcSafety.includes('entityType: "feedComment"'), "Feed-Kommentar-Meldungen muessen serverseitig auf sichtbare Urheber aufgeloest werden");
check(eventCommentsRoute.includes('hiddenEntityIds(tenantId, "feedComment")') && eventCommentsRoute.includes("blockedUserIds(currentUserId, tenantId)"), "Blockierte und moderierte Feed-Kommentare muessen aus der Kommentaransicht verschwinden");
check(eventCommentsRoute.includes("canReport:") && eventCommentsRoute.includes("canHide:"), "Feed-Kommentare brauchen viewer-relative Schutzrechte");
check(packing.includes("own:") && packing.includes("canReport:") && packing.includes("canHide:"), "Packlisten und Pack-Events brauchen viewer-relative Schutzrechte");
check(packingSafety.includes('hiddenEntityIds(user.tenantId, "packingList")') && packingSafety.includes('hiddenEntityIds(user.tenantId, "packingEvent")'), "Moderierte Packinhalte muessen zentral ausgeschlossen werden");
check(packingListsRoute.includes('visiblePackingWhere(auth.user, "list", exclusions)') && packingEventsRoute.includes('visiblePackingWhere(auth.user, "event", exclusions)'), "Blockierte und moderierte Packinhalte muessen aus Listen verschwinden");
check(ugcSafety.includes('type === "packinglist"') && ugcSafety.includes('entityType: "packingList"') && ugcSafety.includes('entityType: "packingEvent"'), "Packinhalte muessen serverseitig auf sichtbare Urheber aufgeloest werden");
check(calendarEvents.includes("own,") && calendarEvents.includes("canReport:") && calendarEvents.includes("canHide:"), "Kalendereintraege brauchen viewer-relative Eigentums- und Schutzrechte");
check(calendarEventSafety.includes('hiddenEntityIds(user.tenantId, "calendarEvent")') && calendarEventSafety.includes("blockedUserIds"), "Moderierte und blockierte Kalendereintraege muessen zentral ausgeschlossen werden");
check(calendarEventsRoute.includes("visibleCalendarEventWhere(auth.user, exclusions)"), "Kalenderlisten muessen den zentralen Schutzfilter verwenden");
check(ugcSafety.includes('["calendarevent", "calendarentry"]') && ugcSafety.includes('entityType: "calendarEvent"'), "Kalendereintraege muessen serverseitig auf sichtbare Urheber aufgeloest werden");
check(dataTransfer.includes("contentSpaces:") && dataTransfer.includes("contentSpaceEntries:") && dataTransfer.includes("contentEntryAttachments:"), "Datenexport muss Inhaltsbereiche, Eintraege und Anlagen enthalten");
check(schema.includes("showSensitiveMedia") && profileSettings.includes('name="showSensitiveMedia"'), "Sensible Medien brauchen eine persoenliche Web-Einstellung");
check(privacySettingsRoute.includes("showSensitiveMedia"), "iOS muss die Web-Einstellung fuer sensible Medien lesen koennen");
check(privacySettingsRoute.includes("showSensitiveMedia: z.boolean().optional()"), "Die native persoenliche Medienansicht muss typisiert speicherbar sein");
check(privacySettingsRoute.includes("}).strict()"), "Die iOS-API muss unbekannte Privacy-Felder ablehnen");
check(nativePush.includes('function normalizedPreviewMode') && nativePush.includes('|| "DISCREET"'), "Push-Vorschauen muessen standardmaessig diskret sein");
check(nativePush.includes('include: { user: { select: { settings: { select: { notificationPreviewMode: true } } } } }'), "Auch direkte Pushes muessen die Vorschau-Einstellung des Empfaengers laden");
check(nativePush.includes('payloadForTest(payloadInput, mode)'), "Direkte Pushes muessen pro Vorschau-Modus erzeugt werden");
check(nativePush.includes('href: protectsContent ? null : href') && nativePush.includes('actorId: protectsContent ? null : input.actorId'), "Diskrete Pushes duerfen keine URL oder Actor-ID uebertragen");
check(nativePush.includes('eventId: !protectsContent') && nativePush.includes('threadId: protectsContent ? null'), "Geschuetzte Regel-Pushes duerfen keine Event- oder Thread-ID uebertragen");
check(nativePush.includes('neutralPushTitle(audit.action)') && nativePush.includes('neutralPushTitle(action)'), "Titelvorschauen muessen neutrale Titel statt fachlicher Rohbezeichnungen verwenden");
check(nativePushDeviceDeleteRoute.includes("deleteVisiblePushDevice(auth.user, params.id)"), "Push-Geraete brauchen einen gezielten ID-basierten Loeschvertrag");
check(nativePushDevices.includes('userId: user.id') && nativePushDevices.includes('tenantId: user.tenantId'), "Push-Geraete duerfen nur im eigenen oder aktuellen Admin-Mandanten geloescht werden");
check(nativePushDevices.includes("nativePushDevice.delete") && nativePushDevices.includes('action: "native_push_device_deleted"'), "Push-Geraete muessen physisch und datensparsam protokolliert geloescht werden");
check(nativePushDevicesRoute.includes('values.get("deviceId")') && nativePushDevicesRoute.includes("deleteVisiblePushDevice(auth.user, deviceId)"), "Der dokumentierte Body-Fallback fuer Push-Geraete muss ID-basiert funktionieren");
check(capabilities.includes('{ method: "DELETE", path: "/api/external/push/devices/{id}"'), "Capabilities muessen den gezielten Push-Geraete-Delete ausweisen");
check(eventsRoute.includes('"native_push_device_deleted"'), "Technische Push-Geraete-Loeschungen duerfen den normalen Feed nicht fuellen");
check(appNavigation.includes('label: "Shopify-Produkte"'), "Die Web-Navigation muss den neutralen Namen Shopify-Produkte verwenden");
check(shopifyProductsPage.includes("Shopify-Produkte") && !shopifyProductsPage.includes("Bondage-System"), "Die Produktseite darf den alten sichtbaren Namen Bondage-System nicht mehr anzeigen");
check(packageManifest.scripts?.["test:review-roles:live"] === "node scripts/verify-app-review-roles-live.js", "Reproduzierbarer Multi-Rollen-Review-Smoke fehlt in package.json");
check(reviewRolesLive.includes('key: "ALEX"') && reviewRolesLive.includes('key: "SAM"') && reviewRolesLive.includes('key: "ADMIN"'), "Review-Smoke muss zwei normale Benutzer und einen Administrator pruefen");
check(reviewRolesLive.includes('expectedRestrictedStatus = account.expectedAdmin ? 200 : 403'), "Review-Smoke muss Adminrechte und normale Benutzergrenzen pruefen");
check(reviewRolesLive.includes("sessions_revoked=3") && reviewRolesLive.includes('await expectStatus("/api/external/status", 401'), "Review-Smoke muss alle Testsitzungen widerrufen und die Tokens danach ablehnen");
check(packageManifest.scripts?.["test:blocked-sharing:live"] === "node scripts/verify-blocked-sharing-live.js", "Reproduzierbarer Blockierungs-/Share-Smoke fehlt in package.json");
check(blockedSharingLive.includes('"/api/external/share"') && blockedSharingLive.includes('"/api/external/blocks"') && blockedSharingLive.includes("BLOCKED_SHARING_LIVE_OK"), "Blockierungs-/Share-Smoke muss Block, Share-Ablehnung und Cleanup pruefen");
const shareSource = read("src/lib/share.ts");
check(shareSource.includes("blockedUserIds(user.id, user.tenantId)") && shareSource.includes("!excluded.has(membership.user.id)"), "Blockierte Benutzer duerfen nicht als Share-Ziel angeboten werden");
check(shareSource.includes("actorId: input.actor.id") && shareSource.includes("!excluded.has(user.id)"), "Direkte und Zirkel-Shares muessen blockierte Empfaenger serverseitig ausschliessen");
check(shareSource.includes("usersAreBlocked(delivery.tenantId, delivery.actorId, delivery.targetUserId)"), "Bestehende Share-Links muessen nach einer Blockierung gesperrt sein");
check(packageManifest.scripts?.["files:scan-backfill"] === "node scripts/backfill-file-scan-status.js", "Reproduzierbarer Scanner-Backfill fehlt in package.json");
check(fileScanBackfill.includes('process.argv.includes("--apply")') && fileScanBackfill.includes("await assertScanner()"), "Scanner-Backfill muss standardmaessig dry-run und fail-closed scannergeprueft sein");
check(fileScanBackfill.includes('scanStatus: "CLEAN"') && fileScanBackfill.includes('scanStatus: "REJECTED"') && fileScanBackfill.includes('contentClassification: "QUARANTINED"'), "Scanner-Backfill muss saubere und infizierte Altdateien getrennt behandeln");
check(packageManifest.scripts?.["test:media-access:live"] === "node scripts/verify-media-access-live.js", "Reproduzierbarer Medienzugriffs-Smoke fehlt in package.json");
check(mediaAccessLive.includes('"/api/external/profile"') && mediaAccessLive.includes('"/api/external/media?kind=ALL&limit=100"') && mediaAccessLive.includes("temporary_tokens_revoked=2"), "Medienzugriffs-Smoke muss Profil, Galerie und Token-Cleanup pruefen");
check(packageManifest.scripts?.["test:view-context:live"] === "node scripts/verify-view-context-isolation-live.js", "Reproduzierbarer Seitenisolations-Smoke fehlt in package.json");
check(viewContextLive.includes('"X-Playplaner-View-Context"') && viewContextLive.includes("Cross-tenant view retained the source actor") && viewContextLive.includes("Cleared context remained usable"), "Seitenisolations-Smoke muss Zielprofil, Mandant und Context-Cleanup pruefen");

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
