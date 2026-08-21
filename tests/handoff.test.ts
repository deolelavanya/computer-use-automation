import { PlaywrightSurface } from "../src/surface/playwright/playwright-surface.js";
import { InterventionManager } from "../src/intervention/intervention-manager.js";

async function main(): Promise<void> {
  const surface =
    await PlaywrightSurface.launch(
      "http://localhost:4173",
    );

  try {
    const manager =
      new InterventionManager(surface);

    console.log(
      `Initial state: ${manager.getState()}`,
    );

    if (
      manager.getState() !==
      "AUTOMATION_CONTROL"
    ) {
      throw new Error(
        "Expected initial AUTOMATION_CONTROL",
      );
    }

    const request =
      await manager.requestIntervention(
        "review.confirm-open",
        "Human approval required before irreversible action",
      );

    console.log(
      `After request: ${manager.getState()}`,
    );

    console.log(
      JSON.stringify(request, null, 2),
    );

    if (
      manager.getState() !==
      "INTERVENTION_REQUIRED"
    ) {
      throw new Error(
        "Expected INTERVENTION_REQUIRED",
      );
    }

    if (
      request.sessionId !==
      surface.getSession().id
    ) {
      throw new Error(
        "Intervention request has wrong session ID",
      );
    }

    const human =
      manager.beginHumanControl();

    console.log(
      `After human takeover: ${manager.getState()}`,
    );

    console.log(
      JSON.stringify(human, null, 2),
    );

    if (
      manager.getState() !==
      "HUMAN_CONTROL"
    ) {
      throw new Error(
        "Expected HUMAN_CONTROL",
      );
    }

    if (
      human.stepId !==
      "review.confirm-open"
    ) {
      throw new Error(
        "Human-control session lost the step ID",
      );
    }

    /**
     * The browser remains open here.
     *
     * In the real workflow this is the period during which the
     * operator can interact with the SAME visible browser.
     */
    console.log(
      "Human now controls the same live browser session.",
    );

    const resolution =
      await manager.resumeAutomation(
        "Operator reviewed the account details and returned control.",
      );

    console.log(
      `After resume: ${manager.getState()}`,
    );

    console.log(
      JSON.stringify(
        resolution,
        null,
        2,
      ),
    );

    if (
      manager.getState() !==
      "AUTOMATION_CONTROL"
    ) {
      throw new Error(
        "Expected AUTOMATION_CONTROL after resume",
      );
    }

    if (
      resolution.sessionId !==
      request.sessionId
    ) {
      throw new Error(
        "Session changed during human handoff",
      );
    }

    if (
      resolution.stepId !==
      request.stepId
    ) {
      throw new Error(
        "Step changed during human handoff",
      );
    }

    console.log(
      "SAME-SESSION HUMAN HANDOFF PASSED",
    );
  } finally {
    await surface.close();
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});