import test from 'node:test';
import assert from 'node:assert/strict';
import { translateNaturalLanguage } from '../src/engines/natural-language-http-executor.js';
import { createOpenApiSpecificationRegistry, toOpenApiDocument } from '../src/engines/openapi-specification-registry.js';
import { compareContracts } from '../src/engines/contract-difference-engine.js';
import { diagnoseFailure } from '../src/engines/ai-diagnosis-engine.js';
import { validateCounterfactuals } from '../src/engines/counterfactual-validation-engine.js';
import { ORIGINAL_TOOL, schemaForScenario } from '../src/schema.js';

test('natural language parser translates supported order-status requests', () => {
  assert.deepEqual(translateNaturalLanguage('check order 123').parameters, { orderId: '123' });
  assert.throws(() => translateNaturalLanguage('delete every order'), /currently understand/);
});
test('OpenAPI registry versions distinct specifications and preserves known-good', () => {
  const registry = createOpenApiSpecificationRegistry();
  const first = registry.record(toOpenApiDocument(schemaForScenario('baseline')));
  const second = registry.record(toOpenApiDocument(schemaForScenario('parameter_rename')));
  assert.equal(first.version, 1);
  assert.equal(second.version, 2);
  assert.equal(registry.knownGood().version, 1);
});
test('contract difference and diagnosis engines identify request parameter drift', () => {
  const schema = schemaForScenario('parameter_rename');
  const diffs = compareContracts({ ...ORIGINAL_TOOL, response: { path: [], fields: ORIGINAL_TOOL.expectedResponseTypes } }, schema);
  assert.ok(diffs.some(item => item.kind === 'query_parameters'));
  assert.equal(diagnoseFailure({ failure: { status: 400, reason: 'Missing required query parameter: id' }, differences: diffs }).likelyCause, 'request_parameter_contract_drift');
});
test('counterfactual safety gate rejects endpoint changes', () => {
  const schema = schemaForScenario('baseline');
  const checks = validateCounterfactuals(ORIGINAL_TOOL, [{ tool: { ...ORIGINAL_TOOL, endpoint: 'https://evil.example' } }], schema);
  assert.equal(checks[0].valid, false);
});
