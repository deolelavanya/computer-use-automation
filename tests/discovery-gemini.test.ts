import {
  mkdir,
  writeFile,
} from "node:fs/promises";

import {
  DiscoveryAgent,
} from "../src/discovery/discovery-agent.js";

import {
  GeminiDiscoveryModel,
} from "../src/discovery/gemini-provider.js";

import {
  PlaywrightSurface,
} from "../src/surface/playwright/playwright-surface.js";

async function main(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not set.",
    );
  }

  const startUrl =
    "http://localhost:4173";

  const surface =
    await PlaywrightSurface.launch(
      startUrl,
    );

  try {
    const model =
      new GeminiDiscoveryModel({
        model: "gemini-3.5-flash-lite",
      });

    const agent =
      new DiscoveryAgent(
        surface,
        model,
        {
          maxSteps: 15,
          captureEvidence: true,
        },
      );

    const goal =
      "Discover how to open a SAVINGS " +
      "sub-account for existing member 12345 " +
      "with an opening deposit of 25. " +
      "Navigate the live application one step at a time. " +
      "Do not execute the final irreversible CONFIRM OPEN action.";

    console.log(
      "=== GENUINE GEMINI DISCOVERY START ===",
    );

    console.log(
      `Session: ${surface.getSession().id}`,
    );

    const result =
      await agent.discover(goal);

    console.log(
      "=== GEMINI DISCOVERY RESULT ===",
    );

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

    const evidencePath =
      "evidence/discovery/" +
      "open-savings-gemini-discovery.json";

    const evidence = {
      generatedAt:
        new Date().toISOString(),

      provider:
        "google-gemini",

      model:
        "gemini-3.6-flash",

      genuineLlmDiscovery:
        true,

      application:
        "LegacyCore",

      surface:
        "PlaywrightSurface",

      sessionId:
        surface.getSession().id,

      goal,

      result,
    };

    await writeFile(
      evidencePath,
      JSON.stringify(
        evidence,
        null,
        2,
      ),
      "utf8",
    );

    console.log(
      `Evidence saved: ${evidencePath}`,
    );

    if (result.kind !== "success") {
      throw new Error(
        `Gemini discovery failed: ${
          result.message ??
          "unknown failure"
        }`,
      );
    }

    const reachedConfirmOpen =
      result.steps.some(
        (step) => {
          const action =
            step.decision.action;

          if (
            action.type !== "click"
          ) {
            return false;
          }

          return action.target
            .strategies.some(
              (strategy) => {
                if (
                  strategy.type ===
                  "role"
                ) {
                  return (
                    strategy.name
                      .trim()
                      .toUpperCase() ===
                    "CONFIRM OPEN"
                  );
                }

                if (
                  strategy.type ===
                  "text"
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
        },
      );

    if (!reachedConfirmOpen) {
      throw new Error(
        "Gemini discovery did not reach the CONFIRM OPEN boundary.",
      );
    }

    console.log(
      "GENUINE GEMINI DISCOVERY PASSED",
    );

    console.log(
      "CONFIRM OPEN was identified as the irreversible boundary.",
    );
  } finally {
    await surface.close();
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});