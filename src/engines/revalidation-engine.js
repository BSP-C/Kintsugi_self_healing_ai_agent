export async function revalidateWithRollback({ tool, candidate, request, onRollback }) {
  const before = structuredClone(tool);
  for (const key of Object.keys(tool)) delete tool[key];
  Object.assign(tool, structuredClone(candidate));
  const result = await request(tool);
  if (result.ok) return { result, committed: true, rolledBack: false };
  for (const key of Object.keys(tool)) delete tool[key];
  Object.assign(tool, before);
  await onRollback?.(result);
  return { result, committed: false, rolledBack: true };
}
