export function textResult(text, structuredContent = undefined) {
  return {
    content: [{ type: "text", text }],
    ...(structuredContent === undefined ? {} : { structuredContent })
  };
}

export function jsonResult(label, data) {
  const compact = JSON.stringify(data, null, 2);
  return textResult(`${label}\n\n${compact}`, data);
}

export function errorResult(error) {
  const status = error.status || 500;
  const body = error.body || { error: { code: "mcp_error", message: error.message || "Unbekannter Fehler" } };
  return {
    isError: true,
    content: [{ type: "text", text: `Fehler ${status}: ${body?.error?.message || body?.error || error.message}` }],
    structuredContent: body
  };
}
