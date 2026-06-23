import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { currentTenant, primaryTenantDomain } from "@/lib/tenancy";
import { normalizeTheme, normalizeThemeMode } from "@/lib/themes";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await currentTenant();
  return {
    title: tenant?.name || "Playplaner",
    description: tenant?.description || "Private Social Platform für Paare, Planung, Bilder und Session-Dokumentation.",
    metadataBase: new URL(`https://${tenant ? primaryTenantDomain(tenant) : "playplaner.com"}`)
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const theme = normalizeTheme(user?.settings?.theme);
  const mode = normalizeThemeMode(user?.settings?.darkMode);
  return (
    <html lang="de" data-theme={theme} data-mode={mode}>
      <body>{children}</body>
    </html>
  );
}
