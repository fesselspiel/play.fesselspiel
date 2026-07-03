"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, SendHorizonal, Trash2, X } from "lucide-react";

export type CircleChatMessageView = {
  id: string;
  body: string;
  createdAt: string;
  canDelete?: boolean;
  own: boolean;
  sender: { id: string; displayName: string; imageUrl?: string | null };
  file?: {
    id: string;
    url: string;
    downloadPath: string;
    originalName: string;
    mimeType: string;
    kind: string;
  } | null;
};

type MemberView = {
  id: string;
  name: string;
  imageUrl?: string | null;
};

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function mergeMessages(current: CircleChatMessageView[], incoming: CircleChatMessageView[]) {
  const map = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) map.set(message.id, message);
  return Array.from(map.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function CircleChatClient({
  initialMessages,
  members
}: {
  initialMessages: CircleChatMessageView[];
  members: MemberView[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const lastMessageAt = messages.at(-1)?.createdAt;
  const filePreview = useMemo(() => file && file.type.startsWith("image/") ? URL.createObjectURL(file) : "", [file]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (lastMessageAt) params.set("after", lastMessageAt);
    const source = new EventSource(`/api/chat/circle/stream?${params.toString()}`);
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "messages" && Array.isArray(payload.items)) {
        setMessages((current) => mergeMessages(current, payload.items));
      }
    };
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, [lastMessageAt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() && !file) return;
    setSending(true);
    setError("");
    const formData = new FormData();
    formData.set("body", body);
    if (file) formData.set("file", file);
    const response = await fetch("/api/chat/circle", { method: "POST", body: formData });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      setError(payload?.error || "Nachricht konnte nicht gesendet werden.");
      setSending(false);
      return;
    }
    setMessages((current) => mergeMessages(current, [payload.message]));
    setBody("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSending(false);
  }

  async function deleteMessage(messageId: string) {
    if (!confirm("Diese Chat-Nachricht löschen?")) return;
    const response = await fetch(`/api/chat/circle/${messageId}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      setError(payload?.error || "Nachricht konnte nicht gelöscht werden.");
      return;
    }
    setMessages((current) => current.filter((message) => message.id !== messageId));
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-3 shadow-soft sm:p-4">
      <div className="grid min-h-[68vh] gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="rounded-md border border-line bg-paper p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-graphite">Zirkel</h2>
        <div className="mt-4 grid gap-3">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3">
              {member.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={member.imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-sm font-semibold text-graphite">
                  {member.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{member.name}</div>
                <div className="text-xs text-graphite">im Chat</div>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section className="flex min-h-[68vh] flex-col overflow-hidden rounded-md border border-line bg-canvas">
        <div className="border-b border-line bg-paper px-4 py-3">
          <div className="text-sm font-semibold text-ink">Zirkel-Chat</div>
          <div className="text-xs text-graphite">Live-Nachrichten, Bilder und später App-Push.</div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-5">
          {messages.length ? (
            <div className="grid gap-3">
              {messages.map((message) => (
                <article key={message.id} className={`group flex ${message.own ? "justify-end" : "justify-start"}`}>
                  <div className={`relative max-w-[86%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[68%] ${message.own ? "bg-redbrand text-white" : "border border-line bg-paper text-ink"}`}>
                    {message.canDelete ? (
                      <button
                        type="button"
                        onClick={() => deleteMessage(message.id)}
                        className={`absolute -top-2 ${message.own ? "-left-2" : "-right-2"} flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-graphite opacity-0 shadow-sm transition hover:text-redbrand focus:opacity-100 group-hover:opacity-100`}
                        aria-label="Nachricht löschen"
                        title="Nachricht löschen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    {!message.own ? <div className="mb-1 text-xs font-semibold text-redbrand">{message.sender.displayName}</div> : null}
                    {message.file?.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={message.file.url} alt={message.file.originalName} className="mb-2 max-h-72 w-full rounded-md object-contain" />
                    ) : message.file ? (
                      <a href={message.file.url} className={`mb-2 block text-sm font-semibold underline ${message.own ? "text-white" : "text-redbrand"}`}>{message.file.originalName}</a>
                    ) : null}
                    {message.body ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p> : null}
                    <div className={`mt-1 text-right text-[11px] ${message.own ? "text-white/75" : "text-graphite"}`}>{timeLabel(message.createdAt)}</div>
                  </div>
                </article>
              ))}
              <div ref={bottomRef} />
            </div>
          ) : (
            <div className="flex h-full min-h-80 items-center justify-center text-center text-sm text-graphite">
              Noch keine Nachrichten. Schreib die erste Nachricht in euren Zirkel.
            </div>
          )}
        </div>
        {file ? (
          <div className="border-t border-line bg-paper px-4 py-3">
            <div className="flex items-center gap-3">
              {filePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={filePreview} alt="" className="h-14 w-14 rounded-md object-cover" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-md bg-surface text-xs text-graphite">Datei</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{file.name}</div>
                <div className="text-xs text-graphite">{Math.ceil(file.size / 1024)} KB</div>
              </div>
              <button type="button" onClick={() => setFile(null)} className="rounded-md border border-line bg-surface p-2 hover:bg-paper" aria-label="Datei entfernen">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
        <form ref={formRef} onSubmit={submit} className="border-t border-line bg-paper p-3">
          {error ? <div className="mb-2 rounded-md border border-redbrand/30 bg-redbrand/10 px-3 py-2 text-sm text-redbrand">{error}</div> : null}
          <div className="flex items-end gap-2">
            <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-surface hover:bg-white" aria-label="Bild anhängen">
              <ImagePlus className="h-5 w-5" />
            </button>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (!sending) formRef.current?.requestSubmit();
                }
              }}
              rows={1}
              placeholder="Nachricht schreiben..."
              className="min-h-11 flex-1 resize-none rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-redbrand dark:bg-black/20"
            />
            <button type="submit" disabled={sending} className="flex min-h-11 shrink-0 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover disabled:cursor-wait disabled:opacity-75">
              <SendHorizonal className="h-4 w-4" />
              <span className="hidden sm:inline">{sending ? "Sendet..." : "Senden"}</span>
            </button>
          </div>
        </form>
      </section>
      </div>
    </section>
  );
}
