"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { getMarketPath } from "@/lib/routes";
import { useMarketCode } from "@/context/MarketContext";

export default function SearchSeoLinks() {
  const t = useTranslations("searchSeo");
  const marketCode = useMarketCode();
  const dealersHref = getMarketPath(
    "/predajcovia",
    marketCode,
  );

  return (
    <section
      aria-labelledby="search-seo-links-heading"
      className="border-t border-border-subtle bg-background-secondary/30 py-10"
    >
      <div className="container-main">
        <h2
          id="search-seo-links-heading"
          className="text-lg font-semibold text-text-primary"
        >
          {t("heading")}
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-text-secondary">
          {t("description")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={getMarketPath("/skoda/octavia", marketCode)}
            className="rounded-full border border-border px-3 py-1.5 text-sm text-text-secondary hover:border-accent hover:text-accent"
          >
            Škoda Octavia
          </Link>
          <Link
            href={getMarketPath("/volkswagen/golf", marketCode)}
            className="rounded-full border border-border px-3 py-1.5 text-sm text-text-secondary hover:border-accent hover:text-accent"
          >
            Volkswagen Golf
          </Link>
          <Link
            href={getMarketPath("/bmw/3-series", marketCode)}
            className="rounded-full border border-border px-3 py-1.5 text-sm text-text-secondary hover:border-accent hover:text-accent"
          >
            BMW 3 Series
          </Link>
          <Link
            href={getMarketPath("/audi/a4", marketCode)}
            className="rounded-full border border-border px-3 py-1.5 text-sm text-text-secondary hover:border-accent hover:text-accent"
          >
            Audi A4
          </Link>
          <Link
            href={dealersHref}
            className="rounded-full border border-border px-3 py-1.5 text-sm text-text-secondary hover:border-accent hover:text-accent"
          >
            {t("sellers")}
          </Link>
        </div>
      </div>
    </section>
  );
}
