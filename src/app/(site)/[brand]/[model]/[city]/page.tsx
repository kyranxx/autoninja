import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { SEO_CONFIG } from "@/config/config";
import {
  InventoryEmptyState,
  InventoryMarketSummary,
  InventorySearchCta,
  ProgrammaticBreadcrumbs,
} from "@/components/seo/ProgrammaticInventorySections";
import { SeoListingCard } from "@/components/seo/SeoListingCard";
import { getSeoInventoryListings } from "@/lib/seo/inventory";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import {
  buildInventorySearchHref,
  buildProgrammaticMetadata,
  createInventoryItemListJsonLd,
  summarizeInventory,
} from "@/lib/seo/programmatic-inventory";
import {
  getBrandTaxonomy,
  getCityTaxonomy,
  hasModelForBrand,
  getModelTaxonomy,
} from "@/lib/seo/programmatic-taxonomy";
import { getRequestMarketConfig } from "@/lib/market/request";
import { getMarketPath } from "@/lib/routes";
import { getPublicMarketCopy } from "@/lib/market/public-copy";
import type { MarketCode } from "@/config/markets";

// City taxonomy pages are inventory-gated and should render only when a
// qualifying request arrives; do not spend build time on catalogue samples.
export const dynamic = "force-dynamic";

const CITY_PAGE_MIN_ACTIVE_ADS = SEO_CONFIG.sitemapCityPageMinActiveAds;

async function getLaunchCityInventory({
  marketCode,
  brandName,
  modelName,
  cityName,
}: {
  marketCode: MarketCode;
  brandName: string;
  modelName: string;
  cityName: string;
}) {
  return getSeoInventoryListings({
    marketCode,
    brandName,
    modelName,
    cityName,
    limit: CITY_PAGE_MIN_ACTIVE_ADS,
  });
}

function getBrandModelCityPageCopy(
  marketCode: MarketCode,
  brandName: string,
  modelName: string,
  cityName: string,
  region: string,
) {
  if (marketCode === "RO") {
    return {
      notFound: "Nu a fost găsit",
      description: `${brandName} ${modelName} de vânzare în ${cityName} și împrejurimi (${region}). Compară ofertele disponibile pe AutoNinja.`,
      keywords: [
        `${brandName} ${modelName} ${cityName}`,
        `${brandName} ${modelName} ${region}`,
        `${brandName} de vânzare ${cityName}`,
        `${modelName} second hand ${cityName}`,
        `${brandName} ${modelName} autobazar`,
      ],
      openGraphTitle: `${brandName} ${modelName} de vânzare - ${cityName} | AutoNinja`,
      twitterTitle: `${brandName} ${modelName} în ${cityName} | AutoNinja`,
      twitterDescription: `Compară anunțuri ${brandName} ${modelName} în ${region}.`,
      listName: `${brandName} ${modelName} în ${cityName} - anunțuri`,
      intro: `Anunțuri actuale ${brandName} ${modelName} în ${cityName} și în regiunea ${region}. Vânzătorii din zonă pot oferi vizionare personală.`,
      ctaTitle: `Vrei o selecție mai largă pentru ${brandName} ${modelName}?`,
      ctaDescription: `Deschide căutarea completă și compară mai multe anunțuri, filtre și variante de preț pentru ${cityName}.`,
      emptyMessage: `Momentan nu avem ${brandName} ${modelName} în zona ${cityName}.`,
      summaryTitle: `Privire rapidă asupra pieței în ${cityName}`,
      availableLabel: "Anunțuri disponibile pe pagină",
      averagePriceLabel: "Preț mediu",
      newestYearLabel: "Cel mai nou an de model",
    };
  }

  return {
    notFound: "Nenájdené",
    description: `${brandName} ${modelName} na predaj v ${cityName} a okolí (${region}). Porovnajte dostupné ponuky na AutoNinja.`,
    keywords: [
      `${brandName} ${modelName} ${cityName}`,
      `${brandName} ${modelName} ${region}`,
      `predaj ${brandName} ${cityName}`,
      `${modelName} bazar ${cityName}`,
      `${brandName} ${modelName} autobazar`,
    ],
    openGraphTitle: `${brandName} ${modelName} na predaj - ${cityName} | AutoNinja`,
    twitterTitle: `${brandName} ${modelName} v ${cityName} | AutoNinja`,
    twitterDescription: `Porovnajte ponuky ${brandName} ${modelName} v ${region}.`,
    listName: `${brandName} ${modelName} v ${cityName} - ponuky`,
    intro: `Aktuálne ponuky ${brandName} ${modelName} v meste ${cityName} a v regióne ${region}. Predajcovia z regiónu môžu ponúknuť možnosť osobnej obhliadky.`,
    ctaTitle: `Chcete širší výber pre ${brandName} ${modelName}?`,
    ctaDescription: `Otvorte kompletné vyhľadávanie a porovnajte viac ponúk, filtrov a cenových variantov pre lokalitu ${cityName}.`,
    emptyMessage: `Momentálne nemáme ${brandName} ${modelName} v okolí ${cityName}.`,
    summaryTitle: `Rýchly prehľad trhu v lokalite ${cityName}`,
    availableLabel: "Dostupné ponuky na stránke",
    averagePriceLabel: "Priemerná cena",
    newestYearLabel: "Najnovší modelový rok",
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ brand: string; model: string; city: string }>;
}): Promise<Metadata> {
  const { brand, model, city } = await params;
  const [brandData, modelData, market] = await Promise.all([
    getBrandTaxonomy(brand),
    getModelTaxonomy(brand, model),
    getRequestMarketConfig(),
  ]);
  const marketCopy = getPublicMarketCopy(market);
  const cityData = getCityTaxonomy(city);

  if (!brandData || !modelData || !(await hasModelForBrand(brand, model)) || !cityData) {
    notFound();
  }

  const brandName = brandData.name;
  const modelName = modelData.name;
  const cityName = cityData.name;
  const cars = await getLaunchCityInventory({
    marketCode: market.code,
    brandName,
    modelName,
    cityName,
  });

  if (cars.length < CITY_PAGE_MIN_ACTIVE_ADS) {
    notFound();
  }
  const copy = getBrandModelCityPageCopy(
    market.code,
    brandName,
    modelName,
    cityName,
    cityData.region,
  );

  return buildProgrammaticMetadata({
    title: `${brandName} ${modelName} ${cityName} | ${market.brandName}`,
    description: copy.description,
    keywords: copy.keywords,
    canonicalPath: `/${brand}/${model}/${city}`,
    openGraphTitle: copy.openGraphTitle,
    twitterTitle: copy.twitterTitle,
    twitterDescription: copy.twitterDescription,
    siteUrl: market.origin,
    siteName: market.brandName,
    openGraphLocale: marketCopy.openGraphLocale,
  });
}

export default async function BrandModelCityPage({
  params,
}: {
  params: Promise<{ brand: string; model: string; city: string }>;
}) {
  const { brand, model, city } = await params;
  const [brandData, modelData] = await Promise.all([
    getBrandTaxonomy(brand),
    getModelTaxonomy(brand, model),
  ]);
  const cityData = getCityTaxonomy(city);

  if (!brandData || !modelData || !(await hasModelForBrand(brand, model)) || !cityData) {
    notFound();
  }

  const brandName = brandData.name;
  const modelName = modelData.name;
  const cityName = cityData.name;
  const market = await getRequestMarketConfig();
  const marketCopy = getPublicMarketCopy(market);
  const copy = getBrandModelCityPageCopy(
    market.code,
    brandName,
    modelName,
    cityName,
    cityData.region,
  );
  const cars = await getLaunchCityInventory({
    marketCode: market.code,
    brandName,
    modelName,
    cityName,
  });

  if (cars.length < CITY_PAGE_MIN_ACTIVE_ADS) {
    notFound();
  }

  const routeUrl = `${market.origin}/${brand}/${model}/${city}`;
  const breadcrumbItems = [
    { name: marketCopy.listingsLabel, url: `${market.origin}${getMarketPath("/vysledky", market.code)}` },
    { name: brandName, url: `${market.origin}/${brand}` },
    { name: modelName, url: `${market.origin}/${brand}/${model}` },
    { name: cityName, url: routeUrl },
  ];

  const searchHref = buildInventorySearchHref({ brandName, modelName, cityName, marketCode: market.code });
  const inventoryItemListSchema =
    cars.length > 0
      ? createInventoryItemListJsonLd({
          cars,
          listName: copy.listName,
          siteUrl: market.origin,
          marketCode: market.code,
        })
      : null;
  const { averagePriceEur, newestYear } = summarizeInventory(cars);
  return (
    <div className="market-page min-h-screen">
      <BreadcrumbJsonLd items={breadcrumbItems} />
      {inventoryItemListSchema ? (
        <script type="application/ld+json" suppressHydrationWarning>
          {serializeJsonLd(inventoryItemListSchema)}
        </script>
      ) : null}
      <main className="pt-24 pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ProgrammaticBreadcrumbs
            items={[
              { label: marketCopy.listingsLabel, href: getMarketPath("/vysledky", market.code) },
              { label: brandName, href: `/${brand}` },
              { label: modelName, href: `/${brand}/${model}` },
              { label: cityName },
            ]}
          />

          <div className="market-panel market-hero mb-8 p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-2">
              <span className="market-chip">{cityName}</span>
            </div>
            <h1 className="text-3xl font-semibold text-primary sm:text-4xl">
              {brandName} {modelName} - {cityName}
            </h1>
            <p className="mt-3 text-lg text-secondary max-w-2xl">
              {copy.intro}
            </p>
          </div>

          {cars.length > 0 ? (
            <InventorySearchCta
              title={copy.ctaTitle}
              description={copy.ctaDescription}
              href={searchHref}
              ctaLabel={marketCopy.viewOffers}
            />
          ) : null}

          {cars.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {cars.map((car, index) => (
                <SeoListingCard
                  key={car.id}
                  car={car}
                  source="seo_city_route"
                  position={index + 1}
                  imageSizes="(max-width: 768px) 100vw, 25vw"
                  showCityBadge
                  locale={marketCopy.languageTag}
                  marketCode={market.code}
                />
              ))}
            </div>
          ) : (
            <InventoryEmptyState
              message={copy.emptyMessage}
              href={searchHref}
              padded={false}
              ctaLabel={marketCopy.viewOffers}
            />
          )}

          {cars.length > 0 ? (
            <div className="market-card market-readable mt-12 max-w-none p-6">
              <InventoryMarketSummary
                title={copy.summaryTitle}
                count={cars.length}
                averagePriceEur={averagePriceEur}
                newestYear={newestYear}
                locale={marketCopy.languageTag}
                availableLabel={copy.availableLabel}
                averagePriceLabel={copy.averagePriceLabel}
                newestYearLabel={copy.newestYearLabel}
              />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
