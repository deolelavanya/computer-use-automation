import { z } from "zod";

// -----------------------------------------------------------------------------
// Risk
// -----------------------------------------------------------------------------

export const RiskLevelSchema = z.enum([
  "safe",
  "reversible",
  "irreversible",
]);

// -----------------------------------------------------------------------------
// Capability contract
// -----------------------------------------------------------------------------

export const InputDefinitionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("string"),
    required: z.boolean(),
    sensitive: z.boolean().optional(),
  }),

  z.object({
    type: z.literal("enum"),
    required: z.boolean(),
    values: z.array(z.string()).min(1),
  }),

  z.object({
    type: z.literal("decimal"),
    required: z.boolean(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
  }),
]);

export const OutputDefinitionSchema = z.object({
  type: z.literal("string"),
});

export const BusinessOutcomeSchema = z.object({
  code: z.string().min(1),
  description: z.string().min(1),
});

// -----------------------------------------------------------------------------
// Target resolution
// -----------------------------------------------------------------------------

export const TargetStrategySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("role"),
    role: z.string().min(1),
    name: z.string().min(1),
  }),

  z.object({
    type: z.literal("label"),
    value: z.string().min(1),
  }),

  z.object({
    type: z.literal("text"),
    value: z.string().min(1),
  }),

  z.object({
    type: z.literal("attribute"),
    name: z.string().min(1),
    value: z.string().min(1),
  }),

  z.object({
    type: z.literal("near_text"),
    value: z.string().min(1),
  }),
]);

export const TargetSchema = z.object({
  strategies: z.array(TargetStrategySchema).min(1),
});

// -----------------------------------------------------------------------------
// Actions
// -----------------------------------------------------------------------------

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("fill"),
    value: z.string(),
  }),

  z.object({
    type: z.literal("click"),
  }),

  z.object({
    type: z.literal("select"),
    value: z.string(),
  }),

  z.object({
    type: z.literal("assert_text"),
    expected: z.string(),
  }),
]);

// -----------------------------------------------------------------------------
// Conditions
// -----------------------------------------------------------------------------

const TextVisibleConditionSchema = z.object({
  type: z.literal("text_visible"),
  value: z.string().min(1),
});

const BusinessOutcomeConditionSchema = z.object({
  type: z.literal("business_outcome"),
  code: z.string().min(1),
  whenTextVisible: z.string().min(1),
});

const TextMatchesInputConditionSchema = z.object({
  type: z.literal("text_matches_input"),
  label: z.string().min(1),
  input: z.string().min(1),
});

export const SimpleConditionSchema = z.discriminatedUnion("type", [
  TextVisibleConditionSchema,
  BusinessOutcomeConditionSchema,
  TextMatchesInputConditionSchema,
]);

const OneOfConditionSchema = z.object({
  type: z.literal("one_of"),
  conditions: z.array(SimpleConditionSchema).min(1),
});

export const ConditionSchema = z.union([
  SimpleConditionSchema,
  OneOfConditionSchema,
]);

// -----------------------------------------------------------------------------
// Steps
// -----------------------------------------------------------------------------

export const StepSchema = z.object({
  id: z.string().min(1),
  phase: z.string().min(1),
  action: ActionSchema,
  target: TargetSchema,
  risk: RiskLevelSchema.optional(),
  postconditions: z.array(ConditionSchema).optional(),
});

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

export const OutputExtractionSchema = z.object({
  name: z.string().min(1),

  extract: z.object({
    type: z.literal("text"),
    target: TargetSchema,
  }),
});

// -----------------------------------------------------------------------------
// Final checkpoint
// -----------------------------------------------------------------------------

export const SuccessCheckpointSchema = z.object({
  all: z.array(SimpleConditionSchema).min(1),
});

// -----------------------------------------------------------------------------
// Base artifact structure
// -----------------------------------------------------------------------------

const BaseCapabilityArtifactSchema = z.object({
  schemaVersion: z.literal("1.0"),

  identity: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().min(1),
  }),

  compatibility: z.object({
    application: z.string().min(1),
    surface: z.enum(["web", "desktop"]),
    vendor: z.string().min(1),
  }),

  contract: z.object({
    inputs: z.record(z.string(), InputDefinitionSchema),

    outputs: z.record(z.string(), OutputDefinitionSchema),

    businessOutcomes: z.array(BusinessOutcomeSchema),
  }),

  steps: z.array(StepSchema).min(1),

  outputs: z.array(OutputExtractionSchema),

  successCheckpoint: SuccessCheckpointSchema,
});

// -----------------------------------------------------------------------------
// Semantic validation helpers
// -----------------------------------------------------------------------------

const PARAMETER_PATTERN = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g;

function extractParameterReferences(value: string): string[] {
  return Array.from(
    value.matchAll(PARAMETER_PATTERN),
    (match) => match[1],
  );
}

function getActionParameterReferences(
  action: z.infer<typeof ActionSchema>,
): string[] {
  switch (action.type) {
    case "fill":
    case "select":
      return extractParameterReferences(action.value);

    case "assert_text":
      return extractParameterReferences(action.expected);

    case "click":
      return [];
  }
}

// -----------------------------------------------------------------------------
// Complete artifact + cross-field validation
// -----------------------------------------------------------------------------

export const CapabilityArtifactSchema =
  BaseCapabilityArtifactSchema.superRefine((artifact, ctx) => {
    const declaredInputs = new Set(
      Object.keys(artifact.contract.inputs),
    );

    const declaredOutcomes = new Set(
      artifact.contract.businessOutcomes.map(
        (outcome) => outcome.code,
      ),
    );

    const declaredOutputs = new Set(
      Object.keys(artifact.contract.outputs),
    );

    // Every {{parameter}} used by an action must refer to a declared input.
    artifact.steps.forEach((step, stepIndex) => {
      const references = getActionParameterReferences(step.action);

      for (const reference of references) {
        if (!declaredInputs.has(reference)) {
          ctx.addIssue({
            code: "custom",
            path: ["steps", stepIndex, "action"],
            message:
              `Step "${step.id}" references undeclared input ` +
              `"${reference}".`,
          });
        }
      }

      // Business outcomes used in postconditions must be declared
      // in the capability contract.
      for (const condition of step.postconditions ?? []) {
        const simpleConditions =
          condition.type === "one_of"
            ? condition.conditions
            : [condition];

        for (const simpleCondition of simpleConditions) {
          if (
            simpleCondition.type === "business_outcome" &&
            !declaredOutcomes.has(simpleCondition.code)
          ) {
            ctx.addIssue({
              code: "custom",
              path: ["steps", stepIndex, "postconditions"],
              message:
                `Step "${step.id}" references undeclared business ` +
                `outcome "${simpleCondition.code}".`,
            });
          }

          if (
            simpleCondition.type === "text_matches_input" &&
            !declaredInputs.has(simpleCondition.input)
          ) {
            ctx.addIssue({
              code: "custom",
              path: ["steps", stepIndex, "postconditions"],
              message:
                `Step "${step.id}" references undeclared input ` +
                `"${simpleCondition.input}" in a postcondition.`,
            });
          }
        }
      }
    });

    // Final checkpoint input references must also exist.
    artifact.successCheckpoint.all.forEach(
      (condition, conditionIndex) => {
        if (
          condition.type === "text_matches_input" &&
          !declaredInputs.has(condition.input)
        ) {
          ctx.addIssue({
            code: "custom",
            path: [
              "successCheckpoint",
              "all",
              conditionIndex,
              "input",
            ],
            message:
              `Success checkpoint references undeclared input ` +
              `"${condition.input}".`,
          });
        }
      },
    );

    // Every extraction must correspond to a declared output.
    artifact.outputs.forEach((output, outputIndex) => {
      if (!declaredOutputs.has(output.name)) {
        ctx.addIssue({
          code: "custom",
          path: ["outputs", outputIndex, "name"],
          message:
            `Output extraction "${output.name}" is not declared ` +
            `in contract.outputs.`,
        });
      }
    });

    // Conversely, every declared output needs an extraction rule.
    const extractedOutputs = new Set(
      artifact.outputs.map((output) => output.name),
    );

    for (const outputName of declaredOutputs) {
      if (!extractedOutputs.has(outputName)) {
        ctx.addIssue({
          code: "custom",
          path: ["contract", "outputs", outputName],
          message:
            `Declared output "${outputName}" has no extraction rule.`,
        });
      }
    }
  });

// -----------------------------------------------------------------------------
// Exported TypeScript types
// -----------------------------------------------------------------------------

export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type InputDefinition = z.infer<
  typeof InputDefinitionSchema
>;
export type TargetStrategy = z.infer<
  typeof TargetStrategySchema
>;
export type Target = z.infer<typeof TargetSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type Step = z.infer<typeof StepSchema>;
export type CapabilityArtifact = z.infer<
  typeof CapabilityArtifactSchema
>;