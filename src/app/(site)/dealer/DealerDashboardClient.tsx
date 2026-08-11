"use client";

import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import Image from "next/image";
import { formatCurrency } from "@/config/vat";
import { getMarketConfig } from "@/config/markets";
import { buildDealerPublicProfilePath } from "@/lib/dealer/public-profile-path";
import { formatSkDate } from "@/utils/date-format";
import { useLocale, useTranslations } from "next-intl";
import { optimizeCloudflareImage } from "@/lib/image-optimizer";
import { trackAnalyticsEvent } from "@/lib/analytics/client";
import { createCsrfHeaders } from "@/lib/security/client-csrf";
import { CREATE_LISTING_ROUTE } from "@/lib/routes";
import { useMarketCode } from "@/context/MarketContext";
import { toast } from "sonner";
import {
  VerifiedIcon,
  ExternalLinkIcon,
  PlusIcon,
} from "@/components/ui/Icons";
import {
  formatPriceCents,
  type DealerTopupPackageId,
  type ListingActionOperation,
} from "@/lib/pricing/config";

const TABS = [
  { id: "ads", labelKey: "ads", icon: "📝" },
  { id: "bulk", labelKey: "bulk", icon: "⚡" },
  { id: "billing", labelKey: "billing", icon: "💶" },
  { id: "storefront", labelKey: "storefront", icon: "🏪" },
  { id: "analytics", labelKey: "analytics", icon: "📊" },
  { id: "settings", labelKey: "settings", icon: "⚙️" },
] as const;

type DealerTabId = (typeof TABS)[number]["id"];

function getDealerLocaleTag(locale: string): string {
  return locale;
}

function getDealerInlineCopy(locale: string) {
  const isRo = locale.toLowerCase().startsWith("ro");
  return isRo
    ? {
        tabs: {
          ads: "Anunțuri",
          bulk: "Acțiuni în masă",
          billing: "Plăți",
          storefront: "Showroom",
          analytics: "Statistici",
          settings: "Setări",
        },
        profileLoadError: "Eroare la încărcarea profilului",
        verifiedDealer: "Dealer verificat",
        balance: "Sold",
        active: "Active",
        views: "Vizualizări",
        inquiries: "Cereri",
        sold: "Vândute",
        adsLoadError: "Eroare la încărcarea anunțurilor",
        noAdsYet: "Nu aveți încă niciun anunț",
        selectAll: "Selectează toate",
        selected: "Selectate",
        statusActive: "Activ",
        statusExpired: "Expirat",
        statusSold: "Vândut",
        days: "zile",
        chooseActiveAds: "Selectați mai întâi anunțuri active în fila Anunțuri.",
        confirmBulk: 'Aplicați "{action}" la {count} anunțuri?',
        actionFailed: "Acțiunea nu a putut fi executată.",
        actionApplied: 'Acțiunea "{action}" a fost aplicată la {count} anunțuri.',
        selectedAds: "Anunțuri selectate:",
        bulkHelp:
          "Aceleași prețuri ca pentru vânzătorii obișnuiți. Avantajul dealerului este soldul preplătit.",
        extend28: "Prelungește cu 28 zile",
        premium28: "Premium pentru 28 zile",
        exclusive28: "Exclusive pentru 28 zile",
        checkoutFailed: "Plata nu a putut fi creată.",
        prepaidBalance: "Sold preplătit pentru anunțuri",
        prepaidHelp:
          "Alimentați soldul și folosiți aceleași prețuri ca vânzătorii obișnuiți.",
        youGet: "Primiți în total {value}",
        processing: "Se procesează…",
        topUp: "Alimentează soldul",
        actionPrices: "Prețuri acțiuni",
        extend: "Prelungire",
        publicProfile: "Profil public showroom",
        storefrontUrl: "URL showroom:",
        contactDetails: "Date de contact",
        phone: "Tel.:",
        totalViews: "Vizualizări totale",
        totalInquiries: "Cereri totale",
        conversionRate: "Rată de conversie",
        topAdsByViews: "Top anunțuri după vizualizări",
        viewsCount: "{count} vizualizări",
        dealerVerification: "Verificarea dealerului",
        verifiedStore: "Showroom-ul este verificat.",
        requestVerificationHelp:
          "Cereți verificarea pentru a obține o insignă de încredere.",
        pendingApproval: "În așteptarea aprobării",
        unverified: "Neverificat",
        requestPlaceholder: "Adăugați pe scurt de ce showroom-ul trebuie verificat.",
        requestVerification: "Cere verificarea",
        sending: "Se trimite...",
        requestsLoading: "Se încarcă istoricul cererilor...",
        latestRequest: "Ultima cerere:",
        adminNote: "Notă admin:",
        verificationSent: "Cererea de verificare a fost trimisă.",
        verificationFailed: "Cererea nu a putut fi trimisă.",
        storeData: "Date showroom",
        companyName: "Numele firmei",
        description: "Descriere",
        address: "Adresă",
        saveChanges: "Salvează modificările",
      }
    : {
        tabs: {
          ads: "Inzeráty",
          bulk: "Hromadné akcie",
          billing: "Platby",
          storefront: "Predajňa",
          analytics: "Štatistiky",
          settings: "Nastavenia",
        },
        profileLoadError: "Chyba pri načítavaní profilu",
        verifiedDealer: "Overený dealer",
        balance: "Zostatok",
        active: "Aktívne",
        views: "Zobrazenia",
        inquiries: "Dopyty",
        sold: "Predané",
        adsLoadError: "Chyba pri načítavaní inzerátov",
        noAdsYet: "Zatiaľ nemáte žiadne inzeráty",
        selectAll: "Vybrať všetky",
        selected: "Vybraných",
        statusActive: "Aktívny",
        statusExpired: "Expirovaný",
        statusSold: "Predané",
        days: "dní",
        chooseActiveAds: "Najprv vyberte aktívne inzeráty v záložke Inzeráty.",
        confirmBulk: 'Aplikovať "{action}" na {count} inzerátov?',
        actionFailed: "Akciu sa nepodarilo vykonať.",
        actionApplied: 'Akcia "{action}" bola aplikovaná na {count} inzerátov.',
        selectedAds: "Vybraných inzerátov:",
        bulkHelp:
          "Rovnaké ceny ako pre bežných predajcov. Výhoda dealera je v predplatenom zostatku.",
        extend28: "Predĺžiť o 28 dní",
        premium28: "Premium na 28 dní",
        exclusive28: "Exclusive na 28 dní",
        checkoutFailed: "Nepodarilo sa vytvoriť platbu.",
        prepaidBalance: "Predplatený inzertný zostatok",
        prepaidHelp:
          "Dobite si zostatok a používajte rovnaké ceny ako bežní predajcovia.",
        youGet: "Získate spolu {value}",
        processing: "Spracovávam…",
        topUp: "Dobiť zostatok",
        actionPrices: "Ceny akcií",
        extend: "Predĺžiť",
        publicProfile: "Verejný profil predajne",
        storefrontUrl: "URL vašej predajne:",
        contactDetails: "Kontaktné údaje",
        phone: "Telefón:",
        totalViews: "Celkové zobrazenia",
        totalInquiries: "Celkové dopyty",
        conversionRate: "Konverzný pomer",
        topAdsByViews: "Top inzeráty podľa zobrazení",
        viewsCount: "{count} zobrazení",
        dealerVerification: "Overenie dealera",
        verifiedStore: "Vaša predajňa je overená.",
        requestVerificationHelp:
          "Požiadajte o overenie, aby ste získali dôveryhodný odznak.",
        pendingApproval: "Čaká na schválenie",
        unverified: "Neoverený",
        requestPlaceholder: "Krátko doplňte, prečo má byť predajňa overená.",
        requestVerification: "Požiadať o overenie",
        sending: "Odosielam...",
        requestsLoading: "Načítavam históriu žiadostí...",
        latestRequest: "Posledná žiadosť:",
        adminNote: "Poznámka admina:",
        verificationSent: "Žiadosť o overenie bola odoslaná.",
        verificationFailed: "Žiadosť sa nepodarilo odoslať.",
        storeData: "Údaje predajne",
        companyName: "Názov firmy",
        description: "Popis",
        address: "Adresa",
        saveChanges: "Uložiť zmeny",
      };
}

interface DealerProfile {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  website_url?: string;
  is_verified: boolean;
  prepaid_balance_cents?: number;
  created_at: string;
}

interface DealerTopupDisplayPackage {
  id: DealerTopupPackageId;
  label: string;
  value: string;
}

interface Ad {
  id: string;
  brand: string;
  model: string;
  year: number;
  price_eur: number;
  status: string;
  created_at?: string;
  views_count: number;
  expires_at?: string;
  top_expires_at?: string;
  highlight_expires_at?: string;
  is_top_ad: boolean;
  is_highlighted: boolean;
  photos_json?: string[];
  selected: boolean;
}

type DealerDashboardProfile = {
  email?: string | null;
} | null;

type DealerPricingConfigPayload = {
  config?: {
    dealerTopups?: Array<{
      id?: DealerTopupPackageId;
      label?: string;
      priceCents?: number;
      bonusCents?: number;
    }>;
  };
  summary?: {
    basic?: string;
    premium?: string;
    top?: string;
  };
} | null;

type DealerVerificationPayload = {
  requests?: Array<{
    id: string;
    request_note: string;
    status: "pending" | "approved" | "rejected";
    admin_note: string | null;
    created_at: string;
    reviewed_at: string | null;
  }>;
  error?: string;
} | null;

async function loadDealerPricingConfig(): Promise<DealerPricingConfigPayload> {
  const response = await fetch("/api/pricing/config", { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as DealerPricingConfigPayload;
  return response.ok ? payload : null;
}

async function loadDealerVerificationRequests(): Promise<DealerVerificationPayload> {
  const response = await fetch("/api/account/dealer-verification");
  const payload = (await response.json().catch(() => null)) as DealerVerificationPayload;

  if (!response.ok) {
    throw new Error(payload?.error || "Load failed");
  }

  return payload;
}

const normalizeAdStatus = (status: string | null | undefined): string =>
  (status ?? "").trim().toLowerCase();

const isActiveAdStatus = (status: string | null | undefined): boolean =>
  normalizeAdStatus(status) === "active";

const sortAdsActiveFirst = (ads: Ad[]): Ad[] =>
  ads.toSorted((left, right) => {
    const leftActive = isActiveAdStatus(left.status);
    const rightActive = isActiveAdStatus(right.status);

    if (leftActive !== rightActive) {
      return leftActive ? -1 : 1;
    }

    const leftCreatedAt = left.created_at
      ? new Date(left.created_at).getTime()
      : 0;
    const rightCreatedAt = right.created_at
      ? new Date(right.created_at).getTime()
      : 0;

    return rightCreatedAt - leftCreatedAt;
  });

export default function DealerDashboardClient({
  initialSearchParams = "",
  initialTab = null,
}: {
  initialSearchParams?: string;
  initialTab?: string | null;
}) {
  const controller = useDealerDashboardController({
    initialSearchParams,
    initialTab,
  });
  const { t, tCommon, inlineCopy } = controller;

  if (controller.loading || controller.loadingDealer) {
    return <DealerDashboardLoadingState />;
  }

  if (!controller.user) {
    return (
      <DealerDashboardCenteredMessage title={t("loginRequired")}>
        <Link
          href="/auth/login"
          className="inline-flex px-6 py-3 rounded-full bg-accent text-white font-semibold"
        >
          {tCommon("login")}
        </Link>
      </DealerDashboardCenteredMessage>
    );
  }

  if (!controller.dealer) {
    return (
      <DealerDashboardCenteredMessage
        title={t("becomeDealer")}
        description={t("dealerBenefits")}
        icon={<span className="text-3xl">🏪</span>}
      >
        <Link
          href="/kontakt"
          className="inline-flex px-6 py-3 rounded-full bg-accent text-white font-semibold"
        >
          {t("registerDealership")}
        </Link>
      </DealerDashboardCenteredMessage>
    );
  }

  if (controller.dealerError) {
    return (
      <DealerDashboardCenteredMessage
        title={inlineCopy.profileLoadError}
        description={controller.dealerError}
      >
        <Link
          href="/"
          className="inline-flex px-6 py-3 rounded-full bg-accent text-white font-semibold"
        >
          {tCommon("back")}
        </Link>
      </DealerDashboardCenteredMessage>
    );
  }

  return (
    <DealerDashboardMainContent
      dealer={controller.dealer}
      profile={controller.profile}
      ads={controller.ads}
      activeAds={controller.activeAds}
      activeTab={controller.activeTab}
      onTabChange={controller.handleTabChange}
      t={t}
      tCommon={tCommon}
      selectAll={controller.selectAll}
      toggleSelectAll={controller.toggleSelectAll}
      toggleSelect={controller.toggleSelect}
      selectedCount={controller.selectedCount}
      loadingAds={controller.loadingAds}
      adsError={controller.adsError}
      totalInquiries={controller.totalInquiries}
      setAds={controller.setAds}
      setSelectAllValue={controller.setSelectAllValue}
      pricingSummary={controller.pricingSummary}
      dealerTopups={controller.dealerTopups}
      inlineCopy={inlineCopy}
      localeTag={controller.localeTag}
    />
  );
}

function useDealerDashboardController({
  initialSearchParams,
  initialTab,
}: {
  initialSearchParams: string;
  initialTab: string | null;
}) {
  const { user, profile, loading } = useAuth();
  const marketCode = useMarketCode();
  const { replace } = useRouter();
  const pathname = usePathname();
  const tabParam = initialTab;
  const activeTab =
    (TABS.some((tab) => tab.id === tabParam) ? tabParam : "ads") as DealerTabId;
  const [pricingState, setPricingState] = useState<{
    dealerTopups: DealerTopupDisplayPackage[];
    pricingSummary: {
      basic: string;
      premium: string;
      top: string;
    };
  }>({
    dealerTopups: [
      { id: "dealer_100", label: "100 €", value: "108 €" },
      { id: "dealer_300", label: "300 €", value: "345 €" },
      { id: "dealer_1000", label: "1000 €", value: "1200 €" },
    ],
    pricingSummary: {
      basic: "Zadarmo / 28 dní",
      premium: "4,99 € / 28 dní",
      top: "9,99 € / 28 dní",
    },
  });
  const [dealerState, setDealerState] = useState<{
    dealer: DealerProfile | null;
    loadingDealer: boolean;
    dealerError: string | null;
  }>({
    dealer: null,
    loadingDealer: false,
    dealerError: null,
  });
  const [adsState, setAdsState] = useState<{
    ads: Ad[];
    selectAll: boolean;
    loadingAds: boolean;
    adsError: string | null;
    totalInquiries: number;
  }>({
    ads: [],
    selectAll: false,
    loadingAds: false,
    adsError: null,
    totalInquiries: 0,
  });
  const t = useTranslations("dealer");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const inlineCopy = useMemo(() => getDealerInlineCopy(locale), [locale]);
  const localeTag = getDealerLocaleTag(locale);
  const supabase = useMemo(() => createClient(), []);
  const { dealer, loadingDealer, dealerError } = dealerState;
  const { ads, selectAll, loadingAds, adsError, totalInquiries } = adsState;
  const { dealerTopups, pricingSummary } = pricingState;

  // Fetch dealer profile on mount
  useEffect(() => {
    if (!user) return;

    const fetchDealerProfile = async () => {
      setDealerState((prev) => ({
        ...prev,
        loadingDealer: true,
        dealerError: null,
      }));

      let resolvedDealer: DealerProfile | null | undefined = undefined;
      let resolvedError: string | null = null;
      try {
        const { data, error } = await supabase
          .from("dealers")
          .select("*")
          .eq("owner_id", user.id)
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            // No dealer found - user is not a dealer
            resolvedDealer = null;
          } else {
            console.error("Dealer fetch error:", error);
            resolvedError = error.message;
          }
        } else if (data) {
          resolvedDealer = data as DealerProfile;
        }
      } catch (err) {
        console.error("Exception fetching dealer:", err);
        resolvedError = err instanceof Error ? err.message : "Unknown error";
      }

      setDealerState((prev) => ({
        dealer: resolvedDealer === undefined ? prev.dealer : resolvedDealer,
        loadingDealer: false,
        dealerError: resolvedError,
      }));
    };

    fetchDealerProfile();
  }, [user, supabase]);

  // Fetch ads for the dealer
  useEffect(() => {
    if (!dealer || !user) return;

    const fetchDealerAds = async () => {
      setAdsState((prev) => ({
        ...prev,
        loadingAds: true,
        adsError: null,
      }));

      let resolvedAds: Ad[] | undefined = undefined;
      let resolvedError: string | null = null;
      let resolvedTotalInquiries: number | undefined = undefined;
      try {
        const { data, error } = await supabase
          .from("ads")
          .select(
            `
                        id,
                        brand,
                        model,
                        year,
                        price_eur,
                        status,
                        created_at,
                        views_count,
                        expires_at,
                        top_expires_at,
                        highlight_expires_at,
                        is_top_ad,
                        is_highlighted,
                        photos_json
                    `,
          )
          .eq("dealer_id", dealer.id)
          .eq("market_code", marketCode)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Ads fetch error:", error);
          resolvedError = error.message;
        } else if (data) {
          // Transform data and add selected property
          const transformedAds = data.map((ad: Record<string, unknown>) => ({
            ...ad,
            selected: false,
          }));
          resolvedAds = sortAdsActiveFirst(transformedAds as Ad[]);

          const adIds = resolvedAds.map((ad) => ad.id);
          if (adIds.length === 0) {
            resolvedTotalInquiries = 0;
          } else {
            const { count, error: inquiriesError } = await supabase
              .from("inquiry_conversations")
              .select("id", { count: "exact", head: true })
              .in("ad_id", adIds)
              .neq("buyer_id", user.id);

            if (inquiriesError) {
              console.error("Inquiries count fetch error:", inquiriesError);
            } else {
              resolvedTotalInquiries = count ?? 0;
            }
          }
        }
      } catch (err) {
        console.error("Exception fetching ads:", err);
        resolvedError = err instanceof Error ? err.message : "Unknown error";
      }

      setAdsState((prev) => ({
        ...prev,
        ads: resolvedAds ?? prev.ads,
        loadingAds: false,
        adsError: resolvedError,
        totalInquiries:
          resolvedTotalInquiries ?? (resolvedAds ? 0 : prev.totalInquiries),
      }));
    };

    fetchDealerAds();
  }, [dealer, marketCode, supabase, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadPricingSummary() {
      try {
        const payload = await loadDealerPricingConfig();

        if (!cancelled && payload?.summary) {
          const nextPricingSummary = {
            basic: payload.summary.basic || "Zadarmo / 28 dní",
            premium: payload.summary.premium || "4,99 € / 28 dní",
            top: payload.summary.top || "9,99 € / 28 dní",
          };
          let nextDealerTopups: DealerTopupDisplayPackage[] | null = null;
          if (Array.isArray(payload.config?.dealerTopups) && payload.config.dealerTopups.length > 0) {
            nextDealerTopups = payload.config.dealerTopups.reduce<
              Array<{ id: DealerTopupPackageId; label: string; value: string }>
            >((topups, entry) => {
                if (
                  (entry?.id === "dealer_100"
                    || entry?.id === "dealer_300"
                    || entry?.id === "dealer_1000")
                  && typeof entry.label === "string"
                  && typeof entry.priceCents === "number"
                  && typeof entry.bonusCents === "number"
                ) {
                  topups.push({
                    id: entry.id,
                    label: entry.label,
                    value: formatPriceCents(entry.priceCents + entry.bonusCents),
                  });
                }
                return topups;
              }, []);
          }
          setPricingState((current) => ({
            dealerTopups: nextDealerTopups ?? current.dealerTopups,
            pricingSummary: nextPricingSummary,
          }));
        }
      } catch {
        // Keep defaults.
      }
    }

    void loadPricingSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleTabChange = useCallback(
    (tabId: DealerTabId) => {
      if (tabId === activeTab && tabParam === tabId) {
        return;
      }

      const params = new URLSearchParams(initialSearchParams);
      params.set("tab", tabId);
      replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [activeTab, initialSearchParams, pathname, replace, tabParam],
  );

  const selectedCount = ads.filter((ad) => ad.selected).length;
  const activeAds = ads.filter((ad) => isActiveAdStatus(ad.status));
  const setAds: React.Dispatch<React.SetStateAction<Ad[]>> = (next) => {
    setAdsState((prev) => ({
      ...prev,
      ads: typeof next === "function" ? next(prev.ads) : next,
    }));
  };
  const setSelectAllValue = (value: boolean) => {
    setAdsState((prev) => ({
      ...prev,
      selectAll: value,
    }));
  };

  const toggleSelectAll = () => {
    const newSelectAll = !selectAll;
    setAdsState((prev) => ({
      ...prev,
      selectAll: newSelectAll,
      ads: prev.ads.map((ad) => ({
        ...ad,
        selected: isActiveAdStatus(ad.status) ? newSelectAll : false,
      })),
    }));
  };

  const toggleSelect = (id: string) => {
    setAdsState((prev) => ({
      ...prev,
      ads: prev.ads.map((ad) =>
        ad.id === id ? { ...ad, selected: !ad.selected } : ad,
      ),
    }));
  };

  return {
    activeAds,
    activeTab,
    ads,
    adsError,
    dealer,
    dealerError,
    dealerTopups,
    handleTabChange,
    loading,
    loadingAds,
    loadingDealer,
    pricingSummary,
    profile,
    selectAll,
    selectedCount,
    setAds,
    setSelectAllValue,
    t,
    tCommon,
    inlineCopy,
    localeTag,
    toggleSelect,
    toggleSelectAll,
    totalInquiries,
    user,
  };
}

function DealerDashboardLoadingState() {
  return (
    <main className="pt-24 pb-16 min-h-screen flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="size-16 rounded-full bg-surface" />
        <div className="h-4 w-32 rounded bg-surface" />
      </div>
    </main>
  );
}

function DealerDashboardCenteredMessage({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="pt-24 pb-16 min-h-screen">
      <div className="mx-auto max-w-lg px-4 text-center">
        {icon ? (
          <div className="size-16 mx-auto mb-6 rounded-full bg-accent/10 flex items-center justify-center">
            {icon}
          </div>
        ) : null}
        <h1 className="text-2xl font-semibold text-primary mb-4">{title}</h1>
        {description ? <p className="text-secondary mb-6">{description}</p> : null}
        {children}
      </div>
    </main>
  );
}

function DealerDashboardMainContent({
  dealer,
  profile,
  ads,
  activeAds,
  activeTab,
  onTabChange,
  t,
  tCommon,
  selectAll,
  toggleSelectAll,
  toggleSelect,
  selectedCount,
  loadingAds,
  adsError,
  totalInquiries,
  setAds,
  setSelectAllValue,
  pricingSummary,
  dealerTopups,
  inlineCopy,
  localeTag,
}: {
  dealer: DealerProfile;
  profile: DealerDashboardProfile;
  ads: Ad[];
  activeAds: Ad[];
  activeTab: DealerTabId;
  onTabChange: (tab: DealerTabId) => void;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
  selectAll: boolean;
  toggleSelectAll: () => void;
  toggleSelect: (id: string) => void;
  selectedCount: number;
  loadingAds: boolean;
  adsError: string | null;
  totalInquiries: number;
  setAds: React.Dispatch<React.SetStateAction<Ad[]>>;
  setSelectAllValue: (value: boolean) => void;
  pricingSummary: {
    basic: string;
    premium: string;
    top: string;
  };
  dealerTopups: DealerTopupDisplayPackage[];
  inlineCopy: ReturnType<typeof getDealerInlineCopy>;
  localeTag: ReturnType<typeof getDealerLocaleTag>;
}) {
  return (
    <main className="pt-20 pb-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="py-8 flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            {dealer.logo_url && (
              <Image
                src={dealer.logo_url}
                alt={dealer.name}
                width={64}
                height={64}
                className="rounded-xl object-cover border border-border"
              />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold text-primary">{dealer.name}</h1>
                {dealer.is_verified && (
                  <span className="text-accent" title={inlineCopy.verifiedDealer}>
                    <VerifiedIcon className="size-5" />
                  </span>
                )}
              </div>
              <p className="text-secondary">{dealer.address || ""}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Link
              href="/moj-ucet"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-primary hover:bg-surface"
            >
              {tCommon("myAccount")}
            </Link>
            <Link
              href={buildDealerPublicProfilePath(dealer.slug)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-primary hover:bg-surface"
            >
              <ExternalLinkIcon className="size-4" />
              {t("viewStorefront")}
            </Link>
            <Link
              href={CREATE_LISTING_ROUTE}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-accent text-white font-semibold hover:bg-accent-hover"
            >
              <PlusIcon className="size-5" />
              {t("addListing")}
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8 sm:grid-cols-4 lg:grid-cols-5">
          <StatCard
            icon="\u{1F4B0}"
            label={inlineCopy.balance}
            value={`${((dealer.prepaid_balance_cents || 0) / 100).toLocaleString(localeTag, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} €`}
          />
          <StatCard
            icon="\u{1F4CB}"
            label={inlineCopy.active}
            value={activeAds.length.toString()}
          />
          <StatCard
            icon="\u{1F441}\u{FE0F}"
            label={inlineCopy.views}
            value={ads
              .reduce((s, a) => s + (a.views_count || 0), 0)
              .toLocaleString(localeTag)}
          />
          <StatCard
            icon="\u{1F4AC}"
            label={inlineCopy.inquiries}
            value={totalInquiries.toString()}
          />
          <StatCard
            icon="\u{2705}"
            label={inlineCopy.sold}
            value={ads.filter((a) => a.status === "sold").length.toString()}
          />
        </div>

        <div
          className="flex gap-2 overflow-x-auto pb-4 mb-6 border-b border-border"
          role="tablist"
          aria-label="Sekcie dealer dashboardu"
        >
              {TABS.map((tab) => (
                <button
              key={tab.id}
              id={`dealer-tab-${tab.id}`}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                activeTab === tab.id
                  ? "bg-accent text-white"
                  : "bg-surface text-secondary hover:text-primary"
              }`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`dealer-tabpanel-${tab.id}`}
            >
                  <span>{tab.icon}</span>
                  {inlineCopy.tabs[tab.labelKey]}
                </button>
              ))}
        </div>

        <section
          id={`dealer-tabpanel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`dealer-tab-${activeTab}`}
        >
          {activeTab === "ads" && (
            <AdsTab
              ads={ads}
              selectAll={selectAll}
              toggleSelectAll={toggleSelectAll}
              toggleSelect={toggleSelect}
              selectedCount={selectedCount}
              loading={loadingAds}
              error={adsError}
              inlineCopy={inlineCopy}
            />
          )}
          {activeTab === "bulk" && (
            <BulkActionsTab
              ads={ads}
              selectedCount={selectedCount}
              setAds={setAds}
              setSelectAllValue={setSelectAllValue}
              pricingSummary={pricingSummary}
              inlineCopy={inlineCopy}
            />
          )}
          {activeTab === "billing" && (
            <BillingTab
              dealer={dealer}
              pricingSummary={pricingSummary}
              dealerTopups={dealerTopups}
              inlineCopy={inlineCopy}
              localeTag={localeTag}
            />
          )}
          {activeTab === "storefront" && (
            <StorefrontTab dealer={dealer} profile={profile} inlineCopy={inlineCopy} />
          )}
          {activeTab === "analytics" && (
            <AnalyticsTab
              ads={ads}
              totalInquiries={totalInquiries}
              inlineCopy={inlineCopy}
              localeTag={localeTag}
            />
          )}
          {activeTab === "settings" && <SettingsTab dealer={dealer} inlineCopy={inlineCopy} />}
        </section>
      </div>
    </main>
  );
}

// Ads Tab
function AdsTab({
  ads,
  selectAll,
  toggleSelectAll,
  toggleSelect,
  selectedCount,
  loading = false,
  error = null,
  inlineCopy,
}: {
  ads: Ad[];
  selectAll: boolean;
  toggleSelectAll: () => void;
  toggleSelect: (id: string) => void;
  selectedCount: number;
  loading?: boolean;
  error?: string | null;
  inlineCopy: ReturnType<typeof getDealerInlineCopy>;
}) {
  const tCommon = useTranslations("common");

  // Memoize the getDaysRemaining function to avoid Date.now() calls during render
  const getDaysRemaining = useCallback((dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    const now = Date.now();
    const days = Math.ceil(
      (new Date(dateStr).getTime() - now) / (1000 * 60 * 60 * 24),
    );
    return days > 0 ? days : 0;
  }, []);

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="size-12 rounded-full bg-surface" />
          <div className="h-4 w-40 rounded bg-surface" />
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="p-6 rounded-xl border border-error/20 bg-error-subtle">
        <p className="text-error font-medium">
          {inlineCopy.adsLoadError}
        </p>
        <p className="text-error text-sm mt-2">{error}</p>
      </div>
    );
  }

  // Show empty state
  if (ads.length === 0) {
    return (
      <div className="text-center p-8 rounded-xl border border-dashed border-border">
        <p className="text-secondary">{inlineCopy.noAdsYet}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Selection Header */}
      <div className="flex items-center justify-between mb-4 p-4 rounded-xl bg-surface">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={selectAll}
            onChange={toggleSelectAll}
            className="size-5 rounded border-border accent-accent"
          />
          <span className="text-sm font-medium text-primary">
            {inlineCopy.selectAll} ({ads.filter((a) => isActiveAdStatus(a.status)).length})
          </span>
        </label>

        {selectedCount > 0 && (
          <span className="text-sm text-secondary">
            {inlineCopy.selected}:{" "}
            <span className="font-semibold text-accent">{selectedCount}</span>
          </span>
        )}
      </div>

      {/* Ads List */}
      <div className="space-y-3">
        {ads.map((ad) => {
          const daysRemaining = getDaysRemaining(ad.expires_at);
          const normalizedStatus = normalizeAdStatus(ad.status);

          return (
            <div
              key={ad.id}
              className={`flex gap-4 rounded-xl border p-4 transition-[background-color,border-color,box-shadow] ${
                ad.selected
                  ? "border-accent bg-accent/5"
                  : "border-border bg-background hover:border-accent/30"
              }`}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={ad.selected}
                onChange={() => toggleSelect(ad.id)}
                disabled={!isActiveAdStatus(ad.status)}
                className="mt-1 size-5 rounded border-border accent-accent disabled:opacity-50"
              />

              {/* Photo */}
              <div className="relative w-28 h-20 rounded-lg overflow-hidden shrink-0 bg-surface">
                {ad.photos_json && ad.photos_json.length > 0 ? (
                  <Image
                    src={optimizeCloudflareImage(ad.photos_json[0], {
                      width: 336,
                      height: 240,
                      fit: "cover",
                      quality: 82,
                      format: "auto",
                    })}
                    alt={`${ad.brand} ${ad.model}`}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                ) : (
                  <div className="size-full flex items-center justify-center text-2xl">
                    📷
                  </div>
                )}
                {ad.is_top_ad && (
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-accent text-white text-xs font-semibold">
                    Exclusive
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-primary">
                      {ad.brand} {ad.model}
                    </h3>
                    <p className="text-sm text-secondary">
                      {ad.year} • {formatCurrency(ad.price_eur)}
                    </p>
                  </div>
                  {/* status + edit */}
                  <div className="flex items-center gap-2">
                    {normalizedStatus === "active" ? (
                      <span className="px-2 py-1 rounded-full bg-success/10 text-success text-xs font-medium">
                        {inlineCopy.statusActive}
                      </span>
                    ) : normalizedStatus === "expired" ? (
                      <span className="px-2 py-1 rounded-full bg-warning/10 text-warning text-xs font-medium">
                        {inlineCopy.statusExpired}
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-medium">
                        {inlineCopy.statusSold}
                      </span>
                    )}
                    <Link
                      href={`/upravit-inzerat/${ad.id}`}
                      className="px-2.5 py-1 rounded-md border border-border text-xs font-medium text-primary hover:bg-surface"
                    >
                      {tCommon("edit")}
                    </Link>
                  </div>
                </div>

                <div className="flex gap-4 mt-2 text-sm text-secondary">
                  <span>👁️ {ad.views_count || 0}</span>
                  <span>💬 0</span>
                  {daysRemaining !== null && (
                    <span className={daysRemaining <= 5 ? "text-error" : ""}>
                      ⏱️ {daysRemaining} {inlineCopy.days}
                    </span>
                  )}
                  {ad.is_highlighted && <span>✨ Premium</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Bulk Actions Tab
function BulkActionsTab({
  ads,
  selectedCount,
  setAds,
  setSelectAllValue,
  pricingSummary,
  inlineCopy,
}: {
  ads: Ad[];
  selectedCount: number;
  setAds: React.Dispatch<React.SetStateAction<Ad[]>>;
  setSelectAllValue: (value: boolean) => void;
  pricingSummary: {
    basic: string;
    premium: string;
    top: string;
  };
  inlineCopy: ReturnType<typeof getDealerInlineCopy>;
}) {
  const [processingActionId, setProcessingActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const parsePriceValue = useCallback((label: string) => {
    const match = label.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : 0;
  }, []);

  const bulkActions: Array<{
    id: ListingActionOperation;
    label: string;
    icon: string;
    priceLabel: string;
  }> = [
    { id: "prolong_basic", label: inlineCopy.extend28, icon: "P", priceLabel: pricingSummary.basic },
    { id: "prolong_premium", label: inlineCopy.premium28, icon: "PR", priceLabel: pricingSummary.premium },
    { id: "prolong_top", label: inlineCopy.exclusive28, icon: "EX", priceLabel: pricingSummary.top },
  ];

  const handleBulkAction = async (
    actionId: ListingActionOperation,
    actionLabel: string,
  ) => {
    if (processingActionId) {
      return;
    }

    const selectedAdIds = ads.reduce<string[]>((adIds, ad) => {
      if (ad.selected && isActiveAdStatus(ad.status)) {
        adIds.push(ad.id);
      }
      return adIds;
    }, []);

    if (selectedAdIds.length === 0) {
      setFeedback({
        type: "error",
        message: inlineCopy.chooseActiveAds,
      });
      return;
    }

    const confirmed = window.confirm(
      inlineCopy.confirmBulk
        .replace("{action}", actionLabel)
        .replace("{count}", selectedAdIds.length.toString()),
    );

    if (!confirmed) {
      return;
    }

    setFeedback(null);
    setProcessingActionId(actionId);

    try {
      const response = await fetch("/api/dealer/actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...createCsrfHeaders(),
        },
        body: JSON.stringify({
          adIds: selectedAdIds,
          operation: actionId,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            appliedCount?: number;
            amountCents?: number;
            newBalanceCents?: number;
          }
        | null;

      if (!response.ok || !result?.ok) {
        setFeedback({
          type: "error",
          message: result?.error || inlineCopy.actionFailed,
        });
        return;
      }

      const nextExpiration = new Date();
      nextExpiration.setDate(nextExpiration.getDate() + 28);
      const nextExpirationIso = nextExpiration.toISOString();

      setAds((prev) =>
        prev.map((ad) => {
          if (!selectedAdIds.includes(ad.id)) {
            return ad;
          }

          return {
            ...ad,
            selected: false,
            expires_at: nextExpirationIso,
            is_top_ad: actionId === "prolong_top",
            is_highlighted: actionId === "prolong_premium",
          };
        }),
      );
      setSelectAllValue(false);

      if (actionId === "prolong_premium" || actionId === "prolong_top") {
        for (const adId of selectedAdIds) {
          trackAnalyticsEvent("listing_feature_purchased", {
            adId,
            featureType: actionId === "prolong_top" ? "exclusive" : "premium",
            purchaseSurface: "dealer_bulk",
            valueEur:
              actionId === "prolong_top"
                ? parsePriceValue(pricingSummary.top)
                : parsePriceValue(pricingSummary.premium),
          });
        }
      }

      setFeedback({
        type: "success",
        message: inlineCopy.actionApplied
          .replace("{action}", actionLabel)
          .replace("{count}", String(result.appliedCount || selectedAdIds.length)),
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : inlineCopy.actionFailed,
      });
    } finally {
      setProcessingActionId(null);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6 p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-secondary">{inlineCopy.selectedAds}</span>
          <span className="text-xl font-bold text-primary">{selectedCount}</span>
        </div>
        <p className="text-sm text-secondary">
          {inlineCopy.bulkHelp}
        </p>
      </div>

      {feedback && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-success/30 bg-success/10 text-success"
              : "border-error/30 bg-error/10 text-error"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {bulkActions.map((action) => {
          const isProcessing = processingActionId === action.id;

          return (
            <button
              key={action.id}
              type="button"
              onClick={() => handleBulkAction(action.id, action.label)}
              disabled={selectedCount === 0 || !!processingActionId}
              className="flex items-center gap-4 rounded-xl border border-border p-4 transition-[background-color,border-color,box-shadow] hover:border-accent hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-2xl">{action.icon}</span>
              <div className="flex-1 text-left">
                <p className="font-semibold text-primary">{action.label}</p>
                <p className="text-sm text-secondary">{action.priceLabel}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-accent">
                  {isProcessing ? "…" : action.priceLabel}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BillingTab({
  dealer,
  pricingSummary,
  dealerTopups,
  inlineCopy,
  localeTag,
}: {
  dealer: DealerProfile;
  pricingSummary: {
    basic: string;
    premium: string;
    top: string;
  };
  dealerTopups: DealerTopupDisplayPackage[];
  inlineCopy: ReturnType<typeof getDealerInlineCopy>;
  localeTag: ReturnType<typeof getDealerLocaleTag>;
}) {
  const [loadingPackageId, setLoadingPackageId] = useState<string | null>(null);

  const handleTopup = async (packageId: DealerTopupPackageId) => {
    setLoadingPackageId(packageId);

    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `dealer-topup-${packageId}-${Date.now()}`;

      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": idempotencyKey,
          ...createCsrfHeaders(),
        },
        body: JSON.stringify({
          type: "dealer_topup",
          packageId,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; url?: string }
        | null;

      if (!response.ok || !payload?.url) {
        toast.error(payload?.error || inlineCopy.checkoutFailed);
        return;
      }

      window.location.href = payload.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : inlineCopy.checkoutFailed);
    } finally {
      setLoadingPackageId(null);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-2xl border border-accent/20 bg-accent/5 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
          {inlineCopy.prepaidBalance}
        </p>
        <p className="mt-2 text-3xl font-bold text-primary">
          {((dealer.prepaid_balance_cents || 0) / 100).toLocaleString(localeTag, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} €
        </p>
        <p className="mt-2 text-sm text-secondary">
          {inlineCopy.prepaidHelp}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {dealerTopups.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-border bg-background p-5">
            <p className="text-lg font-semibold text-primary">{entry.label}</p>
            <p className="mt-2 text-sm text-secondary">
              {inlineCopy.youGet.replace("{value}", entry.value)}
            </p>
            <button
              type="button"
              onClick={() => void handleTopup(entry.id)}
              disabled={loadingPackageId === entry.id}
              aria-busy={loadingPackageId === entry.id}
              className="mt-4 w-full rounded-xl bg-accent px-4 py-3 font-semibold text-white transition-[background-color,box-shadow] hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {loadingPackageId === entry.id ? inlineCopy.processing : inlineCopy.topUp}
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-background p-6">
        <h3 className="font-semibold text-primary">{inlineCopy.actionPrices}</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-surface p-4">
            <p className="text-sm font-medium text-primary">{inlineCopy.extend}</p>
            <p className="mt-1 text-sm text-secondary">{pricingSummary.basic}</p>
          </div>
          <div className="rounded-xl bg-surface p-4">
            <p className="text-sm font-medium text-primary">Premium</p>
            <p className="mt-1 text-sm text-secondary">{pricingSummary.premium}</p>
          </div>
          <div className="rounded-xl bg-surface p-4">
            <p className="text-sm font-medium text-primary">Exclusive</p>
            <p className="mt-1 text-sm text-secondary">{pricingSummary.top}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Storefront Tab
interface StorefrontTabProps {
  dealer: DealerProfile;
  profile: DealerDashboardProfile;
  inlineCopy: ReturnType<typeof getDealerInlineCopy>;
}

function StorefrontTab({ dealer, profile, inlineCopy }: StorefrontTabProps) {
  const marketDomain = getMarketConfig(useMarketCode()).domain;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="p-6 rounded-2xl border border-border">
        <h3 className="font-semibold text-primary mb-4">
          {inlineCopy.publicProfile}
        </h3>
        <p className="text-secondary mb-4">
          {inlineCopy.storefrontUrl}{" "}
          <a
            href={buildDealerPublicProfilePath(dealer.slug)}
            className="text-accent hover:underline"
            target="_blank"
          >
            {marketDomain}{buildDealerPublicProfilePath(dealer.slug)}
          </a>
        </p>

        <div className="p-4 rounded-xl bg-surface">
          <div className="flex items-center gap-4 mb-4">
            {dealer.logo_url && (
              <Image
                src={dealer.logo_url}
                alt={dealer.name}
                width={64}
                height={64}
                className="rounded-xl object-cover"
              />
            )}
            <div>
              <h4 className="font-semibold text-primary">{dealer.name}</h4>
              <p className="text-sm text-secondary">{dealer.address || ""}</p>
            </div>
          </div>
          <p className="text-sm text-secondary">{dealer.description || ""}</p>
        </div>
      </div>

      <div className="p-6 rounded-2xl border border-border">
        <h3 className="font-semibold text-primary mb-4">{inlineCopy.contactDetails}</h3>
        <div className="space-y-3 text-sm">
          {dealer.phone && (
            <div className="flex justify-between">
              <span className="text-secondary">{inlineCopy.phone}</span>
              <span className="text-primary">{dealer.phone}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-secondary">Email:</span>
            <span className="text-primary">{profile?.email || "N/A"}</span>
          </div>
          {dealer.website_url && (
            <div className="flex justify-between">
              <span className="text-secondary">Web:</span>
              <span className="text-accent">{dealer.website_url}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Analytics Tab
function AnalyticsTab({
  ads,
  totalInquiries,
  inlineCopy,
  localeTag,
}: {
  ads: Ad[];
  totalInquiries: number;
  inlineCopy: ReturnType<typeof getDealerInlineCopy>;
  localeTag: ReturnType<typeof getDealerLocaleTag>;
}) {
  const totalViews = ads.reduce((s, a) => s + (a.views_count || 0), 0);
  const conversionRate =
    totalViews > 0 ? ((totalInquiries / totalViews) * 100).toFixed(2) : "0";
  const topViewedAds = ads
    .toSorted((a, b) => (b.views_count || 0) - (a.views_count || 0))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="p-6 rounded-2xl border border-border text-center">
          <p className="text-3xl font-bold text-primary">
            {totalViews.toLocaleString(localeTag)}
          </p>
          <p className="text-secondary">{inlineCopy.totalViews}</p>
        </div>
        <div className="p-6 rounded-2xl border border-border text-center">
          <p className="text-3xl font-bold text-primary">{totalInquiries}</p>
          <p className="text-secondary">{inlineCopy.totalInquiries}</p>
        </div>
        <div className="p-6 rounded-2xl border border-border text-center">
          <p className="text-3xl font-bold text-accent">{conversionRate}%</p>
          <p className="text-secondary">{inlineCopy.conversionRate}</p>
        </div>
      </div>

      <div className="p-6 rounded-2xl border border-border">
        <h3 className="font-semibold text-primary mb-4">
          {inlineCopy.topAdsByViews}
        </h3>
        <div className="space-y-3">
          {topViewedAds.map((ad, index) => (
            <div key={ad.id} className="flex items-center gap-4">
              <span className="size-6 rounded-full bg-surface flex items-center justify-center text-sm font-medium text-secondary">
                {index + 1}
              </span>
              <Image
                src={optimizeCloudflareImage(
                  ad.photos_json?.[0] || "/placeholder-car.jpg",
                  {
                    width: 96,
                    height: 64,
                    fit: "cover",
                    quality: 80,
                    format: "auto",
                  },
                )}
                alt=""
                width={48}
                height={32}
                className="rounded object-cover"
              />
              <span className="flex-1 font-medium text-primary">
                {ad.brand} {ad.model}
              </span>
              <span className="text-secondary">
                {inlineCopy.viewsCount.replace("{count}", String(ad.views_count || 0))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Settings Tab
function SettingsTab({
  dealer,
  inlineCopy,
}: {
  dealer: DealerProfile;
  inlineCopy: ReturnType<typeof getDealerInlineCopy>;
}) {
  const [requestNote, setRequestNote] = useState("");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [verificationState, setVerificationState] = useState<{
    isLoading: boolean;
    requests: Array<{
      id: string;
      request_note: string;
      status: "pending" | "approved" | "rejected";
      admin_note: string | null;
      created_at: string;
      reviewed_at: string | null;
    }>;
  }>({
    isLoading: true,
    requests: [],
  });

  useEffect(() => {
    let isMounted = true;

    async function loadVerificationState() {
      try {
        const payload = await loadDealerVerificationRequests();

        if (!isMounted) return;
        setVerificationState({
          isLoading: false,
          requests: payload?.requests ?? [],
        });
      } catch (error) {
        console.error("Failed to load dealer verification state:", error);
        if (!isMounted) return;
        setVerificationState({ isLoading: false, requests: [] });
      }
    }

    void loadVerificationState();

    return () => {
      isMounted = false;
    };
  }, []);

  const latestRequest = verificationState.requests[0] ?? null;
  const hasPendingRequest = latestRequest?.status === "pending";

  const handleSubmitVerificationRequest = async () => {
    setIsSubmittingRequest(true);
    try {
      const response = await fetch("/api/account/dealer-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestNote }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            request?: {
              id: string;
              request_note: string;
              status: "pending" | "approved" | "rejected";
              admin_note: string | null;
              created_at: string;
              reviewed_at: string | null;
            };
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.request) {
        throw new Error(payload?.error || "Submit failed");
      }

      setVerificationState((current) => ({
        ...current,
        requests: [payload.request!, ...current.requests],
      }));
      setRequestNote("");
      toast.success(inlineCopy.verificationSent);
    } catch (error) {
      console.error("Failed to submit dealer verification request:", error);
      toast.error(inlineCopy.verificationFailed);
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-primary">{inlineCopy.dealerVerification}</h3>
            <p className="mt-1 text-sm text-secondary">
              {dealer.is_verified
                ? inlineCopy.verifiedStore
                : inlineCopy.requestVerificationHelp}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              dealer.is_verified
                ? "bg-success/10 text-success"
                : hasPendingRequest
                  ? "bg-warning/10 text-warning"
                  : "bg-background-muted text-text-secondary"
            }`}
          >
            {dealer.is_verified
              ? inlineCopy.verifiedDealer
              : hasPendingRequest
                ? inlineCopy.pendingApproval
                : inlineCopy.unverified}
          </span>
        </div>

        {!dealer.is_verified && !hasPendingRequest ? (
          <div className="mt-4 space-y-3">
            <textarea
              id="dealer-settings-verification-request"
              value={requestNote}
              onChange={(event) => setRequestNote(event.target.value)}
              rows={4}
              placeholder={inlineCopy.requestPlaceholder}
              className="form-input resize-none"
            />
            <button
              type="button"
              onClick={() => void handleSubmitVerificationRequest()}
              disabled={isSubmittingRequest}
              className="rounded-lg bg-accent px-6 py-2.5 font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {isSubmittingRequest ? inlineCopy.sending : inlineCopy.requestVerification}
            </button>
          </div>
        ) : null}

        {verificationState.isLoading ? (
          <p className="mt-4 text-sm text-secondary">{inlineCopy.requestsLoading}</p>
        ) : latestRequest ? (
          <div className="mt-4 rounded-xl bg-surface p-4 text-sm">
            <p className="font-medium text-primary">
              {inlineCopy.latestRequest} {formatSkDate(latestRequest.created_at)}
            </p>
            {latestRequest.request_note ? (
              <p className="mt-2 text-secondary">{latestRequest.request_note}</p>
            ) : null}
            {latestRequest.admin_note ? (
              <p className="mt-2 text-text-muted">
                {inlineCopy.adminNote} {latestRequest.admin_note}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div>
        <h3 className="font-semibold text-primary mb-4">{inlineCopy.storeData}</h3>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="dealer-settings-company-name"
              className="block text-sm font-medium text-primary mb-2"
            >
              {inlineCopy.companyName}
            </label>
            <input
              id="dealer-settings-company-name"
              type="text"
              defaultValue={dealer.name}
              className="form-input"
            />
          </div>
          <div>
            <label
              htmlFor="dealer-settings-description"
              className="block text-sm font-medium text-primary mb-2"
            >
              {inlineCopy.description}
            </label>
            <textarea
              id="dealer-settings-description"
              rows={3}
              defaultValue={dealer.description || ""}
              className="form-input resize-none"
            />
          </div>
          <div>
            <label
              htmlFor="dealer-settings-address"
              className="block text-sm font-medium text-primary mb-2"
            >
              {inlineCopy.address}
            </label>
            <input
              id="dealer-settings-address"
              type="text"
              defaultValue={dealer.address || ""}
              className="form-input"
            />
          </div>
          <button className="px-6 py-2.5 rounded-lg bg-accent text-white font-semibold hover:bg-accent-hover">
            {inlineCopy.saveChanges}
          </button>
        </div>
      </div>
    </div>
  );
}

// Components
function StatCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="p-4 rounded-xl border border-border">
      <span className="text-xl">{icon}</span>
      <p className="text-2xl font-bold text-primary mt-2">{value}</p>
      <p className="text-sm text-secondary">{label}</p>
    </div>
  );
}
