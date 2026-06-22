"use client";

import { useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

type Candidate = {
  updateId: number;
  messageId: number;
  chatId: string;
  threadId: string | null;
  title: string;
  chatTitle: string;
  threadTitle: string | null;
  chatType: string;
  from: string;
  fromId: string | null;
  fromUsername: string | null;
  fromFirstName: string | null;
  fromLastName: string | null;
  text: string;
  createdAt: string;
};

type WebhookInfo = {
  ok: boolean;
  result?: {
    url?: string;
    pending_update_count?: number;
    last_error_message?: string;
  };
};

export function TelegramChatDiscovery({ scope = "tenant", botId }: { scope?: "tenant" | "user"; botId?: string }) {
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [saved, setSaved] = useState("");

  function friendlyError(err: unknown, fallback: string) {
    const message = err instanceof Error ? err.message : "";
    if (!message) return fallback;
    if (message.includes("expected pattern")) return fallback;
    return message;
  }

  async function loadWebhookInfo() {
    setError("");
    const query = new URLSearchParams({ scope });
    if (botId) query.set("botId", botId);
    const response = await fetch(`/api/telegram/webhook-info?${query.toString()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Webhook-Status konnte nicht gelesen werden.");
    setWebhookInfo(payload);
    return payload as WebhookInfo;
  }

  async function configureWebhook(action: "set" | "delete") {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/telegram/webhook-config", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, scope, botId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Webhook konnte nicht geändert werden.");
      await loadWebhookInfo();
      if (action === "delete") await loadUpdates();
    } catch (err) {
      setError(friendlyError(err, "Webhook konnte nicht geändert werden."));
    } finally {
      setLoading(false);
    }
  }

  async function loadUpdates() {
    setLoading(true);
    setError("");
    setSaved("");
    try {
      await loadWebhookInfo();
      const query = new URLSearchParams({ scope });
      if (botId) query.set("botId", botId);
      const response = await fetch(`/api/telegram/updates?${query.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        const message = String(payload.error || "Telegram konnte nicht gelesen werden.");
        if (message.includes("409") || message.includes("webhook")) {
          throw new Error("Telegram blockiert das Einlesen, weil ein Webhook aktiv ist. Lösche den Webhook oder setze ihn auf diese App.");
        }
        throw new Error(message);
      }
      setCandidates(payload.candidates || []);
      if (!payload.candidates?.length) setError("Keine Testnachricht gefunden. Schreibe dem Bot zuerst eine Nachricht im gewünschten Chat oder Thread.");
    } catch (err) {
      setError(friendlyError(err, "Keine Testnachricht gefunden. Sende zuerst eine neue Testnachricht im gewünschten Telegram-Thread."));
    } finally {
      setLoading(false);
    }
  }

  async function save(candidate: Candidate) {
    const key = `${candidate.chatId}:${candidate.threadId || ""}`;
    setSavingKey(key);
    setError("");
    setSaved("");
    try {
      const response = await fetch("/api/telegram/chats", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: candidate.chatId,
          threadId: candidate.threadId,
          title: candidate.title,
          chatTitle: candidate.chatTitle,
          threadTitle: candidate.threadTitle,
          lastMessageText: candidate.text,
          lastMessageFrom: candidate.from,
          fromId: candidate.fromId,
          fromUsername: candidate.fromUsername,
          fromFirstName: candidate.fromFirstName,
          fromLastName: candidate.fromLastName,
          scope,
          botId
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Chat konnte nicht gespeichert werden.");
      setSaved(key);
      window.location.reload();
    } catch (err) {
      setError(friendlyError(err, "Chat konnte nicht gespeichert werden."));
    } finally {
      setSavingKey("");
    }
  }

  function formatDetectedAt(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    try {
      return date.toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
    } catch {
      return date.toISOString();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={loadUpdates}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Testnachricht einlesen
        </Button>
        <Button type="button" variant="secondary" onClick={() => loadWebhookInfo()}>
          Webhook-Status
        </Button>
        <Button type="button" variant="secondary" onClick={() => configureWebhook("delete")}>
          Webhook löschen und einlesen
        </Button>
        <Button type="button" variant="secondary" onClick={() => configureWebhook("set")}>
          Webhook auf diese App setzen
        </Button>
      </div>
      {webhookInfo?.result ? (
        <div className="rounded-md bg-paper p-3 text-sm text-graphite">
          <div><strong>Webhook:</strong> {webhookInfo.result.url || "nicht gesetzt"}</div>
          <div><strong>Offene Updates:</strong> {webhookInfo.result.pending_update_count ?? 0}</div>
          {webhookInfo.result.last_error_message ? <div><strong>Letzter Fehler:</strong> {webhookInfo.result.last_error_message}</div> : null}
        </div>
      ) : null}
      <p className="rounded-md bg-paper p-3 text-sm leading-6 text-graphite">
        Für automatische Mitgliedserkennung muss der Bot Gruppenadmin sein und der Webhook einmal neu auf diese App gesetzt werden. Telegram liefert bestehende normale Gruppenmitglieder nicht vollständig nachträglich; Admins können in den Einstellungen synchronisiert werden.
      </p>
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-medium text-redbrand">{error}</p> : null}
      <div className="space-y-3">
        {candidates.map((candidate) => {
          const key = `${candidate.chatId}:${candidate.threadId || ""}`;
          return (
            <div key={`${candidate.updateId}-${candidate.messageId}`} className="rounded-md border border-line bg-paper p-3">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div><span className="text-graphite">Chat-ID:</span> <strong>{candidate.chatId}</strong></div>
                <div><span className="text-graphite">Thread-ID:</span> <strong>{candidate.threadId || "-"}</strong></div>
                <div><span className="text-graphite">Chatname:</span> {candidate.chatTitle || candidate.title || "Unbenannter Chat"}</div>
                <div><span className="text-graphite">Threadname:</span> {candidate.threadTitle || (candidate.threadId ? "Thread-Name fehlt" : "Hauptchat")}</div>
                <div><span className="text-graphite">Von:</span> {candidate.from || "-"}{candidate.fromId ? ` · ID ${candidate.fromId}` : ""}</div>
              </div>
              <div className="mt-3 rounded-md bg-surface p-3 text-sm">
                <div className="font-semibold text-ink">Letzte erkannte Testnachricht</div>
                <div className="mt-1 text-graphite">{candidate.text || "Keine Textvorschau."}</div>
                <div className="mt-1 text-xs text-graphite">Von: {candidate.from || "-"} · Erkannt: {formatDetectedAt(candidate.createdAt)}</div>
              </div>
              <div className="mt-3">
                <Button type="button" variant={saved === key ? "secondary" : "primary"} onClick={() => save(candidate)}>
                  <Check className="h-4 w-4" />
                  {savingKey === key ? "Speichere..." : saved === key ? "Gespeichert" : "Diesen Chat verwenden"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
