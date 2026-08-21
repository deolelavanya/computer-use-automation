import fs from "node:fs";

import {
  CapabilityArtifactSchema,
} from "../src/artifact/schema.js";

import {
  ReplayEngine,
} from "../src/replay/replay-engine.js";

import {
  PlaywrightSurface,
} from "../src/surface/playwright/playwright-surface.js";

async function main(): Promise<void> {
  const raw = fs.readFileSync(
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

  const startUrl =
    process.env.LEGACYCORE_URL ??
    "http://localhost:4173";

  console.log("Starting deterministic replay");
  console.log(`Capability: ${artifact.identity.id}`);
  console.log(`Target: ${startUrl}`);

  const surface =
    await PlaywrightSurface.launch(startUrl);

  try {
    const engine = new ReplayEngine(surface);

    const result = await engine.replay(
  artifact,
  {
    memberId: "12345",
    product: "SAVINGS",
    openingDeposit: 25,
  },
  {
    approvedStepIds: [
      "review.confirm-open",
    ],
  },
);

    console.log("Replay result:");
    console.log(
      JSON.stringify(result, null, 2),
    );

    if (result.kind !== "success") {
      throw new Error(
        `Replay did not succeed: ${JSON.stringify(result)}`,
      );
    }

    console.log(
      "DETERMINISTIC REPLAY PASSED",
    );

    // Keep final screen visible briefly.
    await new Promise((resolve) =>
      setTimeout(resolve, 5000),
    );
  } finally {
    await surface.close();
  }
}

void main();