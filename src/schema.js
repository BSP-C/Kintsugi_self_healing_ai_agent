export const SCENARIOS = {
  baseline: { id: 'baseline', label: 'Original schema', description: 'No schema drift is active.' },
  parameter_rename: { id: 'parameter_rename', label: 'Parameter rename', description: 'order_id is renamed to id.' },
  response_type: { id: 'response_type', label: 'Response type change', description: 'quantity changes from number to string.' },
  authentication: { id: 'authentication', label: 'Authentication required', description: 'A synthetic Bearer token is required.' },
  nested_response: { id: 'nested_response', label: 'Nested response', description: 'Order fields are wrapped in data.' },
  required_parameter: { id: 'required_parameter', label: 'New required parameter', description: 'A source query parameter becomes mandatory.' }
};

export const ORIGINAL_TOOL = Object.freeze({
  endpoint: '/api/orders',
  method: 'GET',
  queryParameters: ['order_id'],
  requiredParameters: ['order_id'],
  authentication: { required: false, scheme: null, token: null },
  expectedResponseTypes: { order_id: 'string', status: 'string', quantity: 'number' },
  responsePath: []
});

export function cloneTool(tool) { return JSON.parse(JSON.stringify(tool)); }

export function schemaForScenario(scenario) {
  const base = {
    endpoint: '/api/orders',
    method: 'GET',
    queryParameters: ['order_id'],
    requiredParameters: ['order_id'],
    authentication: { required: false, scheme: null },
    response: { path: [], fields: { order_id: 'string', status: 'string', quantity: 'number' } },
    scenario
  };
  switch (scenario) {
    case 'parameter_rename':
      base.queryParameters = ['id']; base.requiredParameters = ['id']; break;
    case 'response_type':
      base.response.fields.quantity = 'string'; break;
    case 'authentication':
      base.authentication = { required: true, scheme: 'Bearer', tokenAvailable: true }; break;
    case 'nested_response':
      base.response.path = ['data']; break;
    case 'required_parameter':
      base.queryParameters = ['order_id', 'source'];
      base.requiredParameters = ['order_id', 'source'];
      base.queryParameterDefaults = { source: 'dashboard-demo' }; break;
    default: break;
  }
  return base;
}
