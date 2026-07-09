import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { normalizeUsername } from "@/lib/usernames";

export const runtime = "nodejs";

function profileItem(user: any) {
  const fileId = fileIdFromUrl(user.profile?.imageUrl);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString?.() || null,
    displayName: user.profile?.displayName || user.name || user.username || user.email,
    name: user.name,
    bio: user.profile?.bio || "",
    avatar: user.profile?.imageUrl ? { fileId, url: fileId ? `/api/external/files/${fileId}` : user.profile.imageUrl, protectedUrl: user.profile.imageUrl } : null,
    role: user.role,
    tenantId: user.tenantId,
    circleId: user.circleId,
    lastLoginAt: user.lastLoginAt?.toISOString?.() || null,
    settings: user.settings ? {
      theme: user.settings.theme,
      darkMode: user.settings.darkMode,
      playReadyExpiryMinutes: user.settings.playReadyExpiryMinutes,
      shareDefaultChannel: user.settings.shareDefaultChannel
    } : null
  };
}

async function body(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }
  return await request.json().catch(() => ({})) as Record<string, unknown>;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const user = await prisma.user.findUnique({ where: { id: auth.user.id }, include: { profile: true, settings: true } });
  if (!user) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: profileItem(user), user: profileItem(user) });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const payload = await body(request);
  const username = payload.username === undefined ? undefined : normalizeUsername(String(payload.username || ""));
  if (payload.username !== undefined && !username) return NextResponse.json({ ok: false, error: "invalid_username" }, { status: 400 });
  if (username) {
    const exists = await prisma.user.findFirst({ where: { username, id: { not: auth.user.id } }, select: { id: true } });
    if (exists) return NextResponse.json({ ok: false, error: "username_taken" }, { status: 409 });
  }
  const file = payload.file instanceof File && payload.file.size > 0 ? payload.file : null;
  const asset = file ? await saveUploadedFile(auth.user.id, file, auth.user.tenantId) : null;
  await prisma.user.update({
    where: { id: auth.user.id },
    data: {
      ...(username !== undefined ? { username } : {}),
      ...(payload.name !== undefined || payload.displayName !== undefined ? { name: String(payload.name || payload.displayName || "").trim() || null } : {}),
      profile: {
        upsert: {
          create: {
            displayName: String(payload.displayName || payload.name || "").trim() || null,
            bio: String(payload.bio || "").trim() || null,
            ...(asset ? { imageUrl: fileAssetUrl(asset.id) } : {})
          },
          update: {
            ...(payload.displayName !== undefined || payload.name !== undefined ? { displayName: String(payload.displayName || payload.name || "").trim() || null } : {}),
            ...(payload.bio !== undefined ? { bio: String(payload.bio || "").trim() || null } : {}),
            ...(asset ? { imageUrl: fileAssetUrl(asset.id) } : {})
          }
        }
      },
      settings: {
        upsert: {
          create: {},
          update: {
            ...(payload.theme !== undefined ? { theme: String(payload.theme || "red") } : {}),
            ...(payload.darkMode !== undefined ? { darkMode: payload.darkMode === true || payload.darkMode === "true" || payload.darkMode === "1" } : {})
          }
        }
      }
    }
  });
  await logAction({ actorId: auth.user.id, action: "profile_updated_api", entityType: "user", entityId: auth.user.id, title: "Profil per API geändert", href: "/profile" });
  const user = await prisma.user.findUnique({ where: { id: auth.user.id }, include: { profile: true, settings: true } });
  return NextResponse.json({ ok: true, item: profileItem(user), user: profileItem(user) });
}
