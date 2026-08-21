import {
  GoogleGenAI,
} from "@google/genai";

import type {
  DiscoveryDecision,
  DiscoveryModel,
  DiscoveryTraceStep,
} from "./types.js";

export interface GeminiDiscoveryModelOptions {
  model?: string;
}

type GeminiDecision = {
  reasoningSummary: string;

  actionType:
    | "fill"
    | "click"
    | "select"
    | "finish";

  value: string;
  reason: string;

  targetType:
    | "label"
    | "role"
    | "text"
    | "attribute"
    | "near_text"
    | "none";

  targetValue: string;
  targetRole: string;
  targetName: string;
  attributeName: string;
};

export class GeminiDiscoveryModel
  implements DiscoveryModel
{
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor(
    options: GeminiDiscoveryModelOptions = {},
  ) {
    const apiKey =
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set.",
      );
    }

    this.ai =
      new GoogleGenAI({
        apiKey,
      });

    this.model =
      options.model ??
      "gemini-3.5-flash-lite";
  }

  async decide(input: {
    goal: string;

    observation: {
      url?: string;
      title?: string;
      visibleText: string;
    };

    history: DiscoveryTraceStep[];
  }): Promise<DiscoveryDecision> {
    const prompt = `
You are the discovery planner for a computer automation system.

Choose exactly ONE next action based only on the CURRENT visible
application state.

GOAL:
${input.goal}

CURRENT URL:
${input.observation.url ?? ""}

CURRENT TITLE:
${input.observation.title ?? ""}

CURRENT VISIBLE TEXT:
${input.observation.visibleText.slice(0, 12000)}

PREVIOUS STEPS:
${JSON.stringify(
  input.history.map((step) => ({
    index: step.index,
    action: step.decision.action,
    success: step.success,
    error: step.error,
  })),
  null,
  2,
)}

RULES:

- Choose exactly one action.
- Allowed actions: fill, click, select, finish.
- Never invent a control that is not supported by the current
  observation.
- Do not skip intermediate screens.
- Re-evaluate the current page after every action.
- Prefer semantic targets.
- Never use screen coordinates.
- Keep reasoningSummary short and operational.
- Do not expose hidden chain-of-thought.

Target preference:

1. label
2. role
3. text
4. attribute
5. near_text

Examples:

For Member Number:
targetType = "label"
targetValue = "Member Number"

For a FIND button:
targetType = "role"
targetRole = "button"
targetName = "FIND"

For visible F2 ACCOUNTS text:
targetType = "text"
targetValue = "F2 ACCOUNTS"

For an input whose stable HTML name is fld_22:
targetType = "attribute"
attributeName = "name"
targetValue = "fld_22"

IMPORTANT SAFETY RULE:

If CONFIRM OPEN is visible and is the next action required, return a
click decision targeting CONFIRM OPEN.

Do NOT return finish merely because the review page has been reached.

The surrounding discovery harness will recognize CONFIRM OPEN as an
irreversible boundary and stop BEFORE executing that click.

For unused output fields, return empty strings.

For finish:
- actionType = "finish"
- targetType = "none"
- reason must explain why the goal is complete.
    `.trim();

    const response =
      await this.ai.models.generateContent({
        model: this.model,

        contents: prompt,

        config: {
          responseMimeType:
            "application/json",

          responseSchema: {
            type: "object",

            properties: {
              reasoningSummary: {
                type: "string",
              },

              actionType: {
                type: "string",
                enum: [
                  "fill",
                  "click",
                  "select",
                  "finish",
                ],
              },

              value: {
                type: "string",
              },

              reason: {
                type: "string",
              },

              targetType: {
                type: "string",
                enum: [
                  "label",
                  "role",
                  "text",
                  "attribute",
                  "near_text",
                  "none",
                ],
              },

              targetValue: {
                type: "string",
              },

              targetRole: {
                type: "string",
              },

              targetName: {
                type: "string",
              },

              attributeName: {
                type: "string",
              },
            },

            required: [
              "reasoningSummary",
              "actionType",
              "value",
              "reason",
              "targetType",
              "targetValue",
              "targetRole",
              "targetName",
              "attributeName",
            ],
          },
        },
      });

    if (!response.text) {
      throw new Error(
        "GEMINI_DISCOVERY_EMPTY_RESPONSE",
      );
    }

    let parsed: GeminiDecision;

    try {
      parsed =
        JSON.parse(
          response.text,
        ) as GeminiDecision;
    } catch {
      throw new Error(
        "GEMINI_DISCOVERY_INVALID_JSON",
      );
    }

    return this.toDiscoveryDecision(
      parsed,
    );
  }

  private toDiscoveryDecision(
    decision: GeminiDecision,
  ): DiscoveryDecision {
    if (
      decision.actionType === "finish"
    ) {
      return {
        reasoningSummary:
          decision.reasoningSummary,

        action: {
          type: "finish",

          reason:
            decision.reason ||
            "Discovery goal complete.",
        },
      };
    }

    const target =
      this.buildTarget(decision);

    switch (decision.actionType) {
      case "fill":
        return {
          reasoningSummary:
            decision.reasoningSummary,

          action: {
            type: "fill",
            value:
              decision.value,
            target,
          },
        };

      case "click":
        return {
          reasoningSummary:
            decision.reasoningSummary,

          action: {
            type: "click",
            target,
          },
        };

      case "select":
        return {
          reasoningSummary:
            decision.reasoningSummary,

          action: {
            type: "select",
            value:
              decision.value,
            target,
          },
        };
    }
  }

  private buildTarget(
    decision: GeminiDecision,
  ) {
    switch (decision.targetType) {
      case "label":
        return {
          strategies: [
            {
              type:
                "label" as const,

              value:
                decision.targetValue,
            },
          ],
        };

      case "role":
        return {
          strategies: [
            {
              type:
                "role" as const,

              role:
                decision.targetRole,

              name:
                decision.targetName,
            },
          ],
        };

      case "text":
        return {
          strategies: [
            {
              type:
                "text" as const,

              value:
                decision.targetValue,
            },
          ],
        };

      case "attribute":
        return {
          strategies: [
            {
              type:
                "attribute" as const,

              name:
                decision.attributeName,

              value:
                decision.targetValue,
            },
          ],
        };

      case "near_text":
        return {
          strategies: [
            {
              type:
                "near_text" as const,

              value:
                decision.targetValue,
            },
          ],
        };

      case "none":
        throw new Error(
          "GEMINI_DISCOVERY_TARGET_REQUIRED",
        );
    }
  }
}