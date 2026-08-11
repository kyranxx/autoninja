import { describe, expect, it, vi } from "vitest";
import { configureCarsIndex, getCarsIndexSettings } from "./admin-config";

describe("getCarsIndexSettings", () => {
  it("exposes every visible refinement facet and numeric range to the search UI", () => {
    const facets = getCarsIndexSettings("cars_live").attributesForFaceting;

    expect(facets).toEqual(
      expect.arrayContaining([
        "fuel",
        "transmission",
        "body_style",
        "price_eur",
        "mileage_km",
        "year",
        "power_kw",
      ]),
    );
    expect(facets).not.toEqual(
      expect.arrayContaining([
        "filterOnly(fuel)",
        "filterOnly(transmission)",
        "filterOnly(body_style)",
      ]),
    );
  });

  it("marks market code as a filter-only facet for country-separated inventory", () => {
    expect(getCarsIndexSettings("cars_live").attributesForFaceting).toContain(
      "filterOnly(market_code)",
    );
  });

  it("marks VAT deductibility as a filter-only facet for detailed search", () => {
    expect(getCarsIndexSettings("cars_live").attributesForFaceting).toContain(
      "filterOnly(is_vat_deductible)",
    );
  });
});

describe("configureCarsIndex", () => {
  it("applies the base settings, replica rankings, and synonym batch", async () => {
    const customPut = vi.fn().mockResolvedValue({});
    const customPost = vi.fn().mockResolvedValue({});

    await configureCarsIndex(
      { customPut, customPost } as Parameters<typeof configureCarsIndex>[0],
      "cars_live",
    );

    expect(customPut).toHaveBeenCalledTimes(5);
    expect(customPut).toHaveBeenCalledWith(
      expect.objectContaining({ path: "1/indexes/cars_live/settings" }),
    );
    expect(customPost).toHaveBeenCalledWith(
      expect.objectContaining({ path: "1/indexes/cars_live/synonyms/batch" }),
    );
  });
});
