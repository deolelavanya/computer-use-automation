import type {
  Action,
} from "../artifact/schema.js";

import type {
  ComputerSurface,
} from "../surface/surface.js";

import type {
  DiscoveryAction,
  DiscoveryModel,
  DiscoveryResult,
  DiscoveryTraceStep,
} from "./types.js";

export interface DiscoveryAgentOptions {
  /**
   * Prevent an accidental infinite model/action loop.
   */
  maxSteps?: number;

  /**
   * Capture a screenshot after each attempted surface action.
   */
  captureEvidence?: boolean;
}

export class DiscoveryAgent {
  private readonly maxSteps: number;
  private readonly captureEvidence: boolean;

  constructor(
    private readonly surface: ComputerSurface,
    private readonly model: DiscoveryModel,
    options: DiscoveryAgentOptions = {},
  ) {
    this.maxSteps =
      options.maxSteps ?? 12;

    this.captureEvidence =
      options.captureEvidence ?? true;
  }

  async discover(
    goal: string,
  ): Promise<DiscoveryResult> {
    const history:
      DiscoveryTraceStep[] = [];

    for (
      let index = 0;
      index < this.maxSteps;
      index += 1
    ) {
      /**
       * The model only receives our surface observation.
       *
       * It does not receive a Playwright Page, Locator, browser
       * object, or other implementation-specific capability.
       */
      const observation =
        await this.surface.observe();

      console.log(
        `Discovery step ${index}`,
      );

      console.log(
        `Page: ${observation.title ?? "(untitled)"}`,
      );

      let decision;

      try {
        decision =
          await this.model.decide({
            goal,
            observation: {
              url: observation.url,
              title: observation.title,
              visibleText:
                observation.visibleText,
            },
            history,
          });
      } catch (error) {
        return {
          kind: "failure",
          goal,
          steps: history,
          message:
            `MODEL_DECISION_FAILED: ${
              error instanceof Error
                ? error.message
                : String(error)
            }`,
        };
      }

      console.log(
        `Decision: ${decision.action.type}`,
      );

      console.log(
        `Reason: ${decision.reasoningSummary}`,
      );

      /**
       * The model may declare the discovery complete.
       */
      if (
        decision.action.type ===
        "finish"
      ) {
        history.push({
          index,
          observation: {
            url: observation.url,
            title: observation.title,
            visibleText:
              observation.visibleText,
          },
          decision,
          success: true,
        });

        return {
          kind: "success",
          goal,
          steps: history,
          message:
            decision.action.reason,
        };
      }

      /**
       * Safety boundary for discovery.
       *
       * Discovery is allowed to identify the irreversible action,
       * but this exploratory agent is not allowed to execute it.
       *
       * The deterministic ReplayEngine + approval/handoff path owns
       * execution of that operation.
       */
      if (
        this.isIrreversibleDiscoveryAction(
          decision.action,
        )
      ) {
        history.push({
          index,
          observation: {
            url: observation.url,
            title: observation.title,
            visibleText:
              observation.visibleText,
          },
          decision,
          success: true,
        });

        try {
          if (this.captureEvidence) {
            await this.surface.captureEvidence(
              "screenshot",
            );
          }
        } catch {
          // Evidence failure should not turn a successful discovery
          // boundary into a failed discovery.
        }

        return {
          kind: "success",
          goal,
          steps: history,
          message:
            "Discovery reached an irreversible action boundary. " +
            "The action was identified but not executed.",
        };
      }

      let success = false;
      let errorMessage:
        string | undefined;

      try {
        const target =
          await this.surface.resolveTarget(
            decision.action.target,
          );

        const action =
          this.toSurfaceAction(
            decision.action,
          );

        const result =
          await this.surface.act(
            action,
            target,
          );

        success =
          result.success;

        if (!result.success) {
          errorMessage =
            result.error?.message ??
            "Surface action failed";
        }
      } catch (error) {
        success = false;

        errorMessage =
          error instanceof Error
            ? error.message
            : String(error);
      }

      history.push({
        index,
        observation: {
          url: observation.url,
          title: observation.title,
          visibleText:
            observation.visibleText,
        },
        decision,
        success,
        error: errorMessage,
      });

      /**
       * Capture evidence after every attempted interaction.
       */
      if (this.captureEvidence) {
        try {
          await this.surface.captureEvidence(
            "screenshot",
          );
        } catch {
          /**
           * Evidence is useful, but failure to save a screenshot
           * should not prevent the model from continuing discovery.
           */
        }
      }

      /**
       * Don't immediately abort on a target/action failure.
       *
       * The failed attempt becomes part of history, allowing the
       * model to observe the current page again and choose another
       * target strategy on the next turn.
       */
      if (!success) {
        console.log(
          `Discovery action failed: ${errorMessage}`,
        );
      }
    }

    return {
      kind: "failure",
      goal,
      steps: history,
      message:
        `DISCOVERY_STEP_LIMIT_REACHED: ${this.maxSteps}`,
    };
  }

  /**
   * Convert the discovery action into the smaller primitive Action
   * contract understood by ComputerSurface.
   */
  private toSurfaceAction(
    action: Exclude<
      DiscoveryAction,
      {
        type: "finish";
      }
    >,
  ): Action {
    switch (action.type) {
      case "fill":
        return {
          type: "fill",
          value: action.value,
        };

      case "click":
        return {
          type: "click",
        };

      case "select":
        return {
          type: "select",
          value: action.value,
        };
    }
  }

  /**
   * This is intentionally narrow for the demo.
   *
   * Later the compiler will represent this as artifact risk metadata
   * rather than relying on button text during deterministic replay.
   */
  private isIrreversibleDiscoveryAction(
    action: DiscoveryAction,
  ): boolean {
    if (
      action.type !== "click"
    ) {
      return false;
    }

    return action.target.strategies.some(
      (strategy) => {
        if (
          strategy.type === "role"
        ) {
          return (
            strategy.name
              .trim()
              .toUpperCase() ===
            "CONFIRM OPEN"
          );
        }

        if (
          strategy.type === "text"
        ) {
          return (
            strategy.value
              .trim()
              .toUpperCase() ===
            "CONFIRM OPEN"
          );
        }

        return false;
      },
    );
  }
}