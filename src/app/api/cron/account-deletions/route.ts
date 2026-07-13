import { NextResponse } from "next/server";
import { retryPendingAccountDeletionFiles } from "@/lib/compliance/account-deletion";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!env.cronSecret || token !== env.cronSecret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const jobs = await retryPendingAccountDeletionFiles();
  return NextResponse.json({
    ok: true,
    processed: jobs.length,
    completed: jobs.filter((job) => job.status === "COMPLETED").length,
    pending: jobs.filter((job) => job.status !== "COMPLETED").length
  });
}
