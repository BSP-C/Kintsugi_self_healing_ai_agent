export function monitorFailure(result) {
  if (result?.ok) return { failed: false, status: result.status ?? null, reason: null };
  return { failed: true, status: result?.status ?? null, reason: result?.validation?.reason ?? result?.body?.error ?? 'Unknown request failure', detectedAt: new Date().toISOString() };
}
