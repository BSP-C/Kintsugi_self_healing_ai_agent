import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startMockApi } from './mock-api.js';
import { SCENARIOS, ORIGINAL_TOOL } from './schema.js';
import { createRunStore, runBaseline, runSentinel, calculateMetrics } from './healing.js';
import { toOpenApiDocument } from './engines/openapi-specification-registry.js';
import { executeNaturalLanguageRequest } from './engines/natural-language-http-executor.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_PORT=Number(process.env.PORT||3000), MOCK_PORT=Number(process.env.MOCK_API_PORT||3001);
const mock=startMockApi(MOCK_PORT), store=createRunStore();
let busy=false;
const publicDir=path.join(__dirname,'public');
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*'});res.end(JSON.stringify(data));};
async function readBody(req){let s='';for await(const chunk of req)s+=chunk;return s?JSON.parse(s):{};}
const app=async(req,res)=>{
  const url=new URL(req.url,`http://localhost:${DASHBOARD_PORT}`);
  if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'});return res.end();}
  try {
    if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{ok:true,dashboard:DASHBOARD_PORT,mockApi:MOCK_PORT,busy});
    if(req.method==='GET'&&url.pathname==='/api/schema'){const r=await fetch(`http://127.0.0.1:${MOCK_PORT}/api/schema`);return send(res,r.status,await r.json());}
    if(req.method==='GET'&&url.pathname==='/api/openapi'){const r=await fetch(`http://127.0.0.1:${MOCK_PORT}/api/schema`);const schema=await r.json();return send(res,r.status,toOpenApiDocument(schema));}
    if(req.method==='POST'&&url.pathname==='/api/execute-natural-language'){const body=await readBody(req);const result=await executeNaturalLanguageRequest({input:body.input,tool:store.toolRegistry?.get('get_order_status') ?? ORIGINAL_TOOL,apiBase:`http://127.0.0.1:${MOCK_PORT}`,token:process.env.MOCK_API_TOKEN});return send(res,result.ok?200:502,result);}
    if(req.method==='GET'&&url.pathname==='/api/scenario')return send(res,200,{activeScenario:mock.getScenario(),scenarios:SCENARIOS,busy});
    if(req.method==='POST'&&url.pathname.startsWith('/api/scenario/')){const id=decodeURIComponent(url.pathname.split('/').at(-1));try{return send(res,200,{ok:true,activeScenario:mock.getScenario(),schema:mock.setScenario(id)});}catch(e){return send(res,400,{error:e.message});}}
    if(req.method==='POST'&&url.pathname==='/api/reset'){mock.reset();store.toolRegistry?.reset();store.events.length=0;store.patches.length=0;store.runs.length=0;store.metrics={adaptationAttempts:0,adaptationSuccesses:0,rollbacks:0};store.openApiRegistry=createRunStore().openApiRegistry;return send(res,200,{ok:true,activeScenario:mock.getScenario()});}
    const actions={
      '/api/run/baseline':async()=>runBaseline(mock.getScenario(),store),
      '/api/run/sentinel':async()=>runSentinel(mock.getScenario(),store),
      '/api/run/both':async()=>{const scenario=mock.getScenario();return {baseline:await runBaseline(scenario,store),sentinel:await runSentinel(scenario,store)};},
      '/api/run/all':async()=>{const results=[];for(const scenario of Object.keys(SCENARIOS).filter(s=>s!=='baseline')){mock.setScenario(scenario);results.push({scenario,baseline:await runBaseline(scenario,store),sentinel:await runSentinel(scenario,store)});}mock.reset();return results;}
    };
    if(req.method==='POST'&&actions[url.pathname]){
      if(busy)return send(res,409,{error:'A run is already in progress. Please wait.'});
      busy=true;try{return send(res,200,await actions[url.pathname]());}finally{busy=false;}
    }
    if(req.method==='GET'&&url.pathname==='/api/metrics')return send(res,200,calculateMetrics(store));
    if(req.method==='GET'&&url.pathname==='/api/events')return send(res,200,store.events);
    if(req.method==='GET'&&url.pathname==='/api/patches')return send(res,200,store.patches);
    if(req.method==='GET'&&url.pathname==='/api/runs')return send(res,200,store.runs);
    if(req.method==='GET'&&url.pathname==='/api/registry')return send(res,200,{baseline:ORIGINAL_TOOL,openApiVersions:store.openApiRegistry.list()});
    if(req.method==='GET'&&url.pathname==='/api/registry/sentinel')return send(res,200,{note:'Sentinel maintains a versioned active tool definition and restores the last known-good version on failed revalidation.',original:ORIGINAL_TOOL,active:store.toolRegistry?.get('get_order_status'),toolHistory:store.toolRegistry?.snapshot('get_order_status'),openApiVersions:store.openApiRegistry.list()});
    if(req.method==='GET'&&(url.pathname==='/'||!url.pathname.startsWith('/api/'))){
      const file=path.join(publicDir,url.pathname==='/'?'index.html':path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
      if(!file.startsWith(publicDir))return send(res,403,{error:'Forbidden'});
      if(fs.existsSync(file)&&fs.statSync(file).isFile()){const ext=path.extname(file);res.writeHead(200,{'content-type':({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'}[ext]||'application/octet-stream')});return fs.createReadStream(file).pipe(res);}
    }
    return send(res,404,{error:'Not found'});
  } catch(error){console.error('[dashboard-api]',error);return send(res,500,{error:error.message});}
};
const server=http.createServer((req,res)=>void app(req,res)).listen(DASHBOARD_PORT,()=>console.log(`[dashboard] http://localhost:${DASHBOARD_PORT}`));
function shutdown(){server.close();mock.server.close();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
