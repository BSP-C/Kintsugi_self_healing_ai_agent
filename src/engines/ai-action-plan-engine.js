export function createActionPlan({ diagnosis, candidates }) {
  if (!candidates?.length) return { status: 'no_safe_plan', steps: [], candidateIndexes: [] };
  return { status: 'candidate_plans_available', diagnosis: diagnosis?.likelyCause ?? 'unknown', steps: ['Validate candidate against trusted contract', 'Assess dependent-tool impact', 'Apply versioned patch', 'Revalidate with a bounded retry', 'Commit or roll back'], candidateIndexes: candidates.map((_, index) => index) };
}
