import { readFile } from "node:fs/promises";

import { CapabilityArtifactSchema } from "../src/artifact/schema.js";
import { ReplayEngine } from "../src/replay/replay-engine.js";
import { PlaywrightSurface } from "../src/surface/playwright/playwright-surface.js";

async function main(): Promise<void> {
  const raw = await readFile(
    "artifacts/open-savings-subaccount.v1.json",
    "utf8",
  );

  const artifact = CapabilityArtifactSchema.parse(
    JSON.parse(raw),
  );

  const startUrl = "http://localhost:4173";

  const surface =
    await PlaywrightSurface.launch(startUrl);

  try {
    const engine = new ReplayEngine(surface);

    const inputs = {
      memberId: "12345",
      product: "SAVINGS",
      openingDeposit: 25,
    };

    console.log("=== FIRST PASS: NO APPROVAL ===");

    const firstResult = await engine.replay(
      artifact,
      inputs,
    );

    console.log(
      JSON.stringify(firstResult, null, 2),
    );

    if (
      firstResult.kind !== "approval_required"
    ) {
      throw new Error(
        `Expected approval_required, received: ` +
          JSON.stringify(firstResult),
      );
    }

    console.log(
      `Paused at step: ${firstResult.stepId}`,
    );

    console.log(
      `Session: ${firstResult.checkpoint.sessionId}`,
    );

    console.log(
      `Next step index: ${firstResult.checkpoint.nextStepIndex}`,
    );

    console.log(
      "=== SECOND PASS: RESUME WITH APPROVAL ===",
    );

    const secondResult = await engine.replay(
      artifact,
      inputs,
      {
        approvedStepIds: [
          "review.confirm-open",
        ],
        checkpoint:
          firstResult.checkpoint,
      },
    );

    console.log(
      JSON.stringify(secondResult, null, 2),
    );

    if (
      secondResult.kind !== "success"
    ) {
      throw new Error(
        `Expected success after resume, received: ` +
          JSON.stringify(secondResult),
      );
    }

    const confirmationId =
      secondResult.outputs.confirmationId;

    if (
      typeof confirmationId !== "string" ||
      !confirmationId.startsWith(
        "LC-12345-",
      )
    ) {
      throw new Error(
        `Unexpected confirmationId: ${String(
          confirmationId,
        )}`,
      );
    }

    console.log(
      "SAME-SESSION RESUME PASSED",
    );
  } finally {
    await surface.close();
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});