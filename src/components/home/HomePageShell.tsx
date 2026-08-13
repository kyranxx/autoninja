import type { CSSProperties } from "react";
import { Suspense } from "react";
import { preload } from "react-dom";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { TrackedLink } from "@/components/analytics";
import HomeFeaturedAdsRows, { type HomeFeaturedAdCard } from "@/components/home/HomeFeaturedAdsRows";
import HomeFrontpageSearch from "@/components/home/HomeFrontpageSearch";
import { HOME_THEME, withAlpha } from "@/components/home/theme";
import {
  ArrowRightIcon,
  CameraIcon,
  CheckCircleIcon,
} from "@/components/ui/Icons";
import { buildAdPath } from "@/lib/cars/ad-path";
import { optimizeCloudflareImage } from "@/lib/image-optimizer";
import {
  PUBLIC_MARKET_COPY,
  formatMarketCurrency,
  formatMarketNumber,
  formatPublicCarValue,
  type PublicMarketCopy,
} from "@/lib/market/public-copy";
import { CREATE_LISTING_ROUTE, getMarketPath } from "@/lib/routes";
import { getFeaturedCars } from "@/lib/supabase/cached";
import { BRAND_THEME } from "@/lib/theme/brand";
import { type MarketCode } from "@/config/markets";
import { getRequestMarketConfig } from "@/lib/market/request";

const QUICK_LINKS = [
  {
    href: "/vysledky?priceTo=10000",
    titleKey: "quickLinks.cityCars.title",
    cta: "city_cars",
  },
  {
    href: "/vysledky?bodyStyle=suv",
    titleKey: "quickLinks.familySuv.title",
    cta: "family_suv",
  },
  {
    href: "/vysledky?transmission=automatic",
    titleKey: "quickLinks.automatics.title",
    cta: "automatics",
  },
] as const;

const HOME_HERO_BACKGROUND_SRC = "/brand/autoninja/homepage-hero-car-studio-v1.webp";
const HOME_HERO_MASCOT_SRC = "/brand/autoninja/mascot-leaning-key-hero-v2.webp";
const TRANSPARENT_PIXEL_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const BRAND_LOGOS = [
  { name: "Volkswagen", src: "/brand-logos/volkswagen.png", href: "/volkswagen" },
  { name: "Toyota", src: "/brand-logos/toyota.png", href: "/toyota" },
  { name: "Škoda", src: "/brand-logos/skoda.png", href: "/skoda" },
  { name: "BMW", src: "/brand-logos/bmw.png", href: "/bmw" },
  { name: "Mercedes-Benz", src: "/brand-logos/mercedes-benz.png", href: "/mercedes-benz" },
  { name: "Audi", src: "/brand-logos/audi.png", href: "/audi" },
  { name: "Renault", src: "/brand-logos/renault.svg", href: "/renault" },
  { name: "Dacia", src: "/brand-logos/dacia.svg", href: "/dacia" },
] as const;

export default async function HomePageShell() {
  const [t, tTopBanner, tHomeSearch, tBodyType, market] = await Promise.all([
    getTranslations("homePage"),
    getTranslations("topBanner"),
    getTranslations("homeSearch"),
    getTranslations("bodyType"),
    getRequestMarketConfig(),
  ]);
  const marketCode = market.code;
  const marketCopy = PUBLIC_MARKET_COPY[marketCode];
  const sellerImageAlt = market.presentation.sellerImageAlt;

  const vars = {
    "--home-brand": HOME_THEME.brand,
    "--home-link": HOME_THEME.link,
    "--home-cta": HOME_THEME.cta,
    "--home-cta-ink": HOME_THEME.ctaInk,
    "--home-cta-text": HOME_THEME.ctaText,
    "--home-accent-soft": withAlpha(HOME_THEME.cta, 0.14),
    "--home-mint": HOME_THEME.mint,
    "--home-mint-ink": HOME_THEME.brand,
    "--home-mint-soft": withAlpha(HOME_THEME.mint, 0.2),
    "--home-mint-strong": withAlpha(HOME_THEME.mint, 0.32),
    "--home-soft-surface": HOME_THEME.softSurface,
    "--home-dark-surface": HOME_THEME.brand,
    "--home-canvas": "var(--color-background)",
    "--home-brand-hover": BRAND_THEME.primaryHover,
    "--home-brand-soft": withAlpha(HOME_THEME.brand, 0.13),
  } as CSSProperties;

  const trustItems = [
    {
      title: t("buyerPromises.verifiedListings.title"),
      icon: CheckCircleIcon,
    },
    {
      title: tTopBanner("realVehiclePhotos"),
      icon: CameraIcon,
    },
    {
      title: t("buyerPromises.fastCompare.title"),
      icon: CheckCircleIcon,
    },
  ] as const;

  const quickCards = [
    ...QUICK_LINKS.map((entry) => ({
      href: getMarketPath(entry.href, marketCode),
      title: t(entry.titleKey),
      cta: entry.cta,
    })),
    {
      href: getMarketPath("/vysledky?bodyStyle=commercial", marketCode),
      title: tBodyType("commercial"),
      cta: "utility",
    },
    {
      href: getMarketPath("/vysledky", marketCode),
      title: tHomeSearch("categoryAll"),
      cta: "all_cars",
    },
  ] as const;

  [HOME_HERO_BACKGROUND_SRC, HOME_HERO_MASCOT_SRC].forEach((src) => {
    preload(src, {
      as: "image",
      fetchPriority: "high",
      media: "(min-width: 640px)",
      type: "image/webp",
    });
  });

  return (
    <div
      style={vars}
      className="home-frontpage relative isolate overflow-hidden bg-white text-text-primary"
    >
      <main>
        <section
          id="search-first"
          aria-labelledby="home-search-heading"
          className="search-first border-b border-black/8 bg-[var(--home-soft-surface)]"
        >
          <div className="relative isolate overflow-hidden bg-[var(--home-brand)]">
            <picture className="absolute inset-0 hidden sm:block">
              <source
                media="(min-width: 640px)"
                srcSet={HOME_HERO_BACKGROUND_SRC}
                type="image/webp"
              />
              {/* The transparent fallback prevents the desktop hero from downloading on mobile. */}
              <img
                src={TRANSPARENT_PIXEL_SRC}
                alt=""
                width={1672}
                height={941}
                decoding="async"
                fetchPriority="high"
                className="h-full w-full object-cover object-[64%_center] lg:object-center"
              />
            </picture>
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(circle_at_80%_32%,rgba(244,91,0,0.18)_0%,rgba(0,92,51,0)_34%),linear-gradient(120deg,#061713_0%,#005c33_58%,#003d24_100%)] sm:hidden"
            />
            <picture className="pointer-events-none absolute bottom-[5.75rem] right-4 top-3 hidden w-[42%] sm:right-6 sm:block sm:w-[38%] lg:bottom-[6.75rem] lg:right-8 lg:top-4 lg:w-[36%]">
              <source
                media="(min-width: 640px)"
                srcSet={HOME_HERO_MASCOT_SRC}
                type="image/webp"
              />
              {/* The transparent fallback prevents the desktop mascot from downloading on mobile. */}
              <img
                src={TRANSPARENT_PIXEL_SRC}
                alt=""
                width={948}
                height={1659}
                decoding="async"
                fetchPriority="high"
                className="h-full w-full object-contain object-center drop-shadow-[0_18px_28px_rgba(0,0,0,0.3)]"
              />
            </picture>
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,23,20,0.96)_0%,rgba(5,23,20,0.82)_34%,rgba(5,23,20,0.28)_68%,rgba(5,23,20,0.04)_100%)] sm:bg-[linear-gradient(90deg,rgba(5,23,20,0.94)_0%,rgba(5,23,20,0.72)_38%,rgba(5,23,20,0.12)_72%,rgba(5,23,20,0.02)_100%)]"
            />
            <div className="relative mx-auto flex min-h-[21rem] max-w-7xl items-start px-4 pb-28 pt-8 sm:min-h-[24rem] sm:px-6 sm:pb-32 sm:pt-12 lg:min-h-[27rem] lg:pb-36 lg:pt-16">
              <div className="max-w-[18rem] sm:max-w-md lg:max-w-[38rem]">
                <h1
                  id="home-search-heading"
                  className="!text-[2rem] font-semibold tracking-[-0.025em] !text-white [text-wrap:balance] sm:!text-[2.75rem] lg:!text-[3.25rem]"
                >
                  {t("heroTitle")}
                </h1>
                <p className="mt-3 max-w-xl text-base leading-relaxed text-white/82 sm:text-lg">
                  {t("heroDescription")}
                </p>
              </div>
            </div>
          </div>

          <div className="relative z-10 mx-auto -mt-20 max-w-7xl px-4 sm:-mt-24 sm:px-6 lg:-mt-28">
            <HomeFrontpageSearch />
            <nav
              aria-label={t("quickChoicesTitle")}
              className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 pb-6 pt-4 text-sm sm:pb-8"
            >
              <span className="font-semibold text-text-primary">{t("quickChoicesTitle")}:</span>
              {quickCards.map((entry) => (
                <TrackedLink
                  key={`${entry.cta}-${entry.href}`}
                  href={entry.href}
                  analyticsEventName="homepage_cta_clicked"
                  analyticsPayload={{
                    cta: entry.cta,
                    surface: "home_quick_search",
                    destination: entry.href,
                  }}
                  className="inline-flex items-center gap-1 font-medium text-[var(--home-brand)] underline-offset-4 hover:underline"
                >
                  {entry.title}
                  <ArrowRightIcon className="size-3.5" />
                </TrackedLink>
              ))}
            </nav>
          </div>
        </section>

        <Suspense fallback={<HomeFeaturedAdsFallback />}>
          <HomeFeaturedAdsSection marketCode={marketCode} marketCopy={marketCopy} />
        </Suspense>

        <section className="border-b border-black/8 bg-white">
          <div className="mx-auto grid max-w-7xl divide-y divide-black/8 px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6">
            {trustItems.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="flex min-w-0 items-center gap-2.5 py-3 sm:px-5 sm:py-4 first:pl-0 last:pr-0">
                  <Icon className="size-4.5 shrink-0 text-[var(--home-brand)]" />
                  <h2 className="!text-sm font-semibold text-text-primary">{item.title}</h2>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:py-12">
          <div className="overflow-hidden rounded-2xl bg-[var(--home-brand)] text-white md:grid md:grid-cols-[1.05fr_.95fr]">
            <div className="p-6 sm:p-8 lg:p-10">
              <p className="text-sm font-semibold text-white">{t("sellerPromoEyebrow")}</p>
              <h2 className="mt-2 !text-3xl font-semibold !text-white sm:!text-4xl">
                {t("sellerPromoTitle")}
              </h2>
              <p className="mt-3 max-w-xl text-base leading-relaxed text-white/82">
                {t("sellerPanelDescription")}
              </p>
              <p className="mt-4 text-sm font-semibold text-white">
                {t("sellerPromoFootnote")}
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <TrackedLink
                  href={CREATE_LISTING_ROUTE}
                  analyticsEventName="homepage_cta_clicked"
                  analyticsPayload={{
                    cta: "sell_car",
                    surface: "home_seller_promo",
                    destination: CREATE_LISTING_ROUTE,
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--home-cta)] px-5 text-sm font-semibold text-[var(--home-cta-text)] transition-colors hover:bg-[var(--color-accent-hover)]"
                >
                  {t("ctaSellCar")}
                  <ArrowRightIcon className="size-4" />
                </TrackedLink>
                <TrackedLink
                  href="/dealer"
                  analyticsEventName="homepage_cta_clicked"
                  analyticsPayload={{
                    cta: "dealers",
                    surface: "home_seller_promo",
                    destination: "/dealer",
                  }}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/50 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  {t("sellerPromoDealersCta")}
                </TrackedLink>
              </div>
            </div>
            <div className="relative min-h-52 md:min-h-full">
              <Image
                src="/homepage-dealer-showroom-v2.webp"
                alt={sellerImageAlt}
                fill
                loading="eager"
                sizes="(min-width: 768px) 45vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        <section
          aria-label={tHomeSearch("popularBrandsLabel")}
          className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:pb-12"
        >
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="!text-2xl font-semibold text-text-primary">
              {tHomeSearch("popularBrandsLabel")}
            </h2>
            <TrackedLink
              href={getMarketPath("/vysledky", marketCode)}
              analyticsEventName="homepage_cta_clicked"
              analyticsPayload={{
                cta: "view_all_brands",
                surface: "home_brand_logos",
                destination: getMarketPath("/vysledky", marketCode),
              }}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--home-brand)] underline-offset-4 hover:underline"
            >
              {t("viewAll")}
              <ArrowRightIcon className="size-4" />
            </TrackedLink>
          </div>

          <div className="grid grid-cols-4 gap-x-3 gap-y-6 sm:grid-cols-8">
            {BRAND_LOGOS.map((brand) => (
              <TrackedLink
                key={brand.name}
                href={brand.href}
                analyticsEventName="homepage_cta_clicked"
                analyticsPayload={{
                  cta: "popular_brand",
                  surface: "home_brand_logos",
                  destination: brand.href,
                }}
                className="flex min-h-16 flex-col items-center justify-center gap-2 text-center opacity-90 transition-opacity hover:opacity-100"
              >
                <span className="relative h-8 w-14">
                  <Image src={brand.src} alt={`Logo značky ${brand.name}`} fill sizes="64px" className="object-contain" />
                </span>
                <span className="hidden text-xs font-medium text-text-secondary sm:block">{brand.name}</span>
              </TrackedLink>
            ))}
          </div>

        </section>
      </main>
    </div>
  );
}

function HomeFeaturedAdsFallback() {
  return (
    <section
      aria-hidden="true"
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-14"
    >
      <div className="mb-6 h-9 w-56 rounded-lg bg-background-muted" />
      <div className="grid gap-3 md:hidden">
        {[0, 1].map((row) => (
          <div
            key={row}
            className="flex w-full min-w-0 max-w-full gap-3 overflow-hidden pb-2"
          >
            {[0, 1, 2].map((card) => (
              <div
                key={`${row}-${card}`}
                className="min-h-[17.75rem] w-[calc((100%-1.5rem)/2.25)] shrink-0 rounded-lg border border-black/10 bg-background-muted"
              />
            ))}
          </div>
        ))}
      </div>
      <div className="hidden grid-cols-5 gap-4 md:grid lg:gap-5">
        {[0, 1, 2, 3, 4].map((card) => (
          <div
            key={card}
            className="min-h-[17.75rem] rounded-lg border border-black/10 bg-background-muted"
          />
        ))}
      </div>
    </section>
  );
}

async function HomeFeaturedAdsSection({
  marketCode,
  marketCopy,
}: {
  marketCode: MarketCode;
  marketCopy: PublicMarketCopy;
}) {
  const featuredCars = await getFeaturedCars(marketCode);
  const topAdCards: HomeFeaturedAdCard[] = featuredCars.slice(0, 10).map((car) => ({
    id: car.id,
    href: getMarketPath(buildAdPath({
      id: car.id,
      brand: car.brand,
      model: car.model,
      year: car.year,
    }), marketCode),
    title: `${car.brand} ${car.model}`,
    year: String(car.year || "—"),
    mileage:
      typeof car.mileage === "number" && car.mileage > 0
        ? `${formatMarketNumber(car.mileage, marketCopy)} km`
        : "—",
    fuel: formatPublicCarValue(car.fuel, marketCode, "fuel") || "—",
    location: car.location || marketCopy.locationFallback,
    price:
      typeof car.price === "number" && car.price > 0
        ? formatMarketCurrency(car.price, marketCopy)
        : marketCopy.vehiclePriceOnRequest,
    image: optimizeCloudflareImage(car.image || "/placeholder-car.jpg", {
      width: 768,
      height: 768,
      fit: "cover",
      quality: 88,
      format: "auto",
    }),
  }));

  return <HomeFeaturedAdsRows cards={topAdCards} />;
}
