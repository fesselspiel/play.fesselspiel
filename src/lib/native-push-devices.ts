import type { Prisma } from "@prisma/client";
import type { AccessUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

function deletionScope(user: AccessUser): Prisma.NativePushDeviceWhereInput {
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (isAdmin && user.tenantId) return { tenantId: user.tenantId };
  return {
    userId: user.id,
    ...(user.tenantId ? { tenantId: user.tenantId } : {})
  };
}

export async function deleteVisiblePushDevice(user: AccessUser, deviceId: string) {
  const id = deviceId.trim();
  if (!id) return null;

  const device = await prisma.nativePushDevice.findFirst({
    where: { AND: [{ id }, deletionScope(user)] },
    select: {
      id: true,
      platform: true,
      environment: true,
      disabledAt: true
    }
  });
  if (!device) return null;

  await prisma.$transaction([
    prisma.nativePushDevice.delete({ where: { id: device.id } }),
    prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "native_push_device_deleted",
        entityType: "nativePushDevice",
        entityId: device.id,
        title: "Push-Gerät entfernt",
        details: {
          platform: device.platform,
          environment: device.environment,
          previouslyDisabled: device.disabledAt !== null
        }
      }
    })
  ]);

  return device;
}
