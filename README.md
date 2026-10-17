# 🛡️ Sentinel — Self-Healing AI Agent for APIs

**An intelligent API reliability system that detects failures, diagnoses contract mismatches, evaluates repair strategies, and restores API functionality with minimal manual intervention.**

## 📌 Overview

Sentinel is a self-healing API agent designed to identify and resolve API failures caused by contract changes, schema mismatches, unexpected responses, and other integration issues.

Traditional API integrations often depend on static configurations and manual debugging. When a third-party API changes its response structure or violates its expected contract, dependent applications can break until developers identify and fix the issue.

Sentinel introduces an intelligent recovery pipeline that monitors API behavior, detects discrepancies, diagnoses failures, evaluates possible corrective actions, and selects a suitable recovery strategy.

Its goal is to reduce manual intervention, minimize downtime, and make API integrations more resilient.

## 🎯 Problem Statement

Third-party APIs can become unreliable when:

- Response fields are renamed, removed, or modified.
- Expected request or response schemas change.
- API contracts no longer match the integration's assumptions.
- A dependent service breaks because an upstream API changes.
- Developers must manually investigate and patch integration failures.

Static API integrations generally cannot independently diagnose these changes, assess their impact, and safely recover from them.

**Sentinel aims to automate this recovery process through a combination of deterministic engineering and AI-assisted decision-making.**

## 💡 Proposed Solution

Sentinel implements a structured self-healing pipeline that combines API contract analysis, failure diagnosis, dependency impact assessment, candidate repair generation, safety validation, and recovery mechanisms.

### Core Engines

#### 1. Tool Registry

Maintains information about registered API tools, including their endpoints, HTTP methods, configuration, and relevant dependencies.

**Purpose:** Provides a structured source of information about the APIs Sentinel can inspect and interact with.

#### 2. API Execution Layer

Executes HTTP requests against registered APIs using the supplied request parameters.

**Purpose:** Enables Sentinel to observe actual API behavior rather than relying exclusively on predefined mock responses.

#### 3. Failure Monitoring Engine

Monitors API execution results and identifies failures, unexpected responses, and potential contract violations.

**Purpose:** Detects when an API integration requires investigation or recovery.

#### 4. OpenAPI Specification Registry

Stores or references the expected API contracts, including endpoint definitions, request parameters, and response schemas.

**Purpose:** Establishes the expected behavior against which actual API responses can be evaluated.

#### 5. Contract Difference Engine

Compares expected API contracts with observed API behavior to identify structural differences.

For example, an integration may expect a response containing `user_id`, while the API returns `id`.

**Purpose:** Converts an unexpected API response into a structured description of the mismatch.

#### 6. AI Diagnosis Engine

Uses the detected failure information and relevant API context to generate a diagnosis of the likely cause.

**Purpose:** Helps explain why an API integration failed and identifies the mismatch that a repair strategy needs to address.

#### 7. Blast Radius Analysis Engine

Analyzes dependencies between API tools and downstream consumers to estimate which components could be affected by a failure or proposed change.

**Purpose:** Helps Sentinel consider the potential impact of a repair instead of evaluating the failing endpoint in isolation.

#### 8. AI Action Plan Engine

Generates candidate corrective actions based on the diagnosis and available API context.

Possible strategies may include field mapping, response transformation, or other compatible adjustments, depending on the failure.

**Purpose:** Produces possible recovery strategies instead of immediately applying the first proposed fix.

#### 9. Counterfactual Validation Engine

Evaluates alternative repair candidates against relevant correctness and safety conditions before a recovery action is selected.

Rather than asking only, “Can this change fix the immediate error?”, Sentinel aims to evaluate, “Which proposed change resolves the failure while introducing the least risk to existing behavior?”

**Purpose:** Supports safer repair selection by comparing candidate outcomes before committing to a change.

#### 10. Instant Rollback Mechanism

Provides a recovery path for reverting a repair when the implementation supports restoration of the previous configuration or state.

**Purpose:** Limits the consequences of an unsuccessful repair and helps restore the last known working configuration.

## 🔄 System Workflow

1. **Register:** Load the API tool configuration and its expected contract.
2. **Execute:** Send an HTTP request to the target API.
3. **Monitor:** Inspect the execution result for failures or unexpected behavior.
4. **Compare:** Identify differences between the expected contract and actual response.
5. **Diagnose:** Determine the likely cause of the failure using the AI Diagnosis Engine.
6. **Assess impact:** Analyze dependencies and the potential blast radius.
7. **Generate repairs:** Produce candidate corrective actions through the AI Action Plan Engine.
8. **Validate alternatives:** Evaluate candidates using the Counterfactual Validation Engine.
9. **Recover:** Select and apply an appropriate repair when the implementation permits it.
10. **Verify and roll back:** Check the outcome and revert the change if recovery fails and rollback is available.

The exact execution order and available recovery actions depend on the implemented pipeline and its configured safeguards.

## ⭐ Key Differentiators

### 1. AI-Assisted Diagnosis and Repair Planning

Sentinel goes beyond identifying an error by using failure context to explain likely causes and propose corrective actions.

### 2. Counterfactual Repair Validation

Instead of blindly applying the first suggested fix, Sentinel evaluates alternative repair candidates against defined conditions.

This promotes more deliberate repair selection, with the aim of preserving existing API behavior while resolving the detected failure.

### 3. Blast Radius Awareness

By considering dependencies between tools and downstream consumers, Sentinel can account for the wider consequences of a proposed change.

### 4. Rollback-Oriented Recovery

Where supported by the implementation, rollback provides a way to recover from a repair that produces an unsuccessful result.

## 🏗️ High-Level Architecture

```text
                 API Request
                      |
                      v
              Tool Registry
                      |
                      v
              API Execution
                      |
                      v
             Failure Monitor
                      |
                      v
          OpenAPI Contract Registry
                      |
                      v
           Contract Difference Engine
                      |
                      v
              AI Diagnosis Engine
                      |
                      v
           Blast Radius Analysis
                      |
                      v
             AI Action Plan Engine
                      |
                      v
        Counterfactual Validation Engine
                      |
                      v
              Repair Selection
                      |
                      v
              Apply Correction
                      |
                      v
             Verify API Behavior
                      |
               +------+------+
               |             |
             Success       Failure
               |             |
               v             v
             Finish      Instant Rollback
```

*This diagram represents the conceptual pipeline; implementation-specific branches may differ.*

## 🧰 Technology Stack

The project is designed around a JavaScript backend architecture.

| Technology | Purpose |
|---|---|
| Node.js | JavaScript runtime |
| Express.js | Backend application and API routing |
| JavaScript | Engine implementation and orchestration |
| HTTP / REST | API communication |
| OpenAPI | API contract representation |
| Large Language Models (LLMs) | AI-assisted diagnosis and repair planning, where configured |
| Git and GitHub | Version control and collaboration |

Additional technologies, external services, or persistence layers should be listed here only if they are actually configured and used in the repository.

## 🧪 Example Failure Scenario

Consider an API that originally returns:

```json
{
  "user_id": "101",
  "name": "Saniya",
  "email": "saniya@example.com"
}
```

A third-party API changes its response to:

```json
{
  "id": "101",
  "name": "Saniya",
  "email": "saniya@example.com"
}
```

An integration expecting `user_id` may now fail because the identifier is returned under `id`.

Sentinel's intended recovery process is:

1. Detect the unexpected response structure.
2. Identify the field mismatch through contract comparison.
3. Diagnose the likely cause of the failure.
4. Generate possible corrective actions, such as mapping `id` to `user_id`.
5. Assess the potential impact on dependent components.
6. Evaluate candidate repairs against correctness and safety conditions.
7. Apply the selected correction when supported.
8. Verify the result and roll back if necessary.

This example illustrates a possible field-mapping recovery strategy; the actual behavior depends on the repository's implemented engines and validation rules.

## 🚀 Getting Started

### Prerequisites

- Node.js and npm
- Git
- A configured API endpoint for testing
- Any required environment variables or AI-provider credentials, if applicable

### Installation

Clone the repository:

```bash
git clone https://github.com/BSP-C/Kintsugi_self_healing_ai_agent.git
```

Navigate into the project:

```bash
cd Kintsugi_self_healing_ai_agent
```

Install dependencies:

```bash
npm install
```

### Configuration

Configure the environment variables required by the application and its enabled integrations.

If the project uses an LLM provider, supply its API key through an environment variable. Do not commit secrets or production credentials to GitHub.

### Run the Application

Use the start command defined in `package.json`.

For example, if the project defines a start script:

```bash
npm start
```

Refer to the project's actual scripts and configuration for the correct execution command.

## 📊 Evaluation Metrics

Sentinel can be evaluated using the following metrics:

- **Mean Time to Recovery (MTTR):** Average time required to restore successful API behavior after a failure.
- **Zero-Adaptation Rate:** Percentage of supported API changes handled without manual code modification, according to a clearly defined test set.
- **Repair Success Rate:** Percentage of repair attempts that successfully restore the expected behavior.
- **Regression Rate:** Frequency with which a repair introduces new failures.
- **Recovery Overhead:** Additional latency, compute, or API calls introduced by the healing process.

These metrics should be reported using measured test results rather than assumed performance figures.

## 🔒 Safety Considerations

- Validate repair candidates before applying changes.
- Restrict the actions available to the agent.
- Protect API credentials and sensitive response data.
- Evaluate downstream dependencies before changing shared behavior.
- Verify the outcome of a repair.
- Use rollback mechanisms where supported.
- Require appropriate safeguards before making changes to production systems.

AI-generated recommendations should not automatically be treated as safe or correct.

## 🔮 Future Scope

Potential extensions include:

- Live monitoring of production API integrations.
- Broader support for OpenAPI-compatible services.
- Sandboxed execution of candidate repairs.
- Automated regression testing before deployment.
- Dependency-aware repair prioritization.
- Observability dashboards and recovery histories.
- Approval workflows for high-impact changes.
- Expanded support for authentication failures, rate limits, and transient network errors.

These are potential extensions, not claims that every capability is already implemented.

## 👥 Contributors

Developed as a collaborative engineering project focused on API resilience, AI-assisted automation, and safer software recovery.

Add contributor names and GitHub profiles here.

## 📄 License

Specify the project's chosen license before distributing or reusing the code publicly.

---

**Sentinel — Detect failures. Understand causes. Evaluate repairs. Recover safely.**
