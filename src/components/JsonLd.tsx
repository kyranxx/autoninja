import { BRAND_SOCIAL_PROFILE_URLS } from "@/config/brand";
import { COMPANY_INFO } from "@/config/company";
import {
  DEFAULT_MARKET_CODE,
  getMarketConfig,
  type MarketConfig,
} from "@/config/markets";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import { getMarketPath } from "@/lib/routes";

function buildOrganizationSchema(
  market: Pick<MarketConfig, "origin" | "brandName" | "locale" | "contact">,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: market.brandName,
    url: market.origin,
    logo: `${market.origin}/icon.svg`,
    contactPoint: {
      "@type": "ContactPoint",
      email: market.contact.email,
      contactType: "customer service",
      availableLanguage: [market.locale],
    },
    sameAs: BRAND_SOCIAL_PROFILE_URLS,
    address: {
      "@type": "PostalAddress",
      streetAddress: COMPANY_INFO.streetAddress,
      postalCode: COMPANY_INFO.postalCode,
      addressLocality: COMPANY_INFO.city,
      addressCountry: "SK",
    },
  };
}

function buildWebsiteSchema(
  market: Pick<MarketConfig, "code" | "origin" | "locale" | "brandName">,
) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: market.brandName,
    url: market.origin,
    inLanguage: market.locale,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${market.origin}${getMarketPath("/vysledky", market.code)}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

function createJsonLdId(prefix: string, suffix?: string) {
  return suffix ? `${prefix}-${suffix}` : prefix;
}

export function JsonLd({
  market = getMarketConfig(DEFAULT_MARKET_CODE),
}: {
  market?: Pick<
    MarketConfig,
    "code" | "origin" | "locale" | "brandName" | "contact"
  >;
}) {
  const organizationJson = serializeJsonLd(buildOrganizationSchema(market));
  const websiteJson = serializeJsonLd(buildWebsiteSchema(market));

  return (
    <>
      <script
        id={createJsonLdId("organization-jsonld")}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: organizationJson }}
      />
      <script
        id={createJsonLdId("website-jsonld")}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: websiteJson }}
      />
    </>
  );
}

interface BreadcrumbItem {
  name: string;
  url: string;
}

export function BreadcrumbJsonLd({ items }: { items: BreadcrumbItem[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
  const scriptId = createJsonLdId(
    "breadcrumb-jsonld",
    items
      .map((item) => item.name)
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "default",
  );

  return (
    <script
      id={scriptId}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  );
}
