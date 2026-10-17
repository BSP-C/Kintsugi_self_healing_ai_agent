const $ = (id) => document.getElementById(id);
const names = {
  baseline: ['Original schema','No schema drift is active.'],
  parameter_rename: ['Parameter rename','The API now expects id instead of order_id.'],
  response_type: ['Response type change','The quantity field is now returned as a string.'],
  authentication: ['Authentication required','The API now requires a synthetic local Bearer token.'],
  nested_response: ['Nested response','Order fields are now wrapped under data.'],
  required_parameter: ['New required parameter','The API now requires source=dashboard-demo.']
};
let active = 'baseline', busy = false;
const originalTool = { endpoint:'/api/orders', method:'GET', queryParameters:['order_id'], requiredParameters:['order_id'], authentication:{required:false,scheme:null,token:null}, expectedResponseTypes:{order_id:'string',status:'string',quantity:'number'}, responsePath:[] };
function pretty(value){return JSON.stringify(value,null,2)}
async function api(url, options={}) {
  const response = await fetch(url,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const data = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function setBusy(value){
  busy=value;
  document.querySelectorAll('button').forEach(b=>b.disabled=value && !['refreshBtn'].includes(b.id));
  $('runStatus').textContent=value?'Agent run in progress…':'Ready to run';
}
function setScenarioUI(id){
  active=id; $('activeScenario').textContent=names[id]?.[0]||id; $('scenarioDescription').textContent=names[id]?.[1]||'';
  document.querySelectorAll('.scenario-card').forEach(c=>c.classList.toggle('active',c.dataset.scenario===id));
}
async function chooseScenario(id){
  if(busy)return;
  try{await api(`/api/scenario/${id}`,{method:'POST'});setScenarioUI(id);await refreshAll();}
  catch(e){$('runStatus').textContent=e.message;}
}
function timeLabel(timestamp){return new Date(timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function badgeClass(type){
  if(['RECOVERY_SUCCESS','RESPONSE_VALIDATED'].includes(type))return 'success';
  if(['API_ERROR_DETECTED','RECOVERY_FAILED'].includes(type))return 'failure';
  if(['SCHEMA_DRIFT_DETECTED','DIAGNOSIS_COMPLETE','TOOL_DEFINITION_PATCHED','RETRY_STARTED'].includes(type))return 'warning';
  return '';
}
function renderEvents(events){
  $('eventCount').textContent=`${events.length} event${events.length===1?'':'s'}`;
  const el=$('eventList');
  if(!events.length){el.className='event-list empty';el.innerHTML='<div class="empty-icon">⌁</div><strong>Waiting for an agent run</strong><p>Requests, diagnoses, patches, and validations will appear here.</p>';return;}
  el.className='event-list';el.innerHTML=events.slice(0,100).map(e=>`<div class="event"><div class="event-time">${timeLabel(e.timestamp)}</div><div><div class="event-title"><span class="event-badge ${badgeClass(e.type)}">${escapeHtml(e.type)}</span><span class="event-agent">${escapeHtml(e.agent)}</span>${e.status?`<span class="event-badge">${e.status}</span>`:''}</div><p class="event-desc">${escapeHtml(e.message)} <span class="muted">· ${escapeHtml(e.scenario)}</span></p></div></div>`).join('');
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderPatches(patches){
  $('patchCount').textContent=`${patches.length} patch${patches.length===1?'':'es'}`;
  const el=$('patchList');
  if(!patches.length){el.className='patch-list empty-mini';el.textContent='No patches yet. Trigger a schema drift and run Sentinel.';return;}
  el.className='patch-list';el.innerHTML=patches.slice(0,30).map(p=>`<div class="patch"><strong>${escapeHtml(p.detectedChange)}</strong><p>${escapeHtml(p.reason)}</p><div class="patch-values"><span class="old-value">${escapeHtml(shortValue(p.oldDefinition))}</span><span>→</span><span class="new-value">${escapeHtml(shortValue(p.newDefinition))}</span><span class="muted">${timeLabel(p.timestamp)} · retry ${p.retrySucceeded===null?'pending':p.retrySucceeded?'succeeded':'failed'}</span></div></div>`).join('');
}
function shortValue(v){let s=typeof v==='string'?v:JSON.stringify(v);return s.length>72?s.slice(0,69)+'…':s;}
function renderMetrics(m){
  $('adaptationMetric').textContent=m.adaptationRate===null?'—':`${m.adaptationRate.toFixed(0)}%`;
  $('mttrMetric').textContent=m.mttrMs===null?'—':`${Math.round(m.mttrMs)} ms`;
  $('baselineMetric').textContent=m.baselineSuccessRate===null?'—':`${m.baselineSuccessRate.toFixed(0)}%`;
  $('overheadMetric').textContent=m.requestOverhead===null?'—':`${m.requestOverhead>=0?'+':''}${m.requestOverhead}`;
}
function renderRun(run, prefix){
  if(!run)return;
  const state=$(prefix+'State');state.textContent=run.success?'SUCCESS':'FAILED';state.className='state-tag '+(run.success?'state-ok':'state-fail');
  $(prefix+'Requests').textContent=run.requests;
  $(prefix+'Elapsed').textContent=`${Math.round(run.elapsedMs)} ms`;
  $(prefix+'Validation').textContent=run.success?'PASS':'FAIL';
  $(prefix+'Error').textContent=run.success?'':run.error||'Request failed';
  if(prefix==='sentinel')$('sentinelAdapted').textContent=run.adapted?'Yes':'No';
}
async function refreshAll(){
  const [events,patches,metrics,runs,schema,registry]=await Promise.all([
    api('/api/events'),api('/api/patches'),api('/api/metrics'),api('/api/runs'),api('/api/schema'),api('/api/registry/sentinel')
  ]);
  renderEvents(events);renderPatches(patches);renderMetrics(metrics);
  const latest=(agent)=>[...runs].reverse().find(r=>r.agent===agent);
  renderRun(latest('Baseline'),'baseline');renderRun(latest('Sentinel'),'sentinel');
  $('registryJson').textContent=pretty({active:registry.active,history:registry.toolHistory?.history,openApiVersions:registry.openApiVersions?.map(v=>({version:v.version,label:v.label,knownGood:v.knownGood,recordedAt:v.recordedAt}))});
  const health=await api('/api/health').catch(()=>null);
  $('healthText').textContent=health?.ok?'Dashboard + Mock API online':'Service connection issue';
}
async function run(url){
  if(busy)return;setBusy(true);
  try{
    const result=await api(url,{method:'POST',body:'{}'});
    if(url==='/api/run/all'){
      $('runStatus').textContent=`Completed ${result.length} scenarios`;
      setScenarioUI('baseline');
    } else $('runStatus').textContent='Run completed';
    await refreshAll();
  }catch(e){$('runStatus').textContent=`Run error: ${e.message}`;}
  finally{setBusy(false);}
}
document.querySelectorAll('[data-scenario]').forEach(b=>b.addEventListener('click',()=>chooseScenario(b.dataset.scenario)));
$('resetBtn').addEventListener('click',async()=>{if(busy)return;await api('/api/reset',{method:'POST'});setScenarioUI('baseline');await refreshAll();});
$('runBaselineBtn').addEventListener('click',()=>run('/api/run/baseline'));
$('runSentinelBtn').addEventListener('click',()=>run('/api/run/sentinel'));
$('runBothBtn').addEventListener('click',()=>run('/api/run/both'));
$('runAllBtn').addEventListener('click',()=>run('/api/run/all'));
$('refreshBtn').addEventListener('click',()=>refreshAll().catch(e=>$('runStatus').textContent=e.message));
$('naturalLanguageForm').addEventListener('submit',async event=>{event.preventDefault();const output=$('naturalLanguageResult');output.textContent='Translating request and calling the active API…';try{const result=await api('/api/execute-natural-language',{method:'POST',body:JSON.stringify({input:$('naturalLanguageInput').value})});output.textContent=pretty(result);}catch(error){output.textContent=pretty({ok:false,error:error.message});}});
(async()=>{try{const s=await api('/api/scenario');setScenarioUI(s.activeScenario);await refreshAll();}catch(e){$('healthText').textContent='Unable to connect';$('runStatus').textContent=e.message;}})();
