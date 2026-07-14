const fs = require("node:fs");
const path = require("node:path");

function loadEnvironment(filePath) {
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

const local = loadEnvironment(path.join(process.env.HOME, ".playplaner", "app-review.env"));
const baseURL = (process.env.APP_REVIEW_BASE_URL || local.APP_REVIEW_BASE_URL || "https://test.playplaner.com").replace(/\/$/, "");

function credentials(prefix) {
  const defaultIdentifiers = {
    ALEX: "app-review-alex@playplaner.com",
    SAM: "app-review-sam@playplaner.com"
  };
  return {
    identifier:
      process.env[`APP_REVIEW_${prefix}_IDENTIFIER`] ||
      local[`APP_REVIEW_${prefix}_IDENTIFIER`] ||
      defaultIdentifiers[prefix],
    password: process.env[`APP_REVIEW_${prefix}_PASSWORD`] || local[`APP_REVIEW_${prefix}_PASSWORD`]
  };
}

async function request(route, options = {}) {
  const response = await fetch(`${baseURL}${route}`, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function login(prefix) {
  const account = credentials(prefix);
  if (!account.identifier || !account.password) throw new Error(`Missing protected ${prefix} review credentials`);
  const result = await request("/api/external/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(account)
  });
  if (result.response.status !== 200 || !result.body?.token || !result.body?.user?.id) throw new Error(`${prefix} login failed`);
  return { token: result.body.token, id: result.body.user.id };
}

function headers(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function main() {
  const alex = await login("ALEX");
  const sam = await login("SAM");
  let createdBlock = false;
  try {
    const before = await request("/api/external/blocks", { headers: headers(alex.token) });
    if (before.response.status !== 200) throw new Error(`Block list failed: ${before.response.status}`);
    const wasBlocked = (before.body?.items || []).some((item) => item.userId === sam.id);
    if (!wasBlocked) {
      const block = await request("/api/external/blocks", {
        method: "POST",
        headers: headers(alex.token),
        body: JSON.stringify({ userId: sam.id })
      });
      if (block.response.status !== 200) throw new Error(`Block creation failed: ${block.response.status}`);
      createdBlock = true;
    }

    const targets = await request("/api/external/content-spaces/share-targets", { headers: headers(alex.token) });
    if (targets.response.status !== 200) throw new Error(`Share targets failed: ${targets.response.status}`);
    if ((targets.body?.users || []).some((user) => user.id === sam.id)) throw new Error("Blocked user remained in share targets");

    const share = await request("/api/external/share", {
      method: "POST",
      headers: headers(alex.token),
      body: JSON.stringify({
        channel: "push",
        targetType: "user",
        targetId: sam.id,
        entityType: "activity",
        entityId: "blocked-share-live-probe",
        title: "Blockierungsprüfung",
        href: "/activities/blocked-share-live-probe"
      })
    });
    if (share.response.status !== 400 || share.body?.ok !== false) throw new Error(`Blocked share was not rejected: ${share.response.status}`);

    console.log(`BLOCKED_SHARING_LIVE_OK target_hidden=1 share_rejected=1 preserved_existing_block=${createdBlock ? 0 : 1}`);
  } finally {
    if (createdBlock) {
      const unblock = await request(`/api/external/blocks/${encodeURIComponent(sam.id)}`, { method: "DELETE", headers: headers(alex.token) });
      if (unblock.response.status !== 200) throw new Error(`Block cleanup failed: ${unblock.response.status}`);
    }
    await Promise.allSettled([
      request("/api/external/auth/logout", { method: "POST", headers: headers(alex.token) }),
      request("/api/external/auth/logout", { method: "POST", headers: headers(sam.token) })
    ]);
  }
}

main().catch((error) => {
  console.error(`BLOCKED_SHARING_LIVE_FAILED:${error.message}`);
  process.exit(1);
});
