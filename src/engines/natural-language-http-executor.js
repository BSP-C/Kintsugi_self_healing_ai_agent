/** Small, transparent intent parser for the local demo. Unknown intents are rejected. */
export function translateNaturalLanguage(input) {
  const text = String(input ?? '').trim();
  if (!text) throw new Error('Enter a request in natural language.');
  const match = text.match(/(?:order\s*(?:status|details)?|status\s*of\s*order)\s*(?:number|#|id)?\s*([a-z0-9_-]+)/i)
    ?? text.match(/(?:show|get|check|find)\s+(?:me\s+)?(?:the\s+)?order\s+([a-z0-9_-]+)/i);
  if (!match) throw new Error('I can currently understand requests like “check order 123” or “show order status 123”.');
  return { intent: 'get_order_status', parameters: { orderId: match[1] }, confidence: 0.95, parser: 'rule-based-demo' };
}

export async function executeNaturalLanguageRequest({ input, tool, apiBase, token }) {
  const translated = translateNaturalLanguage(input);
  const query = new URLSearchParams();
  const parameter = (tool.queryParameters ?? [])[0];
  if (!parameter) throw new Error('The active tool has no query parameter mapping.');
  query.set(parameter, translated.parameters.orderId);
  for (const required of tool.requiredParameters ?? []) {
    if (!query.has(required)) {
      const value = tool.queryDefaults?.[required];
      if (value === undefined) throw new Error(`Missing configured value for required parameter: ${required}`);
      query.set(required, String(value));
    }
  }
  const headers = {};
  if (tool.authentication?.required) {
    if (!token) throw new Error('The tool requires authentication but no credential is configured.');
    headers.Authorization = `${tool.authentication.scheme || 'Bearer'} ${token}`;
  }
  const response = await fetch(`${apiBase}${tool.endpoint}?${query}`, { method: tool.method || 'GET', headers, signal: AbortSignal.timeout(3000) });
  let body; try { body = await response.json(); } catch { body = null; }
  return { translated, request: { method: tool.method || 'GET', url: `${tool.endpoint}?${query}`, headers: Object.keys(headers) }, status: response.status, ok: response.ok, body };
}
