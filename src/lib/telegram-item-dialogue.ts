import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slug";
import { telegramHtml, telegramLink } from "@/lib/telegram";

type DraftKind = "toy" | "position" | "album";
type DraftStatus = "ACTIVE" | "DONE" | "CANCELLED";

type ItemDraft = {
  kind: DraftKind;
  status: DraftStatus;
  fields: {
    title?: string;
    name?: string;
    description?: string;
    imageUrl?: string;
    toyTitles?: string[];
  };
};

const DRAFT_PREFIX = "Telegram-Draft:";

function clean(value: string) {
  return value.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

function normalizeSkip(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["keine", "kein", "ohne", "überspringen", "überspringen", "-", "nein"].includes(normalized);
}

function link(path: string) {
  return `${env.appUrl}${path}`;
}

function parseDraft(body: string): ItemDraft | null {
  if (!body.startsWith(DRAFT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(body.slice(DRAFT_PREFIX.length).trim()) as ItemDraft;
    if ((parsed.kind === "toy" || parsed.kind === "position" || parsed.kind === "album") && ["ACTIVE", "DONE", "CANCELLED"].includes(parsed.status)) return parsed;
  } catch {
    return null;
  }
  return null;
}

async function saveDraft(userId: string, draft: ItemDraft) {
  await prisma.message.create({
    data: {
      senderId: userId,
      body: `${DRAFT_PREFIX} ${JSON.stringify(draft)}`
    }
  });
}

async function latestActiveDraft(userId: string) {
  const messages = await prisma.message.findMany({
    where: { senderId: userId, body: { startsWith: DRAFT_PREFIX } },
    orderBy: { createdAt: "desc" },
    take: 10
  });
  for (const message of messages) {
    const draft = parseDraft(message.body);
    if (draft) return draft.status === "ACTIVE" ? draft : null;
  }
  return null;
}

function initialKind(text: string): DraftKind | null {
  const normalized = text.toLowerCase();
  const createIntent = /(anlegen|erstellen|neu|hinzufügen|hinzufügen|speichern)/i.test(normalized);
  if (!createIntent) return null;
  if (/(spielzeug|toy|equipment|ausruestung|ausrüstung)/i.test(normalized)) return "toy";
  if (/(stellung|position)/i.test(normalized)) return "position";
  if (/(album|galerie)/i.test(normalized)) return "album";
  return null;
}

function quotedValue(text: string) {
  const match = text.match(/["'`](.+?)["'`]/);
  return match ? clean(match[1]) : "";
}

function initialTitle(text: string, kind: DraftKind) {
  const quoted = quotedValue(text);
  if (quoted) return quoted;
  const pattern =
    kind === "toy"
      ? /(?:spielzeug|toy|equipment|ausruestung|ausrüstung)\s+(.+?)(?:\s+(?:anlegen|erstellen|speichern|hinzufügen|hinzufügen))?$/i
      : kind === "position"
        ? /(?:stellung|position)\s+(.+?)(?:\s+(?:anlegen|erstellen|speichern|hinzufügen|hinzufügen))?$/i
        : /(?:album|galerie)\s+(.+?)(?:\s+(?:anlegen|erstellen|speichern|hinzufügen|hinzufügen))?$/i;
  const match = text.match(pattern);
  const candidate = match ? clean(match[1]) : "";
  if (!candidate || /^(anlegen|erstellen|neu|hinzufügen|hinzufügen)$/i.test(candidate)) return "";
  return candidate;
}

function nextQuestion(draft: ItemDraft) {
  if (draft.kind === "album") {
    if (!draft.fields.title) return "Wie soll das Album heißen?";
    return null;
  }

  if (draft.kind === "toy") {
    if (!draft.fields.title) return "Wie soll das Spielzeug heissen?";
    if (!draft.fields.description) return "Welche Beschreibung soll auf die Detailseite?";
    if (draft.fields.imageUrl === undefined) return "Sende jetzt ein Bild hier in den Chat oder schreibe 'ohne'.";
    return null;
  }

  if (!draft.fields.name) return "Wie soll die Stellung heissen?";
  if (!draft.fields.description) return "Welche Beschreibung soll auf die Detailseite?";
  if (draft.fields.imageUrl === undefined) return "Sende jetzt ein Bild hier in den Chat oder schreibe 'ohne'.";
  if (!draft.fields.toyTitles) return "Welche Spielzeuge sollen verknüpft werden? Schreibe Titel kommagetrennt oder 'keine'.";
  return null;
}

function needsImage(draft: ItemDraft) {
  return Boolean(
    (draft.kind === "toy" && draft.fields.title && draft.fields.description && draft.fields.imageUrl === undefined) ||
      (draft.kind === "position" && draft.fields.name && draft.fields.description && draft.fields.imageUrl === undefined)
  );
}

function applyAnswer(draft: ItemDraft, text: string) {
  const answer = clean(text);
  if (draft.kind === "album") {
    if (!draft.fields.title) draft.fields.title = answer;
    return draft;
  }

  if (draft.kind === "toy") {
    if (!draft.fields.title) draft.fields.title = answer;
    else if (!draft.fields.description) draft.fields.description = answer;
    else if (draft.fields.imageUrl === undefined) draft.fields.imageUrl = normalizeSkip(answer) ? "" : answer;
    return draft;
  }

  if (!draft.fields.name) draft.fields.name = answer;
  else if (!draft.fields.description) draft.fields.description = answer;
  else if (draft.fields.imageUrl === undefined) draft.fields.imageUrl = normalizeSkip(answer) ? "" : answer;
  else if (!draft.fields.toyTitles) {
    draft.fields.toyTitles = normalizeSkip(answer)
      ? []
      : answer
          .split(",")
          .map(clean)
          .filter(Boolean);
  }
  return draft;
}

async function matchingToys(userId: string, titles: string[]) {
  if (!titles.length) return [];
  return prisma.toy.findMany({
    where: {
      ownerId: userId,
      OR: titles.flatMap((title) => [
        { title: { contains: title, mode: "insensitive" as const } },
        { slug: { contains: title, mode: "insensitive" as const } }
      ])
    },
    take: 20
  });
}

async function createFromDraft(userId: string, draft: ItemDraft) {
  if (draft.kind === "album") {
    const title = draft.fields.title || "";
    const album = await prisma.album.create({
      data: {
        ownerId: userId,
        title,
        description: "Per Telegram angelegt.",
        visibility: "PRIVATE"
      }
    });
    return `<b>Album angelegt</b>\n${telegramHtml(album.title)}\n${telegramLink(link(`/media?album=${album.id}`), "in Medien öffnen")}`;
  }

  if (draft.kind === "toy") {
    const title = draft.fields.title || "";
    const description = draft.fields.description || "";
    const imageUrl = draft.fields.imageUrl || "";
    const slug = await uniqueSlug("toy", title);
    const toy = await prisma.toy.create({ data: { ownerId: userId, title, description, imageUrl, slug } });
    return `<b>Spielzeug angelegt</b>\n${telegramHtml(toy.title)}\n${telegramLink(link(`/toys/${toy.slug}`), "öffnen")}`;
  }

  const name = draft.fields.name || "";
  const description = draft.fields.description || "";
  const imageUrl = draft.fields.imageUrl || "";
  const toyTitles = draft.fields.toyTitles || [];
  const toys = await matchingToys(userId, toyTitles);
  const slug = await uniqueSlug("position", name);
  const position = await prisma.position.create({
    data: {
      ownerId: userId,
      name,
      description,
      imageUrl,
      slug,
      tools: { connect: toys.map((toy) => ({ id: toy.id })) }
    },
    include: { tools: true }
  });
  const linked = position.tools.length ? `\n<b>Verknuepft:</b> ${telegramHtml(position.tools.map((toy) => toy.title).join(", "))}` : "";
  return `<b>Stellung angelegt</b>\n${telegramHtml(position.name)}${linked}\n${telegramLink(link(`/positions/${position.slug}`), "öffnen")}`;
}

export async function handleItemCreationDialogue(userId: string, text: string) {
  const trimmed = clean(text);
  if (/^(abbrechen|stopp|stop|cancel)$/i.test(trimmed)) {
    const existing = await latestActiveDraft(userId);
    if (!existing) return null;
    await saveDraft(userId, { ...existing, status: "CANCELLED" });
    return "Erfassung abgebrochen. Es wurde nichts angelegt.";
  }

  const existing = await latestActiveDraft(userId);
  if (existing) {
    const draft = applyAnswer(existing, trimmed);
    const question = nextQuestion(draft);
    if (question) {
      await saveDraft(userId, draft);
      return question;
    }
    const result = await createFromDraft(userId, draft);
    await saveDraft(userId, { ...draft, status: "DONE" });
    return result;
  }

  const kind = initialKind(trimmed);
  if (!kind) return null;
  const draft: ItemDraft = { kind, status: "ACTIVE", fields: {} };
  const title = initialTitle(trimmed, kind);
  if (title) {
    if (kind === "toy" || kind === "album") draft.fields.title = title;
    else draft.fields.name = title;
  }
  const question = nextQuestion(draft);
  if (question) {
    await saveDraft(userId, draft);
    const label = kind === "toy" ? "ein neues Spielzeug" : kind === "position" ? "eine neue Stellung" : "ein neues Album";
    return `Ich erfasse ${label}.\n${question}`;
  }
  const result = await createFromDraft(userId, draft);
  await saveDraft(userId, { ...draft, status: "DONE" });
  return result;
}

export async function startAlbumCreationDialogue(userId: string, title?: string) {
  const draft: ItemDraft = { kind: "album", status: "ACTIVE", fields: {} };
  if (title) draft.fields.title = clean(title);
  const question = nextQuestion(draft);
  if (question) {
    await saveDraft(userId, draft);
    return `Ich erfasse ein neues Album.\n${question}`;
  }
  const result = await createFromDraft(userId, draft);
  await saveDraft(userId, { ...draft, status: "DONE" });
  return result;
}

export async function handleItemCreationImage(userId: string, imageUrl: string) {
  const existing = await latestActiveDraft(userId);
  if (!existing) return null;
  if (!needsImage(existing)) {
    return "Ich habe das Bild erhalten. In der laufenden Erfassung brauche ich aber zuerst noch die angefragte Textangabe.";
  }

  const draft: ItemDraft = { ...existing, fields: { ...existing.fields, imageUrl } };
  const question = nextQuestion(draft);
  if (question) {
    await saveDraft(userId, draft);
    return question;
  }
  const result = await createFromDraft(userId, draft);
  await saveDraft(userId, { ...draft, status: "DONE" });
  return result;
}
