# Computer-Use Automation System

Take-home project implementing a **record-once / replay-many computer-use automation architecture**.

The system uses an LLM during discovery to navigate a live application and identify a workflow. The resulting discovery trace can be compiled into a structured capability artifact. Subsequent execution uses deterministic artifact replay rather than asking the LLM to rediscover the workflow.

The demo application is **LegacyCore**, a simulated member-servicing application used to demonstrate opening a savings sub-account.

## Architecture

The primary execution flow is:

```text
Goal
  ↓
LLM Discovery
  ↓
Discovery Trace
  ↓
Artifact Compiler
  ↓
Capability Artifact
  ↓
Deterministic Replay
```

Major components:

- `DiscoveryAgent` — observes the live application and requests one next action from a discovery model.
- `GeminiDiscoveryModel` — genuine LLM-backed discovery provider using Google Gemini.
- `PlaywrightSurface` — live browser computer surface implemented with Playwright.
- `compileDiscoveryArtifact` — converts a successful discovery trace into a reusable capability artifact.
- Replay engine — executes capability artifacts deterministically.
- Approval/checkpoint handling — prevents irreversible actions from executing without explicit approval.
- Evidence capture — stores discovery and runtime evidence for inspection.

## Requirements

- Node.js 22+
- npm
- Playwright
- A Gemini API key for genuine LLM discovery

Install dependencies:

```bash
npm install
```

If Playwright's browser is not already installed:

```bash
npx playwright install chromium
```

## Configuration

Genuine LLM discovery uses the environment variable:

```text
GEMINI_API_KEY
```

Do **not** commit API keys to the repository.

### PowerShell

For the current terminal session:

```powershell
$env:GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
```

The repository `.gitignore` excludes `.env` files, dependencies, build output, logs, and other local files that should not be committed.

## LegacyCore demo application

Start the demo application:

```bash
npm run start:legacy
```

LegacyCore is available at:

```text
http://localhost:4173
```

Keep this process running while executing browser-based discovery or replay tests.

### Demo members

| Member | Scenario |
|---|---|
| `12345` | Happy path |
| `20002` | Restricted-account business outcome |
| `30003` | Permission-denied / human-intervention scenario |
| `99999` | Member-not-found business outcome |

## Validation

Run the TypeScript type checker:

```bash
npm run typecheck
```

Build the project:

```bash
npm run build
```

## Genuine LLM Discovery Demo

The repository contains a genuine Google Gemini discovery path.

First start LegacyCore in one terminal:

```bash
npm run start:legacy
```

Set `GEMINI_API_KEY` in the terminal that will run discovery.

Then run:

```bash
npm run test:discovery-gemini
```

The discovery agent operates against the live LegacyCore browser surface.

In the successful evidence run, Gemini discovered the account-opening workflow and identified `CONFIRM OPEN` as the irreversible boundary without executing that irreversible action.

Discovery evidence is written under:

```text
evidence/discovery/
```

The successful genuine LLM discovery evidence is:

```text
evidence/discovery/open-savings-gemini-discovery.json
```

The saved successful run records:

```text
provider: google-gemini
model: gemini-3.6-flash
genuineLlmDiscovery: true
result: success
```

## Deterministic Replay Demo

Once a capability has been discovered and represented as an artifact, replay does not require the LLM to decide each next action.

With LegacyCore running, execute:

```bash
npm run test:replay
```

Replay executes the predefined artifact steps through the computer surface using invocation parameters and semantic target resolution.

The replay path demonstrates the record-once / replay-many design: the probabilistic model is used for discovery, while execution of the resulting capability is deterministic.

## Approval and Resume

The account-opening workflow contains an irreversible action:

```text
CONFIRM OPEN
```

The runtime does not execute this step automatically without approval.

Approval behavior can be exercised with:

```bash
npm run test:approval
```

Resume behavior can be exercised with:

```bash
npm run test:resume
```

Checkpoints are associated with the browser session that created them. Cross-session checkpoint reuse is rejected rather than silently continuing execution in an unrelated session.

## Business Outcomes

The runtime distinguishes technical automation failures from expected business outcomes.

Examples exercised by the LegacyCore demo include:

- member not found;
- account restricted;
- permission/human-intervention scenarios.

This allows callers to distinguish an expected application decision from a failure of the automation infrastructure.

## Artifact Compilation

Discovery traces can be compiled into reusable capability artifacts.

Run:

```bash
npm run test:artifact-compiler
```

The compiler generalizes configured concrete discovery values into invocation parameters such as:

```text
{{memberId}}
{{product}}
{{openingDeposit}}
```

This prevents the replay artifact from being tied to the exact member or values used during discovery.

## Safety

The prototype includes several safety mechanisms:

- explicit irreversible-action classification;
- approval gates;
- checkpoint/resume;
- session-bound checkpoints;
- semantic target resolution instead of screen coordinates;
- postcondition validation;
- structured business outcomes;
- deterministic replay after discovery;
- evidence capture;
- API keys kept outside source control.

The genuine Gemini discovery run is intentionally stopped at the irreversible `CONFIRM OPEN` boundary.

## Evidence

Evidence generated during development and validation is stored under:

```text
evidence/
```

This includes genuine LLM discovery evidence and runtime screenshots/DOM evidence captured from live Playwright sessions.

The key genuine-discovery artifact for the final implementation is:

```text
evidence/discovery/open-savings-gemini-discovery.json
```

## Project Structure

```text
apps/               Demo applications
artifacts/          Capability artifacts
audit/              Audit-related implementation/data
evidence/           Saved discovery and runtime evidence
src/
  artifact/         Artifact schema and related logic
  discovery/        Discovery agent, providers, compiler
  surface/          ComputerSurface abstraction
    playwright/     Playwright implementation
tests/              Validation and demonstration tests
types/              Project type declarations
REPORT.md           Architecture/design report
README.md           Setup and demo instructions
```

## Design Summary

The central design decision is to separate **probabilistic discovery** from **deterministic execution**.

The LLM is useful when the workflow is initially unknown: it observes the application and discovers what actions are required.

After discovery, the workflow is represented as a constrained capability artifact containing inputs, steps, semantic targets, outputs, success conditions, and safety metadata.

Replay therefore does not depend on an LLM repeatedly deciding what to do. This improves repeatability, auditability, error handling, and control over irreversible actions.

See [`REPORT.md`](REPORT.md) for the detailed architecture and design discussion.