import { NextResponse } from "next/server";
import { oauthIssuer, OAUTH_SCOPES } from "@/lib/oauth";

export async function GET(request: Request) {
  const issuer = oauthIssuer(request);
  return NextResponse.json({
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    scopes_supported: OAUTH_SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: `${issuer}/settings/api`
  }, { headers: { "Cache-Control": "no-store" } });
}
