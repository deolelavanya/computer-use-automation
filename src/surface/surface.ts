import type {
  Action,
  Target,
} from "../artifact/schema.js";

/**
 * A surface observation is the automation system's view of the
 * application at a particular moment.
 *
 * Discovery may expose this representation to an LLM.
 * Replay can use it for diagnostics and evidence.
 */
export interface SurfaceObservation {
  url?: string;
  title?: string;
  visibleText: string;

  /**
   * Reference to richer evidence captured separately.
   * We deliberately avoid embedding screenshots or large DOM
   * snapshots directly into observations.
   */
  evidenceRef?: string;
}

/**
 * Result of attempting to resolve one of the artifact's target
 * strategies.
 */
export interface ResolvedTarget {
  strategyIndex: number;
  strategyType: Target["strategies"][number]["type"];

  /**
   * Surface-specific opaque identifier.
   *
   * The artifact never stores this value. It exists only for the
   * lifetime of the current surface interaction.
   */
  handle: string;
}

/**
 * Result of executing an action against the surface.
 */
export interface SurfaceActionResult {
  success: boolean;
  durationMs: number;

  resolvedTarget?: ResolvedTarget;

  error?: {
    code: string;
    message: string;
  };
}

/**
 * Reference to evidence captured during execution.
 *
 * The surface owns the mechanics of capturing it. Higher layers only
 * work with the reference.
 */
export interface EvidenceRef {
  type: "screenshot" | "dom_snapshot" | "trace";
  path: string;
}

/**
 * Opaque identifier for the live browser/desktop session.
 *
 * This becomes important later when automation pauses and a human
 * takes control of the SAME session.
 */
export interface SurfaceSession {
  id: string;
}

/**
 * Boundary between capability execution and the concrete computer
 * automation technology.
 *
 * Replay and discovery depend on this interface rather than directly
 * depending on Playwright.
 */
export interface ComputerSurface {
  /**
   * Observe the current application state.
   */
  observe(): Promise<SurfaceObservation>;

  /**
   * Wait until visible application text contains the expected value.
   *
   * Returns true if the text becomes visible before the timeout,
   * otherwise false.
   */
  waitForText(
    text: string,
    timeoutMs?: number,
  ): Promise<boolean>;

  /**
   * Extract visible text from a previously resolved target.
   *
   * This allows higher layers such as ReplayEngine to perform
   * artifact-driven output extraction without depending directly
   * on Playwright or DOM APIs.
   */
  getText(
    target: ResolvedTarget,
  ): Promise<string>;

  /**
   * Resolve an artifact target using its ordered strategies.
   *
   * Implementations must try strategies deterministically in the
   * order stored in the artifact.
   */
  resolveTarget(
    target: Target,
  ): Promise<ResolvedTarget>;

  /**
   * Execute a primitive capability action.
   */
  act(
    action: Action,
    target: ResolvedTarget,
  ): Promise<SurfaceActionResult>;

  /**
   * Capture richer diagnostic evidence.
   */
  captureEvidence(
    type: EvidenceRef["type"],
  ): Promise<EvidenceRef>;

  /**
   * Return the identity of the current live session.
   */
  getSession(): SurfaceSession;

  /**
   * Release resources owned by the surface.
   */
  close(): Promise<void>;
}