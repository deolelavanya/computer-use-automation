import type {
  ComputerSurface,
} from "../surface/surface.js";

import type {
  ControlState,
  HumanControlSession,
  InterventionRequest,
  InterventionResolution,
} from "./types.js";

export class InterventionManager {
  private state: ControlState =
    "AUTOMATION_CONTROL";

  /**
   * Request waiting for a human to take control.
   */
  private pending:
    InterventionRequest | undefined;

  /**
   * Currently active human-control session.
   */
  private active:
    HumanControlSession | undefined;

  constructor(
    private readonly surface:
      ComputerSurface,
  ) {}

  getState(): ControlState {
    return this.state;
  }

  getPendingIntervention():
    InterventionRequest | undefined {
    return this.pending;
  }

  getActiveIntervention():
    HumanControlSession | undefined {
    return this.active;
  }

  async requestIntervention(
    stepId: string,
    reason: string,
  ): Promise<InterventionRequest> {
    if (
      this.state !==
      "AUTOMATION_CONTROL"
    ) {
      throw new Error(
        `INVALID_CONTROL_STATE: cannot request intervention ` +
          `while state is ${this.state}`,
      );
    }

    const session =
      this.surface.getSession();

    let evidenceRef:
      string | undefined;

    try {
      const evidence =
        await this.surface.captureEvidence(
          "screenshot",
        );

      evidenceRef = evidence.path;
    } catch {
      evidenceRef = undefined;
    }

    const request:
      InterventionRequest = {
        sessionId: session.id,
        stepId,
        reason,
        requestedAt:
          new Date().toISOString(),
        evidenceRef,
      };

    this.pending = request;

    this.state =
      "INTERVENTION_REQUIRED";

    return request;
  }

  beginHumanControl():
    HumanControlSession {
    if (
      this.state !==
        "INTERVENTION_REQUIRED" ||
      !this.pending
    ) {
      throw new Error(
        `INVALID_CONTROL_STATE: cannot begin human control ` +
          `while state is ${this.state}`,
      );
    }

    /**
     * Verify that the browser/session has not changed between the
     * intervention request and the human taking control.
     */
    const currentSession =
      this.surface.getSession();

    if (
      currentSession.id !==
      this.pending.sessionId
    ) {
      throw new Error(
        `INTERVENTION_SESSION_MISMATCH: request belongs to ` +
          `"${this.pending.sessionId}", but current session is ` +
          `"${currentSession.id}"`,
      );
    }

    this.active = {
      sessionId:
        this.pending.sessionId,
      stepId:
        this.pending.stepId,
      reason:
        this.pending.reason,
      startedAt:
        new Date().toISOString(),
      evidenceBeforeRef:
        this.pending.evidenceRef,
    };

    this.pending = undefined;

    this.state =
      "HUMAN_CONTROL";

    return this.active;
  }

  async resumeAutomation(
    operatorNote?: string,
  ): Promise<InterventionResolution> {
    if (
      this.state !==
        "HUMAN_CONTROL" ||
      !this.active
    ) {
      throw new Error(
        `INVALID_CONTROL_STATE: cannot resume automation ` +
          `while state is ${this.state}`,
      );
    }

    /**
     * Human control must still be operating on the exact same
     * live surface session.
     */
    const currentSession =
      this.surface.getSession();

    if (
      currentSession.id !==
      this.active.sessionId
    ) {
      throw new Error(
        `INTERVENTION_SESSION_MISMATCH: human control belongs to ` +
          `"${this.active.sessionId}", but current session is ` +
          `"${currentSession.id}"`,
      );
    }

    let evidenceAfterRef:
      string | undefined;

    try {
      const evidence =
        await this.surface.captureEvidence(
          "screenshot",
        );

      evidenceAfterRef =
        evidence.path;
    } catch {
      evidenceAfterRef = undefined;
    }

    const resolution:
      InterventionResolution = {
        sessionId:
          this.active.sessionId,
        stepId:
          this.active.stepId,
        resumedAt:
          new Date().toISOString(),
        operatorNote,
        evidenceAfterRef,
      };

    this.active = undefined;

    this.state =
      "AUTOMATION_CONTROL";

    return resolution;
  }
}