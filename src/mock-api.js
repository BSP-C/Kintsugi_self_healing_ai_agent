import http from 'node:http';
import { URL } from 'node:url';
import { SCENARIOS, schemaForScenario } from './schema.js';
import { toOpenApiDocument } from './engines/openapi-specification-registry.js';
export const DEMO_TOKEN = 'demo-sentinel-token';

export function createMockApi() {
  let activeScenario = 'baseline';
  const requestLog = [];
  const handler = (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && url.pathname === '/health') return send(200, { ok: true, service: 'mock-order-api', port: 3001 });
    if (req.method === 'GET' && url.pathname === '/api/schema') return send(200, schemaForScenario(activeScenario));
    if (req.method === 'GET' && url.pathname === '/openapi.json') return send(200, toOpenApiDocument(schemaForScenario(activeScenario)));
    if (req.method === 'GET' && url.pathname === '/api/scenario') return send(200, { activeScenario, ...SCENARIOS[activeScenario] });
    if (req.method === 'GET' && url.pathname === '/api/orders') {
      const started = Date.now(), scenario = activeScenario;
      const record = { at: new Date().toISOString(), scenario, query: Object.fromEntries(url.searchParams) };
      const fail = (status, error) => { record.status = status; record.error = error; record.elapsedMs = Date.now()-started; requestLog.push(record); return send(status,{error,scenario}); };
      if (scenario === 'parameter_rename' && !url.searchParams.get('id')) return fail(400,'Missing required query parameter: id');
      if (scenario !== 'parameter_rename' && !url.searchParams.get('order_id')) return fail(400,'Missing required query parameter: order_id');
      if (scenario === 'required_parameter' && !url.searchParams.get('source')) return fail(400,'Missing required query parameter: source');
      if (scenario === 'authentication' && req.headers.authorization !== `Bearer ${DEMO_TOKEN}`) return fail(401,'Bearer authentication required');
      const id = scenario === 'parameter_rename' ? url.searchParams.get('id') : url.searchParams.get('order_id');
      const order = { order_id:String(id), status:'shipped', quantity:scenario === 'response_type' ? '3' : 3 };
      record.status=200; record.elapsedMs=Date.now()-started; requestLog.push(record);
      return send(200, scenario === 'nested_response' ? {data:order} : order);
    }
    return send(404,{error:'Not found'});
  };
  handler.listen = (...args) => http.createServer(handler).listen(...args);
  return {
    app: handler, getScenario:()=>activeScenario,
    setScenario:(scenario)=>{if(!SCENARIOS[scenario])throw new Error(`Unknown scenario: ${scenario}`);activeScenario=scenario;return schemaForScenario(scenario);},
    reset:()=>{activeScenario='baseline';}, requestLog
  };
}
export function startMockApi(port=Number(process.env.MOCK_API_PORT||3001)){
  const mock=createMockApi();
  const server=mock.app.listen(port,()=>console.log(`[mock-api] listening on http://localhost:${port}`));
  return {...mock,server,port};
}
