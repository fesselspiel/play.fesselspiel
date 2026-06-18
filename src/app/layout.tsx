import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { normalizeTheme } from "@/lib/themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fesselspiel",
  description: "Private Social Platform fuer Paare, Planung, Medien und Session-Dokumentation."
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const theme = normalizeTheme(user?.settings?.theme);
  return (
    <html lang="de" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
