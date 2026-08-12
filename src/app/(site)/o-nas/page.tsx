import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicPageBreadcrumbs } from "@/components/seo/PublicPageBreadcrumbs";
import {
  MarketplaceArticleCard,
  MarketplaceContainer,
  MarketplaceHero,
  MarketplaceIconBadge,
  MarketplaceLinkButton,
  MarketplacePageShell,
  MarketplaceSection,
} from "@/components/ui/MarketplacePage";
import { CheckCircleIcon, LockIcon, SpeedometerIcon } from "@/components/ui/Icons";
import type { MarketCode } from "@/config/markets";
import { getRequestMarketConfig } from "@/lib/market/request";
import { getMarketPath } from "@/lib/routes";
import { resolvePublicCopyMarketCode } from "@/lib/market/public-copy";

function getAboutPageCopy(marketCode: MarketCode) {
  if (marketCode === "RO") {
    return {
      title: "Despre noi | AutoNinja",
      description:
        "Descoperă echipa AutoNinja și misiunea noastră de a aduce o piață auto mai transparentă, sigură și corectă în România.",
      breadcrumb: "Despre noi",
    };
  }

  return {
    title: "O nás | AutoNinja",
    description:
      "Spoznajte tím AutoNinja a našu misiu prinášať transparentný, bezpečný a férový autobazár na Slovensku.",
    breadcrumb: "O nás",
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const [market, locale] = await Promise.all([
    getRequestMarketConfig(),
    getLocale(),
  ]);
  const copy = getAboutPageCopy(
    resolvePublicCopyMarketCode(locale, market.code),
  );

  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: `${market.origin}${getMarketPath("/o-nas", market.code)}`,
    },
  };
}

export default async function AboutPage() {
  const [t, market, locale] = await Promise.all([
    getTranslations("about"),
    getRequestMarketConfig(),
    getLocale(),
  ]);
  const copy = getAboutPageCopy(
    resolvePublicCopyMarketCode(locale, market.code),
  );

  const values = [
    {
      title: t("transparency"),
      description: t("transparencyDesc"),
      icon: CheckCircleIcon,
    },
    {
      title: t("security"),
      description: t("securityDesc"),
      icon: LockIcon,
    },
    {
      title: t("speed"),
      description: t("speedDesc"),
      icon: SpeedometerIcon,
    },
  ];

  return (
    <MarketplacePageShell>
      <MarketplaceContainer size="lg" className="space-y-8">
        <MarketplaceHero
          align="center"
          eyebrow={market.brandName}
          title={t("title")}
          description={t("subtitle")}
          breadcrumbs={
            <PublicPageBreadcrumbs
              items={[{ label: copy.breadcrumb }]}
              currentHref="/o-nas"
              siteUrl={market.origin}
              className="mb-0"
            />
          }
        />

        <MarketplaceSection title={t("ourMission")}>
          <MarketplaceArticleCard>
            <p className="market-readable">{t("missionText")}</p>
          </MarketplaceArticleCard>
        </MarketplaceSection>

        <MarketplaceSection title={t("ourValues")}>
          <div className="grid gap-4 md:grid-cols-3">
            {values.map((value) => {
              const Icon = value.icon;

              return (
                <MarketplaceArticleCard key={value.title}>
                  <MarketplaceIconBadge>
                    <Icon className="size-5" />
                  </MarketplaceIconBadge>
                  <h3 className="mt-4 text-lg font-semibold text-primary">{value.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-secondary">{value.description}</p>
                </MarketplaceArticleCard>
              );
            })}
          </div>
        </MarketplaceSection>

        <MarketplaceSection title={t("ourTeam")}>
          <MarketplaceArticleCard>
            <p className="market-readable">{t("teamText")}</p>
          </MarketplaceArticleCard>
        </MarketplaceSection>

        <section className="market-soft-band p-6 text-center sm:p-8">
          <h2 className="text-xl font-semibold text-primary">{t("haveQuestions")}</h2>
          <p className="mx-auto mt-2 max-w-2xl text-secondary">{t("dontHesitate")}</p>
          <div className="mt-5 flex justify-center">
            <MarketplaceLinkButton href={getMarketPath("/kontakt", market.code)} showArrow>
              {t("contactUs")}
            </MarketplaceLinkButton>
          </div>
        </section>
      </MarketplaceContainer>
    </MarketplacePageShell>
  );
}
