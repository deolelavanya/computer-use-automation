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

    /**
     * Deliberately provide NO approval.
     */
    const result = await engine.replay(
      artifact,
      {
        memberId: "12345",
        product: "SAVINGS",
        openingDeposit: 25,
      },
    );

    console.log("Approval gate result:");
    console.log(
      JSON.stringify(result, null, 2),
    );

    if (
      result.kind !== "approval_required" ||
      result.stepId !== "review.confirm-open"
    ) {
      throw new Error(
        `Expected approval_required for ` +
          `review.confirm-open, received: ` +
          JSON.stringify(result),
      );
    }

    console.log(
      "IRREVERSIBLE ACTION SAFETY GATE PASSED",
    );
  } finally {
    await surface.close();
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});