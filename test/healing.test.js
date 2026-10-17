import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createMockApi } from '../src/mock-api.js';
import { ORIGINAL_TOOL, cloneTool, schemaForScenario } from '../src/schema.js';
import { createRunStore, runBaseline, runSentinel, calculateMetrics, validateForTest } from '../src/healing.js';

const mock = createMockApi();
const server = mock.app.listen(3001);
after(() => server.close());

test('all five schema mutations are reflected in live API specification', async () => {
  for (const scenario of ['parameter_rename','response_type','authentication','nested_response','required_parameter']) {
    mock.setScenario(scenario);
    const spec = await (await fetch('http://127.0.0.1:3001/api/schema')).json();
    assert.equal(spec.scenario, scenario);
  }
});
test('baseline fails and Sentinel recovers from each supported schema drift', async () => {
  for (const scenario of ['parameter_rename','response_type','authentication','nested_response','required_parameter']) {
    mock.setScenario(scenario);
    const store = createRunStore();
    const baseline = await runBaseline(scenario, store);
    assert.equal(baseline.success, false, `baseline should fail for ${scenario}`);
    const sentinel = await runSentinel(scenario, store);
    assert.equal(sentinel.success, true, `Sentinel should recover for ${scenario}: ${sentinel.error}`);
    assert.equal(sentinel.adapted, true);
    assert.equal(sentinel.validation.ok, true);
    assert.equal(sentinel.requests, 2);
  }
});
test('quantity type change is detected by response validator', () => {
  const tool = cloneTool(ORIGINAL_TOOL);
  assert.equal(validateForTest({order_id:'123',status:'shipped',quantity:'3'},tool).ok,false);
});
test('nested response requires correct response path', () => {
  const tool = cloneTool(ORIGINAL_TOOL);
  const body = {data:{order_id:'123',status:'shipped',quantity:3}};
  assert.equal(validateForTest(body,tool).ok,false);
  tool.responsePath=['data'];
  assert.equal(validateForTest(body,tool).ok,true);
});
test('authentication is enforced and missing required params fail', async () => {
  mock.setScenario('authentication');
  let r = await fetch('http://127.0.0.1:3001/api/orders?order_id=123');
  assert.equal(r.status,401);
  mock.setScenario('required_parameter');
  r = await fetch('http://127.0.0.1:3001/api/orders?order_id=123');
  assert.equal(r.status,400);
});
test('reset restores original API behavior', async () => {
  mock.setScenario('nested_response'); mock.reset();
  const spec = await (await fetch('http://127.0.0.1:3001/api/schema')).json();
  assert.equal(spec.scenario,'baseline');
  const response = await fetch('http://127.0.0.1:3001/api/orders?order_id=123');
  assert.equal(response.status,200);
  assert.equal((await response.json()).quantity,3);
});
test('metrics are computed from recorded run data', async () => {
  mock.setScenario('parameter_rename');
  const store = createRunStore();
  await runBaseline('parameter_rename',store);
  await runSentinel('parameter_rename',store);
  const metrics = calculateMetrics(store);
  assert.equal(metrics.adaptationRate,100);
  assert.equal(metrics.baselineSuccessRate,0);
  assert.equal(metrics.requestOverhead,1);
  assert.equal(metrics.counts.baselineRuns,1);
  assert.equal(metrics.counts.sentinelRuns,1);
});

test('Sentinel records contract analysis and OpenAPI registry stages', async () => {
  mock.setScenario('parameter_rename');
  const store = createRunStore();
  const run = await runSentinel('parameter_rename', store);
  assert.equal(run.success, true);
  assert.ok(store.openApiRegistry.list().length >= 1);
  const types = new Set(store.events.map(event => event.type));
  assert.ok(types.has('OPENAPI_SPEC_REGISTERED'));
  assert.ok(types.has('CONTRACT_DIFFERENCES_FOUND'));
  assert.ok(types.has('AI_DIAGNOSIS_COMPLETED'));
  assert.ok(types.has('AI_ACTION_PLAN_CREATED'));
  assert.ok(types.has('COUNTERFACTUALS_VALIDATED'));
});

test('OpenAPI registry document uses OpenAPI 3.1 and describes the active query parameters', async () => {
  mock.setScenario('parameter_rename');
  const response = await fetch('http://127.0.0.1:3001/openapi.json');
  const spec = await response.json();
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(spec.paths['/api/orders'].get.parameters[0].name, 'id');
});
