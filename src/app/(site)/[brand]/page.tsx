import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { ProgrammaticBreadcrumbs } from "@/components/seo/ProgrammaticInventorySections";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import {
  getAllSeoBrands,
  getBrandTaxonomy,
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
  const brands = await getAllSeoBrands();
  return brands.map(({ slug: brand }) => ({ brand }));
}

function getBrandPageCopy(
  marketCode: MarketCode,
  brandName: string,
  modelCount: number,
) {
  if (marketCode === "RO") {
    return {
      notFound: "Nu a fost găsit",
      title: `${brandName} | Mașini de vânzare în România | AutoNinja`,
      description: `Modele ${brandName} și anunțuri actuale în România. ${modelCount} modele în catalogul AutoNinja.`,
      keywords: [
        brandName,
        `${brandName} de vânzare`,
        `${brandName} second hand`,
        `cumpără ${brandName}`,
      ],
      openGraphTitle: `${brandName} de vânzare | AutoNinja`,
      openGraphDescription: `Explorează toate modelele ${brandName} disponibile în România.`,
      twitterDescription: `Modele ${brandName} și anunțuri auto actuale.`,
      itemListName: `${brandName} - modele`,
      heading: `${brandName} - toate modelele`,
      intro: `Explorează toate modelele ${brandName} de vânzare în România. Alege modelul și găsește mașina potrivită.`,
      searchTitle: `Vrei să vezi imediat toate ofertele ${brandName}?`,
      searchDescription:
        "Deschide căutarea completă și compară anunțurile după preț, model, combustibil și localitate.",
      searchCta: "Vezi rezultatele în căutare",
      modelCta: "Vezi toate anunțurile →",
      aboutTitle: `Despre marca ${brandName}`,
      aboutFirst: `${brandName} este una dintre mărcile auto populare din România. Pe AutoNinja adunăm treptat anunțuri ${brandName} de la vânzători privați și dealeri.`,
      aboutSecond: `Oferim ${modelCount} modele ${brandName}, inclusiv versiuni noi și clasice. Fiecare anunț include detalii, fotografii și contact direct cu vânzătorul.`,
      otherBrands: "Alte mărci",
    };
  }

  return {
    notFound: "Nenájdené",
    title: `${brandName} | Predaj na Slovensku | AutoNinja`,
    description: `Modely ${brandName} a aktuálne inzeráty na Slovensku. ${modelCount} modelov v katalógu AutoNinja.`,
    keywords: [
      brandName,
      `${brandName} predaj`,
      `${brandName} bazar`,
      `kúpiť ${brandName}`,
    ],
    openGraphTitle: `${brandName} na predaj | AutoNinja`,
    openGraphDescription: `Preskúmajte všetky modely značky ${brandName} na Slovensku.`,
    twitterDescription: `Modely značky ${brandName} a aktuálne inzeráty.`,
    itemListName: `${brandName} - modely`,
    heading: `${brandName} - všetky modely`,
    intro: `Preskúmajte všetky modely ${brandName} na predaj na Slovensku. Vyberte si model a nájdite svoje vysnívané vozidlo.`,
    searchTitle: `Chcete okamžite vidieť všetky ponuky značky ${brandName}?`,
    searchDescription:
      "Otvorte kompletné vyhľadávanie a porovnajte inzeráty podľa ceny, modelu, paliva a lokality.",
    searchCta: "Zobraziť výsledky vo vyhľadávaní",
    modelCta: "Zobraziť všetky inzeráty →",
    aboutTitle: `O značke ${brandName}`,
    aboutFirst: `${brandName} je jednou z najpopulárnejších automobilových značiek na Slovensku. Na AutoNinja postupne zhromažďujeme ponuky ${brandName} od súkromných predajcov aj autobazárov.`,
    aboutSecond: `Ponúkame ${modelCount} modelov značky ${brandName}, vrátane najnovších aj klasických verzií. Každý inzerát obsahuje detailné informácie, fotogalériu a priamy kontakt na predajcu.`,
    otherBrands: "Ďalšie značky",
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ brand: string }>;
}): Promise<Metadata> {
  const { brand } = await params;
  const [brandData, market] = await Promise.all([
    getBrandTaxonomy(brand),
    getRequestMarketConfig(),
  ]);
  const marketCopy = getPublicMarketCopy(market);

  if (!brandData) {
    notFound();
  }
  const copy = getBrandPageCopy(
    market.code,
    brandData.name,
    brandData.models.length,
  );
  const canonicalUrl = `${market.origin}/${brand}`;

  return {
    title: copy.title,
    description: copy.description,
    keywords: copy.keywords,
    openGraph: {
      title: copy.openGraphTitle,
      description: copy.openGraphDescription,
      url: canonicalUrl,
      siteName: market.brandName,
      type: "website",
      locale: marketCopy.openGraphLocale,
    },
    twitter: {
      card: "summary_large_image",
      title: copy.openGraphTitle,
      description: copy.twitterDescription,
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

function createBrandModelsItemListJsonLd(
  brandSlug: string,
  brandName: string,
  models: readonly { slug: string; name: string }[],
  copy: Pick<ReturnType<typeof getBrandPageCopy>, "itemListName">,
  siteUrl: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: copy.itemListName,
    numberOfItems: models.length,
    itemListOrder: "https://schema.org/ItemListUnordered",
    itemListElement: models.map((model, index) => {
      const modelUrl = `${siteUrl}/${brandSlug}/${model.slug}`;

      return {
        "@type": "ListItem",
        position: index + 1,
        url: modelUrl,
        name: `${brandName} ${model.name}`,
      };
    }),
  };
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand } = await params;
  const [brandData, allBrands, market] = await Promise.all([
    getBrandTaxonomy(brand),
    getAllSeoBrands(),
    getRequestMarketConfig(),
  ]);

  if (!brandData) {
    notFound();
  }

  const marketCopy = getPublicMarketCopy(market);
  const copy = getBrandPageCopy(
    market.code,
    brandData.name,
    brandData.models.length,
  );
  const brandUrl = `${market.origin}/${brand}`;
  const breadcrumbItems = [
    { name: marketCopy.listingsLabel, url: `${market.origin}${getMarketPath("/vysledky", market.code)}` },
    { name: brandData.name, url: brandUrl },
  ];
  const brandSearchHref = getMarketPath(`/vysledky?brand=${encodeURIComponent(brandData.name)}`, market.code);
  const modelsItemListSchema = createBrandModelsItemListJsonLd(
    brand,
    brandData.name,
    brandData.models,
    copy,
    market.origin,
  );
  const otherBrands = allBrands.reduce<typeof allBrands>((entries, entry) => {
    if (entry.slug !== brand) {
      entries.push(entry);
    }
    return entries;
  }, []);

  return (
    <div className="market-page min-h-screen">
      <BreadcrumbJsonLd items={breadcrumbItems} />
      <script type="application/ld+json" suppressHydrationWarning>
        {serializeJsonLd(modelsItemListSchema)}
      </script>
      <main className="pt-24 pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ProgrammaticBreadcrumbs
            items={[
              { label: marketCopy.listingsLabel, href: getMarketPath("/vysledky", market.code) },
              { label: brandData.name },
            ]}
          />

          {/* Header */}
          <div className="market-panel market-hero mb-8 p-6 sm:p-8">
            <h1 className="text-3xl font-semibold text-primary sm:text-4xl">
              {copy.heading}
            </h1>
            <p className="mt-3 text-lg text-secondary max-w-2xl">
              {copy.intro}
            </p>
          </div>

          <div className="market-soft-band mb-8 p-5">
            <h2 className="text-base font-semibold text-primary">
              {copy.searchTitle}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-secondary">
              {copy.searchDescription}
            </p>
            <Link
              href={brandSearchHref}
              className="market-action-primary mt-4"
            >
              {copy.searchCta}
            </Link>
          </div>

          {/* Models Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {brandData.models.map((model) => (
              <Link
                key={model.slug}
                href={`/${brand}/${model.slug}`}
                className="market-card group p-6"
              >
                <h2 className="text-xl font-semibold text-primary group-hover:text-accent">
                  {brandData.name} {model.name}
                </h2>
                <p className="mt-2 text-sm text-secondary">
                  {copy.modelCta}
                </p>
              </Link>
            ))}
          </div>

          {/* SEO Content */}
          <div className="market-card market-readable mt-16 max-w-none p-6">
            <h2 className="text-2xl font-semibold text-primary mb-4">
              {copy.aboutTitle}
            </h2>
            <p className="text-secondary mb-4">
              {copy.aboutFirst}
            </p>
            <p className="text-secondary">
              {copy.aboutSecond}
            </p>
          </div>

          {/* Other Brands */}
          <div className="mt-16">
            <h2 className="text-xl font-semibold text-primary mb-6">
              {copy.otherBrands}
            </h2>
            <div className="flex flex-wrap gap-3">
              {otherBrands.map((entry) => (
                <Link
                  key={entry.slug}
                  href={`/${entry.slug}`}
                  className="market-chip hover:text-accent"
                >
                  {entry.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
