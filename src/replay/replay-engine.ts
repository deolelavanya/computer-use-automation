import type {
  ComputerSurface,
} from "../surface/surface.js";

import type {
  Action,
  CapabilityArtifact,
  Condition,
  InputDefinition,
} from "../artifact/schema.js";

import {
  ReplayAudit,
  auditTimestamp,
} from "./audit.js";

export type InvocationInputs =
  Record<string, unknown>;

export interface ReplayCheckpoint {
  nextStepIndex: number;
  sessionId: string;
}

export interface ReplayOptions {
  approvedStepIds?: string[];
  checkpoint?: ReplayCheckpoint;
}

export type ReplayResult =
  | {
      kind: "success";
      outputs: Record<string, unknown>;
      auditPath?: string;
    }
  | {
      kind: "business_outcome";
      code: string;
      details?: Record<string, unknown>;
      auditPath?: string;
    }
  | {
      kind: "approval_required";
      stepId: string;
      risk: "irreversible";
      checkpoint: ReplayCheckpoint;
      evidenceRef?: string;
      auditPath?: string;
    }
  | {
      kind: "failure";
      error: {
        code: string;
        message: string;
        stepId?: string;
      };
      auditPath?: string;
    };

export function validateInvocationInputs(
  artifact: CapabilityArtifact,
  inputs: InvocationInputs,
): void {
  for (
    const [name, definition] of
    Object.entries(
      artifact.contract.inputs,
    )
  ) {
    const value = inputs[name];

    if (
      definition.required &&
      value === undefined
    ) {
      throw new Error(
        `MISSING_INPUT: ${name}`,
      );
    }

    if (value === undefined) {
      continue;
    }

    validateInputValue(
      name,
      definition,
      value,
    );
  }

  for (
    const suppliedName of
    Object.keys(inputs)
  ) {
    if (
      !(
        suppliedName in
        artifact.contract.inputs
      )
    ) {
      throw new Error(
        `UNKNOWN_INPUT: ${suppliedName}`,
      );
    }
  }
}

function validateInputValue(
  name: string,
  definition: InputDefinition,
  value: unknown,
): void {
  switch (definition.type) {
    case "string": {
      if (typeof value !== "string") {
        throw new Error(
          `INVALID_INPUT_TYPE: ${name} must be a string`,
        );
      }

      return;
    }

    case "enum": {
      if (
        typeof value !== "string" ||
        !definition.values.includes(value)
      ) {
        throw new Error(
          `INVALID_INPUT_VALUE: ${name} must be one of ` +
            definition.values.join(", "),
        );
      }

      return;
    }

    case "decimal": {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value)
      ) {
        throw new Error(
          `INVALID_INPUT_TYPE: ${name} must be a finite number`,
        );
      }

      if (
        definition.minimum !== undefined &&
        value < definition.minimum
      ) {
        throw new Error(
          `INVALID_INPUT_VALUE: ${name} must be >= ` +
            `${definition.minimum}`,
        );
      }

      if (
        definition.maximum !== undefined &&
        value > definition.maximum
      ) {
        throw new Error(
          `INVALID_INPUT_VALUE: ${name} must be <= ` +
            `${definition.maximum}`,
        );
      }

      return;
    }
  }
}

export function bindTemplate(
  template: string,
  inputs: InvocationInputs,
): string {
  return template.replace(
    /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g,
    (_, parameterName: string) => {
      const value =
        inputs[parameterName];

      if (value === undefined) {
        throw new Error(
          `UNBOUND_PARAMETER: ${parameterName}`,
        );
      }

      return String(value);
    },
  );
}

export function bindAction(
  action: Action,
  inputs: InvocationInputs,
): Action {
  switch (action.type) {
    case "click":
      return action;

    case "fill":
      return {
        ...action,
        value: bindTemplate(
          action.value,
          inputs,
        ),
      };

    case "select":
      return {
        ...action,
        value: bindTemplate(
          action.value,
          inputs,
        ),
      };

    case "assert_text":
      return {
        ...action,
        expected: bindTemplate(
          action.expected,
          inputs,
        ),
      };
  }
}

export class ReplayEngine {
  constructor(
    private readonly surface:
      ComputerSurface,
  ) {}

  private async evaluateCondition(
    condition: Condition,
    inputs: InvocationInputs,
  ): Promise<
    | {
        kind: "satisfied";
      }
    | {
        kind: "business_outcome";
        code: string;
      }
    | {
        kind: "failed";
        message: string;
      }
  > {
    switch (condition.type) {
      case "text_visible": {
        const visible =
          await this.surface.waitForText(
            condition.value,
            5000,
          );

        return visible
          ? {
              kind: "satisfied",
            }
          : {
              kind: "failed",
              message:
                `Expected text "${condition.value}" ` +
                `did not become visible.`,
            };
      }

      case "business_outcome": {
        const visible =
          await this.surface.waitForText(
            condition.whenTextVisible,
            5000,
          );

        return visible
          ? {
              kind:
                "business_outcome",
              code: condition.code,
            }
          : {
              kind: "failed",
              message:
                `Business outcome "${condition.code}" ` +
                `was not observed.`,
            };
      }

      case "text_matches_input": {
        const expected =
          inputs[condition.input];

        if (expected === undefined) {
          return {
            kind: "failed",
            message:
              `Input "${condition.input}" is unavailable.`,
          };
        }

        const observation =
          await this.surface.observe();

        const matched =
          observation.visibleText.includes(
            String(expected),
          );

        return matched
          ? {
              kind: "satisfied",
            }
          : {
              kind: "failed",
              message:
                `Expected visible text to contain input ` +
                `"${condition.input}".`,
            };
      }

      case "one_of": {
        const deadline =
          Date.now() + 5000;

        while (
          Date.now() < deadline
        ) {
          const observation =
            await this.surface.observe();

          for (
            const candidate of
            condition.conditions
          ) {
            if (
              candidate.type ===
                "text_visible" &&
              observation.visibleText.includes(
                candidate.value,
              )
            ) {
              return {
                kind: "satisfied",
              };
            }

            if (
              candidate.type ===
                "business_outcome" &&
              observation.visibleText.includes(
                candidate.whenTextVisible,
              )
            ) {
              return {
                kind:
                  "business_outcome",
                code: candidate.code,
              };
            }

            if (
              candidate.type ===
              "text_matches_input"
            ) {
              const expected =
                inputs[candidate.input];

              if (
                expected !== undefined &&
                observation.visibleText.includes(
                  String(expected),
                )
              ) {
                return {
                  kind: "satisfied",
                };
              }
            }
          }

          await new Promise<void>(
            (resolve) => {
              setTimeout(
                resolve,
                100,
              );
            },
          );
        }

        return {
          kind: "failed",
          message:
            "None of the one_of conditions were satisfied.",
        };
      }
    }
  }

  async replay(
    artifact: CapabilityArtifact,
    inputs: InvocationInputs,
    options: ReplayOptions = {},
  ): Promise<ReplayResult> {
    const currentSession =
      this.surface.getSession();

    const audit =
      new ReplayAudit(
        currentSession.id,
        artifact.identity.id,
      );

    audit.add({
      type: "replay_started",
      timestamp: auditTimestamp(),
      sessionId: currentSession.id,
      capabilityId:
        artifact.identity.id,
    });

    try {
      validateInvocationInputs(
        artifact,
        inputs,
      );

      let startStepIndex = 0;

      if (options.checkpoint) {
        if (
          options.checkpoint.sessionId !==
          currentSession.id
        ) {
          audit.add({
            type: "replay_failed",
            timestamp: auditTimestamp(),
            code:
              "CHECKPOINT_SESSION_MISMATCH",
          });

          const auditPath =
            await audit.save();

          return {
            kind: "failure",
            error: {
              code:
                "CHECKPOINT_SESSION_MISMATCH",
              message:
                `Checkpoint belongs to session ` +
                `"${options.checkpoint.sessionId}", ` +
                `but current session is ` +
                `"${currentSession.id}".`,
            },
            auditPath,
          };
        }

        if (
          !Number.isInteger(
            options.checkpoint.nextStepIndex,
          ) ||
          options.checkpoint.nextStepIndex < 0 ||
          options.checkpoint.nextStepIndex >=
            artifact.steps.length
        ) {
          audit.add({
            type: "replay_failed",
            timestamp: auditTimestamp(),
            code:
              "INVALID_CHECKPOINT",
          });

          const auditPath =
            await audit.save();

          return {
            kind: "failure",
            error: {
              code:
                "INVALID_CHECKPOINT",
              message:
                `Invalid nextStepIndex: ` +
                `${options.checkpoint.nextStepIndex}`,
            },
            auditPath,
          };
        }

        startStepIndex =
          options.checkpoint.nextStepIndex;

        console.log(
          `Resuming replay at step ${startStepIndex}: ` +
            `${artifact.steps[startStepIndex].id}`,
        );
      }

      for (
        let stepIndex = startStepIndex;
        stepIndex <
        artifact.steps.length;
        stepIndex += 1
      ) {
        const step =
          artifact.steps[stepIndex];

        if (
          step.risk === "irreversible"
        ) {
          const approved =
            options.approvedStepIds?.includes(
              step.id,
            ) ?? false;

          if (!approved) {
            const checkpoint:
              ReplayCheckpoint = {
                nextStepIndex:
                  stepIndex,
                sessionId:
                  currentSession.id,
              };

            let evidenceRef:
              string | undefined;

            try {
              const evidence =
                await this.surface.captureEvidence(
                  "screenshot",
                );

              evidenceRef =
                evidence.path;
            } catch {
              evidenceRef =
                undefined;
            }

            audit.add({
              type:
                "approval_required",
              timestamp:
                auditTimestamp(),
              stepId: step.id,
              evidenceRef,
            });

            const auditPath =
              await audit.save();

            console.log(
              `Approval required: ${step.id}`,
            );

            return {
              kind:
                "approval_required",
              stepId: step.id,
              risk: "irreversible",
              checkpoint,
              evidenceRef,
              auditPath,
            };
          }

          audit.add({
            type:
              "approval_granted",
            timestamp:
              auditTimestamp(),
            stepId: step.id,
          });
        }

        audit.add({
          type: "step_started",
          timestamp:
            auditTimestamp(),
          stepId: step.id,
        });

        console.log(
          `Executing: ${step.id}`,
        );

        const action =
          bindAction(
            step.action,
            inputs,
          );

        let target;

        try {
          target =
            await this.surface.resolveTarget(
              step.target,
            );
        } catch (error) {
          audit.add({
            type: "replay_failed",
            timestamp:
              auditTimestamp(),
            code:
              "TARGET_RESOLUTION_FAILED",
            stepId: step.id,
          });

          const auditPath =
            await audit.save();

          return {
            kind: "failure",
            error: {
              code:
                "TARGET_RESOLUTION_FAILED",
              message:
                error instanceof Error
                  ? error.message
                  : String(error),
              stepId: step.id,
            },
            auditPath,
          };
        }

        const result =
          await this.surface.act(
            action,
            target,
          );

        if (!result.success) {
          audit.add({
            type: "replay_failed",
            timestamp:
              auditTimestamp(),
            code:
              result.error?.code ??
              "ACTION_FAILED",
            stepId: step.id,
          });

          const auditPath =
            await audit.save();

          return {
            kind: "failure",
            error: {
              code:
                result.error?.code ??
                "ACTION_FAILED",
              message:
                result.error?.message ??
                "Surface action failed",
              stepId: step.id,
            },
            auditPath,
          };
        }

        for (
          const condition of
          step.postconditions ?? []
        ) {
          const conditionResult =
            await this.evaluateCondition(
              condition,
              inputs,
            );

          if (
            conditionResult.kind ===
            "business_outcome"
          ) {
            audit.add({
              type:
                "business_outcome",
              timestamp:
                auditTimestamp(),
              stepId: step.id,
              code:
                conditionResult.code,
            });

            const auditPath =
              await audit.save();

            console.log(
              `Business outcome: ${conditionResult.code}`,
            );

            return {
              kind:
                "business_outcome",
              code:
                conditionResult.code,
              auditPath,
            };
          }

          if (
            conditionResult.kind ===
            "failed"
          ) {
            audit.add({
              type: "replay_failed",
              timestamp:
                auditTimestamp(),
              code:
                "POSTCONDITION_FAILED",
              stepId: step.id,
            });

            const auditPath =
              await audit.save();

            return {
              kind: "failure",
              error: {
                code:
                  "POSTCONDITION_FAILED",
                message:
                  conditionResult.message,
                stepId: step.id,
              },
              auditPath,
            };
          }
        }

        audit.add({
          type: "step_completed",
          timestamp:
            auditTimestamp(),
          stepId: step.id,
        });

        console.log(
          `Completed: ${step.id}`,
        );
      }

      const outputs:
        Record<string, unknown> = {};

      for (
        const output of
        artifact.outputs
      ) {
        try {
          const target =
            await this.surface.resolveTarget(
              output.extract.target,
            );

          switch (
            output.extract.type
          ) {
            case "text": {
              outputs[output.name] =
                await this.surface.getText(
                  target,
                );

              break;
            }
          }
        } catch (error) {
          audit.add({
            type: "replay_failed",
            timestamp:
              auditTimestamp(),
            code:
              "OUTPUT_EXTRACTION_FAILED",
          });

          const auditPath =
            await audit.save();

          return {
            kind: "failure",
            error: {
              code:
                "OUTPUT_EXTRACTION_FAILED",
              message:
                error instanceof Error
                  ? error.message
                  : String(error),
            },
            auditPath,
          };
        }
      }

      let evidenceRef:
        string | undefined;

      try {
        const evidence =
          await this.surface.captureEvidence(
            "screenshot",
          );

        evidenceRef =
          evidence.path;
      } catch {
        evidenceRef =
          undefined;
      }

      audit.add({
        type:
          "replay_succeeded",
        timestamp:
          auditTimestamp(),
        evidenceRef,
      });

      const auditPath =
        await audit.save();

      return {
        kind: "success",
        outputs,
        auditPath,
      };
    } catch (error) {
      audit.add({
        type: "replay_failed",
        timestamp:
          auditTimestamp(),
        code: "REPLAY_FAILED",
      });

      const auditPath =
        await audit.save();

      return {
        kind: "failure",
        error: {
          code: "REPLAY_FAILED",
          message:
            error instanceof Error
              ? error.message
              : String(error),
        },
        auditPath,
      };
    }
  }
}