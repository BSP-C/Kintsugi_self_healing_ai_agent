export function generateMetrics(runs = [], counters = {}) {
  const sentinel = runs.filter(run => run.agent === 'Sentinel');
  const baseline = runs.filter(run => run.agent === 'Baseline');
  const recovered = sentinel.filter(run => run.adapted && run.success && Number.isFinite(run.recoveryMs));
  const avg = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    adaptationRate: counters.adaptationAttempts ? (counters.adaptationSuccesses / counters.adaptationAttempts) * 100 : null,
    mttrMs: avg(recovered.map(run => run.recoveryMs)),
    baselineSuccessRate: baseline.length ? baseline.filter(run => run.success).length / baseline.length * 100 : null,
    sentinelSuccessRate: sentinel.length ? sentinel.filter(run => run.success).length / sentinel.length * 100 : null,
    requestOverhead: sentinel.reduce((sum, run) => sum + run.requests, 0) - baseline.reduce((sum, run) => sum + run.requests, 0),
    rollbackRate: sentinel.length ? sentinel.filter(run => run.rolledBack).length / sentinel.length * 100 : null,
    runCounts: { baseline: baseline.length, sentinel: sentinel.length }
  };
}
