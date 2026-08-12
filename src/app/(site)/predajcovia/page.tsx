import type { Metadata } from "next";
import { connection } from "next/server";
import { getLocale } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { PublicPageBreadcrumbs } from "@/components/seo/PublicPageBreadcrumbs";
import {
  MarketplaceBadge,
  MarketplaceCard,
  MarketplaceContainer,
  MarketplaceHero,
  MarketplaceLinkButton,
  MarketplacePageShell,
  MarketplaceSection,
  MarketplaceStatCard,
} from "@/components/ui/MarketplacePage";
import { VerifiedIcon } from "@/components/ui/Icons";
import type { MarketCode } from "@/config/markets";
import { getVerifiedDealerSummaries } from "@/lib/dealer/public";
import { buildDealerPublicProfilePath } from "@/lib/dealer/public-profile-path";
import { optimizeCloudflareImage } from "@/lib/image-optimizer";
import { getRequestMarketConfig } from "@/lib/market/request";
import { getMarketPath } from "@/lib/routes";
import {
  getPublicMarketCopyForLocale,
  resolvePublicCopyMarketCode,
} from "@/lib/market/public-copy";

function getDealersPageCopy(marketCode: MarketCode) {
  if (marketCode === "RO") {
    return {
      title: "Dealeri | AutoNinja",
      description:
        "Lista dealerilor auto de pe AutoNinja. Vezi profilurile dealerilor și anunțurile lor actuale.",
      eyebrow: "Dealeri",
      heroTitle: "Profiluri verificate de dealeri",
      heroDescription:
        "Vezi dealerii care au profil publicat pe AutoNinja și anunțuri auto active.",
      breadcrumb: "Dealeri",
      createDealerProfile: "Creează profil de dealer",
      publishedDealers: "dealeri publicați",
      activeAds: "anunțuri active",
      soldVehicles: "vehicule vândute",
      verified: "Verificat",
      activeShort: "Active",
      soldShort: "Vândute",
      memberSince: "Membru din",
      emptyTitle: "Momentan nu există dealeri publicați",
      emptyDescription:
        "După aprobarea primelor profiluri de dealer, acestea vor apărea pe această pagină.",
      dealerCtaTitle: "Ai un parc auto?",
      dealerCtaDescription:
        "Creează un profil de dealer și pregătește oferta pentru cumpărători.",
      registerDealer: "Înregistrează-te ca dealer",
    };
  }

  return {
    title: "Predajcovia | AutoNinja",
    description:
      "Zoznam predajcov vozidiel na AutoNinja. Prezrite si profily autobazárov a ich aktuálne ponuky.",
    eyebrow: "Predajcovia",
    heroTitle: "Overené profily predajcov",
    heroDescription:
      "Prezrite si predajcov, ktorí majú na AutoNinja zverejnený profil a aktuálnu ponuku vozidiel.",
    breadcrumb: "Predajcovia",
    createDealerProfile: "Vytvoriť profil predajcu",
    publishedDealers: "zverejnených predajcov",
    activeAds: "aktívnych inzerátov",
    soldVehicles: "predaných vozidiel",
    verified: "Overený",
    activeShort: "Aktívnych",
    soldShort: "Predaných",
    memberSince: "Člen od",
    emptyTitle: "Zatiaľ tu nie sú žiadni zverejnení predajcovia",
    emptyDescription:
      "Po schválení prvých dealer profilov sa zobrazia na tejto stránke.",
    dealerCtaTitle: "Ste autobazár?",
    dealerCtaDescription:
      "Vytvorte si profil predajcu a pripravte svoju ponuku pre kupujúcich.",
    registerDealer: "Registrovať sa ako predajca",
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const [market, locale] = await Promise.all([
    getRequestMarketConfig(),
    getLocale(),
  ]);
  const copy = getDealersPageCopy(
    resolvePublicCopyMarketCode(locale, market.code),
  );

  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: `${market.origin}${getMarketPath("/predajcovia", market.code)}`,
    },
  };
}

function formatMemberSinceYear(value: string, locale: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
  }).format(new Date(timestamp));
}

function dealerInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return initials || "AB";
}

export default async function DealersPage() {
  await connection();

  const [market, locale] = await Promise.all([
    getRequestMarketConfig(),
    getLocale(),
  ]);
  const copyMarketCode = resolvePublicCopyMarketCode(locale, market.code);
  const marketCopy = getPublicMarketCopyForLocale(market, locale);
  const copy = getDealersPageCopy(copyMarketCode);
  const dealers = await getVerifiedDealerSummaries(market.code);
  const activeAds = dealers.reduce((sum, dealer) => sum + dealer.activeAds, 0);
  const soldCount = dealers.reduce((sum, dealer) => sum + dealer.soldCount, 0);

  return (
    <MarketplacePageShell>
      <MarketplaceContainer className="space-y-8">
        <MarketplaceHero
          eyebrow={copy.eyebrow}
          title={copy.heroTitle}
          description={copy.heroDescription}
          breadcrumbs={
            <PublicPageBreadcrumbs
              items={[{ label: copy.breadcrumb }]}
              currentHref="/predajcovia"
              siteUrl={market.origin}
            />
          }
          actions={
            <MarketplaceLinkButton href="/dealer" variant="secondary" showArrow>
              {copy.createDealerProfile}
            </MarketplaceLinkButton>
          }
          stats={dealers.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <MarketplaceStatCard value={dealers.length} label={copy.publishedDealers} />
              <MarketplaceStatCard value={activeAds} label={copy.activeAds} tone="accent" />
              <MarketplaceStatCard value={soldCount} label={copy.soldVehicles} tone="success" />
            </div>
          ) : undefined}
        />

        <MarketplaceSection>
          {dealers.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {dealers.map((dealer) => (
                <Link
                  key={dealer.id}
                  href={getMarketPath(buildDealerPublicProfilePath(dealer.slug), market.code)}
                  className="market-card group block p-5"
                >
                  <div className="flex items-start gap-4">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
                      {dealer.logoUrl ? (
                        <Image
                          src={optimizeCloudflareImage(dealer.logoUrl, {
                            width: 128,
                            height: 128,
                            fit: "cover",
                            quality: 82,
                            format: "auto",
                          })}
                          alt={dealer.name}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-background-muted text-sm font-bold text-primary">
                          {dealerInitials(dealer.name)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-semibold text-primary group-hover:text-accent">
                        {dealer.name}
                      </h2>
                      <p className="text-sm text-secondary">
                        {dealer.city || marketCopy.locationFallback}
                      </p>
                      {dealer.isVerified ? (
                        <div className="mt-2">
                          <MarketplaceBadge>
                            <VerifiedIcon className="size-4 text-success" />
                            {copy.verified}
                          </MarketplaceBadge>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                    <DealerMetric value={dealer.activeAds} label={copy.activeShort} />
                    <DealerMetric value={dealer.soldCount} label={copy.soldShort} tone="success" />
                    <DealerMetric
                      value={formatMemberSinceYear(dealer.memberSince, marketCopy.languageTag) || "-"}
                      label={copy.memberSince}
                      tone="accent"
                    />
                  </div>

                  {dealer.description ? (
                    <p className="mt-4 line-clamp-3 text-sm leading-6 text-secondary">
                      {dealer.description}
                    </p>
                  ) : null}
                </Link>
              ))}
            </div>
          ) : (
            <MarketplaceCard className="border-dashed py-12 text-center">
              <h2 className="text-xl font-semibold text-primary">
                {copy.emptyTitle}
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-secondary">
                {copy.emptyDescription}
              </p>
            </MarketplaceCard>
          )}
        </MarketplaceSection>

        {dealers.length > 0 ? (
        <section className="market-soft-band p-6 text-center sm:p-8">
          <h2 className="text-xl font-semibold text-primary">{copy.dealerCtaTitle}</h2>
          <p className="mx-auto mt-2 max-w-2xl text-secondary">
            {copy.dealerCtaDescription}
          </p>
          <div className="mt-5 flex justify-center">
            <MarketplaceLinkButton href="/dealer" showArrow>
              {copy.registerDealer}
            </MarketplaceLinkButton>
          </div>
        </section>
        ) : null}
      </MarketplaceContainer>
    </MarketplacePageShell>
  );
}

function DealerMetric({
  value,
  label,
  tone = "primary",
}: {
  value: string | number;
  label: string;
  tone?: "primary" | "accent" | "success";
}) {
  const toneClass =
    tone === "accent" ? "text-accent" : tone === "success" ? "text-success" : "text-primary";

  return (
    <div className="rounded-lg border border-border bg-background px-2 py-3">
      <p className={`text-lg font-bold ${toneClass}`}>{value}</p>
      <p className="text-xs text-secondary">{label}</p>
    </div>
  );
}
