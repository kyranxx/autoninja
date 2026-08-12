import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type MascotAsset = { path: string; sha256: string };
type MascotManifest = {
  identityMaster: MascotAsset;
  approvedReferences: MascotAsset[];
  productionAssets: MascotAsset[];
  generationPolicy: {
    referenceImagesRequired: boolean;
    textOnlyGenerationAllowed: boolean;
    approvalRequiredBeforeProduction: boolean;
  };
};

const publicRoot = path.resolve(process.cwd(), "public");
const manifest = JSON.parse(
  readFileSync(path.join(publicRoot, "brand/autoninja/mascot-manifest.json"), "utf8"),
) as MascotManifest;

describe("AutoNinja mascot identity assets", () => {
  it.each([
    manifest.identityMaster,
    ...manifest.approvedReferences,
    ...manifest.productionAssets,
  ])(
    "keeps $path byte-for-byte locked",
    (asset) => {
      const bytes = readFileSync(path.join(publicRoot, asset.path.replace(/^\//, "")));
      const sha256 = createHash("sha256").update(bytes).digest("hex");

      expect(sha256).toBe(asset.sha256);
    },
  );

  it("requires reference-led generation and approval", () => {
    expect(manifest.generationPolicy).toMatchObject({
      referenceImagesRequired: true,
      textOnlyGenerationAllowed: false,
      approvalRequiredBeforeProduction: true,
    });
  });
});
