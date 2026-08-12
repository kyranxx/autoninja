import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import skMessages from "@/i18n/messages/sk.json";
import { MarketProvider } from "@/context/MarketContext";
import { CarHit } from "@/components/search/CarHit";
import { MARKETPLACE_LISTING_FIXTURES } from "./fixtures/marketplace-listings";

describe("marketplace listing QA fixtures", () => {
  it("covers realistic body, fuel, promotion, price, mileage, and title extremes", () => {
    expect(new Set(MARKETPLACE_LISTING_FIXTURES.map((item) => item.body_style)).size).toBe(6);
    expect(new Set(MARKETPLACE_LISTING_FIXTURES.map((item) => item.fuel)).size).toBeGreaterThanOrEqual(4);
    expect(MARKETPLACE_LISTING_FIXTURES.some((item) => item.is_top_ad)).toBe(true);
    expect(MARKETPLACE_LISTING_FIXTURES.some((item) => item.is_highlighted)).toBe(true);
    expect(Math.min(...MARKETPLACE_LISTING_FIXTURES.map((item) => item.price_eur))).toBeLessThan(5_000);
    expect(Math.max(...MARKETPLACE_LISTING_FIXTURES.map((item) => item.mileage_km))).toBeGreaterThan(200_000);
    expect(MARKETPLACE_LISTING_FIXTURES.some((item) => `${item.brand} ${item.model}`.length > 35)).toBe(true);
  });

  it.each(["grid", "list"] as const)("renders every fixture in %s view", (viewMode) => {
    render(
      <NextIntlClientProvider locale="sk" messages={skMessages}>
        <MarketProvider marketCode="SK">
          <div>
            {MARKETPLACE_LISTING_FIXTURES.map((fixture) => (
              <CarHit key={fixture.objectID} hit={fixture} viewMode={viewMode} />
            ))}
          </div>
        </MarketProvider>
      </NextIntlClientProvider>,
    );

    for (const fixture of MARKETPLACE_LISTING_FIXTURES) {
      expect(screen.getAllByText(`${fixture.brand} ${fixture.model}`).length).toBeGreaterThan(0);
    }
  });
});
