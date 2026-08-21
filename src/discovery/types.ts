import type {
  Target,
} from "../artifact/schema.js";

export type DiscoveryAction =
  | {
      type: "fill";
      target: Target;
      value: string;
    }
  | {
      type: "click";
      target: Target;
    }
  | {
      type: "select";
      target: Target;
      value: string;
    }
  | {
      type: "finish";
      reason: string;
    };

export interface DiscoveryDecision {
  reasoningSummary: string;
  action: DiscoveryAction;
}

export interface DiscoveryTraceStep {
  index: number;

  observation: {
    url?: string;
    title?: string;
    visibleText: string;
  };

  decision: DiscoveryDecision;

  success: boolean;

  error?: string;
}

export interface DiscoveryResult {
  kind: "success" | "failure";

  goal: string;

  steps: DiscoveryTraceStep[];

  message?: string;
}

export interface DiscoveryModel {
  decide(input: {
    goal: string;

    observation: {
      url?: string;
      title?: string;
      visibleText: string;
    };

    history: DiscoveryTraceStep[];
  }): Promise<DiscoveryDecision>;
}