import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync("src/lib/tracker-quota-deliveries.ts", "utf8");
const scheduler = readFileSync("src/lib/scheduled-rules.ts", "utf8");
const route = readFileSync("src/app/api/external/trackers/[trackerKey]/quota-delivery/route.ts", "utf8");
const testRoute = readFileSync("src/app/api/external/trackers/[trackerKey]/quota-delivery/test/route.ts", "utf8");
const capabilities = readFileSync("src/lib/capabilities.ts", "utf8");
const scheduledPage = readFileSync("src/app/settings/scheduled/page.tsx", "utf8");

test("Kontingenttext bietet lesbare und reine Zahlenvariablen mit eindeutigen Einheiten", () => {
  for (const period of ["heute", "woche", "monat"]) {
    for (const value of ["erfasst", "ziel", "offen"]) {
      assert.match(service, new RegExp(`\\$\\{prefix\\}_${value}`));
      assert.match(service, new RegExp(`\\$\\{prefix\\}_${value}_minuten`));
    }
  }
  for (const token of ["aktive_tage_erreicht", "aktive_tage_ziel", "aktive_tage_offen"]) {
    assert.match(service, new RegExp(token));
  }
});

test("API-Konfiguration ist authentifiziert, mandantengebunden und speichert Zielgeheimnisse verschlüsselt", () => {
  assert.match(route, /requireApiUser\(request\)/);
  assert.match(route, /apiFeatureGate\(auth\.user, "externalApi", "trackers"/);
  assert.match(route, /ownerId: resolved\.auth\.user\.id/);
  assert.match(route, /tenantId: resolved\.tenantId/);
  assert.match(route, /encryptSecret\(providedSecret\)/);
  assert.doesNotMatch(route, /authSecret:\s*providedSecret/);
  assert.match(service, /secretConfigured: Boolean/);
});

test("Ausgehende Ziele verlangen HTTPS und sperren lokale oder private Netze", () => {
  assert.match(service, /url\.protocol !== "https:"/);
  assert.match(service, /hostname === "localhost"/);
  assert.match(service, /hostname\.endsWith\("\.local"\)/);
  assert.match(service, /a === 10/);
  assert.match(service, /a === 172 && b >= 16 && b <= 31/);
  assert.match(service, /a === 192 && b === 168/);
  assert.match(service, /redirect: "manual"/);
  assert.match(service, /AbortSignal\.timeout\(10_000\)/);
});

test("Versand protokolliert weder Nachrichtentext noch Zugangsdaten", () => {
  assert.match(service, /characters: rendered\.length/);
  assert.doesNotMatch(service, /const details = \{[^}\n]*(?:message|payload|text|secret):/i);
  assert.doesNotMatch(service, /details: \{[^}\n]*(?:message|payload|text|secret):/i);
  assert.match(scheduler, /tracker_quota_delivery_sent/);
  assert.match(scheduler, /details: result\.details/);
});

test("Zeitplan, Soforttest, Löschen und API-Dokumentation sind verdrahtet", () => {
  assert.match(scheduler, /rule\.actionType === "TRACKER_QUOTA_TEXT"/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PUT/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /export async function DELETE/);
  assert.match(testRoute, /dispatchTrackerQuotaTextRule/);
  assert.match(capabilities, /quota-delivery\/test/);
});

test("App-eigene Versandregeln bleiben aus dem allgemeinen Web-Editor heraus", () => {
  assert.match(scheduledPage, /actionType: \{ not: TRACKER_QUOTA_TEXT_ACTION \}/);
});
