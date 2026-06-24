import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slug";
import { telegramHtml, telegramLink } from "@/lib/telegram";

type DraftKind = "toy" | "position" | "album";
type DraftStatus = "ACTIVE" | "DONE" | "CANCELLED";
type ImageReplacementTarget = "toy" | "position";

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

type ImageReplacementDraft = {
  status: DraftStatus;
  target: ImageReplacementTarget;
  targetId: string;
  label: string;
  slug: string;
};

const DRAFT_PREFIX = "Telegram-Draft:";
const IMAGE_REPLACEMENT_PREFIX = "Telegram-Image-Replacement:";

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

async function tenantIdForUser(userId: string) {
  const membership = await prisma.tenantMembership.findFirst({ where: { userId, active: true }, orderBy: { createdAt: "asc" }, select: { tenantId: true } });
  if (membership?.tenantId) return membership.tenantId;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
  return user?.tenantId || undefined;
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

function parseImageReplacementDraft(body: string): ImageReplacementDraft | null {
  if (!body.startsWith(IMAGE_REPLACEMENT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(body.slice(IMAGE_REPLACEMENT_PREFIX.length).trim()) as ImageReplacementDraft;
    if ((parsed.target === "toy" || parsed.target === "position") && ["ACTIVE", "DONE", "CANCELLED"].includes(parsed.status) && parsed.targetId) return parsed;
  } catch {
    return null;
  }
  return null;
}

async function saveImageReplacementDraft(userId: string, draft: ImageReplacementDraft) {
  await prisma.message.create({
    data: {
      senderId: userId,
      body: `${IMAGE_REPLACEMENT_PREFIX} ${JSON.stringify(draft)}`
    }
  });
}

export async function queueImageReplacement(userId: string, target: ImageReplacementTarget, targetId: string, label: string, slug: string) {
  await saveImageReplacementDraft(userId, { status: "ACTIVE", target, targetId, label, slug });
  return [
    "<b>Bild ersetzen</b>",
    `Ich ersetze das Bild für ${telegramHtml(label)}.`,
    "Sende jetzt das neue Bild hier in den Chat."
  ].join("\n");
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

async function latestActiveImageReplacementDraft(userId: string) {
  const messages = await prisma.message.findMany({
    where: { senderId: userId, body: { startsWith: IMAGE_REPLACEMENT_PREFIX } },
    orderBy: { createdAt: "desc" },
    take: 10
  });
  for (const message of messages) {
    const draft = parseImageReplacementDraft(message.body);
    if (draft) return draft.status === "ACTIVE" ? draft : null;
  }
  return null;
}

function imageReplacementQuery(text: string) {
  const normalized = clean(text);
  if (!/(bild|foto|image)/i.test(normalized) || !/(ersetzen|ändere|aendere|ändern|aendern|tausche|tauschen|neu|ersetze)/i.test(normalized)) return "";
  const explicit = normalized.match(/(?:für|fuer|von|bei)\s+(.+)$/i)?.[1] || "";
  const withoutIntent = normalized
    .replace(/(?:bitte|kannst du|kannst du bitte|ich möchte|ich will)/gi, "")
    .replace(/(?:das|ein|neues|neue)?\s*(?:bild|foto|image)\s*(?:ersetzen|ändern|aendern|tauschen|neu machen)?/gi, "")
    .replace(/(?:ersetze|ändere|aendere|tausche)\s*(?:das|ein|neues|neue)?\s*(?:bild|foto|image)?/gi, "")
    .replace(/(?:für|fuer|von|bei)\s+/gi, "")
    .trim();
  return clean(explicit || withoutIntent);
}

async function findImageReplacementTarget(userId: string, query: string) {
  const tenantId = await tenantIdForUser(userId);
  const where = {
    ...(tenantId ? { tenantId } : {}),
    ownerId: userId,
    OR: [
      { title: { contains: query, mode: "insensitive" as const } },
      { slug: { contains: query, mode: "insensitive" as const } }
    ]
  };
  const toy = query
    ? await prisma.toy.findFirst({ where, orderBy: { updatedAt: "desc" } })
    : null;
  if (toy) return { target: "toy" as const, targetId: toy.id, label: toy.title, slug: toy.slug };

  const position = query
    ? await prisma.position.findFirst({
        where: {
          ...(tenantId ? { tenantId } : {}),
          ownerId: userId,
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { slug: { contains: query, mode: "insensitive" as const } }
          ]
        },
        orderBy: { updatedAt: "desc" }
      })
    : null;
  if (position) return { target: "position" as const, targetId: position.id, label: position.name, slug: position.slug };
  return null;
}

export async function handleImageReplacementDialogue(userId: string, text: string) {
  const query = imageReplacementQuery(text);
  if (!query) return null;
  const target = await findImageReplacementTarget(userId, query);
  if (!target) return `Ich habe keinen passenden Datensatz für <b>${telegramHtml(query)}</b> gefunden. Schreibe den Namen bitte genauer.`;
  return queueImageReplacement(userId, target.target, target.targetId, target.label, target.slug);
}

function initialKind(text: string): DraftKind | null {
  const normalized = text.toLowerCase();
  const createIntent = /(anlegen|erstellen|neu|hinzufügen|hinzufügen|speichern)/i.test(normalized);
  if (!createIntent) return null;
  if (/(spielzeug|toy|equipment|ausruestung|ausrüstung)/i.test(normalized)) return "toy";
  if (/(szene|stellung|position)/i.test(normalized)) return "position";
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
        ? /(?:szene|stellung|position)\s+(.+?)(?:\s+(?:anlegen|erstellen|speichern|hinzufügen|hinzufügen))?$/i
        : /(?:album|galerie)\s+(.+?)(?:\s+(?:anlegen|erstellen|speichern|hinzufügen|hinzufügen))?$/i;
  const match = text.match(pattern);
  const candidate = match ? clean(match[1]) : "";
  const generic = candidate.replace(/[?.!,;:]+$/g, "").trim();
  if (!generic || /^(anlegen|erstellen|neu|hinzufügen|hinzufügen|speichern|machen)$/i.test(generic)) return "";
  if (/^(kannst du|kannst du bitte|bitte|ich möchte|ich will)\b/i.test(text.trim()) && generic.length < 4) return "";
  return candidate;
}

function nextQuestion(draft: ItemDraft) {
  if (draft.kind === "album") {
    if (!draft.fields.title) return "Wie soll das Album heißen?";
    return null;
  }

  if (draft.kind === "toy") {
    if (!draft.fields.title) return "Wie soll das Spielzeug heißen?";
    if (!draft.fields.description) return "Welche Beschreibung soll auf die Detailseite?";
    if (draft.fields.imageUrl === undefined) return "Sende jetzt ein Bild hier in den Chat oder schreibe 'ohne'.";
    return null;
  }

  if (!draft.fields.name) return "Wie soll die Szene heißen?";
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
  const tenantId = await tenantIdForUser(userId);
  if (!titles.length) return [];
  return prisma.toy.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
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
  const tenantId = await tenantIdForUser(userId);
  if (draft.kind === "album") {
    const title = draft.fields.title || "";
    const album = await prisma.album.create({
      data: {
        tenantId,
        ownerId: userId,
        title,
        description: "Per Telegram angelegt.",
        visibility: "PRIVATE"
      }
    });
    return `<b>Album angelegt</b>\n${telegramHtml(album.title)}\n${telegramLink(link(`/media?album=${album.id}`), "Bilder öffnen")}`;
  }

  if (draft.kind === "toy") {
    const title = draft.fields.title || "";
    const description = draft.fields.description || "";
    const imageUrl = draft.fields.imageUrl || "";
    const slug = await uniqueSlug("toy", title, tenantId);
    const toy = await prisma.toy.create({ data: { tenantId, ownerId: userId, title, description, imageUrl, slug } });
    return `<b>Spielzeug angelegt</b>\n${telegramHtml(toy.title)}\n${telegramLink(link(`/toys/${toy.slug}`), "öffnen")}`;
  }

  const name = draft.fields.name || "";
  const description = draft.fields.description || "";
  const imageUrl = draft.fields.imageUrl || "";
  const toyTitles = draft.fields.toyTitles || [];
  const toys = await matchingToys(userId, toyTitles);
  const slug = await uniqueSlug("position", name, tenantId);
  const position = await prisma.position.create({
    data: {
      ownerId: userId,
      tenantId,
      name,
      description,
      imageUrl,
      slug,
      tools: { connect: toys.map((toy) => ({ id: toy.id })) }
    },
    include: { tools: true }
  });
  const linked = position.tools.length ? `\n<b>Verknüpft:</b> ${telegramHtml(position.tools.map((toy) => toy.title).join(", "))}` : "";
  return `<b>Szene angelegt</b>\n${telegramHtml(position.name)}${linked}\n${telegramLink(link(`/positions/${position.slug}`), "öffnen")}`;
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
    const label = kind === "toy" ? "ein neues Spielzeug" : kind === "position" ? "eine neue Szene" : "ein neues Album";
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

export async function startToyCreationDialogue(userId: string, title?: string) {
  const draft: ItemDraft = { kind: "toy", status: "ACTIVE", fields: {} };
  if (title) draft.fields.title = clean(title);
  const question = nextQuestion(draft);
  if (question) {
    await saveDraft(userId, draft);
    return `Ich erfasse ein neues Spielzeug.\n${question}`;
  }
  const result = await createFromDraft(userId, draft);
  await saveDraft(userId, { ...draft, status: "DONE" });
  return result;
}

export async function handleItemCreationImage(userId: string, imageUrl: string) {
  const pendingReplacement = await latestActiveImageReplacementDraft(userId);
  if (pendingReplacement) {
    if (pendingReplacement.target === "toy") {
      const toy = await prisma.toy.update({ where: { id: pendingReplacement.targetId }, data: { imageUrl } });
      await saveImageReplacementDraft(userId, { ...pendingReplacement, label: toy.title, slug: toy.slug, status: "DONE" });
      await prisma.auditLog.create({
        data: {
          actorId: userId,
          action: "toy_image_changed_telegram",
          entityType: "toy",
          entityId: toy.id,
          title: `Spielzeugbild per Telegram ersetzt: ${toy.title}`,
          href: `/toys/${toy.slug}`
        }
      });
      return `<b>Bild ersetzt</b>\n${telegramHtml(toy.title)}\n${telegramLink(link(`/toys/${toy.slug}`), "öffnen")}`;
    }
    const position = await prisma.position.update({ where: { id: pendingReplacement.targetId }, data: { imageUrl } });
    await saveImageReplacementDraft(userId, { ...pendingReplacement, label: position.name, slug: position.slug, status: "DONE" });
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "position_image_changed_telegram",
        entityType: "position",
        entityId: position.id,
        title: `Szenenbild per Telegram ersetzt: ${position.name}`,
        href: `/positions/${position.slug}`
      }
    });
    return `<b>Bild ersetzt</b>\n${telegramHtml(position.name)}\n${telegramLink(link(`/positions/${position.slug}`), "öffnen")}`;
  }

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
