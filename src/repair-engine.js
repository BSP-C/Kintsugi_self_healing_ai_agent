const primitiveTypes = new Set(['string', 'number', 'boolean']);

function sameArray(a, b) { return JSON.stringify(a ?? []) === JSON.stringify(b ?? []); }

// Produces schema-derived candidate repairs; no scenario names or API field names are embedded here.
export function generateCounterfactuals(tool, schema) {
  const candidates = [];
  if (schema.endpoint !== tool.endpoint || schema.method !== tool.method) return candidates;

  const candidate = structuredClone(tool);
  const changes = [];
  const oldParams = new Set(tool.queryParameters ?? []);
  const newParams = schema.queryParameters ?? [];
  const removed = [...oldParams].filter(p => !newParams.includes(p));
  const added = newParams.filter(p => !oldParams.has(p));

  if (removed.length && added.length && removed.length === added.length) {
    candidate.queryParameters = [...newParams];
    candidate.requiredParameters = [...(schema.requiredParameters ?? newParams)];
    changes.push({kind:'parameter_mapping', from:removed, to:added, rationale:'Align query parameter definitions with the live schema.'});
  } else if (!sameArray(tool.queryParameters, newParams) && added.length) {
    candidate.queryParameters = [...newParams];
    candidate.requiredParameters = [...(schema.requiredParameters ?? newParams)];
    candidate.queryDefaults = {...(tool.queryDefaults ?? {}), ...(schema.queryParameterDefaults ?? {})};
    changes.push({kind:'query_parameters', from:tool.queryParameters, to:newParams, rationale:'Add parameters declared by the live schema and use schema-provided defaults.'});
  }

  const newPath = schema.response?.path ?? [];
  if (!sameArray(tool.responsePath, newPath)) {
    candidate.responsePath = [...newPath];
    changes.push({kind:'response_path', from:tool.responsePath, to:newPath, rationale:'Match the response nesting declared by the live schema.'});
  }

  const fields = schema.response?.fields ?? {};
  const expected = {...(tool.expectedResponseTypes ?? {})};
  let typeChanged = false;
  for (const [field, type] of Object.entries(fields)) {
    if (primitiveTypes.has(type) && Object.hasOwn(expected, field) && expected[field] !== type) {
      expected[field] = type; typeChanged = true;
    }
  }
  if (typeChanged) {
    candidate.expectedResponseTypes = expected;
    changes.push({kind:'response_types', from:tool.expectedResponseTypes, to:expected, rationale:'Align expected primitive field types with the live schema.'});
  }

  if (schema.authentication?.required && !tool.authentication?.required) {
    if (schema.authentication.scheme !== 'Bearer') return candidates;
    const token = process.env.MOCK_API_TOKEN;
    if (!token) return candidates;
    candidate.authentication = {required:true, scheme:schema.authentication.scheme, token};
    changes.push({kind:'authentication', from:tool.authentication, to:{required:true,scheme:schema.authentication.scheme,token:'[configured secret]'}, rationale:'Use a configured credential for the authentication scheme advertised by the live schema.'});
  }

  if (changes.length) {
    // Include a combined hypothesis and one-change-at-a-time hypotheses so the LLM can compare counterfactuals.
    candidates.push({tool:candidate, changes, rationale:changes.map(c=>c.rationale).join(' '), source:'combined-counterfactual'});
    for (const change of changes) {
      const alternative = structuredClone(tool);
      if (change.kind === 'parameter_mapping' || change.kind === 'query_parameters') {
        alternative.queryParameters = [...change.to];
        alternative.requiredParameters = [...(schema.requiredParameters ?? change.to)];
        alternative.queryDefaults = {...(tool.queryDefaults ?? {}), ...(schema.queryParameterDefaults ?? {})};
      } else if (change.kind === 'response_path') {
        alternative.responsePath = [...change.to];
      } else if (change.kind === 'response_types') {
        alternative.expectedResponseTypes = {...change.to};
      } else if (change.kind === 'authentication') {
        alternative.authentication = structuredClone(candidate.authentication);
      }
      candidates.push({tool:alternative, changes:[change], rationale:change.rationale, source:'single-change-counterfactual'});
    }
  }
  return candidates;
}

export async function askLlmForRepair({tool, schema, failure, candidates}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const endpoint = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetch(endpoint, {
    method:'POST', headers:{'content-type':'application/json','authorization':`Bearer ${apiKey}`},
    body:JSON.stringify({model,temperature:0,response_format:{type:'json_object'},messages:[
      {role:'system',content:'You repair agent tool definitions after runtime API schema drift. Return JSON only with keys: candidateIndex (integer), rationale (string), rejectedAlternatives (array of strings), confidence (number 0..1). Select only among supplied candidates. Never invent credentials, endpoints, fields, parameters, or permissions. If no candidate is safe, use candidateIndex -1.'},
      {role:'user',content:JSON.stringify({currentTool:tool,liveSchema:schema,failure,counterfactualCandidates:candidates.map((c,i)=>({candidateIndex:i,tool:c.tool,changes:c.changes,rationale:c.rationale}))})}
    ]})
  });
  if (!response.ok) throw new Error(`LLM repair request failed with HTTP ${response.status}`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM returned no repair decision.');
  const decision = JSON.parse(content);
  if (!Number.isInteger(decision.candidateIndex) || decision.candidateIndex < -1 || decision.candidateIndex >= candidates.length) throw new Error('LLM returned an invalid candidate index.');
  return decision;
}

export function assessBlastRadius(candidate, registry) {
  const changed = new Set();
  for (const key of new Set([...Object.keys(candidate.before ?? {}), ...Object.keys(candidate.after ?? {})])) {
    if (JSON.stringify(candidate.before?.[key]) !== JSON.stringify(candidate.after?.[key])) changed.add(key);
  }
  const tools = registry?.tools ?? [];
  const impacted = tools.filter(t => t.id !== candidate.toolId && (t.dependsOn ?? []).some(dep => changed.has(dep) || dep === candidate.toolId));
  return {changedDimensions:[...changed], impactedToolIds:impacted.map(t=>t.id), impactedCount:impacted.length, risk:impacted.length ? 'elevated' : 'local'};
}
