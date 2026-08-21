import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import {
  compileDiscoveryArtifact,
} from "../src/discovery/artifact-compiler.js";

import type {
  DiscoveryResult,
} from "../src/discovery/types.js";

interface SavedDiscoveryTrace {
  generatedAt: string;
  provider: string;
  genuineLlmDiscovery: boolean;
  sessionId: string;
  result: DiscoveryResult;
}

async function main(): Promise<void> {
  const tracePath =
    "evidence/discovery/" +
    "open-savings-gemini-discovery.json";

  const raw =
    await readFile(
      tracePath,
      "utf8",
    );

  const saved =
    JSON.parse(
      raw,
    ) as SavedDiscoveryTrace;

  /**
   * This compiler test uses the successful genuine LLM
   * discovery evidence produced by the Gemini run.
   */
  if (
    saved.genuineLlmDiscovery !== true
  ) {
    throw new Error(
      "Expected genuine LLM discovery trace.",
    );
  }

  if (
    saved.result.kind !== "success"
  ) {
    throw new Error(
      "Expected successful discovery trace.",
    );
  }

  const parameterBindings: Record<
    string,
    string
  > = {
    "12345": "memberId",
    SAVINGS: "product",
    "REGULAR SAVINGS": "product",
    "25": "openingDeposit",
  };

  const artifact =
    compileDiscoveryArtifact(
      saved.result,
      {
        identity: {
          id:
            "legacycore.open-savings-subaccount.discovered",

          name:
            "Open Savings Sub-Account (Discovered)",

          version:
            "1.0.0",

          description:
            "Capability artifact compiled from a genuine LLM discovery trace.",
        },

        compatibility: {
          application:
            "LegacyCore",

          surface:
            "web",

          vendor:
            "demo",
        },

        parameterBindings,
      },
    );

  console.log(
    "=== COMPILED ARTIFACT ===",
  );

  console.log(
    JSON.stringify(
      artifact,
      null,
      2,
    ),
  );

  /**
   * Verify parameterization for values that actually occur
   * in successful fill/select actions.
   *
   * A genuine discovery run can begin from an application
   * state where earlier values have already been supplied,
   * so their absence from the trace is not a compiler error.
   */
  const successfulActionValues =
    saved.result.steps
      .filter(
        (step) => step.success,
      )
      .flatMap(
        (step) => {
          const action =
            step.decision.action;

          if (
            action.type === "fill" ||
            action.type === "select"
          ) {
            return [
              action.value,
            ];
          }

          return [];
        },
      );

  const serialized =
    JSON.stringify(
      artifact,
    );

  for (
    const concreteValue of
    successfulActionValues
  ) {
    const parameterName =
      parameterBindings[
        concreteValue
      ];

    if (!parameterName) {
      continue;
    }

    if (
      !serialized.includes(
        `{{${parameterName}}}`,
      )
    ) {
      throw new Error(
        `${parameterName} was not parameterized.`,
      );
    }
  }

  /**
   * Confirm the irreversible boundary survived compilation.
   */
  const irreversibleStep =
    artifact.steps.find(
      (step) =>
        step.risk ===
        "irreversible",
    );

  if (!irreversibleStep) {
    throw new Error(
      "Compiled artifact lost irreversible-action metadata.",
    );
  }

  const hasConfirmOpen =
    irreversibleStep.target
      .strategies.some(
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

  if (!hasConfirmOpen) {
    throw new Error(
      "Irreversible step is not CONFIRM OPEN.",
    );
  }

  await mkdir(
    "artifacts/generated",
    {
      recursive: true,
    },
  );

  const outputPath =
    "artifacts/generated/" +
    "open-savings-subaccount.discovered.v1.json";

  await writeFile(
    outputPath,
    JSON.stringify(
      artifact,
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    `Generated artifact: ${outputPath}`,
  );

  console.log(
    "DISCOVERY TO ARTIFACT COMPILER PASSED",
  );
}

main().catch((error) => {
  console.error(error);
  throw error;
});