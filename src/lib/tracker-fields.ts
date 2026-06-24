import { moodAfter, moodBefore } from "@/lib/moods";

export type TrackerField = {
  key: string;
  label: string;
  type: string;
  options?: Array<string | { value?: unknown; label?: unknown }>;
};

export function trackerFields(fields: unknown, trackerKey?: string): TrackerField[] {
  const parsed = Array.isArray(fields)
    ? fields
        .filter((field) => field && typeof field === "object" && "key" in field)
        .map((field) => {
          const data = field as { key?: unknown; label?: unknown; name?: unknown; type?: unknown; options?: unknown };
          return {
            key: String(data.key || ""),
            label: String(data.label || data.name || data.key || ""),
            type: String(data.type || "text"),
            options: Array.isArray(data.options) ? data.options as TrackerField["options"] : undefined
          };
        })
        .filter((field) => field.key)
    : [];
  const existingKeys = new Set(parsed.map((field) => field.key));
  if (trackerKey === "segufix") {
    if (!existingKeys.has("moodBefore")) parsed.push({ key: "moodBefore", label: "Stimmung vorher", type: "select", options: Object.entries(moodBefore).map(([value, label]) => ({ value, label })) });
    if (!existingKeys.has("moodAfter")) parsed.push({ key: "moodAfter", label: "Stimmung nachher", type: "select", options: Object.entries(moodAfter).map(([value, label]) => ({ value, label })) });
  }
  return parsed;
}

export function fieldOptions(field: TrackerField) {
  if (field.options?.length) {
    return field.options.map((option) => {
      if (typeof option === "string") return { value: option, label: option };
      return { value: String(option.value || option.label || ""), label: String(option.label || option.value || "") };
    }).filter((option) => option.value);
  }
  if (field.key === "moodBefore") return Object.entries(moodBefore).map(([value, label]) => ({ value, label }));
  if (field.key === "moodAfter") return Object.entries(moodAfter).map(([value, label]) => ({ value, label }));
  return [];
}

export function fieldValuesFromForm(formData: FormData, fields: TrackerField[], currentValues: Record<string, unknown> = {}) {
  const nextValues: Record<string, unknown> = { ...currentValues };
  for (const field of fields) {
    const nextValue = String(formData.get(`field:${field.key}`) || "").trim();
    if (nextValue) nextValues[field.key] = nextValue;
    else delete nextValues[field.key];
  }
  return nextValues;
}
