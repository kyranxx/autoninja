import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HOME_THEME } from "@/components/home/theme";
import { BRAND_THEME } from "@/lib/theme/brand";

const GLOBAL_CSS = readFileSync(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");

function getHexToken(tokenName: string): string {
  const escapedToken = tokenName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = GLOBAL_CSS.match(new RegExp(`${escapedToken}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`));

  if (!match) {
    throw new Error(`Unable to resolve token "${tokenName}" from src/app/globals.css`);
  }

  return match[1].toLowerCase();
}

describe("brand theme token sync", () => {
  it("locks the approved AutoNinja orange brand accent", () => {
    expect(BRAND_THEME.accent).toBe("#F45B00");
    expect(BRAND_THEME.accentHover).toBe("#E85A00");
    expect(BRAND_THEME.accentForeground).toBe("#111317");
    expect(BRAND_THEME.accentText).toBe(BRAND_THEME.accent);
    expect(BRAND_THEME.accentTextHover).toBe(BRAND_THEME.accentHover);
  });

  it("does not introduce contrast-substitute oranges outside the approved palette", () => {
    expect(GLOBAL_CSS).not.toContain("--color-brand-accent-on-light");
    expect(GLOBAL_CSS).not.toContain("--color-brand-accent-on-dark");
    expect(GLOBAL_CSS.toLowerCase()).not.toContain("#c2410c");
    expect(GLOBAL_CSS.toLowerCase()).not.toContain("#ffb46a");
  });

  it("keeps the shared TypeScript theme aligned with global CSS tokens", () => {
    expect(getHexToken("--color-primary")).toBe(BRAND_THEME.primary.toLowerCase());
    expect(getHexToken("--color-primary-hover")).toBe(BRAND_THEME.primaryHover.toLowerCase());
    expect(getHexToken("--color-primary-foreground")).toBe(
      BRAND_THEME.primaryForeground.toLowerCase(),
    );
    expect(getHexToken("--color-accent")).toBe(BRAND_THEME.accent.toLowerCase());
    expect(getHexToken("--color-accent-hover")).toBe(BRAND_THEME.accentHover.toLowerCase());
    expect(getHexToken("--color-accent-foreground")).toBe(
      BRAND_THEME.accentForeground.toLowerCase(),
    );
    expect(getHexToken("--color-accent-subtle")).toBe(
      BRAND_THEME.accentSubtle.toLowerCase(),
    );
    expect(getHexToken("--color-accent-text")).toBe(BRAND_THEME.accentText.toLowerCase());
    expect(getHexToken("--color-accent-text-hover")).toBe(
      BRAND_THEME.accentTextHover.toLowerCase(),
    );
    expect(getHexToken("--color-mint")).toBe(BRAND_THEME.mint.toLowerCase());
    expect(getHexToken("--color-background-muted")).toBe(BRAND_THEME.softSurface.toLowerCase());
    expect(getHexToken("--color-success")).toBe(BRAND_THEME.success.toLowerCase());
    expect(getHexToken("--color-error")).toBe(BRAND_THEME.error.toLowerCase());
  });

  it("keeps homepage theme values pinned to the shared brand palette", () => {
    expect(HOME_THEME.brand).toBe(BRAND_THEME.success);
    expect(HOME_THEME.link).toBe(BRAND_THEME.success);
    expect(HOME_THEME.cta).toBe(BRAND_THEME.accent);
    expect(HOME_THEME.ctaText).toBe(BRAND_THEME.accentForeground);
    expect(HOME_THEME.softSurface).toBe(BRAND_THEME.softSurface);
  });
});
