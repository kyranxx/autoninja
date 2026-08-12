import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMarketConfig } from "@/config/markets";
import BrandModelPage, { generateMetadata } from "./page";

const mocks = vi.hoisted(() => ({
  eastCitySlug: ["ko", "sice"].join(""),
  getSeoInventoryListings: vi.fn(),
  getBrandTaxonomy: vi.fn(),
  getCityTaxonomy: vi.fn(),
  getModelTaxonomy: vi.fn(),
  getRequestMarketConfig: vi.fn(),
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
  SEO_CITY_SLUGS: ["bratislava", mocks.eastCitySlug],
  getAllSeoBrandModelPairs: vi.fn(),
  getBrandTaxonomy: mocks.getBrandTaxonomy,
  getCityTaxonomy: mocks.getCityTaxonomy,
  getModelTaxonomy: mocks.getModelTaxonomy,
  hasModelForBrand: mocks.hasModelForBrand,
}));

describe("BrandModelPage", () => {
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
    mocks.getCityTaxonomy.mockImplementation((city: string) => ({
      name: city === mocks.eastCitySlug ? "Košice" : "Bratislava",
      region: city === mocks.eastCitySlug ? "Košický kraj" : "Bratislavský kraj",
    }));
    mocks.hasModelForBrand.mockResolvedValue(true);
    mocks.getSeoInventoryListings.mockResolvedValue([]);
    mocks.getRequestMarketConfig.mockResolvedValue(getMarketConfig("SK"));
  });

  it("keeps Romanian model metadata and canonical on the .ro market", async () => {
    mocks.getRequestMarketConfig.mockResolvedValue(getMarketConfig("RO"));
    mocks.getBrandTaxonomy.mockResolvedValue({
      name: "Porsche",
      slug: "porsche",
      models: [{ name: "911", slug: "911", isCityIndexable: true }],
    });
    mocks.getModelTaxonomy.mockResolvedValue({
      name: "911",
      slug: "911",
      isCityIndexable: true,
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ brand: "porsche", model: "911" }),
    });

    expect(metadata).toMatchObject({
      title: "Porsche 911 | Mașini de vânzare în România | AutoNinja",
      alternates: {
        canonical: "https://www.autoninja.ro/porsche/911",
      },
      openGraph: {
        locale: "ro_RO",
        url: "https://www.autoninja.ro/porsche/911",
      },
    });
    expect(metadata.keywords).toContain("Porsche 911 de vânzare");
  });

  it("returns a real not-found result for an unknown model", async () => {
    mocks.getModelTaxonomy.mockResolvedValue(null);
    mocks.hasModelForBrand.mockResolvedValue(false);

    await expect(
      generateMetadata({
        params: Promise.resolve({
          brand: "volkswagen",
          model: "unknown-model",
        }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("does not link city pSEO pages before launch inventory qualifies them", async () => {
    const page = await BrandModelPage({
      params: Promise.resolve({ brand: "skoda", model: "octavia" }),
    });
    const { container } = render(page);

    expect(container.querySelector('a[href="/skoda/octavia/bratislava"]')).toBeNull();
    expect(
      container.querySelector(`a[href="/skoda/octavia/${mocks.eastCitySlug}"]`),
    ).toBeNull();
  });
});
