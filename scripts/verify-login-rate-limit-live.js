const base = String(process.env.APP_REVIEW_BASE_URL || "https://playplaner.com").replace(/\/$/, "");
const identifier = process.env.RATE_LIMIT_TEST_IDENTIFIER || `rate-limit-${Date.now()}@invalid.playplaner.test`;
const deviceName = process.env.RATE_LIMIT_TEST_DEVICE_NAME || "Rate Limit Live Test";

async function main() {
  let finalResponse = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(`${base}/api/external/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": `198.51.100.${20 + attempt}` },
      body: JSON.stringify({ identifier, password: "definitely-wrong", deviceName })
    });
    if (attempt < 5 && response.status !== 401) throw new Error(`Versuch ${attempt}: erwartet 401, erhalten ${response.status}`);
    finalResponse = response;
  }
  if (!finalResponse || finalResponse.status !== 429) throw new Error(`Schwellwert: erwartet 429, erhalten ${finalResponse?.status}`);
  const retryAfter = Number(finalResponse.headers.get("retry-after") || 0);
  if (retryAfter < 1) throw new Error("Retry-After fehlt");
  const body = await finalResponse.json();
  if (body.error !== "rate_limited" || Number(body.retryAfterSeconds) < 1) throw new Error("Rate-Limit-Antwort ist unvollstaendig");
}

main().then(() => console.log("LOGIN_RATE_LIMIT_LIVE_OK")).catch((error) => {
  console.error(`LOGIN_RATE_LIMIT_LIVE_FAILED: ${error.message}`);
  process.exit(1);
});
