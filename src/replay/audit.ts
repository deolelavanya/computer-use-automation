import { mkdir, writeFile } from "node:fs/promises";

export type AuditEvent =
  | {
      type: "replay_started";
      timestamp: string;
      sessionId: string;
      capabilityId: string;
    }
  | {
      type: "step_started";
      timestamp: string;
      stepId: string;
    }
  | {
      type: "step_completed";
      timestamp: string;
      stepId: string;
    }
  | {
      type: "approval_required";
      timestamp: string;
      stepId: string;
      evidenceRef?: string;
    }
  | {
      type: "approval_granted";
      timestamp: string;
      stepId: string;
    }
  | {
      type: "business_outcome";
      timestamp: string;
      stepId: string;
      code: string;
    }
  | {
      type: "replay_failed";
      timestamp: string;
      code: string;
      stepId?: string;
    }
  | {
      type: "replay_succeeded";
      timestamp: string;
      evidenceRef?: string;
    };

export interface AuditRecord {
  sessionId: string;
  capabilityId: string;
  events: AuditEvent[];
}

export class ReplayAudit {
  private readonly events: AuditEvent[] = [];

  constructor(
    private readonly sessionId: string,
    private readonly capabilityId: string,
  ) {}

  add(
    event: AuditEvent,
  ): void {
    this.events.push(event);
  }

  async save(): Promise<string> {
    const directory = "audit/runtime";

    await mkdir(directory, {
      recursive: true,
    });

    const path =
      `${directory}/${this.sessionId}.json`;

    const record: AuditRecord = {
      sessionId: this.sessionId,
      capabilityId: this.capabilityId,
      events: this.events,
    };

    await writeFile(
      path,
      JSON.stringify(record, null, 2),
      "utf8",
    );

    return path;
  }
}

export function auditTimestamp(): string {
  return new Date().toISOString();
}