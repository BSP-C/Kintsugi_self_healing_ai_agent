const SAFE_KEYS = new Set(['endpoint', 'method', 'queryParameters', 'requiredParameters', 'queryDefaults', 'authentication', 'expectedResponseTypes', 'responsePath']);
export function validateCounterfactuals(currentTool, candidates, trustedSchema) {
  return (candidates ?? []).map((candidate, index) => {
    const keys = Object.keys(candidate.tool ?? {});
    const unknownKeys = keys.filter(key => !SAFE_KEYS.has(key));
    const endpointAllowed = candidate.tool?.endpoint === currentTool.endpoint && candidate.tool?.method === currentTool.method;
    const parametersAllowed = (candidate.tool?.queryParameters ?? []).every(name => (trustedSchema.queryParameters ?? []).includes(name));
    const responseFieldsAllowed = Object.keys(candidate.tool?.expectedResponseTypes ?? {}).every(name => Object.hasOwn(trustedSchema.response?.fields ?? {}, name));
    const valid = !unknownKeys.length && endpointAllowed && parametersAllowed && responseFieldsAllowed;
    return { index, valid, reasons: [unknownKeys.length ? `Unsupported tool fields: ${unknownKeys.join(', ')}` : null, !endpointAllowed ? 'Endpoint or HTTP method changes are not allowed automatically.' : null, !parametersAllowed ? 'Candidate uses parameters absent from the trusted contract.' : null, !responseFieldsAllowed ? 'Candidate uses response fields absent from the trusted contract.' : null].filter(Boolean) };
  });
}
