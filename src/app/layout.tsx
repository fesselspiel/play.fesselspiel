import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { normalizeTheme, normalizeThemeMode } from "@/lib/themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fesselspiel",
  description: "Private Social Platform für Paare, Planung, Medien und Session-Dokumentation."
};

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
