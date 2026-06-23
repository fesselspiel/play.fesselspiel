const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "public", "docs");
fs.mkdirSync(outDir, { recursive: true });

const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Playplaner Benutzeranleitung</title>
  <style>
    :root { --red:#E30613; --ink:#111; --graphite:#555; --paper:#F5F5F5; --line:#D9D9D9; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:#fff; line-height:1.55; }
    header { background:linear-gradient(135deg, #111 0%, #2b2b2b 45%, #E30613 100%); color:white; padding:56px 24px; }
    .wrap { max-width:1040px; margin:0 auto; }
    h1 { margin:0; font-size:clamp(2.2rem, 6vw, 4.7rem); line-height:.95; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:1.7rem; }
    h3 { margin:0 0 8px; font-size:1.1rem; }
    p { margin:0 0 14px; }
    .lead { max-width:740px; margin-top:20px; color:#f4f4f4; font-size:1.15rem; }
    .meta { display:flex; flex-wrap:wrap; gap:10px; margin-top:26px; }
    .pill { border:1px solid rgba(255,255,255,.36); border-radius:999px; padding:8px 12px; background:rgba(255,255,255,.12); font-weight:700; }
    main { padding:34px 24px 72px; }
    section { margin:0 auto 26px; max-width:1040px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:16px; }
    .card { border:1px solid var(--line); background:var(--paper); border-radius:8px; padding:18px; }
    .card strong { color:var(--red); }
    .hero-shot, .shot { border:1px solid var(--line); border-radius:8px; overflow:hidden; background:#fff; box-shadow:0 10px 30px rgba(0,0,0,.08); }
    .hero-shot svg, .shot svg { display:block; width:100%; height:auto; }
    .feature { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(260px,.9fr); gap:20px; align-items:center; }
    .steps { counter-reset:step; padding:0; margin:0; list-style:none; }
    .steps li { position:relative; margin:0 0 10px; padding-left:38px; }
    .steps li:before { counter-increment:step; content:counter(step); position:absolute; left:0; top:0; width:26px; height:26px; display:grid; place-items:center; border-radius:50%; background:var(--red); color:white; font-weight:800; font-size:.9rem; }
    .note { border-left:4px solid var(--red); background:#fff5f5; padding:14px 16px; border-radius:0 8px 8px 0; color:#333; }
    footer { border-top:1px solid var(--line); padding:24px; color:var(--graphite); }
    @media (max-width: 760px) { .feature { grid-template-columns:1fr; } header { padding-top:38px; } }
    @media print { header { background:#111 !important; } .card, .shot, .hero-shot { break-inside:avoid; } }
  </style>
</head>
<body>
<header>
  <div class="wrap">
    <h1>Playplaner<br />Benutzeranleitung</h1>
    <p class="lead">Eine kompakte, verständliche Anleitung für Startseite, Spielampel, Szenen, Spielsachen, Bilder, Aufträge, Tracker, Telegram, E-Mail und Administration.</p>
    <div class="meta">
      <span class="pill">für Benutzer</span>
      <span class="pill">für Paare und Kreise</span>
      <span class="pill">Stand: Juni 2026</span>
    </div>
  </div>
</header>
<main>
  <section class="feature">
    <div>
      <h2>1. Startseite und Überblick</h2>
      <p>Die Startseite bündelt das, was gerade wichtig ist: Spielampel, offene Anfragen, Aufträge, Tracker-To-dos, Favoriten und Feed. Sie ist der tägliche Einstiegspunkt.</p>
      <ol class="steps">
        <li>Prüfe zuerst die Spielampel deines Kreises.</li>
        <li>Öffne offene Spielpläne oder Aufträge direkt aus den Kacheln.</li>
        <li>Nutze den Feed für wichtige Ereignisse und Kommentare.</li>
      </ol>
    </div>
    <div class="hero-shot"><svg viewBox="0 0 560 340" role="img" aria-label="Startseitenübersicht">
      <rect width="560" height="340" fill="#fff"/>
      <rect x="24" y="24" width="512" height="56" rx="8" fill="#111"/><circle cx="58" cy="52" r="15" fill="#22c55e"/><circle cx="102" cy="52" r="15" fill="#E30613"/><text x="136" y="58" font-size="20" font-family="Arial" fill="#fff">Spielampel</text>
      <rect x="24" y="102" width="246" height="88" rx="8" fill="#F5F5F5"/><text x="44" y="136" font-size="18" font-family="Arial" fill="#111">Offene Aufträge</text><rect x="44" y="154" width="128" height="12" rx="6" fill="#E30613"/>
      <rect x="290" y="102" width="246" height="88" rx="8" fill="#F5F5F5"/><text x="310" y="136" font-size="18" font-family="Arial" fill="#111">Tracker-To-dos</text><rect x="310" y="154" width="160" height="12" rx="6" fill="#0284C7"/>
      <rect x="24" y="212" width="512" height="94" rx="8" fill="#F5F5F5"/><text x="44" y="248" font-size="18" font-family="Arial" fill="#111">Feed</text><circle cx="470" cy="246" r="18" fill="#E30613"/><text x="464" y="253" font-size="20" font-family="Arial" fill="#fff">♥</text>
    </svg></div>
  </section>

  <section>
    <h2>2. Die wichtigsten Bereiche</h2>
    <div class="grid">
      <div class="card"><h3>Szenen</h3><p>Szenen beschreiben Positionen oder Setups. Sie können Bilder, Beschreibungen, Self-Bondage-Fähigkeit, Favoriten und Verknüpfungen zu Spielsachen enthalten.</p></div>
      <div class="card"><h3>Spielsachen</h3><p>Der Katalog dokumentiert persönliche Ausrüstung. Einträge können Bilder, Beschreibung, Favoriten, Sortierung und Verknüpfungen zu Szenen haben.</p></div>
      <div class="card"><h3>Bondage-System</h3><p>Shopify-Produkte werden separat synchronisiert und freigeschaltet. Sichtbare Produkte können wie Spielsachen mit Szenen verbunden werden.</p></div>
      <div class="card"><h3>Ideensammlung</h3><p>Ideen sammeln Dinge, die ihr später ausprobieren wollt. Ideen haben eigene Bilder, Likes und Details, ohne die normale Bildergalerie zu vermischen.</p></div>
      <div class="card"><h3>Aufträge</h3><p>Self-Bondage-Aufträge werden beauftragt, angenommen, geändert und abgeschlossen. Beim Abschluss können sie in die Historie einfließen.</p></div>
      <div class="card"><h3>Bilder</h3><p>Die Bilderseite zeigt Alben bildzentriert. Sichtbarkeit kann auf Album- oder Bildebene geregelt werden.</p></div>
    </div>
  </section>

  <section class="feature">
    <div class="shot"><svg viewBox="0 0 560 300" role="img" aria-label="Bilder und Alben">
      <rect width="560" height="300" fill="#fff"/>
      <rect x="24" y="24" width="112" height="112" rx="8" fill="#111"/><rect x="154" y="24" width="112" height="112" rx="8" fill="#E30613"/><rect x="284" y="24" width="112" height="112" rx="8" fill="#0284C7"/><rect x="414" y="24" width="112" height="112" rx="8" fill="#F59E0B"/>
      <text x="24" y="162" font-size="16" font-family="Arial" fill="#555">Alben</text>
      <rect x="24" y="188" width="156" height="88" rx="8" fill="#F5F5F5"/><rect x="202" y="188" width="156" height="88" rx="8" fill="#F5F5F5"/><rect x="380" y="188" width="156" height="88" rx="8" fill="#F5F5F5"/>
    </svg></div>
    <div>
      <h2>3. Bilder, Uploads und Sichtbarkeit</h2>
      <p>Bilder werden geschützt gespeichert und nicht als direkte Dateipfade veröffentlicht. In Dialogen kann ein Ausschnitt gewählt werden, damit Vorschaubilder konsistent aussehen.</p>
      <ol class="steps">
        <li>Bild hochladen und Ausschnitt wählen.</li>
        <li>Album und Sichtbarkeit prüfen.</li>
        <li>Bei Bedarf Notizen, Favoriten oder Kommentare ergänzen.</li>
      </ol>
    </div>
  </section>

  <section class="feature">
    <div>
      <h2>4. Tracker und Kontingente</h2>
      <p>Tracker messen Zeiten für wiederkehrende Themen. Segufix und KG sind konkrete Tracker-Instanzen. Kontingente zeigen, was täglich, wöchentlich oder monatlich noch offen ist.</p>
      <div class="note">Tipp: API und Telegram können Tracker starten, stoppen und Kontingente abfragen. Das ist für Alexa, Kurzbefehle oder Automationen gedacht.</div>
    </div>
    <div class="shot"><svg viewBox="0 0 560 300" role="img" aria-label="Tracker">
      <rect width="560" height="300" fill="#fff"/>
      <rect x="28" y="30" width="504" height="64" rx="8" fill="#F5F5F5"/><text x="52" y="69" font-size="22" font-family="Arial" fill="#111">Segufix Time Tracker</text><rect x="382" y="54" width="110" height="12" rx="6" fill="#E30613"/>
      <rect x="28" y="116" width="504" height="64" rx="8" fill="#F5F5F5"/><text x="52" y="155" font-size="22" font-family="Arial" fill="#111">KG Time Tracker</text><rect x="382" y="140" width="82" height="12" rx="6" fill="#0284C7"/>
      <rect x="28" y="202" width="240" height="58" rx="8" fill="#111"/><text x="52" y="238" font-size="18" font-family="Arial" fill="#fff">Noch 120 Minuten</text>
    </svg></div>
  </section>

  <section>
    <h2>5. Kommunikation und Automationen</h2>
    <div class="grid">
      <div class="card"><h3>Telegram</h3><p>Der Bot kann Befehle ausführen, Bilder einsortieren, Dialoge öffnen und über Regeln Benachrichtigungen in passende Threads senden.</p></div>
      <div class="card"><h3>E-Mail</h3><p>Templates steuern Einladungen, Konto-Mails und Aktionsbenachrichtigungen. Versand und Fehler werden protokolliert.</p></div>
      <div class="card"><h3>API</h3><p>Tokens erlauben externe Webaufrufe für Status, Spielampel, Einladungen, Tracker und Medienuploads.</p></div>
      <div class="card"><h3>Protokoll und Feed</h3><p>Aktionen werden protokolliert. Ausgewählte Einträge können im Feed erscheinen, geliked und kommentiert werden.</p></div>
    </div>
  </section>

  <section>
    <h2>6. Administration</h2>
    <p>Admins verwalten Benutzer, Seiten, Features, Bots, Mailtemplates, Shopify, Tracker, API-Tokens, Datenexporte und Protokolle. Super-Admins können zwischen Seiten wechseln und vorhandene Credentials übernehmen.</p>
    <ol class="steps">
      <li>Unter Einstellungen die passende Verwaltungsseite öffnen.</li>
      <li>Features pro Seite aktivieren oder deaktivieren.</li>
      <li>Nach Änderungen kurz die Startseite und betroffene Menüpunkte prüfen.</li>
    </ol>
  </section>
</main>
<footer><div class="wrap">Playplaner Benutzeranleitung · Öffentlich teilbarer Link · Stand Juni 2026</div></footer>
</body>
</html>`;

fs.writeFileSync(path.join(outDir, "benutzeranleitung.html"), html, "utf8");

const pages = [
  {
    title: "Playplaner Benutzeranleitung",
    subtitle: "Start, Szenen, Spielsachen, Bilder, Tracker, Telegram, E-Mail und Administration",
    blocks: [
      ["Startseite", "Die Startseite ist der tägliche Überblick. Hier siehst du Spielampel, offene Anfragen, Aufträge, Tracker-To-dos, Favoriten und Feed."],
      ["Szenen und Spielsachen", "Szenen beschreiben Setups. Spielsachen dokumentieren Ausrüstung. Beide können Bilder, Favoriten, Sortierung und Verknüpfungen besitzen."],
      ["Bilder", "Bilder werden geschützt gespeichert. Alben ordnen Inhalte. Sichtbarkeit kann pro Album oder pro Bild gesteuert werden."]
    ]
  },
  {
    title: "Planung, Aufträge und Ideen",
    subtitle: "Gemeinsame Vorhaben strukturiert vorbereiten",
    blocks: [
      ["Spielplanung", "Spielpläne werden angefragt, bestätigt und später als durchgeführt oder verworfen markiert."],
      ["Self-Bondage-Aufträge", "Aufträge werden erteilt, angenommen, geändert und abgeschlossen. Abgeschlossene Aufträge können in der Historie landen."],
      ["Ideensammlung", "Ideen sammeln Dinge, die ihr später ausprobieren wollt. Ideenbilder gehören nur zur Idee und erscheinen nicht automatisch in der Bildergalerie."]
    ]
  },
  {
    title: "Tracker und Kontingente",
    subtitle: "Zeiten messen, Ziele sehen und per API steuern",
    blocks: [
      ["Tracker", "Segufix und KG sind Tracker-Instanzen. Neue Tracker können als eigene Systeme konfiguriert werden."],
      ["Kontingente", "Tägliche, wöchentliche und monatliche Ziele zeigen, was bereits erfüllt ist und was noch offen bleibt."],
      ["API und Alexa", "API-Tokens erlauben Statusabfragen, Start/Stop von Trackern, Kontingente und andere Webaufrufe."]
    ]
  },
  {
    title: "Kommunikation und Administration",
    subtitle: "Telegram, E-Mail, Protokoll, Feed und Seitenverwaltung",
    blocks: [
      ["Telegram", "Bots können pro Seite oder Benutzer konfiguriert werden. Threads, Benutzerzuordnung und Bilder werden kontrolliert verarbeitet."],
      ["E-Mail", "Templates regeln Einladungen, Konto-Mails und Benachrichtigungen. Versandstatus und Fehler stehen im Protokoll."],
      ["Admin-Bereich", "Admins verwalten Benutzer, Features, Seiten, Shopify, Tracker, API-Tokens, Datenexport und Protokolle."]
    ]
  }
];

function latin(value) {
  return String(value).replace(/[“”]/g, '"').replace(/[–—]/g, "-");
}

function pdfString(value) {
  return latin(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function stream(commands) {
  const body = commands.join("\n");
  return `<< /Length ${Buffer.byteLength(body, "latin1")} >>\nstream\n${body}\nendstream`;
}

function pageStream(page, pageNo) {
  const commands = [
    "q",
    "0.91 0.02 0.07 rg 0 720 595 122 re f",
    "0.07 0.07 0.07 rg 0 690 595 30 re f",
    "Q",
    "BT /F1 30 Tf 36 780 Td 1 1 1 rg (" + pdfString(page.title) + ") Tj ET",
    "BT /F2 12 Tf 38 748 Td 1 1 1 rg (" + pdfString(page.subtitle) + ") Tj ET",
    "q 0.96 0.96 0.96 rg 36 542 523 112 re f Q",
    "q 0.89 0.02 0.07 rg 58 584 70 34 re f Q",
    "BT /F1 16 Tf 150 606 Td 0.07 0.07 0.07 rg (Visueller Schnellueberblick) Tj ET",
    "BT /F2 10 Tf 150 586 Td 0.30 0.30 0.30 rg (Kacheln, Status, Bilder und Aktionen sind auf Touch-Bedienung ausgelegt.) Tj ET"
  ];
  let y = 488;
  for (const [title, text] of page.blocks) {
    commands.push("q 0.96 0.96 0.96 rg 36 " + (y - 62) + " 523 84 re f Q");
    commands.push("q 0.89 0.02 0.07 rg 36 " + (y - 62) + " 6 84 re f Q");
    commands.push("BT /F1 16 Tf 58 " + (y - 12) + " Td 0.07 0.07 0.07 rg (" + pdfString(title) + ") Tj ET");
    const lines = wrap(latin(text), 88);
    let lineY = y - 34;
    for (const line of lines.slice(0, 3)) {
      commands.push("BT /F2 10 Tf 58 " + lineY + " Td 0.30 0.30 0.30 rg (" + pdfString(line) + ") Tj ET");
      lineY -= 14;
    }
    y -= 104;
  }
  commands.push("BT /F2 9 Tf 36 34 Td 0.45 0.45 0.45 rg (Playplaner Benutzeranleitung - Seite " + pageNo + ") Tj ET");
  return stream(commands);
}

function wrap(value, max) {
  const words = value.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const objects = [];
function addObject(content) {
  objects.push(Buffer.from(content, "latin1"));
  return objects.length;
}

const catalogId = 1;
objects.push(null);
const pagesId = 2;
objects.push(null);
const font1Id = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
const font2Id = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
const pageIds = [];
for (let i = 0; i < pages.length; i += 1) {
  const contentId = addObject(pageStream(pages[i], i + 1));
  const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >> >> /Contents ${contentId} 0 R >>`);
  pageIds.push(pageId);
}
objects[catalogId - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, "latin1");
objects[pagesId - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`, "latin1");

const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")];
const offsets = [0];
for (let i = 0; i < objects.length; i += 1) {
  offsets.push(Buffer.concat(chunks).length);
  chunks.push(Buffer.from(`${i + 1} 0 obj\n`, "latin1"), objects[i], Buffer.from("\nendobj\n", "latin1"));
}
const xrefOffset = Buffer.concat(chunks).length;
const xref = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "];
for (let i = 1; i < offsets.length; i += 1) xref.push(String(offsets[i]).padStart(10, "0") + " 00000 n ");
xref.push("trailer", `<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>`, "startxref", String(xrefOffset), "%%EOF");
chunks.push(Buffer.from(xref.join("\n"), "latin1"));
fs.writeFileSync(path.join(outDir, "playplaner-benutzeranleitung.pdf"), Buffer.concat(chunks));

console.log("Generated public/docs/benutzeranleitung.html");
console.log("Generated public/docs/playplaner-benutzeranleitung.pdf");
