const { createHmac, randomBytes } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const baseURL = String(process.env.VIEW_CONTEXT_BASE_URL || "https://playplaner.com").replace(/\/$/, "");
const startedAt = new Date();

function createToken() {
  return `fsp_${randomBytes(32).toString("base64url")}`;
}

function tokenHash(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing");
  return createHmac("sha256", secret).update(token).digest("hex");
}

async function request(path, token, options = {}) {
  const headers = { Authorization: `Bearer ${token}`, ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  return fetch(`${baseURL}${path}`, { ...options, headers, redirect: "manual" });
}

async function main() {
  const targetTenant = await prisma.tenant.findUnique({ where: { slug: "test" }, select: { id: true } });
  if (!targetTenant) throw new Error("Test tenant is missing");
  const alternativeTarget = await prisma.tenantMembership.findFirst({
    where: { tenantId: targetTenant.id, active: true, user: { active: true } },
    select: { userId: true }
  });
  if (!alternativeTarget) throw new Error("Test tenant has no active member");

  const actors = await prisma.user.findMany({
    where: { active: true, role: "SUPER_ADMIN" },
    select: { id: true, tenantId: true },
    orderBy: { createdAt: "asc" }
  });
  let completed = false;

  for (const actor of actors) {
    const token = createToken();
    const tokenRecord = await prisma.apiToken.create({
      data: {
        tenantId: actor.tenantId,
        userId: actor.id,
        name: "Temporary view isolation smoke",
        tokenHash: tokenHash(token),
        tokenLastSix: token.slice(-6)
      }
    });
    try {
      const created = await request("/api/external/admin/view-context", token, {
        method: "POST",
        body: JSON.stringify({ mode: "tenant", tenantId: targetTenant.id })
      });
      if (created.status === 428) continue;
      if (created.status !== 200) throw new Error(`Create context failed: ${created.status}`);
      const contextBody = await created.json();
      const contextId = contextBody.contextId;
      const representativeId = contextBody?.context?.user?.id;
      if (!contextId || contextBody?.context?.tenant?.id !== targetTenant.id || !representativeId) {
        throw new Error("Context response lacks confirmed tenant or representative");
      }

      const scopedHeaders = { "X-Playplaner-View-Context": contextId };
      const [capabilities, profile] = await Promise.all([
        request("/api/external/capabilities", token, { headers: scopedHeaders }),
        request("/api/external/profile", token, { headers: scopedHeaders })
      ]);
      if (capabilities.status !== 200 || profile.status !== 200) {
        throw new Error(`Scoped APIs failed: capabilities=${capabilities.status} profile=${profile.status}`);
      }
      const capabilitiesBody = await capabilities.json();
      const profileBody = await profile.json();
      if (capabilitiesBody.tenantId !== targetTenant.id) throw new Error("Capabilities leaked the source tenant");
      const scopedProfileId = profileBody?.profile?.id || profileBody?.user?.id || profileBody?.item?.id;
      if (scopedProfileId !== representativeId) throw new Error("Profile did not match the target representative");
      if (actor.tenantId !== targetTenant.id && representativeId === actor.id && alternativeTarget.userId !== actor.id) {
        throw new Error("Cross-tenant view retained the source actor");
      }

      const cleared = await request("/api/external/admin/view-context", token, {
        method: "POST",
        body: JSON.stringify({ mode: "clear" })
      });
      if (cleared.status !== 200) throw new Error(`Clear context failed: ${cleared.status}`);
      const expiredContext = await request("/api/external/profile", token, { headers: scopedHeaders });
      if (expiredContext.status !== 401) throw new Error(`Cleared context remained usable: ${expiredContext.status}`);
      completed = true;
      console.log("VIEW_CONTEXT_ISOLATION_LIVE_OK tenant=1 representative=1 profile=1 cleared=1");
      break;
    } finally {
      await prisma.externalViewContext.deleteMany({ where: { tokenId: tokenRecord.id } }).catch(() => null);
      await prisma.apiToken.delete({ where: { id: tokenRecord.id } }).catch(() => null);
      await prisma.auditLog.deleteMany({
        where: {
          actorId: actor.id,
          createdAt: { gte: startedAt },
          action: { in: ["external_admin_view_context_created", "external_admin_view_context_cleared"] }
        }
      }).catch(() => null);
      const revoked = await request("/api/external/status", token);
      if (revoked.status !== 401) throw new Error(`Temporary token remained usable: ${revoked.status}`);
    }
  }

  if (!completed) throw new Error("No accepted super admin was available for the isolation smoke");
}

main()
  .catch((error) => {
    console.error(`VIEW_CONTEXT_ISOLATION_LIVE_FAILED:${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
