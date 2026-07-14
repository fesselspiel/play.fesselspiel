const base = String(process.env.APP_REVIEW_BASE_URL || "https://playplaner.com").replace(/\/$/, "");
const identifier = process.env.APP_REVIEW_IDENTIFIER;
const password = process.env.APP_REVIEW_PASSWORD;

if (!identifier || !password) {
  console.error("APP_REVIEW_IDENTIFIER und APP_REVIEW_PASSWORD sind erforderlich");
  process.exit(2);
}

async function expectStatus(path, status, options = {}) {
  const response = await fetch(`${base}${path}`, { redirect: "manual", ...options });
  if (response.status !== status) throw new Error(`${path}: erwartet ${status}, erhalten ${response.status}`);
  return response;
}

async function expectStatuses(path, statuses, options = {}) {
  const response = await fetch(`${base}${path}`, { redirect: "manual", ...options });
  if (!statuses.includes(response.status)) throw new Error(`${path}: erwartet ${statuses.join("/")}, erhalten ${response.status}`);
  return response;
}

async function main() {
  for (const path of ["/privacy", "/terms", "/community-guidelines", "/support"]) {
    const response = await expectStatus(path, 200);
    const html = await response.text();
    if (html.length < 500 || /TODO|Platzhalter/i.test(html)) throw new Error(`${path}: Inhalt unvollstaendig`);
  }

  const login = await expectStatus("/api/external/auth/login", 200, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password, deviceName: "Compliance Live Test" })
  });
  const token = (await login.json()).token;
  if (!token) throw new Error("Login lieferte kein Token");
  const headers = { Authorization: `Bearer ${token}` };
  const sessions = await expectStatus("/api/external/account/sessions", 200, { headers });
  const currentSessionId = (await sessions.json()).sessions?.find((session) => session.current)?.id || null;
  if (!currentSessionId) throw new Error("Aktuelle App-Sitzung wurde nicht gefunden");

  try {
    for (const path of [
      "/api/external/compliance/status",
      "/api/external/capabilities",
      "/api/external/sessions",
      "/api/external/media",
      "/api/external/trackers/history",
      "/api/external/calendar-events"
    ]) await expectStatus(path, 200, { headers });
    await expectStatuses("/api/external/chat/circle", [200, 403], { headers });

    const dataExport = await expectStatus("/api/external/account/export", 200, { headers });
    if (!String(dataExport.headers.get("content-type")).includes("application/zip")) throw new Error("Datenexport ist kein ZIP-Archiv");
    if (!String(dataExport.headers.get("cache-control")).includes("no-store")) throw new Error("Datenexport muss no-store sein");
    const exportBytes = new Uint8Array(await dataExport.arrayBuffer());
    if (exportBytes[0] !== 0x50 || exportBytes[1] !== 0x4b) throw new Error("Datenexport ist kein gueltiges ZIP-Archiv");
  } finally {
    const revoked = await expectStatus(`/api/external/account/sessions/${encodeURIComponent(currentSessionId)}`, 200, { method: "DELETE", headers });
    const result = await revoked.json();
    if (!result.currentRevoked) throw new Error("Aktuelle App-Sitzung wurde nicht widerrufen");
    await expectStatus("/api/external/status", 401, { headers });
  }
}

main().then(() => console.log("COMPLIANCE_LIVE_OK")).catch((error) => {
  console.error(`COMPLIANCE_LIVE_FAILED: ${error.message}`);
  process.exit(1);
});
