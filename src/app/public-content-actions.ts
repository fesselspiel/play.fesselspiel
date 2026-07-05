"use server";

import { revalidatePath } from "next/cache";
import { currentSessionContext } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { savePublicContentOverride } from "@/lib/public-content";

export async function savePublicContent(formData: FormData) {
  const { actor, tenant } = await currentSessionContext();
  if (!actor || !tenant || (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN")) return;
  const key = String(formData.get("key") || "").trim();
  const path = String(formData.get("path") || "/login").trim() || "/login";
  const mode = String(formData.get("mode") || "text");
  const raw = String(formData.get("value") || "");
  if (!key) return;
  const value = mode === "lines"
    ? raw.split("\n").map((line) => line.trim()).filter(Boolean)
    : raw.trim();
  await savePublicContentOverride({
    tenantId: tenant.id,
    key,
    value,
    updatedById: actor.id
  });
  await logAction({
    actorId: actor.id,
    action: "public_content_updated",
    entityType: "publicContent",
    entityId: key,
    title: `Startseiteninhalt geändert: ${key}`,
    href: path,
    details: { tenantId: tenant.id, key }
  });
  revalidatePath("/login");
  revalidatePath(path);
}
