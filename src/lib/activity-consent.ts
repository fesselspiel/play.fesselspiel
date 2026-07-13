import type { ActivityPlan, ActivityStatus, Prisma } from "@prisma/client";

export const activityConsentStatuses = [
  "DRAFT",
  "PROPOSED",
  "ACCEPTED",
  "CHANGES_REQUESTED",
  "DECLINED",
  "REVOKED",
  "COMPLETED",
  "CANCELLED"
] as const;

export type ActivityConsentStatus = typeof activityConsentStatuses[number];
export type ActivityConsentAction = "PROPOSE" | "ACCEPT" | "REQUEST_CHANGES" | "DECLINE" | "REVOKE" | "COMPLETE" | "CANCEL";

export function normalizedConsentStatus(value: string | null | undefined): ActivityConsentStatus {
  const normalized = String(value || "DRAFT").trim().toUpperCase();
  return activityConsentStatuses.includes(normalized as ActivityConsentStatus)
    ? normalized as ActivityConsentStatus
    : "DRAFT";
}

export function effectiveConsentStatus(activity: Pick<ActivityPlan, "consentStatus" | "status">): ActivityConsentStatus {
  const explicit = normalizedConsentStatus(activity.consentStatus);
  if (explicit !== "DRAFT") return explicit;
  if (activity.status === "REQUESTED") return "PROPOSED";
  if (activity.status === "PLANNED") return "ACCEPTED";
  if (activity.status === "DONE") return "COMPLETED";
  if (activity.status === "DISCARDED") return "CANCELLED";
  return "DRAFT";
}

export function parsedConsentAction(value: unknown): ActivityConsentAction | null {
  const normalized = String(value || "").trim().toUpperCase();
  return ["PROPOSE", "ACCEPT", "REQUEST_CHANGES", "DECLINE", "REVOKE", "COMPLETE", "CANCEL"].includes(normalized)
    ? normalized as ActivityConsentAction
    : null;
}

export function activityConsentPermissions(activity: Pick<ActivityPlan, "ownerId" | "consentStatus" | "status">, actorId: string, role?: string | null) {
  const status = effectiveConsentStatus(activity);
  const admin = role === "ADMIN" || role === "SUPER_ADMIN";
  const owner = activity.ownerId === actorId;
  const responder = !owner;
  return {
    canAccept: (status === "PROPOSED" && responder) || (status === "CHANGES_REQUESTED" && (owner || admin)),
    canRequestChanges: (status === "PROPOSED" || status === "ACCEPTED") && responder,
    canDecline: status === "PROPOSED" && responder,
    canRevoke: status === "ACCEPTED" && (owner || responder || admin),
    canComplete: status === "ACCEPTED" && (owner || responder || admin),
    canCancel: ["PROPOSED", "CHANGES_REQUESTED"].includes(status) && (owner || admin)
  };
}

export function consentMutation(
  activity: Pick<ActivityPlan, "ownerId" | "consentStatus" | "consentVersion" | "status">,
  actor: { id: string; role?: string | null },
  action: ActivityConsentAction
): { data: Prisma.ActivityPlanUpdateInput; resultingStatus: ActivityConsentStatus; activityStatus: ActivityStatus } | null {
  const permissions = activityConsentPermissions(activity, actor.id, actor.role);
  const now = new Date();
  const version = Math.max(1, activity.consentVersion || 1);
  switch (action) {
    case "PROPOSE":
      if (activity.ownerId !== actor.id && actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") return null;
      return {
        data: { consentStatus: "PROPOSED", consentVersion: version, acceptedVersion: null, consentUpdatedAt: now, status: "REQUESTED" },
        resultingStatus: "PROPOSED",
        activityStatus: "REQUESTED"
      };
    case "ACCEPT":
      if (!permissions.canAccept) return null;
      return {
        data: { consentStatus: "ACCEPTED", acceptedVersion: version, consentUpdatedAt: now, status: "PLANNED" },
        resultingStatus: "ACCEPTED",
        activityStatus: "PLANNED"
      };
    case "REQUEST_CHANGES":
      if (!permissions.canRequestChanges) return null;
      return {
        data: { consentStatus: "CHANGES_REQUESTED", consentVersion: version + 1, acceptedVersion: null, consentUpdatedAt: now, status: "REQUESTED" },
        resultingStatus: "CHANGES_REQUESTED",
        activityStatus: "REQUESTED"
      };
    case "DECLINE":
      if (!permissions.canDecline) return null;
      return {
        data: { consentStatus: "DECLINED", acceptedVersion: null, consentUpdatedAt: now, status: "DISCARDED" },
        resultingStatus: "DECLINED",
        activityStatus: "DISCARDED"
      };
    case "REVOKE":
      if (!permissions.canRevoke) return null;
      return {
        data: { consentStatus: "REVOKED", acceptedVersion: null, consentUpdatedAt: now, status: "DISCARDED" },
        resultingStatus: "REVOKED",
        activityStatus: "DISCARDED"
      };
    case "COMPLETE":
      if (!permissions.canComplete) return null;
      return {
        data: { consentStatus: "COMPLETED", consentUpdatedAt: now, status: "DONE" },
        resultingStatus: "COMPLETED",
        activityStatus: "DONE"
      };
    case "CANCEL":
      if (!permissions.canCancel) return null;
      return {
        data: { consentStatus: "CANCELLED", acceptedVersion: null, consentUpdatedAt: now, status: "DISCARDED" },
        resultingStatus: "CANCELLED",
        activityStatus: "DISCARDED"
      };
  }
}

export function resetConsentForMaterialChange(activity: Pick<ActivityPlan, "consentStatus" | "consentVersion" | "status">) {
  const status = effectiveConsentStatus(activity);
  if (status === "DRAFT") return null;
  return {
    consentStatus: "PROPOSED",
    consentVersion: Math.max(1, activity.consentVersion || 1) + 1,
    acceptedVersion: null,
    consentUpdatedAt: new Date(),
    status: "REQUESTED" as ActivityStatus
  } satisfies Prisma.ActivityPlanUpdateInput;
}
