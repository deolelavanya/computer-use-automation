import {
  mkdir,
  writeFile,
} from "node:fs/promises";

import {
  DiscoveryAgent,
} from "../src/discovery/discovery-agent.js";

import {
  ScriptedDiscoveryModel,
} from "../src/discovery/scripted-provider.js";

import {
  PlaywrightSurface,
} from "../src/surface/playwright/playwright-surface.js";

async function main(): Promise<void> {
  const surface =
    await PlaywrightSurface.launch(
      "http://localhost:4173",
    );

  try {
    const model =
      new ScriptedDiscoveryModel();

    const agent =
      new DiscoveryAgent(
        surface,
        model,
        {
          maxSteps: 20,
          captureEvidence: true,
        },
      );

    const goal =
      "Discover how to open a SAVINGS sub-account " +
      "for member 12345 with an opening deposit of 25, " +
      "but do not execute CONFIRM OPEN.";

    console.log(
      "=== SCRIPTED DISCOVERY START ===",
    );

    const result =
      await agent.discover(goal);

    console.log(
      JSON.stringify(
        result,
        null,
        2,
      ),
    );

    await mkdir(
      "evidence/discovery",
      {
        recursive: true,
      },
    );

    const path =
      "evidence/discovery/" +
      "open-savings-scripted-discovery.json";

    await writeFile(
      path,
      JSON.stringify(
        {
          generatedAt:
            new Date().toISOString(),

          provider:
            "scripted-test-provider",

          genuineLlmDiscovery:
            false,

          sessionId:
            surface.getSession().id,

          result,
        },
        null,
        2,
      ),
      "utf8",
    );

    if (
      result.kind !== "success"
    ) {
      throw new Error(
        `Scripted discovery failed: ${
          result.message ??
          "unknown failure"
        }`,
      );
    }

    const lastStep =
      result.steps[
        result.steps.length - 1
      ];

    if (!lastStep) {
      throw new Error(
        "Discovery produced no steps.",
      );
    }

    if (
      lastStep.decision.action.type !==
      "click"
    ) {
      throw new Error(
        "Expected discovery to stop at CONFIRM OPEN.",
      );
    }

    const foundConfirmOpen =
      lastStep.decision.action
        .target.strategies.some(
          (strategy) => {
            if (
              strategy.type === "role"
            ) {
              return (
                strategy.name ===
                "CONFIRM OPEN"
              );
            }

            if (
              strategy.type === "text"
            ) {
              return (
                strategy.value ===
                "CONFIRM OPEN"
              );
            }

            return false;
          },
        );

    if (!foundConfirmOpen) {
      throw new Error(
        "Discovery did not reach the CONFIRM OPEN boundary.",
      );
    }

    console.log(
      `Trace saved: ${path}`,
    );

    console.log(
      "SCRIPTED DISCOVERY PASSED",
    );

    console.log(
      "NOTE: This validates the discovery harness only; " +
      "it is not genuine LLM discovery evidence.",
    );
  } finally {
    await surface.close();
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});