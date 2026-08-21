# Technical Report

## Architecture

The system is structured around a separation between discovery, artifact compilation, deterministic replay, and the computer interaction surface.

The computer interaction layer is represented by a `ComputerSurface` abstraction. The concrete implementation used for the prototype is `PlaywrightSurface`, which operates a live browser application using Playwright. The surface exposes observation, target resolution, actions, evidence capture, and session identity rather than exposing raw browser automation directly to the higher-level components.

Discovery is handled by `DiscoveryAgent`. The agent observes the current live application state and asks a `DiscoveryModel` for one next action at a time. The discovery model therefore acts as a planner rather than directly controlling Playwright.

Two discovery providers were used during development: a scripted provider for deterministic testing and a genuine LLM provider backed by Google Gemini. The final evidence includes a successful genuine Gemini discovery run against the live LegacyCore application.

The successful Gemini run used `gemini-3.6-flash`, completed discovery in six steps, and identified `CONFIRM OPEN` as the irreversible boundary without executing that action.

After discovery, `compileDiscoveryArtifact` converts a successful discovery trace into a reusable capability artifact. Concrete values can be generalized into artifact parameters so that replay is not tied to the exact values used during discovery.

Replay is deterministic. The replay engine consumes the artifact and invocation inputs and executes the artifact steps through the computer surface without consulting the discovery LLM.

This produces the core architecture:

`Goal -> LLM Discovery -> Discovery Trace -> Artifact Compiler -> Capability Artifact -> Deterministic Replay`

The LLM is therefore used to discover how to perform a task, while subsequent execution uses a constrained artifact rather than repeatedly asking a model what to do.

## Artifact schema

Capability artifacts are validated using a schema before execution.

An artifact contains identity and compatibility information, an input/output contract, executable steps, business outcomes, output extraction rules, and a success checkpoint.

Targets use semantic strategies rather than fixed screen coordinates. Supported strategies include role, label, visible text, attributes, and near-text relationships. A target may contain multiple strategies so that execution can attempt stable alternatives.

Actions include operations such as `fill`, `click`, `select`, and assertions. Inputs discovered with concrete values can be parameterized during compilation. For example, the member number used during discovery can become `{{memberId}}`, allowing the same artifact to be replayed with another invocation.

The example account-opening artifact defines inputs including `memberId`, `product`, and `openingDeposit`, and produces a `confirmationId` output.

The schema also represents risk. The final `CONFIRM OPEN` interaction is classified as irreversible, which allows the runtime to stop and require explicit approval before performing it.

This makes the artifact more than a recorded browser script: it contains an execution contract, semantic targets, safety metadata, expected outcomes, and success conditions.

## Determinism & error handling

The replay path is intentionally deterministic.

Once a capability artifact has been produced, replay does not ask the LLM to choose subsequent actions. It executes the artifact's predefined steps using invocation inputs and the target-resolution rules implemented by the surface.

This separates probabilistic discovery from repeatable execution.

Target resolution is explicit. Strategies are evaluated against the current live surface, and failures such as missing or ambiguous targets are returned as structured errors instead of silently continuing.

The implementation also handles UI representation differences at the surface boundary. For example, a select element can be replayed using its underlying HTML option value, while discovery may identify the human-readable option label. `PlaywrightSurface` supports both without hard-coding a particular product choice.

The runtime also checks postconditions. A step is not considered valid merely because an interaction was attempted; expected conditions must be satisfied. Errors such as `POSTCONDITION_FAILED`, target-resolution failures, and business outcomes are surfaced explicitly.

Session identity is preserved in checkpoints. Resume attempts using a checkpoint created by another session are rejected, preventing unsafe cross-session continuation.

Evidence is captured so failed and successful runs can be inspected rather than relying only on terminal output.

## Heterogeneity & multi-tenant

The architecture separates application-specific interaction details from the execution engine.

`ComputerSurface` defines the interface used by discovery and replay. `PlaywrightSurface` is one implementation, but the higher-level discovery and replay components do not need to depend directly on Playwright.

This creates a path for heterogeneous surfaces. A future implementation could provide another `ComputerSurface` for a desktop application, remote computer-use environment, or other interaction technology while retaining the artifact and replay abstractions.

Artifacts also include compatibility metadata such as application, surface, and vendor. This prevents treating every artifact as universally applicable.

Multi-tenant isolation is supported conceptually through explicit session identity, artifact compatibility, invocation parameters, and checkpoint/session validation. Runtime state is associated with a particular surface session instead of being globally reusable.

A production implementation would extend this with tenant-scoped artifact storage, authorization, encrypted evidence storage, and policy controls. Those production infrastructure concerns are outside the scope of this prototype.

## Escalation & handoff

The runtime supports human-in-the-loop execution at irreversible boundaries.

Discovery is allowed to identify that `CONFIRM OPEN` is the next required action, but the discovery harness stops before actually executing it. This allows the system to learn where the irreversible boundary exists without causing the side effect during discovery.

During replay, irreversible steps require explicit approval. The runtime can checkpoint execution before the protected action and later resume after approval.

Resume is tied to the same session. A checkpoint cannot simply be moved to another browser session and executed there. The checkpoint-session safety test verifies that a cross-session resume is rejected.

This provides a concrete handoff model:

`automated execution -> irreversible boundary -> checkpoint -> human approval -> controlled resume`

If the runtime cannot resolve a target, encounters an unexpected state, or fails a postcondition, it returns a structured failure instead of guessing its way through the workflow. This creates a natural escalation point for human review or rediscovery.

## Safety

Safety is enforced at multiple layers rather than being left entirely to the LLM.

First, irreversible actions are represented explicitly in artifact metadata. The account-opening confirmation is marked as irreversible and is protected by an approval gate.

Second, discovery itself does not execute the final `CONFIRM OPEN` action. The genuine Gemini discovery run successfully identified this boundary while leaving the irreversible action unexecuted.

Third, checkpoints are bound to sessions. This prevents a previously approved or partially completed workflow from being resumed in an unrelated execution context.

Fourth, deterministic replay reduces the authority of the LLM after discovery. The model is not continuously making unconstrained decisions during production-style execution.

Fifth, success checkpoints and postconditions verify observable application state. Execution therefore distinguishes between an action being attempted and the intended outcome actually being achieved.

Finally, credentials are kept outside source control. The Gemini API key is supplied through environment configuration and `.gitignore` excludes `.env` files, dependencies, build output, and other local material that should not be committed.

Together these mechanisms implement defense in depth: constrained discovery, semantic targeting, schema validation, deterministic replay, explicit risk classification, approval gates, session-safe resume, postconditions, and evidence capture.

## Cuts

This prototype deliberately prioritizes the core architecture and safety model over production completeness.

The implementation uses Playwright as the primary live computer surface rather than supporting multiple real surface backends.

Discovery is demonstrated against the LegacyCore workflow rather than a broad library of applications. The successful genuine Gemini run demonstrates the intended LLM-driven discovery architecture, while scripted discovery remains useful for deterministic tests.

Artifact compilation uses explicit parameter bindings rather than attempting fully automatic semantic generalization of every discovered value.

The current target model is intentionally small. A production system would likely require richer accessibility-tree information, frame handling, dynamic lists, tables, dialogs, additional selector strategies, and stronger target scoring.

Evidence capture is implemented for screenshots and DOM snapshots, while richer tracing and centralized evidence management could be added.

The prototype also does not implement production infrastructure such as persistent artifact registries, distributed execution, tenant authentication, encrypted secret management, audit retention policies, observability dashboards, or large-scale evaluation.

These cuts were intentional. The implementation focuses on demonstrating the central thesis: an LLM can discover a workflow against a live computer surface, compile that discovery into a structured reusable capability, and then replay it deterministically with explicit safety controls around irreversible actions.