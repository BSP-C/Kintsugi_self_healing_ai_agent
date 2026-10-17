import { beginRegistryTransaction } from '../registry-transaction.js';
export function applyVersionedPatch(activeRegistry, candidateTool) {
  const transaction = beginRegistryTransaction(activeRegistry);
  activeRegistry.tool = structuredClone(candidateTool);
  return { transaction, before: transaction.snapshot.tool, after: structuredClone(activeRegistry.tool) };
}
