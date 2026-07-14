const base = String(process.env.APP_REVIEW_BASE_URL || "https://test.playplaner.com").replace(/\/$/, "");
const expectedTenantSlug = process.env.APP_REVIEW_TENANT_SLUG || "test";

const accounts = [
  {
    key: "ALEX",
    identifier: process.env.APP_REVIEW_ALEX_IDENTIFIER || "app-review-alex@playplaner.com",
    password: process.env.APP_REVIEW_ALEX_PASSWORD,
    expectedAdmin: false
  },
  {
    key: "SAM",
    identifier: process.env.APP_REVIEW_SAM_IDENTIFIER || "app-review-sam@playplaner.com",
    password: process.env.APP_REVIEW_SAM_PASSWORD,
    expectedAdmin: false
  },
  {
    key: "ADMIN",
    identifier: process.env.APP_REVIEW_ADMIN_IDENTIFIER || "app-review-admin@playplaner.com",
    password: process.env.APP_REVIEW_ADMIN_PASSWORD,
    expectedAdmin: true
  }
];

for (const account of accounts) {
  if (!account.password) {
    console.error(`APP_REVIEW_${account.key}_PASSWORD ist erforderlich`);
    process.exit(2);
  }
}

async function request(path, options = {}) {
  return fetch(`${base}${path}`, { redirect: "manual", ...options });
}

async function expectStatus(path, status, options = {}) {
  const response = await request(path, options);
  if (response.status !== status) {
    throw new Error(`${path}: erwartet ${status}, erhalten ${response.status}`);
  }
  return response;
}

async function expectJson(path, status, options = {}) {
  const response = await expectStatus(path, status, options);
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== "object") throw new Error(`${path}: kein JSON-Objekt`);
  return body;
}

async function withReviewSession(account, verify) {
  const login = await expectJson("/api/external/auth/login", 200, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier: account.identifier,
      password: account.password,
      deviceName: `App Review Rollen-Test ${account.key}`
    })
  });
  if (!login.token || !login.user?.id) throw new Error(`${account.key}: Login-Shape unvollstaendig`);
  if (login.tenant?.slug !== expectedTenantSlug) {
    throw new Error(`${account.key}: unerwarteter Tenant ${login.tenant?.slug || "(leer)"}`);
  }

  const headers = { Authorization: `Bearer ${login.token}` };
  const sessions = await expectJson("/api/external/account/sessions", 200, { headers });
  const currentSessionId = sessions.sessions?.find((session) => session.current)?.id;
  if (!currentSessionId) throw new Error(`${account.key}: aktuelle Sitzung fehlt`);

  let verificationError = null;
  try {
    return await verify({ account, login, headers });
  } catch (error) {
    verificationError = error;
    throw error;
  } finally {
    try {
      const revoked = await expectJson(
        `/api/external/account/sessions/${encodeURIComponent(currentSessionId)}`,
        200,
        { method: "DELETE", headers }
      );
      if (!revoked.currentRevoked) throw new Error(`${account.key}: Sitzung nicht als widerrufen bestaetigt`);
      await expectStatus("/api/external/status", 401, { headers });
    } catch (cleanupError) {
      if (!verificationError) throw cleanupError;
      console.error(`${account.key}: zusaetzliche Cleanup-Fehlermeldung: ${cleanupError.message}`);
    }
  }
}

async function verifyAccount(context) {
  const { account, login, headers } = context;
  const [compliance, circle, status, chat] = await Promise.all([
    expectJson("/api/external/compliance/status", 200, { headers }),
    expectJson("/api/external/account/circle", 200, { headers }),
    expectJson("/api/external/status", 200, { headers }),
    expectJson("/api/external/chat/circle", 200, { headers })
  ]);

  if (!compliance.compliance?.accessGranted) throw new Error(`${account.key}: Pflichtzustimmungen fehlen`);
  if (!circle.membership?.circle?.id) throw new Error(`${account.key}: Review-Zirkel fehlt`);
  if (!status.ok || !chat.ok) throw new Error(`${account.key}: Kernstatus oder Chat nicht bereit`);

  const expectedRestrictedStatus = account.expectedAdmin ? 200 : 403;
  const moderation = await expectJson("/api/external/moderation/reports?status=OPEN", expectedRestrictedStatus, { headers });
  const users = await expectJson("/api/external/users", expectedRestrictedStatus, { headers });
  if (account.expectedAdmin && (!moderation.ok || !users.ok)) {
    throw new Error(`${account.key}: Admin-Verwaltung nicht bereit`);
  }
  if (!account.expectedAdmin && (moderation.error !== "forbidden" || users.error !== "forbidden")) {
    throw new Error(`${account.key}: eingeschraenkte Route liefert keinen klaren Forbidden-Vertrag`);
  }

  return {
    key: account.key,
    userId: login.user.id,
    circleId: circle.membership.circle.id,
    memberCount: circle.membership.circle.memberCount,
    adminAccess: account.expectedAdmin
  };
}

async function main() {
  const results = [];
  for (const account of accounts) {
    results.push(await withReviewSession(account, verifyAccount));
  }

  if (new Set(results.map((result) => result.userId)).size !== results.length) {
    throw new Error("Review-Zugaenge wurden nicht als getrennte Benutzer erkannt");
  }
  if (new Set(results.map((result) => result.circleId)).size !== 1) {
    throw new Error("Alex, Sam und Review Admin sind nicht demselben Review-Zirkel zugeordnet");
  }
  if (results.some((result) => result.memberCount < 3)) {
    throw new Error("Review-Zirkel enthaelt weniger als drei aktive Mitglieder");
  }

  console.log("APP_REVIEW_ROLES_LIVE_OK accounts=3 user=2 admin=1 sessions_revoked=3");
}

main().catch((error) => {
  console.error(`APP_REVIEW_ROLES_LIVE_FAILED: ${error.message}`);
  process.exit(1);
});
