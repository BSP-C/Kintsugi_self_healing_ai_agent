import { cloneTool, ORIGINAL_TOOL } from '../schema.js';

export function createToolRegistry() {
  const original = cloneTool(ORIGINAL_TOOL);
  const active = new Map([['get_order_status', cloneTool(original)]]);
  const versions = new Map([['get_order_status', [{ version: 1, createdAt: new Date().toISOString(), tool: cloneTool(original), note: 'Initial known-good definition' }]]]);
  return {
    reset() { active.set('get_order_status', cloneTool(original)); versions.set('get_order_status', [{ version: 1, createdAt: new Date().toISOString(), tool: cloneTool(original), note: 'Initial known-good definition' }]); },
    get(id = 'get_order_status') { const tool = active.get(id); return tool ? cloneTool(tool) : null; },
    list() { return [...active.entries()].map(([id, tool]) => ({ id, ...cloneTool(tool) })); },
    snapshot(id = 'get_order_status') { return { active: this.get(id), history: structuredClone(versions.get(id) ?? []) }; },
    patch(id, next, note = 'Validated schema-drift repair') {
      if (!active.has(id)) throw new Error(`Unknown tool: ${id}`);
      const history = versions.get(id) ?? [];
      const version = history.length + 1;
      active.set(id, cloneTool(next));
      history.push({ version, createdAt: new Date().toISOString(), tool: cloneTool(next), note });
      versions.set(id, history);
      return { version, tool: cloneTool(next) };
    },
    rollback(id, version) {
      const history = versions.get(id) ?? [];
      const target = history.find(entry => entry.version === version);
      if (!target) throw new Error(`Known-good version ${version} not found for ${id}`);
      active.set(id, cloneTool(target.tool));
      history.push({ version: history.length + 1, createdAt: new Date().toISOString(), tool: cloneTool(target.tool), note: `Rollback to version ${version}` });
      versions.set(id, history);
      return cloneTool(target.tool);
    }
  };
}
