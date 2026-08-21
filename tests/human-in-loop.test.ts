import { readFile } from "node:fs/promises";

import { CapabilityArtifactSchema } from "../src/artifact/schema.js";
import { ReplayEngine } from "../src/replay/replay-engine.js";
import { InterventionManager } from "../src/intervention/intervention-manager.js";
import { PlaywrightSurface } from "../src/surface/playwright/playwright-surface.js";

async function main(): Promise<void> {
  const raw = await readFile(
    "artifacts/open-savings-subaccount.v1.json",
    "utf8",
  );

  const artifact =
    CapabilityArtifactSchema.parse(
      JSON.parse(raw),
    );

  const inputs = {
    memberId: "12345",
    product: "SAVINGS",
    openingDeposit: 25,
  };

  const startUrl =
    "http://localhost:4173";

  const surface =
    await PlaywrightSurface.launch(
      startUrl,
    );

  try {
    const engine =
      new ReplayEngine(surface);

    const intervention =
      new InterventionManager(surface);

    const originalSessionId =
      surface.getSession().id;

    console.log(
      `Session: ${originalSessionId}`,
    );

    console.log(
      "=== PHASE 1: AUTOMATION ===",
    );

    /**
     * Start normally with no approval.
     *
     * Replay should execute all safe steps and stop immediately
     * before the irreversible CONFIRM OPEN action.
     */
    const firstResult =
      await engine.replay(
        artifact,
        inputs,
      );

    console.log(
      JSON.stringify(
        firstResult,
        null,
        2,
      ),
    );

    if (
      firstResult.kind !==
      "approval_required"
    ) {
      throw new Error(
        `Expected approval_required, received: ` +
          JSON.stringify(firstResult),
      );
    }

    if (
      firstResult.stepId !==
      "review.confirm-open"
    ) {
      throw new Error(
        `Unexpected approval step: ` +
          firstResult.stepId,
      );
    }

    if (
      firstResult.checkpoint.sessionId !==
      originalSessionId
    ) {
      throw new Error(
        "Replay checkpoint belongs to the wrong session",
      );
    }

    console.log(
      "Automation paused before irreversible action.",
    );

    console.log(
      "=== PHASE 2: REQUEST HUMAN INTERVENTION ===",
    );

    const request =
      await intervention.requestIntervention(
        firstResult.stepId,
        "Human review required before irreversible account opening.",
      );

    console.log(
      JSON.stringify(
        request,
        null,
        2,
      ),
    );

    if (
      intervention.getState() !==
      "INTERVENTION_REQUIRED"
    ) {
      throw new Error(
        "Expected INTERVENTION_REQUIRED",
      );
    }

    if (
      request.sessionId !==
      originalSessionId
    ) {
      throw new Error(
        "Intervention request changed browser session",
      );
    }

    console.log(
      "=== PHASE 3: HUMAN CONTROL ===",
    );

    const humanSession =
      intervention.beginHumanControl();

    console.log(
      JSON.stringify(
        humanSession,
        null,
        2,
      ),
    );

    if (
      intervention.getState() !==
      "HUMAN_CONTROL"
    ) {
      throw new Error(
        "Expected HUMAN_CONTROL",
      );
    }

    if (
      humanSession.sessionId !==
      originalSessionId
    ) {
      throw new Error(
        "Human control is not using the original session",
      );
    }

    /**
     * At this point the visible Playwright browser remains open.
     *
     * In production, this is where an operator could inspect or
     * interact with the live application before returning control.
     *
     * The automated test does not click CONFIRM OPEN manually,
     * because we want ReplayEngine to retain ownership of the
     * irreversible capability action after explicit approval.
     */
    console.log(
      "Human controls the SAME live browser.",
    );

    console.log(
      "Human reviews the account details.",
    );

    console.log(
      "=== PHASE 4: RETURN CONTROL ===",
    );

    const resolution =
      await intervention.resumeAutomation(
        "Operator reviewed account details and approved automation resume.",
      );

    console.log(
      JSON.stringify(
        resolution,
        null,
        2,
      ),
    );

    if (
      intervention.getState() !==
      "AUTOMATION_CONTROL"
    ) {
      throw new Error(
        "Expected AUTOMATION_CONTROL after human handoff",
      );
    }

    if (
      resolution.sessionId !==
      originalSessionId
    ) {
      throw new Error(
        "Session changed while returning control",
      );
    }

    /**
     * Verify the live surface itself still reports the exact same
     * session before replay resumes.
     */
    if (
      surface.getSession().id !==
      originalSessionId
    ) {
      throw new Error(
        "Browser session changed before replay resume",
      );
    }

    console.log(
      "=== PHASE 5: APPROVED RESUME ===",
    );

    /**
     * Resume from the checkpoint produced by the first replay.
     *
     * Explicit approval is supplied only for the irreversible step.
     */
    const finalResult =
      await engine.replay(
        artifact,
        inputs,
        {
          approvedStepIds: [
            firstResult.stepId,
          ],
          checkpoint:
            firstResult.checkpoint,
        },
      );

    console.log(
      JSON.stringify(
        finalResult,
        null,
        2,
      ),
    );

    if (
      finalResult.kind !==
      "success"
    ) {
      throw new Error(
        `Expected successful replay after human handoff, received: ` +
          JSON.stringify(finalResult),
      );
    }

    const confirmationId =
      finalResult.outputs.confirmationId;

    if (
      typeof confirmationId !==
        "string" ||
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

    /**
     * Final same-session assertion.
     */
    if (
      surface.getSession().id !==
      originalSessionId
    ) {
      throw new Error(
        "Browser session changed during end-to-end flow",
      );
    }

    console.log(
      `Confirmation: ${confirmationId}`,
    );

    console.log(
      "END-TO-END HUMAN-IN-THE-LOOP PASSED",
    );
  } finally {
    await surface.close();
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});