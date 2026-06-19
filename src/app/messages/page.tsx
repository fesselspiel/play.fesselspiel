import { redirect } from "next/navigation";
import { Send, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FileUploadField } from "@/components/file-upload-field";
import { Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { accessibleOwnerIds } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { deleteOwnedFile, fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/dates";

async function sendMessage(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const file = await saveUploadedFile(user.id, formData.get("file") as File | null);
  const recipientId = String(formData.get("recipientId") || "") || null;
  const accessIds = await accessibleOwnerIds(user);
  await prisma.message.create({
    data: {
      senderId: user.id,
      recipientId: recipientId && accessIds.includes(recipientId) ? recipientId : null,
      body: String(formData.get("body") || "").trim(),
      mediaUrl: file ? fileAssetUrl(file.id) : ""
    }
  });
  redirect("/messages");
}

async function deleteMessage(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") || "");
  const message = await prisma.message.findFirst({ where: { id, senderId: user.id } });
  if (!message) redirect("/messages");
  await prisma.message.delete({ where: { id: message.id } });
  const fileId = fileIdFromUrl(message.mediaUrl);
  if (fileId) await deleteOwnedFile(user.id, fileId);
  redirect("/messages");
}

export default async function MessagesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const accessIds = await accessibleOwnerIds(user);
  const [users, messages] = await Promise.all([
    prisma.user.findMany({ where: { active: true, id: { in: accessIds } }, orderBy: { email: "asc" } }),
    prisma.message.findMany({
      where: { OR: [{ senderId: { in: accessIds } }, { recipientId: user.id }, { recipientId: null, senderId: { in: accessIds } }] },
      include: { sender: true, recipient: true },
      orderBy: { createdAt: "desc" },
      take: 50
    })
  ]);
  return (
    <AppShell>
      <PageHeader title="Nachrichten" />
      <PageGuide title="Direktnachrichten mit geschuetztem Datei-Anhang">
        Nachrichten dienen der privaten Kommunikation im Portal. Waehle einen Empfaenger oder Alle, schreibe deine Nachricht, haenge optional eine Datei an und loesche eigene Nachrichten bei Bedarf wieder.
      </PageGuide>
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Nachricht senden</h2>
          <form action={sendMessage} className="space-y-4">
            <Field label="Empfaenger"><select className={selectClass} name="recipientId"><option value="">Alle / Paar</option>{users.map((entry) => <option key={entry.id} value={entry.id}>{entry.name || entry.email}</option>)}</select></Field>
            <Field label="Nachricht"><textarea className={inputClass} name="body" rows={5} required /></Field>
            <FileUploadField name="file" label="Anhang" help="Optional eine Datei oder ein Bild anhaengen." />
            <Button><Send className="h-4 w-4" /> Senden</Button>
          </form>
        </Panel>
        <Panel>
          <div className="space-y-3">
            {messages.map((message) => (
              <article key={message.id} className="rounded-md border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <strong>{message.sender.name || message.sender.email}</strong>
                  <span className="text-graphite">{formatDateTime(message.createdAt)}</span>
                </div>
                <p className="mt-2 leading-6 text-graphite">{message.body}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  {message.mediaUrl ? <a href={message.mediaUrl} className="block text-sm font-semibold text-redbrand">Anhang oeffnen</a> : <span />}
                  {message.senderId === user.id ? (
                    <form action={deleteMessage}>
                      <input type="hidden" name="id" value={message.id} />
                      <Button variant="danger" className="min-h-9 px-3 py-1.5">
                        <Trash2 className="h-4 w-4" />
                        Loeschen
                      </Button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
