const { createHmac, randomBytes } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const baseURL = String(process.env.MEDIA_ACCESS_BASE_URL || "https://playplaner.com").replace(/\/$/, "");

function createToken() {
  return `fsp_${randomBytes(32).toString("base64url")}`;
}

function tokenHash(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing");
  return createHmac("sha256", secret).update(token).digest("hex");
}

async function request(route, token) {
  return fetch(`${baseURL}${route}`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "manual"
  });
}

async function withTemporaryToken(user, verify) {
  const token = createToken();
  const record = await prisma.apiToken.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      name: "Temporary media restore smoke",
      tokenHash: tokenHash(token),
      tokenLastSix: token.slice(-6)
    }
  });
  try {
    return await verify(token);
  } finally {
    await prisma.apiToken.delete({ where: { id: record.id } }).catch(() => null);
    const revoked = await request("/api/external/status", token);
    if (revoked.status !== 401) throw new Error(`Temporary media token remained usable: ${revoked.status}`);
  }
}

async function firstUsable(candidates, verify) {
  for (const user of candidates) {
    try {
      const result = await withTemporaryToken(user, verify);
      if (result) return true;
    } catch (error) {
      if (!String(error.message || "").startsWith("unaccepted:")) throw error;
    }
  }
  return false;
}

async function verifyProfile(token) {
  const profile = await request("/api/external/profile", token);
  if (profile.status === 428) throw new Error("unaccepted:profile");
  if (profile.status !== 200) throw new Error(`Profile API failed: ${profile.status}`);
  const body = await profile.json();
  const fileId = body?.item?.avatar?.fileId;
  if (!fileId) return false;
  const image = await request(`/api/external/files/${encodeURIComponent(fileId)}`, token);
  if (image.status !== 200 || !String(image.headers.get("content-type") || "").startsWith("image/")) {
    throw new Error(`Profile image download failed: ${image.status}`);
  }
  if ((await image.arrayBuffer()).byteLength < 1) throw new Error("Profile image download was empty");
  return true;
}

async function verifyMedia(token) {
  const media = await request("/api/external/media?kind=ALL&limit=100", token);
  if (media.status === 428) throw new Error("unaccepted:media");
  if (media.status !== 200) throw new Error(`Media API failed: ${media.status}`);
  const body = await media.json();
  const item = (body?.items || []).find((candidate) => candidate.fileId && candidate.downloadPath);
  if (!item) return false;
  const file = await request(item.downloadPath, token);
  const contentType = String(file.headers.get("content-type") || "");
  if (file.status !== 200 || !/^(image|video)\//.test(contentType)) throw new Error(`Media download failed: ${file.status}`);
  if ((await file.arrayBuffer()).byteLength < 1) throw new Error("Media download was empty");
  return true;
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "playplaner" }, select: { id: true } });
  if (!tenant) throw new Error("Production tenant is missing");
  const [profileCandidates, mediaCandidates] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: tenant.id, active: true, profile: { imageUrl: { startsWith: "/api/files/" } } },
      select: { id: true, tenantId: true },
      orderBy: { createdAt: "asc" }
    }),
    prisma.user.findMany({
      where: { tenantId: tenant.id, active: true, media: { some: { url: { startsWith: "/api/files/" } } } },
      select: { id: true, tenantId: true },
      orderBy: { createdAt: "asc" }
    })
  ]);

  const profileOK = await firstUsable(profileCandidates, verifyProfile);
  const mediaOK = await firstUsable(mediaCandidates, verifyMedia);
  if (!profileOK || !mediaOK) throw new Error(`Restored media coverage incomplete: profile=${Number(profileOK)} media=${Number(mediaOK)}`);
  console.log("MEDIA_ACCESS_LIVE_OK profile=1 media=1 temporary_tokens_revoked=2");
}

main()
  .catch((error) => {
    console.error(`MEDIA_ACCESS_LIVE_FAILED:${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
