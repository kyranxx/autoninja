import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
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
  getAllSeoBrandModelPairs,
  getBrandTaxonomy,
  hasModelForBrand,
  getModelTaxonomy,
} from "@/lib/seo/programmatic-taxonomy";
import { getRequestMarketConfig } from "@/lib/market/request";
import { getMarketPath } from "@/lib/routes";
import { getPublicMarketCopy } from "@/lib/market/public-copy";
import type { MarketCode } from "@/config/markets";

// These inventory-backed taxonomy pages need the request market and live
// inventory at request time. Keep them out of the static build and generate
// valid routes on demand instead.
export const dynamic = "force-dynamic";
export const dynamicParams = false;

export async function generateStaticParams() {
  const pairs = await getAllSeoBrandModelPairs();
  return pairs.map(({ brandSlug, modelSlug }) => ({
    brand: brandSlug,
    model: modelSlug,
  }));
}

function getBrandModelPageCopy(
  marketCode: MarketCode,
  brandName: string,
  modelName: string,
) {
  if (marketCode === "RO") {
    return {
      notFound: "Nu a fost găsit",
      title: `${brandName} ${modelName} | Mașini de vânzare în România | AutoNinja`,
      description: `Anunțuri actuale ${brandName} ${modelName} în România. Compară ofertele disponibile și detaliile vehiculelor pe AutoNinja.`,
      keywords: [
        `${brandName} ${modelName}`,
        `${brandName} ${modelName} de vânzare`,
        `${brandName} ${modelName} second hand`,
        `${brandName} ${modelName} rulat`,
        `cumpără ${brandName} ${modelName}`,
      ],
      openGraphTitle: `${brandName} ${modelName} de vânzare | AutoNinja`,
      twitterDescription: `Compară anunțurile actuale pentru ${brandName} ${modelName}.`,
      listName: `${brandName} ${modelName} - anunțuri`,
      heading: `${brandName} ${modelName} de vânzare`,
      intro: `Vezi anunțurile actuale ${brandName} ${modelName} în România. Compară ofertele disponibile, fotografiile și contactul vânzătorului.`,
      ctaTitle: `Vrei o selecție mai largă pentru ${brandName} ${modelName}?`,
      ctaDescription:
        "Deschide căutarea completă, compară mai multe anunțuri și setează filtre după preț, an, combustibil și localitate.",
      emptyMessage: `Momentan nu avem anunțuri reale pentru ${brandName} ${modelName}.`,
      summaryTitle: `Privire rapidă asupra pieței pentru ${brandName} ${modelName}`,
      relatedModels: `Alte modele ${brandName}`,
      availableLabel: "Anunțuri disponibile pe pagină",
      averagePriceLabel: "Preț mediu",
      newestYearLabel: "Cel mai nou an de model",
    };
  }

  return {
    notFound: "Nenájdené",
    title: `${brandName} ${modelName} | Predaj na Slovensku | AutoNinja`,
    description: `Aktuálne ponuky ${brandName} ${modelName} na Slovensku. Porovnajte dostupné inzeráty a detaily vozidiel na AutoNinja.`,
    keywords: [
      `${brandName} ${modelName}`,
      `${brandName} ${modelName} predaj`,
      `${brandName} ${modelName} bazar`,
      `${brandName} ${modelName} ojazdené`,
      `kúpiť ${brandName} ${modelName}`,
    ],
    openGraphTitle: `${brandName} ${modelName} na predaj | AutoNinja`,
    twitterDescription: `Porovnajte aktuálne ponuky modelu ${brandName} ${modelName}.`,
    listName: `${brandName} ${modelName} - ponuky`,
    heading: `${brandName} ${modelName} na predaj`,
    intro: `Prezrite si aktuálne ponuky ${brandName} ${modelName} na Slovensku. Porovnajte dostupné inzeráty, fotografie a kontakt na predajcu.`,
    ctaTitle: `Chcete širší výber pre ${brandName} ${modelName}?`,
    ctaDescription:
      "Otvorte kompletné vyhľadávanie, porovnajte viac ponúk a nastavte si filtre podľa ceny, roku, paliva a lokality.",
    emptyMessage: `Momentálne nemáme reálne inzeráty pre ${brandName} ${modelName}.`,
    summaryTitle: `Rýchly prehľad trhu pre model ${brandName} ${modelName}`,
    relatedModels: `Ďalšie modely ${brandName}`,
    availableLabel: "Dostupné ponuky na stránke",
    averagePriceLabel: "Priemerná cena",
    newestYearLabel: "Najnovší modelový rok",
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ brand: string; model: string }>;
}): Promise<Metadata> {
  const { brand, model } = await params;
  const market = await getRequestMarketConfig();
  const marketCopy = getPublicMarketCopy(market);
  if (!brand || !model) {
    notFound();
  }

  const [brandData, modelData] = await Promise.all([
    getBrandTaxonomy(brand),
    getModelTaxonomy(brand, model),
  ]);

  if (!brandData || !modelData || !(await hasModelForBrand(brand, model))) {
    notFound();
  }

  const brandName = brandData.name;
  const modelName = modelData.name;
  const copy = getBrandModelPageCopy(market.code, brandName, modelName);

  return buildProgrammaticMetadata({
    title: copy.title,
    description: copy.description,
    keywords: copy.keywords,
    canonicalPath: `/${brand}/${model}`,
    openGraphTitle: copy.openGraphTitle,
    twitterTitle: copy.openGraphTitle,
    twitterDescription: copy.twitterDescription,
    siteUrl: market.origin,
    siteName: market.brandName,
    openGraphLocale: marketCopy.openGraphLocale,
  });
}

export default async function BrandModelPage({
  params,
}: {
  params: Promise<{ brand: string; model: string }>;
}) {
  const { brand, model } = await params;
  const [brandData, modelData] = await Promise.all([
    getBrandTaxonomy(brand),
    getModelTaxonomy(brand, model),
  ]);

  if (!brandData || !modelData || !(await hasModelForBrand(brand, model))) {
    notFound();
  }

  const brandName = brandData.name;
  const modelName = modelData.name;
  const market = await getRequestMarketConfig();
  const marketCopy = getPublicMarketCopy(market);
  const copy = getBrandModelPageCopy(market.code, brandName, modelName);
  const routeUrl = `${market.origin}/${brand}/${model}`;
  const breadcrumbItems = [
    { name: marketCopy.listingsLabel, url: `${market.origin}${getMarketPath("/vysledky", market.code)}` },
    { name: brandName, url: `${market.origin}/${brand}` },
    { name: modelName, url: routeUrl },
  ];

  const cars = await getSeoInventoryListings({
    marketCode: market.code,
    brandName,
    modelName,
    limit: 12,
  });
  const searchHref = buildInventorySearchHref({ brandName, modelName, marketCode: market.code });
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
  const relatedModels = brandData.models.reduce<Array<(typeof brandData.models)[number]>>(
    (models, relatedModel) => {
      if (relatedModel.slug !== model) {
        models.push(relatedModel);
      }
      return models;
    },
    [],
  );

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
              { label: modelName },
            ]}
          />

          <div className="market-panel market-hero mb-8 p-6 sm:p-8">
            <h1 className="text-3xl font-semibold text-primary sm:text-4xl">
              {copy.heading}
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
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {cars.map((car, index) => (
                <SeoListingCard
                  key={car.id}
                  car={car}
                  source="seo_model_route"
                  position={index + 1}
                  imageSizes="(max-width: 768px) 100vw, 33vw"
                  extraMetaLine={car.fuel || "-"}
                  locale={marketCopy.languageTag}
                  marketCode={market.code}
                />
              ))}
            </div>
          ) : (
            <InventoryEmptyState
              message={copy.emptyMessage}
              href={searchHref}
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

          <div className="mt-16">
            <h2 className="text-xl font-semibold text-primary mb-6">
              {copy.relatedModels}
            </h2>
            <div className="flex flex-wrap gap-3">
              {relatedModels.map((relatedModel) => (
                <Link
                  key={relatedModel.slug}
                  href={`/${brand}/${relatedModel.slug}`}
                  className="market-chip hover:text-accent"
                >
                  {brandName} {relatedModel.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
