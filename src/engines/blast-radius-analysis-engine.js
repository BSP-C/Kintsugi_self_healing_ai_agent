import { assessBlastRadius } from '../repair-engine.js';
export function analyzeBlastRadius({ toolId, before, after, registry }) {
  const result = assessBlastRadius({ toolId, before, after }, registry);
  return { ...result, requiresApproval: result.risk === 'elevated' };
}
