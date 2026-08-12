import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEO_CONFIG } from "@/config/config";
import { getMarketConfig } from "@/config/markets";
import BrandModelCityPage, { generateMetadata } from "./page";

const mocks = vi.hoisted(() => ({
  eastCitySlug: ["ko", "sice"].join(""),
  getSeoInventoryListings: vi.fn(),
  getBrandTaxonomy: vi.fn(),
  getModelTaxonomy: vi.fn(),
  getRequestMarketConfig: vi.fn(),
  getCityTaxonomy: vi.fn(),
  hasModelForBrand: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/components/BreadcrumbTrail", () => ({
  BreadcrumbTrail: () => null,
}));

vi.mock("@/lib/market/request", () => ({
  getRequestMarketConfig: mocks.getRequestMarketConfig,
}));

vi.mock("@/lib/seo/inventory", () => ({
  getSeoInventoryListings: mocks.getSeoInventoryListings,
}));

vi.mock("@/lib/seo/programmatic-taxonomy", () => ({
  SEO_CITIES: {
    bratislava: { name: "Bratislava", region: "Bratislavský kraj" },
    [mocks.eastCitySlug]: { name: "Košice", region: "Košický kraj" },
  },
  getBrandTaxonomy: mocks.getBrandTaxonomy,
  getCityTaxonomy: mocks.getCityTaxonomy,
  getModelTaxonomy: mocks.getModelTaxonomy,
  hasModelForBrand: mocks.hasModelForBrand,
}));

function cityParams() {
  return Promise.resolve({
    brand: "skoda",
    model: "octavia",
    city: "bratislava",
  });
}

function listing(index: number) {
  return {
    id: `ad-${index}`,
    brand: "Škoda",
    model: "Octavia",
    year: 2020,
    priceEur: 12000,
    mileageKm: 90000,
    fuel: "Benzín",
    city: "Bratislava",
    image: "/placeholder-car.jpg",
  };
}

describe("BrandModelCityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBrandTaxonomy.mockResolvedValue({
      name: "Škoda",
      slug: "skoda",
      models: [{ name: "Octavia", slug: "octavia", isCityIndexable: true }],
    });
    mocks.getModelTaxonomy.mockResolvedValue({
      name: "Octavia",
      slug: "octavia",
      isCityIndexable: true,
    });
    mocks.getCityTaxonomy.mockReturnValue({
      name: "Bratislava",
      region: "Bratislavský kraj",
    });
    mocks.hasModelForBrand.mockResolvedValue(true);
    mocks.getSeoInventoryListings.mockResolvedValue([]);
    mocks.getRequestMarketConfig.mockResolvedValue(getMarketConfig("SK"));
  });

  it("returns a real not-found result below the city inventory threshold", async () => {
    await expect(
      generateMetadata({ params: cityParams() }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("does not link unqualified sibling city pSEO pages", async () => {
    mocks.getSeoInventoryListings.mockResolvedValue(
      Array.from({ length: SEO_CONFIG.sitemapCityPageMinActiveAds }, (_, index) =>
        listing(index),
      ),
    );

    const page = await BrandModelCityPage({ params: cityParams() });
    const { container } = render(page);

    expect(
      container.querySelector(`a[href="/skoda/octavia/${mocks.eastCitySlug}"]`),
    ).toBeNull();
  });

  it("does not render city pSEO pages below the launch inventory threshold", async () => {
    await expect(
      BrandModelCityPage({ params: cityParams() }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.getSeoInventoryListings).toHaveBeenCalledWith({
      marketCode: "SK",
      brandName: "Škoda",
      modelName: "Octavia",
      cityName: "Bratislava",
      limit: SEO_CONFIG.sitemapCityPageMinActiveAds,
    });
  });
});
