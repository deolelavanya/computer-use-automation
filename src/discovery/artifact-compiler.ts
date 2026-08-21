import type {
  CapabilityArtifact,
} from "../artifact/schema.js";

import {
  CapabilityArtifactSchema,
} from "../artifact/schema.js";

import type {
  DiscoveryResult,
} from "./types.js";

export interface ArtifactCompilerOptions {
  identity: {
    id: string;
    name: string;
    version: string;
    description: string;
  };

  compatibility: {
    application: string;
    surface: "web";
    vendor: string;
  };

  /**
   * Maps concrete discovery values to reusable artifact parameters.
   *
   * Example:
   * "12345" -> "memberId"
   */
  parameterBindings: Record<
    string,
    string
  >;
}

export function compileDiscoveryArtifact(
  discovery: DiscoveryResult,
  options: ArtifactCompilerOptions,
): CapabilityArtifact {
  if (discovery.kind !== "success") {
    throw new Error(
      "CANNOT_COMPILE_FAILED_DISCOVERY",
    );
  }

  const successfulActions =
    discovery.steps.filter(
      (step) =>
        step.success &&
        step.decision.action.type !==
          "finish",
    );

  if (successfulActions.length === 0) {
    throw new Error(
      "DISCOVERY_HAS_NO_ACTIONS",
    );
  }

  const steps =
    successfulActions.map(
      (traceStep, index) => {
        const discoveredAction =
          traceStep.decision.action;

        if (
          discoveredAction.type ===
          "finish"
        ) {
          throw new Error(
            "UNEXPECTED_FINISH_ACTION",
          );
        }

        const action =
          bindDiscoveredAction(
            discoveredAction,
            options.parameterBindings,
          );

        const irreversible =
          isConfirmOpenAction(
            discoveredAction,
          );

        return {
          id: makeStepId(
            index,
            discoveredAction.type,
          ),

          phase:
            inferPhase(index),

          ...(irreversible
            ? {
                risk:
                  "irreversible" as const,
              }
            : {}),

          action,

          target:
            discoveredAction.target,
        };
      },
    );

  /**
   * For this demo compiler, the contract is intentionally explicit.
   *
   * Discovery tells us what happened. The compiler/generalization
   * layer tells us which concrete values become reusable inputs.
   */
  const candidate = {
    schemaVersion: "1.0",

    identity:
      options.identity,

    compatibility:
      options.compatibility,

    contract: {
      inputs: {
        memberId: {
          type: "string",
          required: true,
          sensitive: true,
        },

        product: {
          type: "enum",
          required: true,
          values: [
            "SAVINGS",
            "CHECKING",
          ],
        },

        openingDeposit: {
          type: "decimal",
          required: true,
          minimum: 0,
        },
      },

      outputs: {
        confirmationId: {
          type: "string",
        },
      },

      businessOutcomes: [
        {
          code:
            "MEMBER_NOT_FOUND",
          description:
            "The supplied member ID does not exist.",
        },

        {
          code:
            "ACCOUNT_RESTRICTED",
          description:
            "The member exists but is not permitted to open a new sub-account.",
        },
      ],
    },

    steps,

    outputs: [
      {
        name:
          "confirmationId",

        extract: {
          type: "text",

          target: {
            strategies: [
              {
                type:
                  "attribute",
                name: "id",
                value:
                  "confirmation_value",
              },
            ],
          },
        },
      },
    ],

    successCheckpoint: {
      all: [
        {
          type:
            "text_visible",
          value:
            "ACCOUNT OPENED",
        },

        {
          type:
            "text_visible",
          value:
            "TRANSACTION COMPLETE",
        },

        {
          type:
            "text_matches_input",
          label: "Member",
          input: "memberId",
        },
      ],
    },
  };

  return CapabilityArtifactSchema.parse(
    candidate,
  );
}

function bindDiscoveredAction(
  action: Exclude<
    DiscoveryResult["steps"][number]["decision"]["action"],
    {
      type: "finish";
    }
  >,
  bindings: Record<string, string>,
) {
  switch (action.type) {
    case "click":
      return {
        type:
          "click" as const,
      };

    case "fill":
      return {
        type:
          "fill" as const,

        value:
          parameterizeValue(
            action.value,
            bindings,
          ),
      };

    case "select":
      return {
        type:
          "select" as const,

        value:
          parameterizeValue(
            action.value,
            bindings,
          ),
      };
  }
}

/**
 * Convert a concrete value observed during discovery into a reusable
 * artifact parameter.
 *
 * Values are normalized before comparison so harmless whitespace
 * differences in a discovery trace do not prevent parameterization.
 */
function parameterizeValue(
  concreteValue: string,
  bindings: Record<string, string>,
): string {
  const normalizedValue =
    String(concreteValue).trim();

  for (
    const [
      discoveredValue,
      parameterName,
    ] of Object.entries(bindings)
  ) {
    const normalizedBinding =
      String(discoveredValue).trim();

    if (
      normalizedValue ===
      normalizedBinding
    ) {
      console.log(
        `Parameterizing "${normalizedValue}" -> ` +
          `{{${parameterName}}}`,
      );

      return `{{${parameterName}}}`;
    }
  }

  console.log(
    `No parameter binding for "${normalizedValue}"`,
  );

  return concreteValue;
}

function isConfirmOpenAction(
  action: Exclude<
    DiscoveryResult["steps"][number]["decision"]["action"],
    {
      type: "finish";
    }
  >,
): boolean {
  if (action.type !== "click") {
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

function makeStepId(
  index: number,
  actionType: string,
): string {
  return (
    `discovered.${String(
      index + 1,
    ).padStart(2, "0")}.` +
    actionType
  );
}

function inferPhase(
  index: number,
): string {
  if (index <= 1) {
    return "search_member";
  }

  if (index === 2) {
    return "open_subaccount";
  }

  if (index <= 5) {
    return "configure_account";
  }

  return "confirm";
}