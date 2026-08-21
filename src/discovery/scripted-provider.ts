import type {
  DiscoveryDecision,
  DiscoveryModel,
} from "./types.js";

/**
 * Deterministic discovery provider used only for local testing.
 *
 * This is NOT an LLM and must not be presented as evidence of
 * genuine model-driven discovery.
 */
export class ScriptedDiscoveryModel
  implements DiscoveryModel
{
  private index = 0;

  private readonly decisions:
    DiscoveryDecision[] = [
      {
        reasoningSummary:
          "Enter the member number so the existing member can be found.",
        action: {
          type: "fill",
          value: "12345",
          target: {
            strategies: [
              {
                type: "label",
                value: "Member Number",
              },
              {
                type: "attribute",
                name: "name",
                value: "fld_104",
              },
            ],
          },
        },
      },

      {
        reasoningSummary:
          "Submit the member search.",
        action: {
          type: "click",
          target: {
            strategies: [
              {
                type: "role",
                role: "button",
                name: "FIND",
              },
              {
                type: "text",
                value: "FIND",
              },
            ],
          },
        },
      },

      {
        reasoningSummary:
          "Open the workflow for creating a new sub-account.",
        action: {
          type: "click",
          target: {
            strategies: [
              {
                type: "role",
                role: "button",
                name: "OPEN NEW SUB-ACCOUNT",
              },
              {
                type: "text",
                value: "OPEN NEW SUB-ACCOUNT",
              },
            ],
          },
        },
      },

      {
        reasoningSummary:
          "Select SAVINGS as the requested product.",
        action: {
          type: "select",
          value: "SAVINGS",
          target: {
            strategies: [
              {
                type: "label",
                value: "Product",
              },
              {
                type: "attribute",
                name: "name",
                value: "fld_22",
              },
            ],
          },
        },
      },

      {
        reasoningSummary:
          "Enter the requested opening deposit.",
        action: {
          type: "fill",
          value: "25",
          target: {
            strategies: [
              {
                type: "label",
                value: "Opening Deposit",
              },
              {
                type: "attribute",
                name: "name",
                value: "fld_23",
              },
            ],
          },
        },
      },

      {
        reasoningSummary:
          "Continue to the review page.",
        action: {
          type: "click",
          target: {
            strategies: [
              {
                type: "role",
                role: "button",
                name: "CONTINUE",
              },
              {
                type: "text",
                value: "CONTINUE",
              },
            ],
          },
        },
      },

      {
        reasoningSummary:
          "The final CONFIRM OPEN action has been identified. " +
          "Discovery must not execute this irreversible action.",
        action: {
          type: "click",
          target: {
            strategies: [
              {
                type: "role",
                role: "button",
                name: "CONFIRM OPEN",
              },
              {
                type: "text",
                value: "CONFIRM OPEN",
              },
            ],
          },
        },
      },
    ];

  async decide(input: {
  history: {
    success: boolean;
  }[];
}): Promise<DiscoveryDecision> {
  /**
   * Advance only after the previous decision actually succeeded.
   *
   * On the first call there is no history, so decision 0 is used.
   * If an action fails, the same decision is returned on the next
   * iteration instead of moving the script forward.
   */
  if (input.history.length > 0) {
    const previous =
      input.history[
        input.history.length - 1
      ];

    if (previous?.success) {
      this.index += 1;
    }
  }

  const decision =
    this.decisions[this.index];

  if (!decision) {
    return {
      reasoningSummary:
        "The scripted discovery sequence is complete.",
      action: {
        type: "finish",
        reason:
          "Scripted discovery sequence completed.",
      },
    };
  }

  return decision;
}
}