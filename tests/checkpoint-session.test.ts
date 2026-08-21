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

  const inputs = {
    memberId: "12345",
    product: "SAVINGS",
    openingDeposit: 25,
  };

  const startUrl = "http://localhost:4173";

  console.log("=== SESSION A ===");

  const surfaceA =
    await PlaywrightSurface.launch(startUrl);

  let checkpoint;

  try {
    const engineA =
      new ReplayEngine(surfaceA);

    const resultA =
      await engineA.replay(
        artifact,
        inputs,
      );

    if (
      resultA.kind !==
      "approval_required"
    ) {
      throw new Error(
        `Expected approval_required, received: ` +
          JSON.stringify(resultA),
      );
    }

    checkpoint =
      resultA.checkpoint;

    console.log(
      `Checkpoint session: ${checkpoint.sessionId}`,
    );
  } finally {
    await surfaceA.close();
  }

  console.log("=== SESSION B ===");

  const surfaceB =
    await PlaywrightSurface.launch(startUrl);

  try {
    const engineB =
      new ReplayEngine(surfaceB);

    console.log(
      `Current session: ${surfaceB.getSession().id}`,
    );

    const resultB =
      await engineB.replay(
        artifact,
        inputs,
        {
          approvedStepIds: [
            "review.confirm-open",
          ],
          checkpoint,
        },
      );

    console.log(
      JSON.stringify(
        resultB,
        null,
        2,
      ),
    );

    if (
      resultB.kind !== "failure"
    ) {
      throw new Error(
        `Expected failure, received: ` +
          JSON.stringify(resultB),
      );
    }

    if (
      resultB.error.code !==
      "CHECKPOINT_SESSION_MISMATCH"
    ) {
      throw new Error(
        `Expected CHECKPOINT_SESSION_MISMATCH, received: ` +
          resultB.error.code,
      );
    }

    console.log(
      "CROSS-SESSION CHECKPOINT REJECTED",
    );

    console.log(
      "CHECKPOINT SESSION SAFETY PASSED",
    );
  } finally {
    await surfaceB.close();
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});