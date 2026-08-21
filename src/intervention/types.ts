export type ControlState =
  | "AUTOMATION_CONTROL"
  | "INTERVENTION_REQUIRED"
  | "HUMAN_CONTROL";

export interface InterventionRequest {
  sessionId: string;
  stepId: string;
  reason: string;
  requestedAt: string;
  evidenceRef?: string;
}

export interface HumanControlSession {
  sessionId: string;
  stepId: string;
  reason: string;
  startedAt: string;
  evidenceBeforeRef?: string;
}

export interface InterventionResolution {
  sessionId: string;
  stepId: string;
  resumedAt: string;
  operatorNote?: string;
  evidenceAfterRef?: string;
}