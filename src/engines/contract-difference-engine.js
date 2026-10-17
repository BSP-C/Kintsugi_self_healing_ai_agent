export function compareContracts(previous = {}, current = {}) {
  const differences = [];
  const compare = (kind, before, after) => { if (JSON.stringify(before) !== JSON.stringify(after)) differences.push({ kind, before: structuredClone(before ?? null), after: structuredClone(after ?? null) }); };
  compare('endpoint', previous.endpoint, current.endpoint);
  compare('method', previous.method, current.method);
  compare('query_parameters', previous.queryParameters, current.queryParameters);
  compare('required_parameters', previous.requiredParameters, current.requiredParameters);
  compare('authentication', { required: Boolean(previous.authentication?.required), scheme: previous.authentication?.scheme ?? null }, { required: Boolean(current.authentication?.required), scheme: current.authentication?.scheme ?? null });
  compare('response_path', previous.response?.path, current.response?.path);
  compare('response_fields', previous.response?.fields, current.response?.fields);
  return differences;
}
