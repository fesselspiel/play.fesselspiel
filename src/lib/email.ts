import net from "node:net";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const defaultEmailTemplates = [
  {
    key: "user_created",
    title: "Neues Benutzerkonto",
    subject: "Dein Zugang zu Fesselspiel",
    body:
      "Hallo {{userName}},\n\nfür dich wurde ein Zugang zu Fesselspiel angelegt.\n\nLogin: {{loginIdentifier}}\nPortal: {{appUrl}}\n\nBitte frage den Admin nach deinem Passwort und ändere dein Profil nach dem ersten Login.\n\nViele Grüße\nFesselspiel"
  },
  {
    key: "user_invite",
    title: "Benutzerkonto bestätigen",
    subject: "Bestätige deinen Zugang zu Fesselspiel",
    body:
      "Hallo {{userName}},\n\nfür dich wurde ein Zugang zu Fesselspiel angelegt.\n\nLogin: {{loginIdentifier}}\nBestätigen und Passwort setzen: {{confirmUrl}}\n\nDer Link ist zeitlich begrenzt gültig.\n\nViele Grüße\nFesselspiel"
  },
  {
    key: "user_invite_link",
    title: "Einladungslink",
    subject: "Du wurdest zu Playplaner eingeladen",
    body:
      "Hallo {{userName}},\n\n{{inviterName}} hat dich zu Playplaner eingeladen.\n\nEinladung annehmen: {{inviteUrl}}\n\nDer Link ist zeitlich begrenzt gültig. Ohne Einladung kann kein neues Konto angelegt werden.\n\nViele Grüße\nPlayplaner"
  },
  {
    key: "login_success",
    title: "Login-Benachrichtigung",
    subject: "Login bei Fesselspiel",
    body:
      "Hallo {{userName}},\n\nbei deinem Konto gab es gerade einen Login.\n\nZeit: {{loginTime}}\nProfil: {{profileUrl}}\n\nWenn du das nicht warst, informiere bitte den Admin.\n\nFesselspiel"
  },
  {
    key: "password_reset",
    title: "Passwort zurücksetzen",
    subject: "Passwort zurücksetzen",
    body:
      "Hallo {{userName}},\n\nfür dein Konto wurde ein Link zum Zurücksetzen des Passworts angefordert.\n\nLogin: {{loginIdentifier}}\nNeues Passwort setzen: {{resetUrl}}\n\nFalls du das nicht warst, ignoriere diese E-Mail.\n\nViele Grüße\nFesselspiel"
  },
  {
    key: "item_share",
    title: "Eintrag teilen",
    subject: "{{actor}} teilt: {{title}}",
    body:
      "Hallo {{userName}},\n\n{{actor}} hat einen Eintrag mit dir geteilt:\n\n{{title}}\n\n{{text}}\n\nÖffnen: {{url}}\n\nViele Grüße\nPlayplaner"
  },
  {
    key: "item_share_opened",
    title: "Geteilter Eintrag geöffnet",
    subject: "{{opener}} hat geöffnet: {{title}}",
    body:
      "Hallo {{userName}},\n\n{{opener}} hat deinen geteilten Eintrag geöffnet:\n\n{{title}}\n\nDirekt öffnen: {{url}}\n\nViele Grüße\nPlayplaner"
  }
] as const;

type SendTemplateInput = {
  key: string;
  to: string | null | undefined;
  bcc?: string | string[] | null;
  variables: Record<string, string | number | boolean | null | undefined>;
  actorId?: string | null;
  source?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

type SendRawInput = {
  to: string;
  bcc?: string[];
  fromEmail: string;
  fromName: string;
  subject: string;
  body: string;
  smtpHost: string;
  smtpPort: number;
  messageId: string;
};

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(cleanHeader(value), "utf8").toString("base64")}?=`;
}

function escapeSmtpData(value: string) {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function isDeliverableAddress(email: string | null | undefined) {
  const value = String(email || "").trim();
  return Boolean(value && value.includes("@") && !value.endsWith("@local.fesselspiel"));
}

function normalizedBcc(value: SendTemplateInput["bcc"]) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.map((entry) => String(entry || "").trim()).filter(isDeliverableAddress);
}

function renderTemplate(source: string, variables: SendTemplateInput["variables"]) {
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => String(variables[key] ?? ""));
}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function readSmtpReply(socket: net.Socket) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("SMTP-Antwort hat zu lange gedauert"));
    }, 15000);
    function cleanup() {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("error", onError);
    }
    function onError(error: Error) {
      cleanup();
      reject(error);
    }
    function onData(chunk: Buffer) {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      if (last && /^\d{3}\s/.test(last)) {
        cleanup();
        resolve(buffer);
      }
    }
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function smtpCommand(socket: net.Socket, command: string, expected: number[], transcript: string[]) {
  socket.write(`${command}\r\n`);
  const response = await readSmtpReply(socket);
  transcript.push(`${command.replace(/^DATA[\s\S]*/i, "DATA")} -> ${response.trim()}`);
  const code = Number(response.slice(0, 3));
  if (!expected.includes(code)) throw new Error(`SMTP-Fehler nach ${command}: ${response.trim()}`);
  return response;
}

async function sendRawEmail(input: SendRawInput) {
  const socket = net.createConnection({ host: input.smtpHost, port: input.smtpPort });
  const transcript: string[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    transcript.push(`CONNECT ${input.smtpHost}:${input.smtpPort}`);
    transcript.push(`SERVER -> ${(await readSmtpReply(socket)).trim()}`);
    await smtpCommand(socket, "EHLO playplaner.com", [250], transcript);
    await smtpCommand(socket, `MAIL FROM:<${cleanHeader(input.fromEmail)}>`, [250], transcript);
    await smtpCommand(socket, `RCPT TO:<${cleanHeader(input.to)}>`, [250, 251], transcript);
    for (const recipient of input.bcc || []) {
      await smtpCommand(socket, `RCPT TO:<${cleanHeader(recipient)}>`, [250, 251], transcript);
    }
    await smtpCommand(socket, "DATA", [354], transcript);
    const message = [
      `From: ${encodeHeader(input.fromName)} <${cleanHeader(input.fromEmail)}>`,
      `To: <${cleanHeader(input.to)}>`,
      `Subject: ${encodeHeader(input.subject)}`,
      `Message-ID: <${input.messageId}@playplaner.local>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      escapeSmtpData(input.body),
      "."
    ].join("\r\n");
    socket.write(`${message}\r\n`);
    const dataResponse = await readSmtpReply(socket);
    transcript.push(`MESSAGE -> ${dataResponse.trim()}`);
    const code = Number(dataResponse.slice(0, 3));
    if (code !== 250) throw new Error(`SMTP-Fehler beim Senden: ${dataResponse.trim()}`);
    await smtpCommand(socket, "QUIT", [221], transcript);
    return { transcript, response: dataResponse.trim() };
  } finally {
    socket.destroy();
  }
}

async function writeEmailProtocol(input: {
  status: "SENT" | "FAILED" | "SKIPPED";
  templateKey: string;
  recipient: string;
  subject: string;
  fromEmail?: string | null;
  fromName?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  messageId?: string | null;
  error?: string | null;
  details?: Prisma.InputJsonValue;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}) {
  const log = await prisma.emailLog.create({
    data: {
      templateKey: input.templateKey,
      recipient: input.recipient || "(kein Empfänger)",
      subject: input.subject || "(kein Betreff)",
      status: input.status,
      fromEmail: input.fromEmail || null,
      fromName: input.fromName || null,
      smtpHost: input.smtpHost || null,
      smtpPort: input.smtpPort || null,
      messageId: input.messageId || null,
      error: input.error || null,
      details: input.details
    }
  });
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId || null,
      action: input.status === "SENT" ? "email_sent" : input.status === "FAILED" ? "email_failed" : "email_skipped",
      entityType: input.entityType || "email",
      entityId: input.entityId || log.id,
      title: input.status === "SENT"
        ? `E-Mail gesendet: ${input.subject}`
        : input.status === "FAILED"
          ? `E-Mail fehlgeschlagen: ${input.subject}`
          : `E-Mail übersprungen: ${input.subject || input.templateKey}`,
      details: jsonValue({
        emailLogId: log.id,
        templateKey: input.templateKey,
        recipient: input.recipient,
        status: input.status,
        fromEmail: input.fromEmail,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        messageId: input.messageId,
        error: input.error,
        details: input.details ?? null
      }),
      href: "/settings/email"
    }
  });
  return log;
}

export async function ensureEmailSetup() {
  await prisma.emailSettings.upsert({
    where: { id: "system" },
    update: {},
    create: {
      id: "system",
      enabled: false,
      fromName: "Fesselspiel",
      fromEmail: "no-reply@playplaner.com",
      smtpHost: env.emailSmtpHost,
      smtpPort: env.emailSmtpPort
    }
  });
  await Promise.all(
    defaultEmailTemplates.map((template) =>
      prisma.emailTemplate.upsert({
        where: { key: template.key },
        update: {},
        create: { ...template, enabled: template.key === "item_share" || template.key === "item_share_opened" }
      })
    )
  );
}

export async function sendTemplateEmail(input: SendTemplateInput) {
  const recipient = String(input.to || "").trim();
  const bcc = normalizedBcc(input.bcc);
  const messageId = randomUUID();
  if (!isDeliverableAddress(input.to)) {
    await writeEmailProtocol({
      status: "SKIPPED",
      templateKey: input.key,
      recipient,
      subject: input.key,
      messageId,
      error: "Kein zustellbarer Empfänger",
      details: { reason: "no-recipient", source: input.source || null },
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId
    });
    return { sent: false, skipped: "no-recipient" };
  }
  await ensureEmailSetup();
  const [settings, template] = await Promise.all([
    prisma.emailSettings.findUnique({ where: { id: "system" } }),
    prisma.emailTemplate.findUnique({ where: { key: input.key } })
  ]);
  const subject = template ? renderTemplate(template.subject, input.variables) : input.key;
  const body = template ? renderTemplate(template.body, input.variables) : "";
  const smtpHost = settings?.smtpHost || env.emailSmtpHost;
  const smtpPort = settings?.smtpPort || env.emailSmtpPort;
  const baseDetails = {
    source: input.source || null,
    bcc,
    templateFound: Boolean(template),
    templateEnabled: Boolean(template?.enabled),
    systemEnabled: Boolean(settings?.enabled),
    variables: Object.keys(input.variables)
  };
  if (!settings?.enabled || !template?.enabled) {
    await writeEmailProtocol({
      status: "SKIPPED",
      templateKey: input.key,
      recipient,
      subject,
      fromEmail: settings?.fromEmail,
      fromName: settings?.fromName,
      smtpHost,
      smtpPort,
      messageId,
      error: !settings?.enabled ? "E-Mail-System deaktiviert" : "E-Mail-Template deaktiviert",
      details: { ...baseDetails, reason: !settings?.enabled ? "system-disabled" : "template-disabled" },
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId
    });
    return { sent: false, skipped: "disabled" };
  }
  try {
    const delivery = await sendRawEmail({
      to: recipient,
      fromEmail: settings.fromEmail,
      fromName: settings.fromName,
      subject,
      body,
      smtpHost,
      smtpPort,
      messageId,
      bcc
    });
    await writeEmailProtocol({
      status: "SENT",
      templateKey: input.key,
      recipient,
      subject,
      fromEmail: settings.fromEmail,
      fromName: settings.fromName,
      smtpHost,
      smtpPort,
      messageId,
      details: { ...baseDetails, smtpTranscript: delivery.transcript, smtpResponse: delivery.response },
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId
    });
    return { sent: true };
  } catch (error) {
    await writeEmailProtocol({
      status: "FAILED",
      templateKey: input.key,
      recipient,
      subject,
      fromEmail: settings.fromEmail,
      fromName: settings.fromName,
      smtpHost,
      smtpPort,
      messageId,
      error: error instanceof Error ? error.message : String(error),
      details: baseDetails,
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId
    });
    return { sent: false, error };
  }
}
