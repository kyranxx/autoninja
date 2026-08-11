import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { BreadcrumbTrail } from "@/components/BreadcrumbTrail";
import ThemePreviewShell from "@/components/theme/ThemePreviewShell";
import {
  buildSearchResultsBreadcrumbItems,
  buildSearchResultsBreadcrumbSchemaItems,
  type BreadcrumbSearchParams,
} from "@/lib/seo/breadcrumbs";
import { getRequestMarketConfig } from "@/lib/market/request";
import {
  getPublicMarketCopyForLocale,
  resolvePublicCopyMarketCode,
} from "@/lib/market/public-copy";
import type { MarketCode } from "@/config/markets";
import { getMarketPath } from "@/lib/routes";
import AlgoliaSearchPageClient from "./AlgoliaSearchPageClient";
import SearchSeoLinks from "./SearchSeoLinks";

const SEARCH_PAGE_METADATA: Record<
  MarketCode,
  { title: string; description: string }
> = {
  SK: {
    title: "Výsledky vyhľadávania áut | AutoNinja",
    description:
      "Prehliadajte ponuku áut, filtrujte výsledky a objavte dostupné ponuky na AutoNinja.",
  },
  RO: {
    title: "Rezultate căutare mașini | AutoNinja",
    description:
      "Explorează anunțurile auto, filtrează rezultatele și găsește oferte disponibile pe AutoNinja.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const [market, locale] = await Promise.all([
    getRequestMarketConfig(),
    getLocale(),
  ]);
  const copy = getPublicMarketCopyForLocale(market, locale);
  const metadata =
    SEARCH_PAGE_METADATA[resolvePublicCopyMarketCode(locale, market.code)];
  const url = `${market.origin}${getMarketPath("/vysledky", market.code)}`;

  return {
    title: metadata.title,
    description: metadata.description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: metadata.title.replace(/ \| (?:AutoNinja|AutoNinja)$/, ""),
      description: metadata.description,
      url,
      locale: copy.openGraphLocale,
    },
  };
}

type SearchPageProps = {
  searchParams?: Promise<BreadcrumbSearchParams>;
};

export default async function SearchPage({
  searchParams,
}: SearchPageProps) {
  const [market, tSearchPage, locale] = await Promise.all([
    getRequestMarketConfig(),
    getTranslations("searchPage"),
    getLocale(),
  ]);
  const copyMarketCode = resolvePublicCopyMarketCode(locale, market.code);
  const copy = getPublicMarketCopyForLocale(market, locale);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const breadcrumbItems = buildSearchResultsBreadcrumbItems(
    resolvedSearchParams,
    { listingsLabel: copy.listingsLabel, marketCode: copyMarketCode },
  );

  return (
    <ThemePreviewShell scopeLabel="/vysledky">
      <div className="market-page min-h-screen">
        <BreadcrumbJsonLd
          items={buildSearchResultsBreadcrumbSchemaItems(resolvedSearchParams, {
            siteUrl: market.origin,
            listingsLabel: copy.listingsLabel,
            marketCode: copyMarketCode,
          })}
        />
        <section aria-labelledby="search-results-heading">
          <h1 id="search-results-heading" className="sr-only">
            {tSearchPage("srHeading")}
          </h1>
          <div className="container-main pt-3 sm:pt-4 lg:pt-6">
            <BreadcrumbTrail items={breadcrumbItems} className="mb-0" />
          </div>
        </section>
        <AlgoliaSearchPageClient />
        <SearchSeoLinks />
      </div>
    </ThemePreviewShell>
  );
}
