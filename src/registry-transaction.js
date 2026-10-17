export function beginRegistryTransaction(registry) {
  const snapshot = structuredClone(registry);
  let committed = false;
  return {
    commit() { committed = true; return structuredClone(registry); },
    rollback() {
      if (committed) return {restored:false, reason:'Transaction was already committed.'};
      for (const key of Object.keys(registry)) delete registry[key];
      Object.assign(registry, structuredClone(snapshot));
      return {restored:true, registry:structuredClone(registry)};
    },
    snapshot:structuredClone(snapshot)
  };
}
