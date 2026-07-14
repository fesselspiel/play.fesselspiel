const base = String(process.env.APP_REVIEW_BASE_URL || "http://127.0.0.1:8097").replace(/\/$/, "");
const identifier = process.env.APP_REVIEW_IDENTIFIER;
const password = process.env.APP_REVIEW_PASSWORD;
const mode = process.argv.includes("--scanner-unavailable") ? "unavailable" : "full";
const cleanPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const eicar = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*", "ascii");

if (!identifier || !password) {
  console.error("APP_REVIEW_IDENTIFIER und APP_REVIEW_PASSWORD sind erforderlich");
  process.exit(2);
}

async function request(path, options = {}) {
  return fetch(`${base}${path}`, { redirect: "manual", ...options });
}

async function upload(headers, bytes, name) {
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: "image/png" }), name);
  form.set("title", `Reversibler Upload-Test ${Date.now()}`);
  form.set("visibility", "PRIVATE");
  return request("/api/external/media", { method: "POST", headers, body: form });
}

async function main() {
  const login = await request("/api/external/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password, deviceName: "Upload Security Test" })
  });
  if (login.status !== 200) throw new Error(`Login: ${login.status}`);
  const token = (await login.json()).token;
  const headers = { Authorization: `Bearer ${token}` };
  const sessionsResponse = await request("/api/external/account/sessions", { headers });
  const currentSessionId = (await sessionsResponse.json()).sessions?.find((session) => session.current)?.id;
  if (!currentSessionId) throw new Error("Test-Sitzung nicht gefunden");

  try {
    if (mode === "unavailable") {
      const unavailable = await upload(headers, cleanPng, "scanner-ausfall.png");
      const body = await unavailable.json().catch(() => ({}));
      if (unavailable.status !== 503 || body.error !== "security_scan_unavailable") {
        throw new Error(`Scanner-Ausfall: erwartet 503/security_scan_unavailable, erhalten ${unavailable.status}/${body.error || "?"}`);
      }
      console.log("UPLOAD_SCANNER_UNAVAILABLE_OK");
      return;
    }

    const clean = await upload(headers, cleanPng, "sauber.png");
    const cleanBody = await clean.json().catch(() => ({}));
    if (clean.status !== 200 || cleanBody.file?.scanStatus !== "CLEAN") throw new Error(`Sauberer Upload: ${clean.status}`);
    const mediaId = cleanBody.media?.id;
    const fileId = cleanBody.file?.id;
    try {
      const download = await request(`/api/external/files/${encodeURIComponent(fileId)}`, { headers });
      if (download.status !== 200) throw new Error(`CLEAN-Datei nicht abrufbar: ${download.status}`);
    } finally {
      if (mediaId) await request(`/api/external/media/${encodeURIComponent(mediaId)}`, { method: "DELETE", headers });
    }

    const infected = await upload(headers, eicar, "eicar-test.txt");
    const infectedBody = await infected.json().catch(() => ({}));
    if (infected.status !== 400 || !["invalid_upload", "unsafe_upload"].includes(infectedBody.error)) {
      if (infectedBody.media?.id) {
        await request(`/api/external/media/${encodeURIComponent(infectedBody.media.id)}`, { method: "DELETE", headers });
      }
      throw new Error(`Nicht erlaubte Testdatei: erwartet 400, erhalten ${infected.status}/${infectedBody.error || "?"}`);
    }
    console.log("UPLOAD_CLEAN_AND_DISALLOWED_BYTES_OK");
  } finally {
    await request(`/api/external/account/sessions/${encodeURIComponent(currentSessionId)}`, { method: "DELETE", headers });
  }
}

main().catch((error) => {
  console.error(`UPLOAD_SECURITY_FAILED: ${error.message}`);
  process.exit(1);
});
