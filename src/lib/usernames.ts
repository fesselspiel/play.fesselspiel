export function normalizeUsername(value: string | null | undefined) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  return normalized || null;
}

export function isValidUsername(value: string | null | undefined) {
  const normalized = normalizeUsername(value);
  return Boolean(normalized && normalized.length >= 2 && normalized.length <= 40 && /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(normalized));
}
