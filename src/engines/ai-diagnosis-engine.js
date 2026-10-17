/** Evidence-grounded diagnosis fallback; an LLM may refine this but cannot invent schema facts. */
export function diagnoseFailure({ failure, differences = [] }) {
  const reason = String(failure?.reason ?? failure?.validation?.reason ?? 'Unknown failure');
  const status = failure?.status ?? null;
  const kinds = differences.map(item => item.kind);
  let likelyCause = 'unclassified_runtime_failure';
  if (status === 401 || kinds.includes('authentication')) likelyCause = 'authentication_contract_drift';
  else if (/required query parameter/i.test(reason) || kinds.includes('query_parameters') || kinds.includes('required_parameters')) likelyCause = 'request_parameter_contract_drift';
  else if (/response path/i.test(reason) || kinds.includes('response_path')) likelyCause = 'response_nesting_drift';
  else if (/expected .* received/i.test(reason) || kinds.includes('response_fields')) likelyCause = 'response_schema_drift';
  return { likelyCause, confidence: kinds.length ? 0.86 : 0.55, evidence: { status, reason, contractDifferenceKinds: kinds }, requiresHumanReview: likelyCause === 'unclassified_runtime_failure' };
}
