import { createHash } from "crypto";
import { deleteStoredFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export const accountDeletionConfirmation = "KONTO LOESCHEN";

type DeletionFile = { id: string; storagePath: string };

function deletionFiles(value: unknown): DeletionFile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const id = String((entry as Record<string, unknown>).id || "");
    const storagePath = String((entry as Record<string, unknown>).storagePath || "");
    return id && storagePath ? [{ id, storagePath }] : [];
  });
}

export async function cleanupAccountDeletionFiles(jobId: string) {
  const job = await prisma.accountDeletionJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("deletion_job_not_found");
  if (job.status === "COMPLETED") return job;
  const files = deletionFiles(job.fileManifest);
  const failedFiles: DeletionFile[] = [];
  for (const file of files) {
    try {
      await deleteStoredFile(file.storagePath);
    } catch {
      failedFiles.push(file);
    }
  }
  return prisma.accountDeletionJob.update({
    where: { id: job.id },
    data: failedFiles.length
      ? {
          status: "FAILED",
          lastErrorCode: "file_cleanup_failed",
          retryCount: { increment: 1 },
          fileManifest: failedFiles
        }
      : {
          status: "COMPLETED",
          completedAt: new Date(),
          lastErrorCode: null,
          fileManifest: []
        }
  });
}

export async function retryPendingAccountDeletionFiles(limit = 25) {
  const jobs = await prisma.accountDeletionJob.findMany({
    where: { status: { in: ["DELETING_FILES", "FAILED"] } },
    orderBy: { updatedAt: "asc" },
    take: Math.max(1, Math.min(limit, 100))
  });
  const results = [];
  for (const job of jobs) {
    results.push(await cleanupAccountDeletionFiles(job.id));
  }
  return results;
}

function deletionReference(userId: string) {
  return createHash("sha256").update(`deleted-user:${userId}`).digest("hex").slice(0, 20);
}

async function isLastAdmin(userId: string, tenantId?: string | null, role?: string | null) {
  if (role === "SUPER_ADMIN") {
    const otherSuperAdmins = await prisma.user.count({
      where: { active: true, role: "SUPER_ADMIN", id: { not: userId } }
    });
    if (otherSuperAdmins === 0) return true;
  }
  if (!tenantId) return false;
  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { role: true, active: true }
  });
  const effectiveAdmin = role === "SUPER_ADMIN" || (membership?.active && membership.role === "ADMIN");
  if (!effectiveAdmin) return false;
  const otherAdmins = await prisma.tenantMembership.count({
    where: {
      tenantId,
      active: true,
      userId: { not: userId },
      user: { active: true },
      OR: [{ role: "ADMIN" }, { user: { role: "SUPER_ADMIN" } }]
    }
  });
  return otherAdmins === 0;
}

export async function accountDeletionSummary(userId: string) {
  return prisma.accountDeletionJob.findFirst({
    where: { requestedUserId: userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      lastErrorCode: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

export async function deleteAccount(input: {
  userId: string;
  tenantId?: string | null;
  role?: string | null;
  confirmation: string;
}) {
  if (input.confirmation.trim().toUpperCase() !== accountDeletionConfirmation) {
    throw new Error("confirmation_mismatch");
  }
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, tenantId: true, role: true, active: true }
  });
  if (!user?.active) throw new Error("account_not_found");
  const tenantId = input.tenantId || user.tenantId;
  if (await isLastAdmin(user.id, tenantId, input.role || user.role)) {
    const blockedJob = await prisma.accountDeletionJob.create({
      data: {
        tenantId,
        userId: user.id,
        requestedUserId: user.id,
        confirmationMethod: "CONFIRMATION_TEXT",
        status: "BLOCKED_LAST_ADMIN",
        lastErrorCode: "last_admin"
      }
    });
    return { ok: false as const, blocked: true as const, job: blockedJob };
  }

  const files = await prisma.fileAsset.findMany({
    where: { ownerId: user.id },
    select: { id: true, storagePath: true }
  });
  const reference = deletionReference(user.id);
  const job = await prisma.accountDeletionJob.create({
    data: {
      tenantId,
      userId: user.id,
      requestedUserId: user.id,
      confirmationMethod: "CONFIRMATION_TEXT",
      status: "REQUESTED",
      fileManifest: files.map((file) => ({ id: file.id, storagePath: file.storagePath }))
    }
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.accountDeletionJob.update({
        where: { id: job.id },
        data: { status: "REVOKING_ACCESS", startedAt: new Date() }
      });
      await tx.user.update({
        where: { id: user.id },
        data: {
          active: false,
          deletionRequestedAt: new Date(),
          sessionRevision: { increment: 1 },
          rememberTokenHash: null
        }
      });
      await tx.apiToken.updateMany({ where: { userId: user.id }, data: { active: false } });
      await tx.nativePushDevice.updateMany({ where: { userId: user.id }, data: { disabledAt: new Date() } });
      await tx.externalViewContext.deleteMany({
        where: { OR: [{ actorId: user.id }, { userId: user.id }] }
      });
      await tx.checkIn.deleteMany({ where: { userId: user.id } });
      await tx.auditLog.updateMany({
        where: { actorId: user.id },
        data: {
          title: "Aktivitaet eines geloeschten Benutzers",
          details: { deletedUserReference: reference },
          href: null
        }
      });
      await tx.accountDeletionJob.update({
        where: { id: job.id },
        data: { status: "DELETING_DATA" }
      });
      await tx.user.delete({ where: { id: user.id } });
      await tx.accountDeletionJob.update({
        where: { id: job.id },
        data: { status: "DELETING_FILES", userId: null }
      });
    }, { timeout: 30_000 });

    const cleaned = await cleanupAccountDeletionFiles(job.id);
    return {
      ok: true as const,
      blocked: false as const,
      cleanupPending: cleaned.status !== "COMPLETED",
      job: cleaned
    };
  } catch (error) {
    await prisma.accountDeletionJob.updateMany({
      where: { id: job.id, status: { not: "COMPLETED" } },
      data: {
        status: "FAILED",
        lastErrorCode: error instanceof Error ? error.message.slice(0, 80) : "deletion_failed",
        retryCount: { increment: 1 }
      }
    }).catch(() => null);
    throw error;
  }
}
