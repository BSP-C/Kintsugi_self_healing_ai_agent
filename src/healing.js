import { cloneTool, ORIGINAL_TOOL } from './schema.js';
import { DEMO_TOKEN } from './mock-api.js';
if (!process.env.MOCK_API_TOKEN) process.env.MOCK_API_TOKEN = DEMO_TOKEN;
import { generateCounterfactuals, askLlmForRepair } from './repair-engine.js';
import { applyVersionedPatch } from './engines/patch-engine.js';
import { revalidateWithRollback } from './engines/revalidation-engine.js';
import { toOpenApiDocument, createOpenApiSpecificationRegistry } from './engines/openapi-specification-registry.js';
import { compareContracts } from './engines/contract-difference-engine.js';
import { diagnoseFailure } from './engines/ai-diagnosis-engine.js';
import { createActionPlan } from './engines/ai-action-plan-engine.js';
import { validateCounterfactuals } from './engines/counterfactual-validation-engine.js';
import { monitorFailure } from './engines/failure-monitor-engine.js';
import { analyzeBlastRadius } from './engines/blast-radius-analysis-engine.js';
import { generateMetrics } from './engines/metrics-generation-engine.js';
import { createToolRegistry } from './engines/tool-registry.js';

const API_BASE = process.env.MOCK_API_URL || 'http://127.0.0.1:3001';
const TIMEOUT_MS = 2500;

export function createRunStore() {
  return { events: [], patches: [], runs: [], registry: { tools: [] }, toolRegistry: createToolRegistry(), openApiRegistry: createOpenApiSpecificationRegistry(), metrics: { adaptationAttempts: 0, adaptationSuccesses: 0, rollbacks: 0 } };
}
const now = () => new Date().toISOString();
function addEvent(store, agent, scenario, type, message, status = null, extra = {}) {
  const event = { id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, timestamp: now(), agent, scenario, type, message, status, ...extra };
  store.events.unshift(event);
  if (store.events.length > 500) store.events.length = 500;
  return event;
}
function extractAtPath(body, path) {
  let value = body;
  for (const key of path) value = value?.[key];
  return value;
}
function validateResponse(body, tool) {
  const value = extractAtPath(body, tool.responsePath);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: `Expected an object at response path "${tool.responsePath.join('.') || '(root)'}".` };
  for (const [field, expected] of Object.entries(tool.expectedResponseTypes)) {
    if (typeof value[field] !== expected) return { ok: false, reason: `Field "${field}" expected ${expected}, received ${typeof value[field]}.`, field, expected, actual: typeof value[field] };
  }
  return { ok: true, value };
}
async function requestWithTool(tool, scenario, store, agent, sourceScenario = scenario) {
  const query = new URLSearchParams();
  for (const key of tool.queryParameters ?? []) {
    const value = tool.queryDefaults?.[key] ?? ((tool.requiredParameters ?? []).includes(key) ? '123' : undefined);
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const url = `${API_BASE}${tool.endpoint}?${query.toString()}`;
  const headers = {};
  if (tool.authentication?.required && tool.authentication.token) headers.Authorization = `${tool.authentication.scheme || 'Bearer'} ${tool.authentication.token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  addEvent(store, agent, scenario, 'REQUEST_SENT', `GET ${tool.endpoint} using ${[...query.keys()].join(', ') || 'no query parameters'}.`);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const elapsedMs = performance.now() - started;
    let body;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      addEvent(store, agent, scenario, 'API_ERROR_DETECTED', `API returned HTTP ${response.status}: ${body?.error || response.statusText}`, response.status);
      return { ok: false, status: response.status, body, elapsedMs, validation: { ok: false, reason: body?.error || `HTTP ${response.status}` } };
    }
    const validation = validateResponse(body, tool);
    if (!validation.ok) {
      addEvent(store, agent, scenario, 'API_ERROR_DETECTED', `Response validation failed: ${validation.reason}`, response.status);
      return { ok: false, status: response.status, body, elapsedMs, validation };
    }
    addEvent(store, agent, scenario, 'RESPONSE_VALIDATED', 'HTTP response and expected response fields validated successfully.', response.status);
    return { ok: true, status: response.status, body, elapsedMs, validation };
  } catch (error) {
    const reason = error.name === 'AbortError' ? `Request timed out after ${TIMEOUT_MS} ms.` : error.message;
    addEvent(store, agent, scenario, 'API_ERROR_DETECTED', reason, null);
    return { ok: false, status: null, body: null, elapsedMs: performance.now() - started, validation: { ok: false, reason } };
  } finally { clearTimeout(timer); }
}
async function getCurrentSchema(store) {
  const response = await fetch(`${API_BASE}/api/schema`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Could not retrieve API schema: HTTP ${response.status}`);
  const schema = await response.json();
  const openApi = toOpenApiDocument(schema);
  const version = store.openApiRegistry.record(openApi, `observed:${schema.scenario ?? 'runtime'}`);
  addEvent(store, 'Sentinel', schema.scenario ?? 'runtime', 'OPENAPI_SPEC_REGISTERED', `Recorded OpenAPI contract version ${version.version}.`, null, { openApiVersion: version.version });
  return schema;
}
function diagnoseAndPatch(tool, schema, store, scenario) {
  const before = cloneTool(tool);
  const candidates = generateCounterfactuals(tool, schema);
  if (!candidates.length) return { ok:false, reason:'No safe schema-derived repair candidate could be generated. Check schema compatibility and configured credentials.' };
  const selected = candidates[0];
  for (const [key, value] of Object.entries(selected.tool)) tool[key] = structuredClone(value);
  const changes = selected.changes.map(change => ({...change, field:change.kind, oldValue:change.from, newValue:change.to}));
  return {ok:true, changes, before, candidates};
}
export function validateForTest(body, tool) { return validateResponse(body, tool); }

export async function runBaseline(scenario, store) {
  const tool = cloneTool(ORIGINAL_TOOL);
  const started = performance.now(); let attempts = 0; let result;
  do {
    attempts++; result = await requestWithTool(tool, scenario, store, 'Baseline');
  } while (!result.ok && attempts < 1);
  const run = { id: `${Date.now()}-baseline`, agent: 'Baseline', scenario, success: result.ok, status: result.status, requests: attempts, elapsedMs: performance.now() - started, adapted: false, validation: result.validation, response: result.ok ? result.validation.value : result.body, error: result.ok ? null : result.validation.reason, recoveryMs: null };
  store.runs.push(run); return run;
}

export async function runSentinel(scenario, store) {
  const tool = store.toolRegistry?.get('get_order_status') ?? cloneTool(ORIGINAL_TOOL);
  const started = performance.now();
  const first = await requestWithTool(tool, scenario, store, 'Sentinel');
  let attempts = 1, result = first, adapted = false, recoveryMs = null, rolledBack = false;
  if (!first.ok) {
    const failureSignal = monitorFailure(first);
    addEvent(store, 'Sentinel', scenario, 'FAILURE_MONITORED', `Failure monitor captured HTTP ${failureSignal.status ?? 'network/validation'} failure.`, failureSignal.status, { failureSignal });
    store.metrics.adaptationAttempts++;
    const repairStarted = performance.now();
    addEvent(store, 'Sentinel', scenario, 'SCHEMA_DRIFT_DETECTED', 'Runtime request failed; retrieving the live API schema and generating counterfactual repairs.');
    try {
      const schema = await getCurrentSchema(store);
      const differences = compareContracts({ ...ORIGINAL_TOOL, response: { path: ORIGINAL_TOOL.responsePath, fields: ORIGINAL_TOOL.expectedResponseTypes } }, schema);
      addEvent(store, 'Sentinel', scenario, 'CONTRACT_DIFFERENCES_FOUND', differences.length ? `Detected ${differences.length} contract difference(s).` : 'No structural contract differences found.', null, { differences });
      const diagnosis = diagnoseFailure({ failure: { status: first.status, reason: first.validation.reason }, differences });
      addEvent(store, 'Sentinel', scenario, 'AI_DIAGNOSIS_COMPLETED', `Likely cause: ${diagnosis.likelyCause} (${Math.round(diagnosis.confidence * 100)}% confidence).`, null, { diagnosis });
      const candidates = generateCounterfactuals(tool, schema);
      const actionPlan = createActionPlan({ diagnosis, candidates });
      addEvent(store, 'Sentinel', scenario, 'AI_ACTION_PLAN_CREATED', `Generated ${actionPlan.candidateIndexes.length} candidate repair plan(s).`, null, { actionPlan });
      const counterfactualChecks = validateCounterfactuals(tool, candidates, schema);
      const safeCandidates = candidates.filter((candidate, index) => counterfactualChecks[index]?.valid);
      if (!safeCandidates.length) throw new Error('No counterfactual passed the deterministic safety gate.');
      let decision = null;
      try { decision = await askLlmForRepair({tool:cloneTool(tool), schema, failure:first.validation, candidates:safeCandidates}); }
      catch (error) { addEvent(store, 'Sentinel', scenario, 'LLM_DECISION_UNAVAILABLE', `LLM decision unavailable; applying deterministic schema validation: ${error.message}`); }
      const index = decision ? decision.candidateIndex : 0;
      if (index < 0) throw new Error('LLM rejected all candidate repairs as unsafe.');
      const selected = safeCandidates[index];
      if (!selected) throw new Error('Repair selector returned a candidate outside the validated candidate set.');
      const candidateTool = cloneTool(selected.tool);
      const blast = analyzeBlastRadius({toolId:'active-tool',before:tool,after:candidateTool, registry:store.registry});
      addEvent(store, 'Sentinel', scenario, 'BLAST_RADIUS_ASSESSED', `Repair impact: ${blast.risk}; ${blast.impactedCount} dependent tool(s) identified.`, null, {blastRadius:blast});
      addEvent(store, 'Sentinel', scenario, 'COUNTERFACTUALS_VALIDATED', `${safeCandidates.length} repair candidate(s) passed safety validation.`, null, { counterfactualChecks });
      if (blast.risk === 'elevated') throw new Error('Repair requires approval because dependent tools may be affected.');

      const activeRegistry = {tool:cloneTool(tool)};
      const patch = applyVersionedPatch(activeRegistry, candidateTool);
      adapted = true;
      addEvent(store, 'Sentinel', scenario, 'TOOL_DEFINITION_PATCHED', `Prepared versioned candidate patch: ${selected.rationale}`, null, {changes:selected.changes, llmDecision:decision, blastRadius:blast});
      addEvent(store, 'Sentinel', scenario, 'RETRY_STARTED', 'Revalidation engine is executing a bounded retry; registry transaction remains reversible.');
      attempts++;
      const validationOutcome = await revalidateWithRollback({
        tool,
        candidate: candidateTool,
        request: activeTool => requestWithTool(activeTool, scenario, store, 'Sentinel'),
        onRollback: async failedResult => addEvent(store, 'Sentinel', scenario, 'REVALIDATION_FAILED', `Candidate did not pass revalidation: ${failedResult.validation.reason}` , failedResult.status)
      });
      result = validationOutcome.result;
      if (validationOutcome.committed) {
        patch.transaction.commit();
        store.metrics.adaptationSuccesses++;
        recoveryMs = performance.now() - repairStarted;
        addEvent(store, 'Sentinel', scenario, 'RECOVERY_SUCCESS', `Revalidation passed; recovered in ${Math.round(recoveryMs)} ms.`, result.status);
      } else {
        patch.transaction.rollback();
        rolledBack = true;
        store.metrics.rollbacks++;
        addEvent(store, 'Sentinel', scenario, 'ROLLBACK_COMPLETED', `Candidate failed validation (${result.validation.reason}); previous tool definition restored.`, result.status);
        addEvent(store, 'Sentinel', scenario, 'RECOVERY_FAILED', `Retry failed and the candidate was rolled back: ${result.validation.reason}`, result.status);
      }
      for (const change of selected.changes) store.patches.unshift({timestamp:now(),scenario,detectedChange:change.kind,oldDefinition:change.from,newDefinition:change.to,reason:change.rationale,retrySucceeded:result.ok,rolledBack});
    } catch (error) {
      result = {...first,validation:{ok:false,reason:error.message}};
      addEvent(store, 'Sentinel', scenario, 'RECOVERY_FAILED', error.message);
    }
  }
  if (result.ok && adapted) { const latest = store.openApiRegistry.latest(); if (latest) store.openApiRegistry.markKnownGood(latest.version); store.toolRegistry?.patch('get_order_status', tool, `Validated repair for ${scenario}`); }
  const run = {id:`${Date.now()}-sentinel`,agent:'Sentinel',scenario,success:result.ok,status:result.status,requests:attempts,elapsedMs:performance.now()-started,adapted,rolledBack,validation:result.validation,response:result.ok?result.validation.value:result.body,error:result.ok?null:result.validation.reason,recoveryMs};
  store.runs.push(run); return run;
}

export function calculateMetrics(store) {
  const sentinel = store.runs.filter(r => r.agent === 'Sentinel');
  const baseline = store.runs.filter(r => r.agent === 'Baseline');
  const recovered = sentinel.filter(r => r.adapted);
  const successfulRecoveryTimes = recovered.filter(r => r.success && Number.isFinite(r.recoveryMs)).map(r => r.recoveryMs);
  const baselineRequests = baseline.reduce((sum, r) => sum + r.requests, 0);
  const sentinelRequests = sentinel.reduce((sum, r) => sum + r.requests, 0);
  const engineMetrics = generateMetrics(store.runs, store.metrics);
  return {
    ...engineMetrics,
    adaptationRate: store.metrics.adaptationAttempts ? store.metrics.adaptationSuccesses / store.metrics.adaptationAttempts * 100 : null,
    mttrMs: successfulRecoveryTimes.length ? successfulRecoveryTimes.reduce((a,b) => a+b, 0) / successfulRecoveryTimes.length : null,
    baselineSuccessRate: baseline.length ? baseline.filter(r => r.success).length / baseline.length * 100 : null,
    requestOverhead: baseline.length || sentinel.length ? sentinelRequests - baselineRequests : null,
    counts: { baselineRuns: baseline.length, sentinelRuns: sentinel.length, adaptationAttempts: store.metrics.adaptationAttempts, successfulRecoveries: store.metrics.adaptationSuccesses, rollbacks: store.metrics.rollbacks, baselineRequests, sentinelRequests },
    openApiVersions: store.openApiRegistry.list(), toolRegistry: store.toolRegistry?.snapshot('get_order_status')
  };
}
