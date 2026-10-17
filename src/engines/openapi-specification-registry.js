/** Converts the mock API's normalized schema into a valid OpenAPI 3.1 document. */
export function toOpenApiDocument(schema) {
  const properties = Object.fromEntries(Object.entries(schema.response?.fields ?? {}).map(([name, type]) => [name, { type: type === 'number' ? 'number' : type }]));
  const responseSchema = { type: 'object', properties };
  const wrappedSchema = (schema.response?.path ?? []).reduceRight((inner, key) => ({ type: 'object', properties: { [key]: inner } }), responseSchema);
  const parameters = (schema.queryParameters ?? []).map(name => ({ name, in: 'query', required: (schema.requiredParameters ?? []).includes(name), schema: { type: 'string' } }));
  const security = schema.authentication?.required ? [{ bearerAuth: [] }] : [];
  return {
    openapi: '3.1.0', info: { title: 'Sentinel Mock Orders API', version: '1.0.0' },
    paths: { [schema.endpoint]: { [String(schema.method || 'GET').toLowerCase()]: {
      operationId: 'get_order_status', summary: 'Retrieve order status', parameters,
      ...(security.length ? { security } : {}), responses: { '200': { description: 'Order status', content: { 'application/json': { schema: wrappedSchema } } }, '400': { description: 'Invalid request' }, '401': { description: 'Authentication required' } }
    } } }, components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } }, 'x-sentinel-normalized-schema': structuredClone(schema)
  };
}

export function createOpenApiSpecificationRegistry() {
  const versions = [];
  return {
    record(spec, label = 'observed') {
      const fingerprint = JSON.stringify(spec);
      const existing = versions.find(entry => entry.fingerprint === fingerprint);
      if (existing) return structuredClone(existing);
      const entry = { version: versions.length + 1, label, recordedAt: new Date().toISOString(), fingerprint, spec: structuredClone(spec), knownGood: versions.length === 0 };
      versions.push(entry);
      return structuredClone(entry);
    },
    latest() { return versions.length ? structuredClone(versions.at(-1)) : null; },
    knownGood() { const entries = versions.filter(entry => entry.knownGood); return entries.length ? structuredClone(entries.at(-1)) : null; },
    list() { return structuredClone(versions.map(({ fingerprint, spec, ...entry }) => entry)); },
    markKnownGood(version) { const entry = versions.find(item => item.version === version); if (!entry) throw new Error(`Unknown OpenAPI version ${version}`); for (const item of versions) item.knownGood = false; entry.knownGood = true; }
  };
}
