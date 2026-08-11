"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { BRAND_SOCIAL_CHANNELS, BRAND_SOCIAL_LINKS } from "@/config/brand";
import { COMPANY_INFO, PUBLIC_CONTACT_BY_MARKET } from "@/config/company";
import { AcceptedPaymentMethods } from "@/components/payments/AcceptedPaymentMethods";
import { CREATE_LISTING_ROUTE, getMarketPath } from "@/lib/routes";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useMarketCode } from "@/context/MarketContext";

export default function Footer({ currentYear }: { currentYear: number }) {
  const t = useTranslations("footer");
  const tCommon = useTranslations("common");
  const marketCode = useMarketCode();
  const pathname = usePathname();
  const isCompactAccountFooter = pathname === "/moj-ucet";
  const showsPaymentMethods =
    pathname === getMarketPath("/ceny", marketCode) ||
    pathname.startsWith("/dealer") ||
    pathname.startsWith(getMarketPath("/platba", marketCode));
  const publicContact = PUBLIC_CONTACT_BY_MARKET[marketCode];

  const footerLinks = {
    navigation: [
      { href: getMarketPath("/vysledky", marketCode), label: tCommon("cars") },
      { href: getMarketPath("/predajcovia", marketCode), label: tCommon("dealers") },
      { href: getMarketPath("/ceny", marketCode), label: tCommon("pricing") },
      { href: getMarketPath("/kontakt", marketCode), label: tCommon("contact") },
    ],
    forDealers: [
      { href: CREATE_LISTING_ROUTE, label: tCommon("addListing") },
      { href: getMarketPath("/ceny", marketCode), label: tCommon("pricing") },
      { href: "/dealer", label: t("forDealers") },
      { href: "/moj-ucet", label: tCommon("myAccount") },
    ],
    legal: [
      { href: getMarketPath("/o-nas", marketCode), label: tCommon("about") },
      { href: getMarketPath("/obchodne-podmienky", marketCode), label: t("termsOfService") },
      { href: getMarketPath("/ochrana-udajov", marketCode), label: t("privacyPolicy") },
      { href: "/cookies", label: t("cookiePolicy") },
      { href: "/site-map", label: t("sitemap") },
    ],
  };
  const socialLinks = BRAND_SOCIAL_CHANNELS.map((channel) => ({
    ...channel,
    href: BRAND_SOCIAL_LINKS[channel.key],
  }));
  const hasActiveSocialLinks = socialLinks.some((link) => Boolean(link.href));

  return (
    <footer
      className="print:hidden bg-[var(--color-primary)] text-white"
      role="contentinfo"
      data-mobile-variant={isCompactAccountFooter ? "compact" : "full"}
    >
      <div className={`container-main ${isCompactAccountFooter ? "py-6 md:py-7" : "py-8 lg:py-10"}`}>
        {isCompactAccountFooter ? (
          <div
            data-account-footer-compact
            className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/" prefetch={false} className="inline-flex items-center">
                <BrandLogo
                  marketCode={marketCode}
                  inverse
                  showDomain
                  className="text-xl text-white"
                />
              </Link>
              <FooterLink href={getMarketPath("/kontakt", marketCode)}>
                {tCommon("contact")}
              </FooterLink>
            </div>
            <nav
              aria-label={t("legal")}
              className="flex flex-wrap gap-x-5 gap-y-3 md:justify-end"
            >
              {footerLinks.legal.slice(1, 4).map((link) => (
                <FooterLink key={link.href} href={link.href}>{link.label}</FooterLink>
              ))}
            </nav>
          </div>
        ) : (
          <div className="md:hidden">
            <Link href="/" prefetch={false} className="inline-flex items-center">
              <BrandLogo
                marketCode={marketCode}
                inverse
                showDomain
                className="text-2xl text-white"
              />
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/78">{t("description")}</p>

            <div className="mt-6 divide-y divide-white/12 border-y border-white/12">
              <MobileFooterSection title={t("navigation")}>
                {footerLinks.navigation.map((link) => (
                  <FooterLink key={link.href} href={link.href}>{link.label}</FooterLink>
                ))}
              </MobileFooterSection>
              <MobileFooterSection title={t("forDealers")}>
                {footerLinks.forDealers.map((link) => (
                  <FooterLink key={link.href} href={link.href}>{link.label}</FooterLink>
                ))}
              </MobileFooterSection>
              <MobileFooterSection title={t("legal")}>
                {footerLinks.legal.map((link) => (
                  <FooterLink key={link.href} href={link.href}>{link.label}</FooterLink>
                ))}
              </MobileFooterSection>
              <MobileFooterSection title={t("contact")}>
                {publicContact.phoneHref ? (
                  <a href={`tel:${publicContact.phoneHref}`} className="text-sm text-white">
                    {publicContact.phoneDisplay}
                  </a>
                ) : null}
                <a href={`mailto:${publicContact.email}`} className="text-sm text-white">
                  {publicContact.email}
                </a>
                <span className="text-sm text-white/78">{t("locationLine")}</span>
              </MobileFooterSection>
            </div>
          </div>
        )}

        {!isCompactAccountFooter ? (
          <div data-full-footer-desktop className="hidden gap-8 md:grid md:grid-cols-12">
            <div className="space-y-5 sm:col-span-2 lg:col-span-4">
            <Link href="/" prefetch={false} className="inline-flex items-center gap-2 group">
              <BrandLogo
                marketCode={marketCode}
                inverse
                showDomain
                className="text-2xl text-white"
              />
            </Link>

            <p className="max-w-xs text-sm leading-relaxed text-white/82">{t("description")}</p>

            <div className="space-y-1 text-sm text-white/82">
              <p className="font-semibold text-white">{COMPANY_INFO.legalName}</p>
              <p>{t("operatorLine")}</p>
              <p>{t("locationLine")}</p>
            </div>

            {hasActiveSocialLinks ? (
              <div className="pt-1">
                <div className="flex items-center gap-2">
                  {socialLinks
                    .filter((link): link is typeof link & { href: string } => Boolean(link.href))
                    .map((link) => (
                    <SocialLink
                      key={link.label}
                      href={link.href}
                      label={link.label}
                      iconPath={link.iconPath}
                    />
                    ))}
                </div>
              </div>
            ) : null}
            </div>

            <div className="lg:col-span-2">
            <FooterHeading>{t("navigation")}</FooterHeading>
            <ul className="space-y-2.5" role="list">
              {footerLinks.navigation.map((link) => (
                <li key={link.href}>
                  <FooterLink href={link.href}>{link.label}</FooterLink>
                </li>
              ))}
            </ul>
            </div>

            <div className="lg:col-span-2">
            <FooterHeading>{t("forDealers")}</FooterHeading>
            <ul className="space-y-2.5" role="list">
              {footerLinks.forDealers.map((link) => (
                <li key={link.href}>
                  <FooterLink href={link.href}>{link.label}</FooterLink>
                </li>
              ))}
            </ul>
            </div>

            <div className="lg:col-span-2">
            <FooterHeading>{t("legal")}</FooterHeading>
            <ul className="space-y-2.5" role="list">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <FooterLink href={link.href}>{link.label}</FooterLink>
                </li>
              ))}
            </ul>
            </div>

            <div className="lg:col-span-2">
            <FooterHeading>{t("contact")}</FooterHeading>
            <ul className="space-y-3 text-sm text-white/82">
              {publicContact.phoneHref ? (
                <li>
                  <a href={`tel:${publicContact.phoneHref}`} className="hover:text-white">
                    {publicContact.phoneDisplay}
                  </a>
                </li>
              ) : null}
              <li>
                <a href={`mailto:${publicContact.email}`} className="hover:text-white">
                  {publicContact.email}
                </a>
              </li>
              <li>{t("locationLine")}</li>
            </ul>
            </div>
          </div>
        ) : null}

        <div className={`${isCompactAccountFooter ? "mt-5" : "mt-7"} flex flex-col items-center gap-4 border-t border-white/12 pt-5 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left`}>
          <p className="text-xs text-white/78">{t("copyright", { year: currentYear })}</p>
          {!isCompactAccountFooter && showsPaymentMethods ? (
            <AcceptedPaymentMethods
              ariaLabel={t("acceptedPaymentMethods")}
              className="justify-center"
              itemClassName="h-9 rounded-lg px-2 py-1.5"
              imageClassName="h-4 w-6"
            />
          ) : null}
        </div>
      </div>
    </footer>
  );
}

function MobileFooterSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-semibold text-white marker:content-none">
        {title}
        <span aria-hidden="true" className="text-lg font-normal text-white/70 group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="grid gap-3 pb-4">
        {children}
      </div>
    </details>
  );
}

function FooterHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 text-sm font-semibold !text-white [text-transform:none] [letter-spacing:0] sm:mb-4 sm:text-base">
      {children}
    </h3>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="inline-flex items-center gap-2 text-sm text-white transition-colors hover:text-accent"
    >
      {children}
    </Link>
  );
}

function SocialLink({
  href,
  label,
  iconPath,
}: {
  href: string;
  label: string;
  iconPath: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="flex size-9 hit-target items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/85 transition-all motion-interruptible hover:bg-white/10 hover:text-white"
    >
      <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
        <path d={iconPath} />
      </svg>
    </a>
  );
}
