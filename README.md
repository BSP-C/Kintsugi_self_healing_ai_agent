# Self-Healing Tool Registry

A locally runnable hackathon prototype that demonstrates **controlled recovery from runtime API schema drift**. A static baseline agent keeps using an outdated tool definition; Sentinel checks a versioned OpenAPI contract registry, compares contract changes, diagnoses failures, assesses repair impact, validates candidate repairs, applies a versioned tool patch, retries, and rolls back on failed revalidation.

> This is a deterministic, rule-based simulation. It does not call an external LLM and does not claim to repair arbitrary API changes.

## Features

- Node HTTP dashboard server on port `3000`; mock order API starts automatically on port `3001`.
- Five selectable schema-drift scenarios: parameter rename, response type change, authentication requirement, nested response, and a new required parameter.
- Twelve modular engine responsibilities, including a persistent versioned tool registry and OpenAPI 3.1 specification snapshots.
- Natural-language-to-HTTP demo endpoint and dashboard form (e.g. `check order 123`).
- Deterministic diagnosis and safety checks; optional LLM selection among prevalidated repair candidates when an OpenAI-compatible API key is configured.
- Static baseline and self-healing Sentinel with independent local tool definitions.
- Actual HTTP requests, response type/path validation, event stream, patch history, and run-based metrics.
- Responsive dashboard; run one agent, both agents, or all five scenarios.
- Node's built-in test runner.

## Architecture

```text
Browser dashboard (HTML/CSS/vanilla JS)
             │ REST /api/*
             ▼
     Node HTTP dashboard server :3000
       ├── Scenario controls + in-memory run history
       ├── Baseline agent (immutable original definition)
       ├── Sentinel orchestration
       │    ├── Failure monitor + OpenAPI specification registry
       │    ├── Contract differences + diagnosis + blast-radius assessment
       │    ├── Action plan + counterfactual safety gate
       │    └── Versioned patch + revalidation + rollback + metrics
       ├── Versioned active tool registry
       └── Mock order API server :3001
              ├── GET /api/schema and /openapi.json
              ├── GET /api/scenario
              └── GET /api/orders
```

Run history, tool versions, and OpenAPI snapshots are in memory and reset when the process restarts. The dashboard's “Run both agents” action runs each agent against the same active scenario; neither agent can modify the API schema, and the baseline definition never adapts. Sentinel only commits a candidate tool definition after the retry passes response validation.

## Supported mutations

| Scenario | Mock API behavior | Sentinel repair |
|---|---|---|
| Parameter rename | Requires `id` instead of `order_id` | Renames its query parameter |
| Response type | `quantity` is a string instead of a number | Updates expected response type |
| Authentication | Requires `Authorization: Bearer demo-sentinel-token` | Adds the local synthetic token |
| Nested response | Fields are nested under `data` | Updates response path |
| New required parameter | Requires `source` | Adds approved `source=dashboard-demo` |

For the new required parameter, the value is a fixed demo policy. **A production agent must not guess business-critical parameter values**; they need to come from an approved configuration or policy. Sentinel only accepts the endpoint, parameter names, response fields/types, nesting path, and auth scheme explicitly allowlisted in code. It does not execute instructions from API response bodies or patch arbitrary endpoints.

## Metrics

- **Adaptation rate:** successful Sentinel recoveries ÷ Sentinel runs that required adaptation.
- **MTTR:** mean time from starting diagnosis to successful retry, for successful recoveries, in milliseconds.
- **Baseline success rate:** successful baseline runs ÷ all baseline runs.
- **Request overhead:** Sentinel HTTP request attempts minus baseline HTTP request attempts. This is a request-count metric, **not LLM token overhead**.

Metrics show `—` until applicable runs have been recorded. All values are derived from in-memory run records, not sample values.

## Prerequisites and setup

1. Install Node.js 18 or later.
2. Extract this ZIP.
3. In the extracted folder, run (the project uses Node built-ins only, so installation does not download packages):

   ```bash
   npm install
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000).

The dashboard starts the mock API automatically. Do not start a second copy of the mock API on port `3001`. To change ports, set `PORT` and `MOCK_API_PORT` environment variables together; if changing the mock API port, also set `MOCK_API_URL` to the corresponding URL for the agent module.

## Tests

```bash
npm test
```

The tests use Node's built-in `node:test` runner and verify all five scenarios, baseline failures, Sentinel recoveries, response validation, authentication, required parameters, reset behavior, and metric calculations. Tests bind to port `3001`, so ensure no other process is using it.

## REST endpoints

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Dashboard and mock service status |
| `GET` | `/api/schema` | Current normalized API schema |
| `GET` | `/api/openapi` | Current OpenAPI 3.1 document |
| `POST` | `/api/execute-natural-language` | Translate a supported natural-language order request and execute its HTTP call |
| `GET` | `/api/scenario` | Active scenario and scenario list |
| `POST` | `/api/scenario/:id` | Activate a supported scenario |
| `POST` | `/api/reset` | Restore original schema |
| `POST` | `/api/run/baseline` | Run static baseline |
| `POST` | `/api/run/sentinel` | Run Sentinel |
| `POST` | `/api/run/both` | Run both against active schema |
| `POST` | `/api/run/all` | Run all five scenarios sequentially |
| `GET` | `/api/metrics` | Current calculated metrics |
| `GET` | `/api/events` | Event history |
| `GET` | `/api/patches` | Patch history |
| `GET` | `/api/runs` | Recorded agent runs |
| `GET` | `/api/registry` | Original tool definition |
| `GET` | `/api/registry/sentinel` | Registry explanation and original definition |

## Troubleshooting

- **Port already in use:** stop the process using `3000` or `3001`, or configure both service ports consistently.
- **Sentinel cannot reach the mock API:** make sure the mock server is running and `MOCK_API_URL` points to it.
- **No metric values yet:** run one of the agents. Empty values are intentional until a relevant measurement exists.
- **Browser says service connection issue:** check the terminal for startup errors and open `/api/health`.
- **Google Fonts unavailable:** the interface falls back to system fonts; fonts are decorative only.

## Security and limitations

- The Bearer token is a fake local demo token. Never put production credentials in this project.
- Recovery is rule-based and limited to known changes. Unknown parameter names, endpoint changes, unsupported auth schemes, and arbitrary nesting are rejected.
- The API specification is trusted only for diagnosis within the allowlist. A real integration would need stronger schema provenance, authorization, audit controls, secret management, and tests before applying patches.
- This prototype uses in-memory state and is not intended for production deployment.

## Runtime repair configuration

The repair engine is schema-driven: it compares the active tool definition with the live API schema and does not contain scenario-specific parameter names or response fields. The natural-language demo currently supports order-status requests such as `check order 123`; its parser is a small deterministic intent parser, not a general-purpose language model. The included mock API still has named scenarios because they are fixtures for demonstrating API drift.

For LLM-selected counterfactual repairs, configure an OpenAI-compatible chat-completions endpoint:

```bash
# Windows PowerShell
$env:OPENAI_API_KEY="your-api-key"
$env:OPENAI_MODEL="gpt-4o-mini"
# Optional for an OpenAI-compatible provider
$env:OPENAI_BASE_URL="https://api.openai.com/v1/chat/completions"
```

If `OPENAI_API_KEY` is absent or the LLM call fails, the prototype uses the first schema-derived candidate and still validates it through the real mock API retry. This keeps the demo runnable without a paid API key; it is not an LLM decision in that fallback path.

For the included local authentication fixture, `MOCK_API_TOKEN` can be configured to match the mock server's token. Do not use demo credentials in production.

## Healing capabilities and limits

- **Counterfactual repair:** builds candidate tool definitions from the live schema; when configured, an LLM chooses among candidates and reports rejected alternatives/rationale.
- **Blast-radius assessment:** compares changed tool dimensions against declared dependencies in the registry. The included demo starts with one tool, so its initial dependency blast radius is local; add registry entries with `id` and `dependsOn` metadata to assess multi-tool dependencies.
- **Transactional rollback:** the active in-memory tool definition is restored if the candidate retry fails. This does not reverse side effects already performed by an external service.
- **OpenAPI registry:** schema snapshots are emitted as OpenAPI 3.1 documents and versioned in memory; a successful repair marks its observed specification as known-good for this demo.
- **No digital twin:** no digital-twin/sandbox subsystem is included.

Run `npm test` to execute the project's automated tests.
