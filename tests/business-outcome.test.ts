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

    const result = await engine.replay(
      artifact,
      {
        memberId: "99999",
        product: "SAVINGS",
        openingDeposit: 25,
      },
    );

    console.log("Business outcome result:");
    console.log(
      JSON.stringify(result, null, 2),
    );

    if (
      result.kind !== "business_outcome" ||
      result.code !== "MEMBER_NOT_FOUND"
    ) {
      throw new Error(
        `Expected MEMBER_NOT_FOUND but received: ${JSON.stringify(
          result,
        )}`,
      );
    }

    console.log(
      "MEMBER_NOT_FOUND BUSINESS OUTCOME PASSED",
    );
  } finally {
    await surface.close();
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});