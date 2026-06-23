import net from "node:net";
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
  }
] as const;

type SendTemplateInput = {
  key: string;
  to: string | null | undefined;
  variables: Record<string, string | number | boolean | null | undefined>;
};

type SendRawInput = {
  to: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  body: string;
  smtpHost: string;
  smtpPort: number;
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

function renderTemplate(source: string, variables: SendTemplateInput["variables"]) {
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => String(variables[key] ?? ""));
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

async function smtpCommand(socket: net.Socket, command: string, expected: number[]) {
  socket.write(`${command}\r\n`);
  const response = await readSmtpReply(socket);
  const code = Number(response.slice(0, 3));
  if (!expected.includes(code)) throw new Error(`SMTP-Fehler nach ${command}: ${response.trim()}`);
  return response;
}

async function sendRawEmail(input: SendRawInput) {
  const socket = net.createConnection({ host: input.smtpHost, port: input.smtpPort });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    await readSmtpReply(socket);
    await smtpCommand(socket, "EHLO playplaner.com", [250]);
    await smtpCommand(socket, `MAIL FROM:<${cleanHeader(input.fromEmail)}>`, [250]);
    await smtpCommand(socket, `RCPT TO:<${cleanHeader(input.to)}>`, [250, 251]);
    await smtpCommand(socket, "DATA", [354]);
    const message = [
      `From: ${encodeHeader(input.fromName)} <${cleanHeader(input.fromEmail)}>`,
      `To: <${cleanHeader(input.to)}>`,
      `Subject: ${encodeHeader(input.subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      escapeSmtpData(input.body),
      "."
    ].join("\r\n");
    socket.write(`${message}\r\n`);
    const dataResponse = await readSmtpReply(socket);
    const code = Number(dataResponse.slice(0, 3));
    if (code !== 250) throw new Error(`SMTP-Fehler beim Senden: ${dataResponse.trim()}`);
    await smtpCommand(socket, "QUIT", [221]);
  } finally {
    socket.destroy();
  }
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
        create: { ...template, enabled: false }
      })
    )
  );
}

export async function sendTemplateEmail(input: SendTemplateInput) {
  if (!isDeliverableAddress(input.to)) return { sent: false, skipped: "no-recipient" };
  await ensureEmailSetup();
  const [settings, template] = await Promise.all([
    prisma.emailSettings.findUnique({ where: { id: "system" } }),
    prisma.emailTemplate.findUnique({ where: { key: input.key } })
  ]);
  if (!settings?.enabled || !template?.enabled) return { sent: false, skipped: "disabled" };
  const subject = renderTemplate(template.subject, input.variables);
  const body = renderTemplate(template.body, input.variables);
  try {
    await sendRawEmail({
      to: String(input.to),
      fromEmail: settings.fromEmail,
      fromName: settings.fromName,
      subject,
      body,
      smtpHost: settings.smtpHost || env.emailSmtpHost,
      smtpPort: settings.smtpPort || env.emailSmtpPort
    });
    await prisma.emailLog.create({ data: { templateKey: input.key, recipient: String(input.to), subject, status: "SENT" } });
    return { sent: true };
  } catch (error) {
    await prisma.emailLog.create({
      data: {
        templateKey: input.key,
        recipient: String(input.to),
        subject,
        status: "FAILED",
        error: error instanceof Error ? error.message : String(error)
      }
    });
    return { sent: false, error };
  }
}
