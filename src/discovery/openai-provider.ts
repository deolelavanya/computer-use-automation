import OpenAI from "openai";

import type {
  DiscoveryDecision,
  DiscoveryModel,
  DiscoveryTraceStep,
} from "./types.js";

export interface OpenAIDiscoveryModelOptions {
  model?: string;
}

export class OpenAIDiscoveryModel
  implements DiscoveryModel
{
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(
    options: OpenAIDiscoveryModelOptions = {},
  ) {
    this.client = new OpenAI();

    this.model =
      options.model ??
      "gpt-5.6-sol";
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
    const response =
      await this.client.responses.create({
        model: this.model,

        instructions: `
You are the discovery planner for a computer automation system.

Your job is to inspect the current application observation and choose
exactly ONE next action that advances the user's goal.

You are discovering a reusable workflow. Do not invent elements that
are not supported by the observation.

Allowed actions:

1. fill
2. click
3. select
4. finish

Targets must use ordered semantic strategies.

Prefer target strategies in this order when possible:

1. label
2. role
3. text
4. attribute
5. near_text

Use stable semantic targets rather than coordinates.

Examples:

A labeled input:

{
  "strategies": [
    {
      "type": "label",
      "value": "Member Number"
    }
  ]
}

A button:

{
  "strategies": [
    {
      "type": "role",
      "role": "button",
      "name": "FIND"
    }
  ]
}

A text fallback:

{
  "strategies": [
    {
      "type": "text",
      "value": "CONTINUE"
    }
  ]
}

Do not return secrets or hidden reasoning.

The reasoningSummary must be a short operational explanation of why
the selected action is appropriate.

Choose "finish" only when the requested goal is visibly complete.
        `.trim(),

        input: JSON.stringify({
          goal: input.goal,

          currentObservation: {
            url:
              input.observation.url,
            title:
              input.observation.title,

            /**
             * Bound observation size so an unexpectedly large page
             * does not create an unnecessarily huge model request.
             */
            visibleText:
              input.observation.visibleText.slice(
                0,
                12000,
              ),
          },

          previousSteps:
            input.history.map(
              (step) => ({
                index: step.index,
                action:
                  step.decision.action,
                success:
                  step.success,
                error:
                  step.error,
              }),
            ),
        }),

        text: {
          format: {
            type: "json_schema",
            name:
              "discovery_decision",
            strict: true,

            schema: {
              type: "object",
              additionalProperties:
                false,

              properties: {
                reasoningSummary: {
                  type: "string",
                },

                action: {
                  oneOf: [
                    {
                      type: "object",
                      additionalProperties:
                        false,

                      properties: {
                        type: {
                          type: "string",
                          const: "fill",
                        },

                        target: {
                          $ref:
                            "#/$defs/target",
                        },

                        value: {
                          type: "string",
                        },
                      },

                      required: [
                        "type",
                        "target",
                        "value",
                      ],
                    },

                    {
                      type: "object",
                      additionalProperties:
                        false,

                      properties: {
                        type: {
                          type: "string",
                          const: "click",
                        },

                        target: {
                          $ref:
                            "#/$defs/target",
                        },
                      },

                      required: [
                        "type",
                        "target",
                      ],
                    },

                    {
                      type: "object",
                      additionalProperties:
                        false,

                      properties: {
                        type: {
                          type: "string",
                          const: "select",
                        },

                        target: {
                          $ref:
                            "#/$defs/target",
                        },

                        value: {
                          type: "string",
                        },
                      },

                      required: [
                        "type",
                        "target",
                        "value",
                      ],
                    },

                    {
                      type: "object",
                      additionalProperties:
                        false,

                      properties: {
                        type: {
                          type: "string",
                          const: "finish",
                        },

                        reason: {
                          type: "string",
                        },
                      },

                      required: [
                        "type",
                        "reason",
                      ],
                    },
                  ],
                },
              },

              required: [
                "reasoningSummary",
                "action",
              ],

              $defs: {
                target: {
                  type: "object",
                  additionalProperties:
                    false,

                  properties: {
                    strategies: {
                      type: "array",
                      minItems: 1,
                      items: {
                        oneOf: [
                          {
                            type: "object",
                            additionalProperties:
                              false,

                            properties: {
                              type: {
                                type:
                                  "string",
                                const:
                                  "label",
                              },
                              value: {
                                type:
                                  "string",
                              },
                            },

                            required: [
                              "type",
                              "value",
                            ],
                          },

                          {
                            type: "object",
                            additionalProperties:
                              false,

                            properties: {
                              type: {
                                type:
                                  "string",
                                const:
                                  "role",
                              },
                              role: {
                                type:
                                  "string",
                              },
                              name: {
                                type:
                                  "string",
                              },
                            },

                            required: [
                              "type",
                              "role",
                              "name",
                            ],
                          },

                          {
                            type: "object",
                            additionalProperties:
                              false,

                            properties: {
                              type: {
                                type:
                                  "string",
                                const:
                                  "text",
                              },
                              value: {
                                type:
                                  "string",
                              },
                            },

                            required: [
                              "type",
                              "value",
                            ],
                          },

                          {
                            type: "object",
                            additionalProperties:
                              false,

                            properties: {
                              type: {
                                type:
                                  "string",
                                const:
                                  "attribute",
                              },
                              name: {
                                type:
                                  "string",
                              },
                              value: {
                                type:
                                  "string",
                              },
                            },

                            required: [
                              "type",
                              "name",
                              "value",
                            ],
                          },

                          {
                            type: "object",
                            additionalProperties:
                              false,

                            properties: {
                              type: {
                                type:
                                  "string",
                                const:
                                  "near_text",
                              },
                              value: {
                                type:
                                  "string",
                              },
                            },

                            required: [
                              "type",
                              "value",
                            ],
                          },
                        ],
                      },
                    },
                  },

                  required: [
                    "strategies",
                  ],
                },
              },
            },
          },
        },
      });

    if (!response.output_text) {
      throw new Error(
        "DISCOVERY_MODEL_EMPTY_RESPONSE",
      );
    }

    let parsed: unknown;

    try {
      parsed =
        JSON.parse(
          response.output_text,
        );
    } catch {
      throw new Error(
        "DISCOVERY_MODEL_INVALID_JSON",
      );
    }

    return parsed as DiscoveryDecision;
  }
}