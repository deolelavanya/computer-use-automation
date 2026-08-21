import fs from "node:fs";
import path from "node:path";

import { CapabilityArtifactSchema } from "../src/artifact/schema.js";

const artifactPath = path.resolve(
  "artifacts/open-savings-subaccount.v1.json"
);

const raw = fs.readFileSync(artifactPath, "utf8");
const json: unknown = JSON.parse(raw);

const result = CapabilityArtifactSchema.safeParse(json);

if (!result.success) {
  console.error("Artifact validation failed");
  console.error(result.error.issues);
  throw new Error("Artifact validation failed");
} else {
  const artifact = result.data;

  console.log("Artifact is valid");
  console.log(`Capability: ${artifact.identity.id}`);
  console.log(`Version: ${artifact.identity.version}`);
  console.log(`Steps: ${artifact.steps.length}`);
}