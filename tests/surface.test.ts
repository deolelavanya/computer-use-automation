import { PlaywrightSurface } from "../src/surface/playwright/playwright-surface.js";

async function main(): Promise<void> {
  const startUrl =
    process.env.LEGACYCORE_URL ?? "http://localhost:4173";

  console.log(`Launching LegacyCore: ${startUrl}`);

  const surface = await PlaywrightSurface.launch(startUrl);

  try {
    const observation = await surface.observe();

    console.log("Observation:");
    console.log(`URL: ${observation.url}`);
    console.log(`Title: ${observation.title}`);
    console.log(
      `Visible text contains MEMBER MAINTENANCE: ${
        observation.visibleText.includes("MEMBER MAINTENANCE")
      }`,
    );

    const target = await surface.resolveTarget({
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
    });

    console.log("Target resolved:");
    console.log(`Strategy index: ${target.strategyIndex}`);
    console.log(`Strategy type: ${target.strategyType}`);

    const result = await surface.act(
      {
        type: "fill",
        value: "12345",
      },
      target,
    );

    console.log("Action result:");
    console.log(result);

    if (!result.success) {
      throw new Error(
        result.error?.message ?? "Surface action failed",
      );
    }

    console.log("SURFACE TEST PASSED");

    // Keep the browser visible briefly so we can visually inspect it.
    await new Promise((resolve) =>
      setTimeout(resolve, 4173),
    );
  } finally {
    await surface.close();
  }
}

void main();