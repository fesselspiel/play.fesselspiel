import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import {
  BellRing,
  ClipboardCheck,
  DatabaseBackup,
  FileText,
  Images,
  KeyRound,
  Lightbulb,
  LayoutDashboard,
  Mail,
  MessageCircle,
  Network,
  PackageSearch,
  Settings,
  Signal,
  CalendarDays,
  SlidersHorizontal,
  ShieldCheck,
  Ticket,
  Timer,
  ToyBrick,
  UserRound,
  UsersRound
} from "lucide-react";

export type AppNavItem = {
  label: string;
  href: string;
  icon: ComponentType<LucideProps>;
  feature: string | null;
};

export type AppNavSection = {
  id: string;
  items: readonly AppNavItem[];
};

export const mainNavigationSections: readonly AppNavSection[] = [
  {
    id: "primary",
    items: [{ label: "Start", href: "/", icon: LayoutDashboard, feature: null }]
  },
  {
    id: "catalog",
    items: [
      { label: "Szenen", href: "/positions", icon: ShieldCheck, feature: "positions" },
      { label: "Spielsachen", href: "/toys", icon: ToyBrick, feature: "toys" },
      {
        label: "Bondage-System",
        href: "/bondage-system",
        icon: PackageSearch,
        feature: "shopifyBondageSystem"
      }
    ]
  },
  {
    id: "ideas",
    items: [{ label: "Ideensammlung", href: "/ideas", icon: Lightbulb, feature: "ideas" }]
  },
  {
    id: "work",
    items: [
      { label: "Aufträge", href: "/orders", icon: ClipboardCheck, feature: "orders" },
      { label: "Sessions", href: "/sessions", icon: Timer, feature: "trackers" }
    ]
  },
  {
    id: "media",
    items: [{ label: "Bilder", href: "/media", icon: Images, feature: "media" }]
  }
] as const;

export const settingsNavigationItems = {
  viewAs: [{ label: "Ansicht wechseln", href: "/settings/view-as", icon: UsersRound, feature: null }] as const,
  profileAndSettings: [
    { label: "Profil", href: "/profile", icon: UserRound, feature: null },
    { label: "Ampel", href: "/settings/play-ready", icon: Signal, feature: "playReady" },
    { label: "Einladungen", href: "/settings/invites", icon: Ticket, feature: "invites" },
    { label: "Zeitregeln", href: "/settings/scheduled", icon: CalendarDays, feature: "scheduledRules" }
  ] as const,
  admin: [
    { label: "Seite", href: "/settings/tenant", icon: SlidersHorizontal, feature: null },
    { label: "Startseite", href: "/settings/home", icon: LayoutDashboard, feature: null },
    { label: "Benutzer", href: "/settings/users", icon: UsersRound, feature: null },
    { label: "Shopify", href: "/settings/shopify", icon: PackageSearch, feature: null },
    { label: "Tracker", href: "/settings/trackers", icon: Timer, feature: null },
    { label: "Telegram", href: "/settings/telegram", icon: Settings, feature: null },
    { label: "E-Mail", href: "/settings/email", icon: Mail, feature: null },
    { label: "Push", href: "/settings/push", icon: BellRing, feature: null },
    { label: "API Kontrolle", href: "/settings/api-control", icon: Network, feature: null },
    { label: "Anleitung", href: "/settings/help", icon: FileText, feature: null },
    { label: "Daten", href: "/settings/data", icon: DatabaseBackup, feature: null },
    { label: "API Tokens", href: "/settings/api", icon: KeyRound, feature: null },
    { label: "Protokoll", href: "/messages", icon: MessageCircle, feature: null }
  ] as const,
  superAdmin: [{ label: "Seiten", href: "/settings/sites", icon: Network, feature: null }] as const
} as const;
