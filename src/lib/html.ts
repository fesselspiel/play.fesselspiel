const allowedTags = new Set(["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "a", "h2", "h3", "h4", "blockquote"]);

function safeHref(value: string) {
  const href = value.trim();
  if (/^(https?:\/\/|\/)/i.test(href) && !/javascript:/i.test(href)) return href.replace(/"/g, "&quot;");
  return "";
}

export function sanitizeShopifyHtml(value: string | null | undefined) {
  const withoutDangerousBlocks = String(value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|svg|math)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|svg|math)[^>]*\/?\s*>/gi, "");

  return withoutDangerousBlocks.replace(/<[^>]+>/g, (tag) => {
    const match = tag.match(/^<\s*(\/)?\s*([a-zA-Z0-9]+)([^>]*)>/);
    if (!match) return "";
    const closing = Boolean(match[1]);
    const name = match[2].toLowerCase();
    const attrs = match[3] || "";
    if (!allowedTags.has(name)) return "";
    if (closing) return name === "br" ? "" : `</${name}>`;
    if (name === "br") return "<br />";
    if (name === "a") {
      const hrefMatch = attrs.match(/\s+href\s*=\s*["']([^"']+)["']/i);
      const href = hrefMatch ? safeHref(hrefMatch[1]) : "";
      return href ? `<a href="${href}" target="_blank" rel="noreferrer">` : "<a>";
    }
    return `<${name}>`;
  });
}

export function stripHtml(value: string | null | undefined) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
