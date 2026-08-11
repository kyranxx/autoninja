"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useReducer,
  useRef,
  type KeyboardEvent,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import Image from "next/image";
import { formatCurrency } from "@/config/vat";
import { createClient } from "@/lib/supabase/client";
import { useLocale, useTranslations } from "next-intl";
import { optimizeCloudflareImage } from "@/lib/image-optimizer";
import { toast } from "sonner";
import { buildAdPath } from "@/lib/cars/ad-path";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { createCsrfHeaders } from "@/lib/security/client-csrf";
import { trackAnalyticsEvent } from "@/lib/analytics/client";
import { CREATE_LISTING_ROUTE } from "@/lib/routes";
import {
  mapInquiryThreadsToConversations,
  type InquiryConversationRow,
} from "@/lib/inquiries/conversations";
import {
  PlusIcon,
  EyeIcon,
  EyeOffIcon,
  MessageIcon,
  ClockIcon,
  HeartIcon,
  CarIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  XIcon,
} from "@/components/ui/Icons";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import {
  AdsIcon,
  SavedIcon,
  MessagesIcon,
  SettingsIcon,
} from "@/components/ui/DashboardIcons";
import { useMarket, useMarketCode } from "@/context/MarketContext";
import { SavedSearchesPanel } from "@/components/account/SavedSearchesPanel";

const EmbeddedAdWizard = dynamic(() => import("../pridat-inzerat/AdWizardClient"), {
  ssr: false,
});

interface DashboardClientProps {
  vinDecodingEnabled?: boolean;
  initialSearchParams?: string;
  initialTab?: string | null;
  submitted?: string | null;
  updated?: string | null;
}

type DealerMetaState = {
  hasDealer: boolean;
  name: string | null;
};

// Type definitions for ads
interface UserAd {
  id: string;
  brand?: string;
  model?: string;
  year: number;
  price_eur: number;
  mileage_km?: number;
  description?: string;
  fuel?: string;
  transmission?: string;
  location_city?: string;
  created_at?: string | null;
  status: string;
  moderation_rejection_note?: string | null;
  views?: number;
  views_count?: number;
  inquiries?: number;
  expires_at: string | null;
  is_top_ad: boolean;
  is_highlighted?: boolean;
  photo?: string;
  photos_json?: string[];
  brands?: { name: string };
  models?: { name: string };
}

type MyAdsTabUiState = {
  deleteAd: UserAd | null;
  deleteLoading: boolean;
};

const initialMyAdsTabUiState: MyAdsTabUiState = {
  deleteAd: null,
  deleteLoading: false,
};

function myAdsTabUiReducer(
  state: MyAdsTabUiState,
  patch: Partial<MyAdsTabUiState>,
): MyAdsTabUiState {
  return { ...state, ...patch };
}

interface SavedAd {
  id: string;
  brand?: string;
  model?: string;
  year: number;
  price_eur: number;
  status: string;
  mileage_km?: number;
  location_city?: string;
  fuel?: string;
  photos_json?: string[];
  brands?: { name: string };
  models?: { name: string };
}

type SavedTabCacheEntry = {
  key: string;
  savedAds: SavedAd[];
  preferences: Record<string, SavedAdAlertPreference>;
  alertsSupported: boolean;
};

const SAVED_TAB_CACHE = new Map<string, SavedTabCacheEntry>();

function sortAdsActiveFirst(ads: UserAd[]): UserAd[] {
  return ads.toSorted(
    (left, right) =>
      Number(right.status === "active") - Number(left.status === "active"),
  );
}

async function loadPricingSummaryConfig(): Promise<{
  prolong?: string;
  premium?: string;
  top?: string;
} | null> {
  const response = await fetch("/api/pricing/config", { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as
    | {
        summary?: {
          prolong?: string;
          premium?: string;
          top?: string;
        };
      }
    | null;

  return response.ok ? (payload?.summary ?? null) : null;
}

function buildSavedTabCacheKey(userId: string, adIds: string[]): string {
  const sortedIds = adIds.toSorted();
  return `${userId}:${sortedIds.join(",")}`;
}

interface SavedAdAlertPreference {
  ad_id: string;
  notify_price_drop: boolean;
  notify_status_change: boolean;
  notify_similar: boolean;
  notify_email: boolean;
  notify_push: boolean;
  paused: boolean;
  baseline_price_eur: number | null;
  baseline_status: string | null;
}

const TABS_CONFIG = [
  { id: "ads", labelKey: "myAds", Icon: AdsIcon },
  { id: "create", labelKey: "addListingTab", Icon: PlusIcon },
  { id: "saved", labelKey: "savedCars", Icon: SavedIcon },
  { id: "messages", labelKey: "messages", Icon: MessagesIcon },
  { id: "settings", labelKey: "settings", Icon: SettingsIcon },
];

type MessageConversation = ReturnType<typeof mapInquiryThreadsToConversations>[number];

type MessagesTabCacheEntry = {
  conversations: MessageConversation[];
  activeConversation: string | null;
};

const MESSAGES_TAB_CACHE = new Map<string, MessagesTabCacheEntry>();

function getLocaleTag(locale: string): string {
  return locale;
}

function getAccountInlineCopy(locale: string) {
  const isRo = locale.toLowerCase().startsWith("ro");
  return isRo
    ? {
        myAccountKicker: "Contul meu",
        freeListingBanner: "Anunț acum gratuit. Premium {premium}. Exclusive {top}.",
        submittedForApproval: "Anunțul a fost trimis pentru aprobare.",
        listingSaved: "Anunțul a fost salvat.",
        wholeMarket: "România",
      }
    : {
        myAccountKicker: "Môj účet",
        freeListingBanner: "Inzerát teraz zdarma. Premium {premium}. Exclusive {top}.",
        submittedForApproval: "Inzerát bol odoslaný na schválenie.",
        listingSaved: "Inzerát bol uložený.",
        wholeMarket: "Slovensko",
      };
}

function DashboardLoadingState() {
  return (
    <main className="pt-24 pb-16 min-h-screen flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="size-16 rounded-full bg-surface" />
        <div className="h-4 w-32 rounded bg-surface" />
      </div>
    </main>
  );
}

function DashboardAuthRequired({
  title,
  loginLabel,
}: {
  title: string;
  loginLabel: string;
}) {
  return (
    <main className="pt-24 pb-16 min-h-screen">
      <div className="mx-auto max-w-lg px-4 text-center">
        <h1 className="text-2xl font-semibold text-primary mb-4">{title}</h1>
        <Link
          href="/auth/login"
          className="inline-flex px-6 py-3 rounded-full bg-accent text-white font-semibold"
        >
          {loginLabel}
        </Link>
      </div>
    </main>
  );
}

export default function DashboardClient(props: DashboardClientProps) {
  return useDashboardClientView(props);
}

function useDashboardClientView({
  vinDecodingEnabled = false,
  initialSearchParams = "",
  initialTab = null,
  submitted = null,
  updated = null,
}: DashboardClientProps) {
  const { user, profile, loading, signOut } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations("dashboard");
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const marketCode = useMarketCode();
  const inlineCopy = useMemo(() => getAccountInlineCopy(locale), [locale]);

  const identityData = user?.identities?.[0]?.identity_data as
    | Record<string, unknown>
    | undefined;

  const avatarUrl =
    (typeof user?.user_metadata?.avatar_url === "string"
      ? (user.user_metadata.avatar_url as string)
      : undefined) ||
    (typeof user?.user_metadata?.picture === "string"
      ? (user.user_metadata.picture as string)
      : undefined) ||
    (identityData && typeof identityData.avatar_url === "string"
      ? (identityData.avatar_url as string)
      : undefined) ||
    (identityData && typeof identityData.picture === "string"
      ? (identityData.picture as string)
      : undefined) ||
    profile?.avatar_url;

  const userInitial =
    profile?.full_name?.charAt(0)?.toUpperCase() ||
    user?.email?.charAt(0)?.toUpperCase() ||
    "U";
  const [avatarErrorUrl, setAvatarErrorUrl] = useState<string | null>(null);

  // URL state management
  const { replace } = useRouter();
  const pathname = usePathname();
  const tabParam = initialTab;
  const isValidTabParam = tabParam
    ? TABS_CONFIG.some((tab) => tab.id === tabParam)
    : false;
  const activeTab = isValidTabParam && tabParam ? tabParam : "ads";
  const [dealerMeta, updateDealerMeta] = useReducer(
    (_state: DealerMetaState, nextState: DealerMetaState) => nextState,
    {
      hasDealer: false,
      name: null,
    },
  );
  const [pricingSummary, setPricingSummary] = useState({
    prolong: "Zadarmo / 28 dní",
    premium: "4,99 € / 28 dní",
    top: "9,99 € / 28 dní",
  });

  const [adsState, setAdsState] = useState<{
    savedCarIds: Set<string>;
    userAds: UserAd[];
    adsLoading: boolean;
    hasLoadedAds: boolean;
    hasLoadedSaved: boolean;
  }>({
    savedCarIds: new Set(),
    userAds: [],
    adsLoading: true,
    hasLoadedAds: false,
    hasLoadedSaved: false,
  });

  const loadUserAds = useCallback(async () => {
    if (!user) return;
    setAdsState((prev) => ({ ...prev, adsLoading: true }));
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
                    mileage_km, 
                    description,
                    fuel,
                    transmission,
                    location_city,
                    status,
                    moderation_rejection_note,
                    views_count,
                    is_top_ad,
                    is_highlighted,
                    expires_at,
                    created_at,
                    photos_json,
                    brands(name),
                    models(name)
                `,
        )
        .eq("seller_id", user.id)
        .eq("market_code", marketCode)
        .order("created_at", { ascending: false });

      if (!error && data) {
        const adIds = data.map((ad) => ad.id);
        const inquiryCounts = new Map<string, number>();
        if (adIds.length > 0) {
          const { data: conversations } = await supabase
            .from("inquiry_conversations")
            .select("ad_id")
            .eq("seller_id", user.id)
            .in("ad_id", adIds);
          for (const conversation of conversations || []) {
            inquiryCounts.set(
              conversation.ad_id,
              (inquiryCounts.get(conversation.ad_id) || 0) + 1,
            );
          }
        }
        const adsWithInquiryCounts = data.map((ad) => ({
          ...ad,
          inquiries: inquiryCounts.get(ad.id) || 0,
        }));
        setAdsState((prev) => ({
          ...prev,
          userAds: sortAdsActiveFirst(adsWithInquiryCounts as unknown as UserAd[]),
        }));
      }
    } catch (err) {
      console.error("Error loading user ads:", err);
    } finally {
      setAdsState((prev) => ({ ...prev, adsLoading: false }));
    }
  }, [marketCode, user, supabase]);

  const loadSavedCars = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("saved_ads")
        .select("ad_id, ads!inner(market_code)")
        .eq("user_id", user.id)
        .eq("ads.market_code", marketCode);

      if (!error && data) {
        setAdsState((prev) => ({
          ...prev,
          savedCarIds: new Set(data.map((d) => d.ad_id)),
        }));
      }
    } catch (err) {
      console.error("Error loading saved cars:", err);
    }
  }, [marketCode, user, supabase]);

  useEffect(() => {
    // When the user changes, reset lazy-load flags so tabs load for the new account.
    setAdsState({
      savedCarIds: new Set(),
      userAds: [],
      adsLoading: true,
      hasLoadedAds: false,
      hasLoadedSaved: false,
    });
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadDealerMeta() {
      if (!user) {
        updateDealerMeta({ hasDealer: false, name: null });
        return;
      }

      try {
        const { data, error } = await supabase
          .from("dealers")
          .select("id, name")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (cancelled) {
          return;
        }

        if (error || !data) {
          updateDealerMeta({ hasDealer: false, name: null });
          return;
        }

        updateDealerMeta({
          hasDealer: true,
          name: typeof data.name === "string" ? data.name : null,
        });
      } catch (error) {
        if (!cancelled) {
          console.error("Error loading dealer meta:", error);
          updateDealerMeta({ hasDealer: false, name: null });
        }
      }
    }

    void loadDealerMeta();

    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadPricingSummary() {
      try {
        const summary = await loadPricingSummaryConfig();

        if (!cancelled && summary) {
          setPricingSummary({
            prolong: summary.prolong || "Zadarmo / 28 dní",
            premium: summary.premium || "4,99 € / 28 dní",
            top: summary.top || "9,99 € / 28 dní",
          });
        }
      } catch {
        // Keep default summary.
      }
    }

    void loadPricingSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    if (activeTab === "ads" && !adsState.hasLoadedAds) {
      loadUserAds().finally(() =>
        setAdsState((prev) => ({ ...prev, hasLoadedAds: true })),
      );
    }

    if (activeTab === "saved" && !adsState.hasLoadedSaved) {
      loadSavedCars().finally(() =>
        setAdsState((prev) => ({ ...prev, hasLoadedSaved: true })),
      );
    }
  }, [
    user,
    activeTab,
    adsState.hasLoadedAds,
    adsState.hasLoadedSaved,
    loadUserAds,
    loadSavedCars,
    marketCode,
  ]);

  const restoreSavedCar = useCallback(
    async (adId: string) => {
      if (!user) return;
      const { error } = await supabase
        .from("saved_ads")
        .insert({ user_id: user.id, ad_id: adId });

      if (error && error.code !== "23505") {
        toast.error(tErrors("generic"));
        return;
      }

      setAdsState((prev) => {
        const nextSavedIds = new Set(prev.savedCarIds);
        nextSavedIds.add(adId);
        return { ...prev, savedCarIds: nextSavedIds };
      });
      toast.success(t("savedRestored"));
    },
    [supabase, t, tErrors, user],
  );

  const handleUnsaveCar = useCallback(
    async (adId: string) => {
      if (!user) return;
      try {
        const { error } = await supabase
          .from("saved_ads")
          .delete()
          .eq("user_id", user.id)
          .eq("ad_id", adId);

        if (error) throw error;

        setAdsState((prev) => {
          const newSet = new Set(prev.savedCarIds);
          newSet.delete(adId);
          return { ...prev, savedCarIds: newSet };
        });
        toast.success(t("savedRemoved"), {
          action: {
            label: t("undo"),
            onClick: () => {
              void restoreSavedCar(adId);
            },
          },
        });
      } catch (err) {
        console.error("Error removing saved car:", err);
        toast.error(tErrors("generic"));
      }
    },
    [restoreSavedCar, supabase, t, tErrors, user],
  );

  const handleSignOutWithRedirect = async () => {
    await signOut();
  };

  useEffect(() => {
    if (!submitted && !updated) {
      return;
    }

    if (submitted === "1") {
      toast.success(inlineCopy.submittedForApproval);
    }
    if (updated === "1") {
      toast.success(inlineCopy.listingSaved);
    }

    const params = new URLSearchParams(initialSearchParams);
    params.delete("submitted");
    params.delete("updated");
    replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [initialSearchParams, inlineCopy, pathname, replace, submitted, updated]);

  // Sync URL with state
  const handleTabChange = useCallback((tabId: string) => {
    if (tabId === activeTab && tabParam === tabId) {
      return;
    }

    const params = new URLSearchParams(initialSearchParams);
    params.set("tab", tabId);
    replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [activeTab, initialSearchParams, pathname, replace, tabParam]);

  if (loading) return <DashboardLoadingState />;

  if (!user) {
    return (
      <DashboardAuthRequired
        title={tAuth("loginRequired")}
        loginLabel={tCommon("login")}
      />
    );
  }

  return (
    <main className="market-page pb-16 pt-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div>
          <DashboardHeader
            avatarUrl={avatarUrl ?? undefined}
            avatarErrorUrl={avatarErrorUrl}
            onAvatarError={setAvatarErrorUrl}
            avatarAlt={profile?.full_name || user.email || t("user")}
            userInitial={userInitial}
            dealerMeta={dealerMeta}
            myAccountKicker={inlineCopy.myAccountKicker}
            dashboardHeading={t("dashboardHeading")}
            dealerDashboardAvailableLabel={t("dealerDashboardAvailable")}
            dealerDashboardLabel={t("dealerDashboard")}
          />

          <DashboardTabNav
            activeTab={activeTab}
            pricingSummary={pricingSummary}
            freeListingBanner={inlineCopy.freeListingBanner}
            onTabChange={handleTabChange}
            getLabel={(labelKey) => t(labelKey) || labelKey}
            navigationLabel={t("accountNavigation")}
          />
        </div>

        <section
          id="dashboard-active-panel"
          role="tabpanel"
          aria-labelledby={`dashboard-tab-${activeTab}`}
          tabIndex={0}
          className={activeTab === "create" ? "outline-none" : "min-w-0 outline-none"}
        >
          {activeTab === "ads" && (
            <MyAdsTab
              ads={adsState.userAds}
              isLoading={adsState.adsLoading}
              onRefresh={loadUserAds}
            />
          )}
          {activeTab === "create" && (
            <CreateListingTab vinDecodingEnabled={vinDecodingEnabled} />
          )}
          {activeTab === "saved" && (
            <SavedTab savedCarIds={adsState.savedCarIds} onUnsave={handleUnsaveCar} />
          )}
          {activeTab === "messages" && <MessagesTab />}
          {activeTab === "settings" && (
            <SettingsTab
              profile={profile}
              signOut={handleSignOutWithRedirect}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function DashboardHeader({
  avatarUrl,
  avatarErrorUrl,
  onAvatarError,
  avatarAlt,
  userInitial,
  dealerMeta,
  myAccountKicker,
  dashboardHeading,
  dealerDashboardAvailableLabel,
  dealerDashboardLabel,
}: {
  avatarUrl?: string;
  avatarErrorUrl: string | null;
  onAvatarError: (url: string | null) => void;
  avatarAlt: string;
  userInitial: string;
  dealerMeta: DealerMetaState;
  myAccountKicker: string;
  dashboardHeading: string;
  dealerDashboardAvailableLabel: string;
  dealerDashboardLabel: string;
}) {
  return (
    <div className="market-panel mb-4 flex items-center justify-between gap-3 p-4 sm:p-5">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/12 bg-primary/5 text-xl font-bold text-primary sm:size-16">
          {avatarUrl && avatarErrorUrl !== avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={avatarAlt}
              fill
              sizes="64px"
              className="object-cover"
              onError={() => onAvatarError(avatarUrl)}
            />
          ) : (
            userInitial
          )}
        </div>
        <div className="min-w-0">
          <p className="market-kicker">{myAccountKicker}</p>
          <h1 className="mt-1 !text-2xl font-display font-semibold text-text-primary sm:!text-4xl">
            {dashboardHeading}
          </h1>
          {dealerMeta.hasDealer ? (
            <p className="mt-1 text-sm text-secondary">
              {dealerMeta.name
                ? `${dealerMeta.name} • ${dealerDashboardAvailableLabel}`
                : dealerDashboardAvailableLabel}
            </p>
          ) : null}
        </div>
      </div>
      {dealerMeta.hasDealer ? (
        <div className="hidden shrink-0 sm:block">
          <Link
            href="/dealer"
            className="market-action-secondary inline-flex items-center gap-2 px-5 py-3 text-sm"
          >
            {dealerDashboardLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function DashboardTabNav({
  activeTab,
  pricingSummary,
  freeListingBanner,
  onTabChange,
  getLabel,
  navigationLabel,
}: {
  activeTab: string;
  pricingSummary: { premium: string; top: string };
  freeListingBanner: string;
  onTabChange: (tabId: string) => void;
  getLabel: (labelKey: (typeof TABS_CONFIG)[number]["labelKey"]) => string;
  navigationLabel: string;
}) {
  const mobileTabListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = mobileTabListRef.current;
    const activeButton = list?.querySelector<HTMLElement>(`[data-tab-id="${activeTab}"]`);
    if (!list || !activeButton || !window.matchMedia("(max-width: 639px)").matches) {
      return;
    }

    const centeredLeft = activeButton.offsetLeft - (list.clientWidth - activeButton.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, centeredLeft), behavior: "auto" });
  }, [activeTab]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % TABS_CONFIG.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + TABS_CONFIG.length) % TABS_CONFIG.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = TABS_CONFIG.length - 1;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = TABS_CONFIG[nextIndex];
    onTabChange(nextTab.id);
    mobileTabListRef.current
      ?.querySelector<HTMLButtonElement>(`[data-tab-id="${nextTab.id}"]`)
      ?.focus();
  };

  return (
    <div className="market-panel mb-5 p-2">
      {activeTab === "ads" || activeTab === "create" ? (
        <div className="mb-2 rounded-xl border border-accent/15 bg-accent/5 px-4 py-3 text-sm text-primary sm:hidden">
          {freeListingBanner
            .replace("{premium}", pricingSummary.premium)
            .replace("{top}", pricingSummary.top)}
        </div>
      ) : null}
      <div
        ref={mobileTabListRef}
        role="tablist"
        aria-label={navigationLabel}
        className="no-scrollbar flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
      >
        {TABS_CONFIG.map((tab, index) => (
          <button
            key={tab.id}
            id={`dashboard-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="dashboard-active-panel"
            tabIndex={activeTab === tab.id ? 0 : -1}
            data-tab-id={tab.id}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            className={`flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold whitespace-nowrap transition-all sm:justify-start ${
              activeTab === tab.id
                ? "border-transparent bg-primary text-white shadow-sm"
                : "border-border bg-background text-primary hover:bg-background-muted"
            }`}
          >
            <tab.Icon className="size-5" />
            {getLabel(tab.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

// My Ads Tab
type MyAdsTabProps = {
  ads: UserAd[];
  isLoading: boolean;
  onRefresh: () => void;
};

function MyAdsTab(props: MyAdsTabProps) {
  return useMyAdsTabView(props);
}

function useMyAdsTabView({
  ads,
  isLoading,
  onRefresh,
}: MyAdsTabProps) {
  const [myAdsUiState, updateMyAdsUiState] = useReducer(
    myAdsTabUiReducer,
    initialMyAdsTabUiState,
  );
  const {
    deleteAd,
    deleteLoading,
  } = myAdsUiState;
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tFuel = useTranslations("fuel");
  const tTransmission = useTranslations("transmission");
  const locale = useLocale();
  const localeTag = getLocaleTag(locale);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return { label: t("active"), class: "bg-success text-white" };
      case "sold":
        return { label: t("sold"), class: "bg-secondary text-white" };
      case "expired":
        return { label: t("expired"), class: "bg-error text-white" };
      case "pending":
        return { label: t("pending"), class: "bg-warning text-primary" };
      case "rejected":
        return { label: t("rejected"), class: "bg-error/15 text-error" };
      default:
        return { label: status, class: "bg-background-muted text-primary" };
    }
  };

  const getDaysRemaining = (dateStr: string | null) => {
    if (!dateStr) return null;
    const days = Math.ceil(
      (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    return days > 0 ? days : 0;
  };

  const closeDeleteAd = () => {
    if (deleteLoading) return;
    updateMyAdsUiState({ deleteAd: null });
  };

  const handleDeleteAd = async () => {
    if (!deleteAd) return;

    updateMyAdsUiState({ deleteLoading: true });
    try {
      const response = await fetch(`/api/account/ads?id=${encodeURIComponent(deleteAd.id)}`, {
        method: "DELETE",
        headers: createCsrfHeaders(),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        toast.error(payload?.error || tErrors("generic"));
        return;
      }

      trackAnalyticsEvent("listing_deleted", {
        adId: deleteAd.id,
        deletedVia: "dashboard",
      });
      toast.success(t("listingDeleted"));
      updateMyAdsUiState({ deleteAd: null });
      onRefresh();
    } catch (error) {
      console.error("Error deleting ad:", error);
      toast.error(tErrors("generic"));
    } finally {
      updateMyAdsUiState({ deleteLoading: false });
    }
  };

  // Helper to get brand/model name from nested objects or direct properties
  const getBrandName = (ad: UserAd) =>
    ad.brands?.name || ad.brand || t("unknown");
  const getModelName = (ad: UserAd) => ad.models?.name || ad.model || "";
  const getFuelLabel = (fuel: string | undefined) =>
    fuel && tFuel.has(fuel) ? tFuel(fuel) : fuel || t("notProvided");
  const getTransmissionLabel = (transmission: string | undefined) =>
    transmission && tTransmission.has(transmission)
      ? tTransmission(transmission)
      : transmission || t("notProvided");
  const getPhoto = (ad: UserAd) => {
    if (ad.photo) {
      return optimizeCloudflareImage(ad.photo, {
        width: 384,
        height: 288,
        fit: "cover",
        quality: 82,
        format: "auto",
      });
    }
    if (ad.photos_json && ad.photos_json.length > 0) {
      return optimizeCloudflareImage(ad.photos_json[0], {
        width: 384,
        height: 288,
        fit: "cover",
        quality: 82,
        format: "auto",
      });
    }
    return "/placeholder-car.jpg";
  };
  const getViews = (ad: UserAd) => ad.views || ad.views_count || 0;
  const getInquiries = (ad: UserAd) => ad.inquiries || 0;
  const formatMileage = (value: number | undefined) =>
    typeof value === "number" ? `${value.toLocaleString(localeTag)} km` : t("notProvided");
  const formatCreatedAt = (value: string | null | undefined) => {
    if (!value) return t("notProvided");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t("notProvided");
    return date.toLocaleDateString(localeTag);
  };
  const activeAdsCount = ads.filter((ad) => ad.status === "active").length;
  const getStatusHelp = (status: string) => {
    switch (status) {
      case "active":
        return t("listingStatusActiveHelp");
      case "pending":
        return t("listingStatusPendingHelp");
      case "rejected":
        return t("listingStatusRejectedHelp");
      case "expired":
        return t("listingStatusExpiredHelp");
      case "sold":
        return t("listingStatusSoldHelp");
      default:
        return "";
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
        {[
          "myads-skeleton-1",
          "myads-skeleton-2",
          "myads-skeleton-3",
          "myads-skeleton-4",
          "myads-skeleton-5",
        ].map(
          (skeletonKey) => (
          <div
            key={skeletonKey}
            className="market-card animate-pulse space-y-3 bg-background p-4"
          >
            <div className="h-40 rounded-xl bg-surface" />
            <div className="space-y-3">
              <div className="h-5 bg-surface rounded w-1/2" />
              <div className="h-4 bg-surface rounded w-1/3" />
              <div className="h-4 bg-surface rounded w-3/4" />
            </div>
          </div>
          ),
        )}
      </div>
    );
  }

  return (
    <div>
      {ads.length === 0 ? (
        <div className="market-panel mx-auto max-w-xl p-8 text-center sm:p-10">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl border border-primary/12 bg-primary/5 text-primary">
            <CarIcon className="size-8" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-primary">
            {t("noAdsYet")}
          </h3>
          <p className="text-secondary mb-4">{t("addFirstAd")}</p>
          <Link
            href={CREATE_LISTING_ROUTE}
            className="market-action-primary inline-flex items-center gap-2 px-6 py-3 text-sm"
          >
            <PlusIcon className="size-5" />
            {t("addFirstListing")}
          </Link>
        </div>
      ) : (
        <div>
          <div className="mb-4 flex flex-col gap-1 rounded-xl border border-primary/10 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold text-primary">{t("myAds")}</h2>
            <p className="text-sm text-secondary">
              {t("listingsSummary", { active: activeAdsCount, total: ads.length })}
            </p>
          </div>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
          {ads.map((ad, index) => {
            const status = getStatusBadge(ad.status);
            const daysRemaining = getDaysRemaining(ad.expires_at);
            const adPath = buildAdPath({
              id: ad.id,
              brand: getBrandName(ad),
              model: getModelName(ad),
              year: ad.year,
            });

            return (
              <article
                key={ad.id}
                className="market-card overflow-hidden bg-background"
              >
                <Link
                  href={adPath}
                  className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  <div className="relative aspect-[16/10] bg-background-muted">
                    <Image
                      src={getPhoto(ad)}
                      alt={`${getBrandName(ad)} ${getModelName(ad)}`}
                      fill
                      className="object-contain"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
                      priority={index === 0}
                      loading={index === 0 ? "eager" : "lazy"}
                      fetchPriority={index === 0 ? "high" : "auto"}
                    />
                    {ad.is_top_ad && (
                      <span className="absolute left-2 top-2 rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-white">
                        {t("topListingBadge")}
                      </span>
                    )}
                    {ad.is_highlighted && (
                      <span className="absolute left-2 top-10 rounded-md bg-warning px-2 py-0.5 text-xs font-semibold text-text-primary">
                        {t("highlightedListingBadge")}
                      </span>
                    )}
                    <span
                      className={`absolute right-2 top-2 rounded-md px-2 py-1 text-xs font-medium ${status.class}`}
                    >
                      {status.label}
                    </span>
                  </div>
                </Link>

                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold text-primary">
                      <Link
                        href={adPath}
                        className="rounded-sm transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                      >
                        {getBrandName(ad)} {getModelName(ad)}
                      </Link>
                    </h3>
                    <p className="mt-1 text-base font-semibold text-primary">
                      {formatCurrency(ad.price_eur)}
                    </p>
                  </div>

                  {ad.status === "rejected" && ad.moderation_rejection_note ? (
                    <div className="rounded-xl border border-error/20 bg-error/5 p-3 text-sm">
                      <p className="font-semibold text-error">{t("rejectionReason")}</p>
                      <p className="mt-1 text-text-secondary">{ad.moderation_rejection_note}</p>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm text-primary/80">
                    <span>{ad.year || t("notProvided")}</span>
                    <span>{formatMileage(ad.mileage_km)}</span>
                    <span>{getFuelLabel(ad.fuel)}</span>
                    <span>{getTransmissionLabel(ad.transmission)}</span>
                    <span>{ad.location_city || t("notProvided")}</span>
                    <span>{formatCreatedAt(ad.created_at)}</span>
                  </div>

                  {getStatusHelp(ad.status) ? (
                    <p className="rounded-lg bg-background-muted px-3 py-2 text-xs leading-5 text-secondary">
                      {getStatusHelp(ad.status)}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-3 text-sm text-primary">
                    <span
                      className="flex items-center gap-1 rounded-full bg-background-muted px-2 py-1"
                      aria-label={t("viewsCount", { count: getViews(ad) })}
                    >
                      <EyeIcon className="size-4" aria-hidden="true" />
                      {getViews(ad)}
                    </span>
                    <span
                      className="flex items-center gap-1 rounded-full bg-background-muted px-2 py-1"
                      aria-label={t("inquiriesCount", { count: getInquiries(ad) })}
                    >
                      <MessageIcon className="size-4" aria-hidden="true" />
                      {getInquiries(ad)}
                    </span>
                    {daysRemaining !== null && (
                      <span
                        className={`flex items-center gap-1 rounded-full px-2 py-1 ${
                          daysRemaining <= 3
                            ? "bg-error text-white"
                            : "bg-background-muted text-primary"
                        }`}
                        aria-label={t("daysRemaining", { count: daysRemaining })}
                      >
                        <ClockIcon className="size-4" aria-hidden="true" />
                        {daysRemaining} {t("days")}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Link
                      href={`/upravit-inzerat/${ad.id}`}
                      className="market-action-primary min-h-11 px-4 py-2 text-center text-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {tCommon("edit")}
                    </Link>
                    <Link
                      href={adPath}
                      className="market-action-secondary min-h-11 px-4 py-2 text-center text-sm"
                    >
                      {t("viewListing")}
                    </Link>
                    <button
                      type="button"
                      data-testid={`listing-delete-${ad.id}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updateMyAdsUiState({ deleteAd: ad });
                      }}
                      className="col-span-2 justify-self-end rounded-lg px-2 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
                    >
                      {t("deleteListing")}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          </div>
        </div>
      )}

      <DeleteAdModal
        isOpen={!!deleteAd}
        isDeleting={deleteLoading}
        title={t("deleteListingTitle")}
        description={t("deleteListingDescription")}
        cancelLabel={tCommon("cancel")}
        deleteLabel={t("deleteListing")}
        deletingLabel={t("deletingListing")}
        onClose={closeDeleteAd}
        onConfirm={handleDeleteAd}
      />
    </div>
  );
}

function DeleteAdModal({
  isOpen,
  isDeleting,
  title,
  description,
  cancelLabel,
  deleteLabel,
  deletingLabel,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  isDeleting: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  deleteLabel: string;
  deletingLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
        aria-label={cancelLabel}
        disabled={isDeleting}
      />
      <div className="relative z-[121] w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-xl sm:p-6">
        <h3 className="text-lg font-semibold text-primary">{title}</h3>
        <p className="mt-2 text-sm text-secondary">{description}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="market-action-secondary min-h-10 px-4 py-2 text-sm disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid="listing-delete-confirm"
            onClick={onConfirm}
            disabled={isDeleting}
            className="market-action-primary min-h-10 bg-error px-4 py-2 text-sm text-white hover:bg-error/90 disabled:opacity-50"
          >
            {isDeleting ? deletingLabel : deleteLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateListingTab({
  vinDecodingEnabled = false,
}: {
  vinDecodingEnabled?: boolean;
}) {
  return (
    <section>
      <EmbeddedAdWizard embedded vinDecodingEnabled={vinDecodingEnabled} />
    </section>
  );
}

function SavedAlertCheckbox({
  id,
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const descriptionId = `${id}-description`;

  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-background-muted/60 px-3 py-3 transition-colors hover:border-primary/25 has-[:focus-visible]:border-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/25"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-primary">{title}</span>
        <span id={descriptionId} className="mt-0.5 block text-xs leading-5 text-secondary">
          {description}
        </span>
      </span>
      <input
        id={id}
        name={id}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 rounded border border-border-strong accent-accent disabled:opacity-70"
        checked={checked}
        disabled={disabled}
        aria-describedby={descriptionId}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

// Saved Tab (functional with persistent state)
type SavedTabProps = {
  savedCarIds: Set<string>;
  onUnsave: (id: string) => void;
};

function SavedTab({
  savedCarIds,
  onUnsave,
}: SavedTabProps) {
  return useSavedTabView({ savedCarIds, onUnsave });
}

function useSavedTabView({
  savedCarIds,
  onUnsave,
}: SavedTabProps) {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useAuth();
  const savedAdIds = useMemo(() => Array.from(savedCarIds), [savedCarIds]);
  const cacheKey = useMemo(
    () => (user ? buildSavedTabCacheKey(user.id, savedAdIds) : null),
    [savedAdIds, user],
  );
  const cachedState = cacheKey ? SAVED_TAB_CACHE.get(cacheKey) : null;
  const [expandedAlertAdId, setExpandedAlertAdId] = useState<string | null>(null);
  const [savedState, setSavedState] = useState<{
    savedAds: SavedAd[];
    preferences: Record<string, SavedAdAlertPreference>;
    isLoading: boolean;
    alertsSupported: boolean;
    isBulkUpdating: boolean;
    updatingAdId: string | null;
  }>(() => ({
    savedAds: cachedState?.savedAds || [],
    preferences: cachedState?.preferences || {},
    isLoading: !cachedState,
    alertsSupported: cachedState?.alertsSupported ?? true,
    isBulkUpdating: false,
    updatingAdId: null,
  }));
  const t = useTranslations("dashboard");
  const tFuel = useTranslations("fuel");
  const locale = useLocale();
  const localeTag = getLocaleTag(locale);
  const inlineCopy = useMemo(() => getAccountInlineCopy(locale), [locale]);

  const createDefaultPreference = useCallback(
    (ad: SavedAd): SavedAdAlertPreference => ({
      ad_id: ad.id,
      notify_price_drop: true,
      notify_status_change: true,
      notify_similar: false,
      notify_email: true,
      notify_push: false,
      paused: false,
      baseline_price_eur: ad.price_eur || null,
      baseline_status: ad.status || null,
    }),
    [],
  );

  const loadSavedAds = useCallback(async () => {
    if (!user || !cacheKey) return;

    if (savedAdIds.length === 0) {
      SAVED_TAB_CACHE.set(cacheKey, {
        key: cacheKey,
        savedAds: [],
        preferences: {},
        alertsSupported: true,
      });
      setSavedState((prev) => ({
        ...prev,
        savedAds: [],
        preferences: {},
        isLoading: false,
      }));
      return;
    }

    const cached = SAVED_TAB_CACHE.get(cacheKey);
    setSavedState((prev) => ({
      ...prev,
      isLoading: !cached,
    }));

    try {
      const { data: adsData, error: adsError } = await supabase
        .from("ads")
        .select(
          `
            id,
            brand,
            model,
            year,
            price_eur,
            mileage_km,
            location_city,
            fuel,
            status,
            photos_json,
            brands(name),
            models(name)
          `,
        )
        .in("id", savedAdIds);

      if (adsError) {
        throw adsError;
      }

      const nextSavedAds = ((adsData || []) as unknown as SavedAd[]).sort(
        (a, b) => (b.year || 0) - (a.year || 0),
      );

      let alertsSupported = true;
      const preferencesByAdId: Record<string, SavedAdAlertPreference> = {};

      const { data: preferenceData, error: preferenceError } = await supabase
        .from("saved_ad_alert_preferences")
        .select(
          `
            ad_id,
            notify_price_drop,
            notify_status_change,
            notify_similar,
            notify_email,
            notify_push,
            paused,
            baseline_price_eur,
            baseline_status
          `,
        )
        .eq("user_id", user.id)
        .in("ad_id", savedAdIds);

      if (preferenceError) {
        alertsSupported = false;
      } else {
        for (const preference of (preferenceData || []) as SavedAdAlertPreference[]) {
          preferencesByAdId[preference.ad_id] = preference;
        }
      }

      const missingDefaults: SavedAdAlertPreference[] = [];
      for (const ad of nextSavedAds) {
        if (!preferencesByAdId[ad.id]) {
          const fallback = createDefaultPreference(ad);
          preferencesByAdId[ad.id] = fallback;
          missingDefaults.push(fallback);
        }
      }

      if (alertsSupported && missingDefaults.length > 0) {
        await supabase.from("saved_ad_alert_preferences").upsert(
          missingDefaults.map((item) => ({
            user_id: user.id,
            ad_id: item.ad_id,
            notify_price_drop: item.notify_price_drop,
            notify_status_change: item.notify_status_change,
            notify_similar: item.notify_similar,
            notify_email: item.notify_email,
            notify_push: item.notify_push,
            paused: item.paused,
            baseline_price_eur: item.baseline_price_eur,
            baseline_status: item.baseline_status,
          })),
          { onConflict: "user_id,ad_id" },
        );
      }

      setSavedState((prev) => ({
        ...prev,
        savedAds: nextSavedAds,
        preferences: preferencesByAdId,
        isLoading: false,
        alertsSupported,
      }));
      SAVED_TAB_CACHE.set(cacheKey, {
        key: cacheKey,
        savedAds: nextSavedAds,
        preferences: preferencesByAdId,
        alertsSupported,
      });
    } catch (err) {
      console.error("Error loading saved ads:", err);
      setSavedState((prev) => ({
        ...prev,
        savedAds: [],
        preferences: {},
        isLoading: false,
      }));
    }
  }, [cacheKey, createDefaultPreference, savedAdIds, supabase, user]);

  useEffect(() => {
    if (!cacheKey) return;
    const cached = SAVED_TAB_CACHE.get(cacheKey);
    if (!cached) return;

    setSavedState((prev) => ({
      ...prev,
      savedAds: cached.savedAds,
      preferences: cached.preferences,
      alertsSupported: cached.alertsSupported,
      isLoading: false,
    }));
  }, [cacheKey]);

  useEffect(() => {
    void loadSavedAds();
  }, [loadSavedAds]);

  const getBrandName = (ad: SavedAd) => ad.brands?.name || ad.brand || t("unknown");
  const getModelName = (ad: SavedAd) => ad.models?.name || ad.model || "";
  const getPhoto = (ad: SavedAd) => {
    if (ad.photos_json && ad.photos_json.length > 0) {
      return optimizeCloudflareImage(ad.photos_json[0], {
        width: 640,
        height: 400,
        fit: "cover",
        quality: 82,
        format: "auto",
      });
    }
    return "/placeholder-car.jpg";
  };
  const getFuelLabel = (fuel: string) => {
    const labels: Record<string, string> = {
      petrol: tFuel("petrol"),
      diesel: tFuel("diesel"),
      electric: tFuel("electric"),
      hybrid: tFuel("hybrid"),
      lpg: tFuel("lpg"),
      cng: tFuel("cng"),
    };
    return labels[fuel] || fuel;
  };

  const getStatusLabel = useCallback(
    (status: string) => {
      switch (status) {
        case "active":
          return t("active");
        case "sold":
          return t("sold");
        case "expired":
          return t("expired");
        case "pending":
          return t("pending");
        case "rejected":
          return t("rejected");
        default:
          return status || t("unknown");
      }
    },
    [t],
  );

  const updatePreference = useCallback(
    async (adId: string, patch: Partial<SavedAdAlertPreference>) => {
      if (!user || !savedState.alertsSupported) return;

      const current = savedState.preferences[adId];
      if (!current) return;

      const optimistic = { ...current, ...patch };
      setSavedState((prev) => ({
        ...prev,
        preferences: {
          ...prev.preferences,
          [adId]: optimistic,
        },
        updatingAdId: adId,
      }));

      const { error } = await supabase
        .from("saved_ad_alert_preferences")
        .update({
          notify_price_drop: optimistic.notify_price_drop,
          notify_status_change: optimistic.notify_status_change,
          notify_similar: optimistic.notify_similar,
          notify_email: optimistic.notify_email,
          notify_push: optimistic.notify_push,
          paused: optimistic.paused,
        })
        .eq("user_id", user.id)
        .eq("ad_id", adId);

      if (error) {
        console.error("Error updating alert preference:", error);
        toast.error(t("saveFailed"));
        setSavedState((prev) => ({
          ...prev,
          preferences: {
            ...prev.preferences,
            [adId]: current,
          },
        }));
      }

      setSavedState((prev) => ({
        ...prev,
        updatingAdId: prev.updatingAdId === adId ? null : prev.updatingAdId,
      }));
    },
    [savedState.alertsSupported, savedState.preferences, supabase, t, user],
  );

  const applyPreferenceToAll = useCallback(
    async (patch: Partial<SavedAdAlertPreference>) => {
      if (!user || !savedState.alertsSupported || savedState.savedAds.length === 0) return;

      const previousPreferences = savedState.preferences;
      const adIds = savedState.savedAds.map((ad) => ad.id);
      const nextPreferences = { ...previousPreferences };

      for (const adId of adIds) {
        const current = nextPreferences[adId];
        if (!current) continue;
        nextPreferences[adId] = { ...current, ...patch };
      }

      setSavedState((prev) => ({
        ...prev,
        preferences: nextPreferences,
        isBulkUpdating: true,
      }));

      const { error } = await supabase
        .from("saved_ad_alert_preferences")
        .update({
          notify_price_drop: patch.notify_price_drop,
          notify_status_change: patch.notify_status_change,
          notify_similar: patch.notify_similar,
          notify_email: patch.notify_email,
          notify_push: patch.notify_push,
          paused: patch.paused,
        })
        .eq("user_id", user.id)
        .in("ad_id", adIds);

      if (error) {
        console.error("Error applying bulk alert preference update:", error);
        toast.error(t("saveFailed"));
        setSavedState((prev) => ({
          ...prev,
          preferences: previousPreferences,
        }));
      }

      setSavedState((prev) => ({
        ...prev,
        isBulkUpdating: false,
      }));
    },
    [savedState.alertsSupported, savedState.preferences, savedState.savedAds, supabase, t, user],
  );

  const handleUnsaveClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    onUnsave(id);
  };

  const derivedSavedAds = useMemo(() => {
    return savedState.savedAds.map((ad) => {
      const preference = savedState.preferences[ad.id] || createDefaultPreference(ad);
      return { ad, preference };
    });
  }, [createDefaultPreference, savedState.preferences, savedState.savedAds]);
  const allAlertsPaused =
    derivedSavedAds.length > 0 &&
    derivedSavedAds.every(({ preference }) => preference.paused);
  const allAlertsActive =
    derivedSavedAds.length > 0 &&
    derivedSavedAds.every(({ preference }) => !preference.paused);

  if (savedState.isLoading) {
    return (
      <div className="space-y-6">
        <SavedSearchesPanel />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {["saved-skeleton-1", "saved-skeleton-2", "saved-skeleton-3"].map(
            (skeletonKey) => (
              <div
                key={skeletonKey}
                className="market-card animate-pulse overflow-hidden"
              >
                <div className="aspect-[16/10] bg-surface" />
                <div className="p-4 space-y-3">
                  <div className="h-5 bg-surface rounded w-3/4" />
                  <div className="h-4 bg-surface rounded w-1/2" />
                  <div className="h-6 bg-surface rounded w-1/3" />
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    );
  }

  if (savedState.savedAds.length === 0) {
    return (
      <div className="space-y-6">
        <SavedSearchesPanel />
        <div className="market-panel mx-auto max-w-xl p-8 text-center sm:p-10">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl border border-primary/12 bg-primary/5 text-primary">
            <HeartIcon className="size-8" />
          </div>
        <h2 className="mb-2 text-lg font-semibold text-primary">{t("savedAds")}</h2>
          <p className="text-secondary mb-4">{t("clickHeartToSave")}</p>
          <Link
            href="/vysledky"
            className="market-action-primary inline-flex px-6 py-3 text-sm"
          >
            {t("browseCars")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SavedSearchesPanel />
      <div>
      <div className="mb-6 rounded-2xl border border-primary/10 bg-primary/5 p-4 sm:p-5">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-primary">{t("savedAds")}</h2>
            <span className="rounded-full bg-background px-3 py-1 text-sm font-semibold text-primary">
              {savedState.savedAds.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-secondary">{t("savedAlertsDescription")}</p>
        </div>

        {!savedState.alertsSupported && (
          <p className="mt-4 text-sm text-warning">{t("alertsUnavailable")}</p>
        )}

        {savedState.savedAds.length >= 2 ? (
        <div className="mt-5 border-t border-primary/10 pt-4">
          <h3 className="text-sm font-semibold text-primary">{t("bulkAlertsTitle")}</h3>
          <p className="mt-1 text-xs text-secondary">{t("bulkAlertsDescription")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!allAlertsPaused ? (
            <button
              type="button"
              onClick={() => {
                void applyPreferenceToAll({ paused: true });
              }}
              disabled={!savedState.alertsSupported || savedState.isBulkUpdating}
              className="market-action-secondary min-h-11 px-4 py-2 text-sm disabled:opacity-50"
            >
              {t("pauseAllAlerts")}
            </button>
            ) : null}
            {!allAlertsActive ? (
            <button
              type="button"
              onClick={() => {
                void applyPreferenceToAll({ paused: false });
              }}
              disabled={!savedState.alertsSupported || savedState.isBulkUpdating}
              className="market-action-primary min-h-11 px-4 py-2 text-sm disabled:opacity-50"
            >
              {t("resumeAllAlerts")}
            </button>
            ) : null}
          </div>
        </div>
        ) : null}

        {savedState.isBulkUpdating && (
          <p className="mt-3 text-xs text-tertiary">{t("updatingAlerts")}</p>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {derivedSavedAds.map(({ ad, preference }, index) => (
            <div
              key={ad.id}
              className="market-card overflow-hidden bg-background"
            >
              <Link
                href={buildAdPath({
                  id: ad.id,
                  brand: getBrandName(ad),
                  model: getModelName(ad),
                  year: ad.year,
                })}
                className="relative block aspect-[16/10] bg-background-muted"
              >
                <Image
                  src={getPhoto(ad)}
                  alt={`${getBrandName(ad)} ${getModelName(ad)}`}
                  fill
                  className="object-contain"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  priority={index === 0}
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : "auto"}
                />
              </Link>
              <div className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <Link
                    href={buildAdPath({
                      id: ad.id,
                      brand: getBrandName(ad),
                      model: getModelName(ad),
                      year: ad.year,
                    })}
                    className="font-semibold text-primary transition-colors hover:text-accent"
                  >
                    {getBrandName(ad)} {getModelName(ad)}
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => handleUnsaveClick(e, ad.id)}
                    className="inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-background-muted hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto"
                    title={t("removeFromSaved")}
                  >
                    <XIcon className="size-3.5" aria-hidden="true" />
                    {t("removeFromSaved")}
                  </button>
                </div>
                <p className="mt-2 text-sm text-secondary">
                  {[ad.year, ad.mileage_km ? `${ad.mileage_km.toLocaleString(localeTag)} km` : null, ad.location_city || inlineCopy.wholeMarket]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xl font-bold text-accent">
                    {formatCurrency(ad.price_eur)}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-background-muted px-2 py-0.5 text-xs font-medium text-secondary">
                    {getStatusLabel(ad.status)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-tertiary">{getFuelLabel(ad.fuel || "")}</p>

                <div className="mt-4 rounded-xl border border-border-strong bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      aria-expanded={expandedAlertAdId === ad.id}
                      aria-controls={`saved-alert-settings-${ad.id}`}
                      onClick={() => {
                        setExpandedAlertAdId((current) => current === ad.id ? null : ad.id);
                      }}
                      className="rounded-sm text-left text-sm font-semibold text-primary hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {expandedAlertAdId === ad.id
                        ? t("hideAlertSettings")
                        : t("showAlertSettings")}
                    </button>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        preference.paused
                          ? "bg-warning/10 text-warning"
                          : "bg-success/10 text-success"
                      }`}
                    >
                      {preference.paused ? t("alertsPaused") : t("active")}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-secondary">
                    {preference.notify_price_drop ? (
                      <span className="rounded-full bg-background-muted px-2 py-0.5">
                        {t("priceDropped")}
                      </span>
                    ) : null}
                    {preference.notify_status_change ? (
                      <span className="rounded-full bg-background-muted px-2 py-0.5">
                        {t("statusChanged")}
                      </span>
                    ) : null}
                    {preference.notify_email ? (
                      <span className="rounded-full bg-background-muted px-2 py-0.5">
                        {t("notifyByEmail")}
                      </span>
                    ) : null}
                  </div>
                  {expandedAlertAdId === ad.id ? (
                   <div id={`saved-alert-settings-${ad.id}`} className="mt-3 space-y-2 border-t border-border pt-3">
                     <p className="mb-2 text-[11px] text-secondary">
                       {t("baselineAtSave")}: {formatCurrency(preference.baseline_price_eur ?? ad.price_eur)}
                     </p>
                     <SavedAlertCheckbox
                       id={`saved-alert-pause-${ad.id}`}
                       title={t("pauseThisAlert")}
                       description={t("pauseThisAlertHelp")}
                       checked={preference.paused}
                       disabled={!savedState.alertsSupported || savedState.isBulkUpdating || savedState.updatingAdId === ad.id}
                       onChange={(checked) => {
                         void updatePreference(ad.id, { paused: checked });
                       }}
                     />
                     <SavedAlertCheckbox
                       id={`saved-alert-price-drop-${ad.id}`}
                       title={t("notifyOnPriceDrop")}
                       description={t("notifyOnPriceDropHelp")}
                       checked={preference.notify_price_drop}
                       disabled={!savedState.alertsSupported || savedState.isBulkUpdating || savedState.updatingAdId === ad.id}
                       onChange={(checked) => {
                         void updatePreference(ad.id, {
                           notify_price_drop: checked,
                           ...(!checked && !preference.notify_status_change
                             ? { notify_email: false }
                             : {}),
                         });
                       }}
                     />
                     <SavedAlertCheckbox
                       id={`saved-alert-status-change-${ad.id}`}
                       title={t("notifyOnStatusChange")}
                       description={t("notifyOnStatusChangeHelp")}
                       checked={preference.notify_status_change}
                       disabled={!savedState.alertsSupported || savedState.isBulkUpdating || savedState.updatingAdId === ad.id}
                       onChange={(checked) => {
                         void updatePreference(ad.id, {
                           notify_status_change: checked,
                           ...(!checked && !preference.notify_price_drop
                             ? { notify_email: false }
                             : {}),
                         });
                       }}
                     />
                     <SavedAlertCheckbox
                       id={`saved-alert-email-${ad.id}`}
                       title={t("notifyByEmail")}
                       description={
                         preference.notify_price_drop || preference.notify_status_change
                           ? t("notifyByEmailHelp")
                           : t("alertChannelRequiresTrigger")
                       }
                       checked={preference.notify_email}
                       disabled={
                         (!preference.notify_price_drop && !preference.notify_status_change) ||
                         !savedState.alertsSupported ||
                         savedState.isBulkUpdating ||
                         savedState.updatingAdId === ad.id
                       }
                       onChange={(checked) => {
                         void updatePreference(ad.id, { notify_email: checked });
                       }}
                     />
                   </div>
                  ) : null}
                 </div>
               </div>
              </div>
          ))}
      </div>
      </div>
    </div>
  );
}
// Messages Tab (functional)
type MessagesTabState = {
  conversations: MessageConversation[];
  activeConversation: string | null;
  isLoading: boolean;
  error: string;
};

type MessagesTabStateAction =
  | MessagesTabState
  | ((current: MessagesTabState) => MessagesTabState);

type MessagesTabUiState = {
  replyMessage: string;
  isSendingReply: boolean;
  isArchivingConversation: boolean;
  isUpdatingQualification: boolean;
  isMobileConversationOpen: boolean;
};

function messagesTabStateReducer(
  state: MessagesTabState,
  action: MessagesTabStateAction,
): MessagesTabState {
  return typeof action === "function" ? action(state) : action;
}

function messagesTabUiReducer(
  state: MessagesTabUiState,
  patch: Partial<MessagesTabUiState> | ((current: MessagesTabUiState) => MessagesTabUiState),
): MessagesTabUiState {
  return typeof patch === "function" ? patch(state) : { ...state, ...patch };
}

function normalizeConversationRows(data: unknown): InquiryConversationRow[] {
  if (!Array.isArray(data)) return [];

  return data.map((entry) => {
    const row = entry as InquiryConversationRow & {
      ads?: InquiryConversationRow["ads"] | InquiryConversationRow["ads"][];
      inquiries?: InquiryConversationRow["inquiries"] | null;
    };
    const adValue = Array.isArray(row.ads) ? (row.ads[0] ?? null) : (row.ads ?? null);
    return {
      ...row,
      ads: adValue,
      inquiries: Array.isArray(row.inquiries) ? row.inquiries : [],
    };
  });
}

function mapProfileNames(data: unknown, fallbackName: string): Record<string, string> {
  if (!Array.isArray(data)) return {};
  const result: Record<string, string> = {};

  for (const entry of data) {
    const row = entry as { id?: string; full_name?: string | null };
    if (typeof row.id !== "string") continue;
    result[row.id] =
      typeof row.full_name === "string" && row.full_name.trim().length > 0
        ? row.full_name.trim()
        : fallbackName;
  }

  return result;
}

function MessagesTab() {
  return useMessagesTabView();
}

function useMessagesTabView() {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const localeTag = getLocaleTag(locale);
  const userId = user?.id ?? null;
  const cachedMessages = userId ? MESSAGES_TAB_CACHE.get(userId) : null;
  const [messagesState, updateMessagesState] = useReducer(
    messagesTabStateReducer,
    {
      conversations: cachedMessages?.conversations || [],
      activeConversation:
        cachedMessages?.activeConversation || (cachedMessages?.conversations[0]?.id ?? null),
      isLoading: !cachedMessages,
      error: "",
    },
  );
  const [reloadToken, requestMessagesReload] = useReducer((value: number) => value + 1, 0);
  const [messageUiState, updateMessageUiState] = useReducer(messagesTabUiReducer, {
    replyMessage: "",
    isSendingReply: false,
    isArchivingConversation: false,
    isUpdatingQualification: false,
    isMobileConversationOpen: false,
  });
  const [isDesktopMessagesLayout, setIsDesktopMessagesLayout] = useState(false);
  const {
    replyMessage,
    isSendingReply,
    isArchivingConversation,
    isUpdatingQualification,
    isMobileConversationOpen,
  } = messageUiState;
  const messageHistoryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncLayout = () => setIsDesktopMessagesLayout(mediaQuery.matches);
    syncLayout();
    mediaQuery.addEventListener("change", syncLayout);
    return () => mediaQuery.removeEventListener("change", syncLayout);
  }, []);

  useEffect(() => {
    if (!userId) {
      updateMessagesState({
        conversations: [],
        activeConversation: null,
        isLoading: false,
        error: "",
      });
      return;
    }

    const cached = MESSAGES_TAB_CACHE.get(userId);
    if (!cached) {
      updateMessagesState({
        conversations: [],
        activeConversation: null,
        isLoading: true,
        error: "",
      });
      return;
    }

    updateMessagesState({
      conversations: cached.conversations,
      activeConversation:
        cached.activeConversation || (cached.conversations[0]?.id ?? null),
      isLoading: false,
      error: "",
    });
  }, [userId]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) {
      return date.toLocaleTimeString(localeTag, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    if (diffDays === 1) return t("yesterday");
    return date.toLocaleDateString(localeTag);
  };

  useEffect(() => {
    let isCancelled = false;

    const run = async () => {
      if (!userId) {
        if (isCancelled) return;
        updateMessagesState({
          conversations: [],
          activeConversation: null,
          isLoading: false,
          error: "",
        });
        return;
      }

      if (!isCancelled) {
        updateMessagesState((prev) => ({
          ...prev,
          isLoading: prev.conversations.length === 0,
          error: "",
        }));
      }

      if (isCancelled) return;

      const { data, error } = await supabase
        .from("inquiry_conversations")
        .select(
          "id, ad_id, buyer_id, seller_id, buyer_archived_at, seller_archived_at, is_qualified, qualified_at, created_at, last_message_at, ads(id, brand, model, photos_json, seller_id, status), inquiries(id, sender_id, recipient_id, message, is_read, created_at)",
        )
        .order("last_message_at", { ascending: false })
        .limit(100);

      if (!isCancelled) {
        if (error) {
          updateMessagesState((prev) => ({
            ...prev,
            isLoading: false,
            error: error.message || t("messagesLoadFailed"),
          }));
        } else {
          const conversationRows = normalizeConversationRows(data);
          const userIdSet = new Set<string>();
          for (const row of conversationRows) {
            if (row.buyer_id) userIdSet.add(row.buyer_id);
            if (row.seller_id) userIdSet.add(row.seller_id);
          }
          const userIds = Array.from(userIdSet);

          let profileNames: Record<string, string> = {};
          if (userIds.length > 0) {
            const { data: participantProfiles } = await supabase.rpc(
              "get_inquiry_participant_profiles",
            );
            if (!isCancelled) {
              const requestedProfiles = Array.isArray(participantProfiles)
                ? participantProfiles.filter((profile) => {
                    const id = (profile as { id?: unknown }).id;
                    return typeof id === "string" && userIdSet.has(id);
                  })
                : [];
              profileNames = mapProfileNames(requestedProfiles, t("user"));
            }
          }

          if (!isCancelled) {
            const conversations = mapInquiryThreadsToConversations(
              conversationRows,
              userId,
              profileNames,
              {
                fallbackCarTitle: t("messageFallbackListing"),
                incomingLabel: t("messageBuyerLabel"),
                outgoingLabel: t("messageSellerLabel"),
                userLabel: t("messageYouLabel"),
              },
            );

            updateMessagesState((prev) => {
              const hasActiveSelection =
                !!prev.activeConversation &&
                conversations.some((conv) => conv.id === prev.activeConversation);

              return {
                conversations,
                activeConversation: hasActiveSelection
                  ? prev.activeConversation
                  : (conversations[0]?.id ?? null),
                isLoading: false,
                error: "",
              };
            });
          }
        }
      }
    };

    queueMicrotask(() => {
      void run();
    });

    return () => {
      isCancelled = true;
    };
  }, [supabase, t, userId, reloadToken]);

  const activeConversation = messagesState.activeConversation
    ? messagesState.conversations.find(
        (conv) => conv.id === messagesState.activeConversation,
      ) || null
    : null;

  useEffect(() => {
    if (!userId) return;
    MESSAGES_TAB_CACHE.set(userId, {
      conversations: messagesState.conversations,
      activeConversation: messagesState.activeConversation,
    });
  }, [userId, messagesState.activeConversation, messagesState.conversations]);

  useEffect(() => {
    if (!activeConversation) {
      updateMessageUiState({ isMobileConversationOpen: false });
    }
  }, [activeConversation]);

  useEffect(() => {
    updateMessageUiState({ replyMessage: "" });
  }, [messagesState.activeConversation]);

  const markConversationRead = useCallback(
    async (conversationId: string, unread: number) => {
      if (unread === 0) return;

      updateMessagesState((prev) => ({
        ...prev,
        conversations: prev.conversations.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                unread: 0,
                messages: conv.messages.map((message) =>
                  message.direction === "incoming"
                    ? { ...message, isRead: true }
                    : message,
                ),
              }
            : conv,
        ),
      }));

      const response = await fetch("/api/inquiries", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...createCsrfHeaders(),
        },
        body: JSON.stringify({ action: "read", conversationId }),
      });
      if (!response.ok) requestMessagesReload();
    },
    [],
  );

  useEffect(() => {
    if (activeConversation?.unread && (isDesktopMessagesLayout || isMobileConversationOpen)) {
      void markConversationRead(activeConversation.id, activeConversation.unread);
    }
  }, [
    activeConversation,
    isDesktopMessagesLayout,
    isMobileConversationOpen,
    markConversationRead,
  ]);

  useEffect(() => {
    const history = messageHistoryRef.current;
    if (!history) return;
    const animationFrame = window.requestAnimationFrame(() => {
      history.scrollTop = history.scrollHeight;
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeConversation?.id, activeConversation?.messages.length]);

  const sendReply = useCallback(async () => {
    if (!activeConversation) {
      toast.error(t("messageCannotReply"));
      return;
    }

    const normalizedReply = replyMessage.trim();
    if (!normalizedReply) return;

    updateMessageUiState({ isSendingReply: true });
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...createCsrfHeaders(),
        },
        body: JSON.stringify({
          conversationId: activeConversation.id,
          message: normalizedReply,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; messageId?: string }
        | null;

      if (!response.ok) {
        toast.error(payload?.error || t("messageReplyFailed"));
        return;
      }

      const createdAt = new Date().toISOString();
      const messageId = payload?.messageId || `pending-${createdAt}`;
      updateMessagesState((current) => {
        const updated = current.conversations.find(
          (conversation) => conversation.id === activeConversation.id,
        );
        if (!updated) return current;

        const updatedConversation: MessageConversation = {
          ...updated,
          lastMessage: normalizedReply,
          lastMessageTime: createdAt,
          lastDirection: "outgoing",
          messages: [
            ...updated.messages,
            {
              id: messageId,
              direction: "outgoing",
              senderName: t("messageYouLabel"),
              body: normalizedReply,
              createdAt,
              isRead: false,
            },
          ],
        };

        return {
          ...current,
          conversations: [
            updatedConversation,
            ...current.conversations.filter(
              (conversation) => conversation.id !== activeConversation.id,
            ),
          ],
        };
      });
      updateMessageUiState({ replyMessage: "" });
      toast.success(t("messageReplySent"));
    } catch {
      toast.error(t("messageReplyFailed"));
    } finally {
      updateMessageUiState({ isSendingReply: false });
    }
  }, [activeConversation, replyMessage, t]);

  const handleArchiveConversation = useCallback(async () => {
    if (!activeConversation) return;

    const confirmed = window.confirm(t("messageConfirmArchive"));
    if (!confirmed) return;

    updateMessageUiState({ isArchivingConversation: true });
    try {
      const response = await fetch(
        `/api/inquiries?conversationId=${encodeURIComponent(activeConversation.id)}`,
        { method: "DELETE", headers: createCsrfHeaders() },
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        toast.error(payload?.error || t("messageArchiveFailed"));
        return;
      }

      updateMessagesState((current) => {
        const remaining = current.conversations.filter(
          (conversation) => conversation.id !== activeConversation.id,
        );
        return {
          ...current,
          conversations: remaining,
          activeConversation: remaining[0]?.id ?? null,
        };
      });
      updateMessageUiState({ isMobileConversationOpen: false });
      toast.success(t("messageConversationArchived"));
    } catch {
      toast.error(t("messageArchiveFailed"));
    } finally {
      updateMessageUiState({ isArchivingConversation: false });
    }
  }, [activeConversation, t]);

  const handleQualificationToggle = useCallback(async () => {
    if (!activeConversation?.adId) return;
    if (!activeConversation.canQualify) return;

    updateMessageUiState({ isUpdatingQualification: true });
    try {
      const nextQualified = !activeConversation.isQualified;
      const response = await fetch("/api/inquiries", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...createCsrfHeaders(),
        },
        body: JSON.stringify({
          action: "qualification",
          conversationId: activeConversation.id,
          isQualified: nextQualified,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            inquiryId?: string;
            adId?: string;
            isQualified?: boolean;
            wasQualifiedBefore?: boolean;
          }
        | null;

      if (!response.ok) {
        toast.error(payload?.error || t("messageLeadUpdateFailed"));
        return;
      }

      const resolvedQualified = Boolean(payload?.isQualified);
      updateMessagesState((prev) => ({
        ...prev,
        conversations: prev.conversations.map((conversation) =>
          conversation.id === activeConversation.id
            ? {
                ...conversation,
                isQualified: resolvedQualified,
                qualifiedAt: resolvedQualified ? new Date().toISOString() : null,
              }
            : conversation,
        ),
      }));

      if (resolvedQualified) {
        if (!payload?.wasQualifiedBefore) {
          trackAnalyticsEvent("lead_qualified", {
            leadId: activeConversation.id,
            adId: activeConversation.adId,
            qualificationMethod: "seller_dashboard_manual",
          });
        }
        toast.success(t("leadQualifiedSuccess"));
      } else {
        toast.success(t("leadQualificationRemoved"));
      }
    } catch {
      toast.error(t("messageLeadUpdateFailed"));
    } finally {
      updateMessageUiState({ isUpdatingQualification: false });
    }
  }, [activeConversation, t]);

  const handleReplyKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (!isSendingReply && replyMessage.trim()) {
        void sendReply();
      }
    }
  };

  if (messagesState.isLoading) {
    return (
      <div className="space-y-3">
        {["messages-skeleton-1", "messages-skeleton-2", "messages-skeleton-3"].map(
          (key) => (
            <div
              key={key}
              className="h-20 rounded-xl border border-border bg-background-muted animate-pulse"
            />
          ),
        )}
      </div>
    );
  }

  if (messagesState.error) {
    return (
      <div className="rounded-xl border border-error/30 bg-error/5 p-6 text-center">
        <p className="text-sm text-error mb-4">{messagesState.error}</p>
        <button
          type="button"
          onClick={() => {
            requestMessagesReload();
          }}
          className="market-action-primary px-5 py-2 text-sm"
        >
          {t("messageRetry")}
        </button>
      </div>
    );
  }

  if (messagesState.conversations.length === 0) {
    return (
      <div className="market-panel mx-auto max-w-xl p-8 text-center sm:p-10">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl border border-primary/12 bg-primary/5 text-primary">
          <MessageIcon className="size-8" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-primary">
          {t("noMessages")}
        </h3>
        <p className="text-secondary">{t("messagesWillAppear")}</p>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 lg:h-[clamp(36rem,65dvh,45rem)] lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
      <aside
        aria-label={t("conversationListLabel")}
        className={`${isMobileConversationOpen ? "hidden lg:flex" : "flex"} min-w-0 flex-col overflow-hidden lg:h-full`}
      >
        <h3 className="mb-3 px-1 text-lg font-semibold text-primary">
          {t("conversations")}
        </h3>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {messagesState.conversations.map((conversation) => {
            const isSelected = messagesState.activeConversation === conversation.id;
            return (
              <button
                key={conversation.id}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${conversation.counterpartyName}, ${conversation.carTitle}${
                  conversation.unread > 0
                    ? `, ${t("messageUnreadCount", { count: conversation.unread })}`
                    : ""
                }`}
                onClick={() => {
                  updateMessagesState((prev) => ({
                    ...prev,
                    activeConversation: conversation.id,
                  }));
                  updateMessageUiState({ isMobileConversationOpen: true });
                  void markConversationRead(conversation.id, conversation.unread);
                }}
                className={`w-full max-w-full overflow-hidden rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  isSelected
                    ? "border-primary/25 bg-primary/5"
                    : "border-border bg-background hover:border-primary/20 hover:bg-background-muted"
                }`}
              >
                <div className="flex min-w-0 gap-3">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-background-muted">
                    <Image
                      src={optimizeCloudflareImage(conversation.carPhoto, {
                        width: 96,
                        height: 96,
                        fit: "cover",
                        quality: 80,
                        format: "auto",
                      })}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className={`min-w-0 flex-1 truncate text-sm text-primary ${conversation.unread ? "font-bold" : "font-semibold"}`}>
                        {conversation.counterpartyName}
                      </span>
                      <span className="shrink-0 text-xs text-tertiary">
                        {formatTime(conversation.lastMessageTime)}
                      </span>
                    </div>
                    <p className="truncate text-sm text-secondary">
                      {conversation.carTitle}
                    </p>
                    <div className="mt-1 flex min-w-0 items-center gap-2">
                      <p className={`min-w-0 flex-1 truncate text-sm ${conversation.unread ? "font-medium text-primary" : "text-tertiary"}`}>
                        {conversation.lastDirection === "outgoing"
                          ? t("messageLastFromYou", { message: conversation.lastMessage })
                          : conversation.lastMessage}
                      </p>
                      {conversation.unread > 0 ? (
                        <span
                          className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold text-white"
                          aria-hidden="true"
                        >
                          {conversation.unread}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section
        className={`${isMobileConversationOpen ? "block" : "hidden lg:block"} min-w-0 lg:h-full`}
      >
        {activeConversation ? (
          <div className="market-card flex min-h-[calc(100dvh-13rem)] min-w-0 flex-col overflow-hidden lg:h-full lg:min-h-0">
            <header className="border-b border-border p-3 sm:p-4">
              <button
                type="button"
                onClick={() => updateMessageUiState({ isMobileConversationOpen: false })}
                className="market-action-secondary mb-3 inline-flex min-h-10 items-center gap-1.5 px-3 py-1 text-sm lg:hidden"
              >
                <ChevronLeftIcon className="size-4" />
                {t("messageBackToConversations")}
              </button>
              <div className="flex min-w-0 items-start gap-3">
                <div className="relative size-12 shrink-0 overflow-hidden rounded-lg">
                  <Image
                    src={optimizeCloudflareImage(activeConversation.carPhoto, {
                      width: 96,
                      height: 96,
                      fit: "cover",
                      quality: 80,
                      format: "auto",
                    })}
                    alt={activeConversation.carTitle}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-primary">
                    {activeConversation.counterpartyName}
                  </p>
                  {activeConversation.listingStatus === "active" ? (
                    <Link
                      href={buildAdPath({
                        id: activeConversation.adId,
                        model: activeConversation.carTitle,
                      })}
                      className="mt-0.5 inline-flex max-w-full items-center gap-1.5 rounded-sm text-sm text-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="truncate">{activeConversation.carTitle}</span>
                      <ExternalLinkIcon className="size-3.5 shrink-0" />
                      <span className="sr-only">{t("messageViewListing")}</span>
                    </Link>
                  ) : (
                    <div className="mt-0.5">
                      <p className="truncate text-sm text-secondary">
                        {activeConversation.carTitle}
                      </p>
                      <p className="text-xs text-tertiary">
                        {t("messageListingUnavailable")}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  {activeConversation.sellerId === userId ? (
                    <span className="hidden rounded-md bg-primary/7 px-2 py-1 text-xs font-medium text-primary sm:inline-flex">
                      {t("yourAd")}
                    </span>
                  ) : null}
                  {activeConversation.isQualified ? (
                    <span className="hidden rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success sm:inline-flex">
                      {t("qualifiedLead")}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleArchiveConversation()}
                    disabled={isArchivingConversation}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-secondary transition-colors hover:bg-background-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                  >
                    {isArchivingConversation
                      ? t("messageArchiving")
                      : t("messageArchiveConversation")}
                  </button>
                </div>
              </div>
              {activeConversation.canQualify ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
                  <p className="min-w-0 flex-1 text-xs text-secondary">
                    {activeConversation.isQualified
                      ? t("leadQualifiedHelp")
                      : t("leadNotQualifiedHelp")}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleQualificationToggle()}
                    disabled={isUpdatingQualification}
                    className="market-action-secondary min-h-9 shrink-0 px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    {isUpdatingQualification
                      ? t("saving")
                      : activeConversation.isQualified
                        ? t("removeLeadQualification")
                        : t("markLeadQualified")}
                  </button>
                </div>
              ) : null}
            </header>

            <div
              ref={messageHistoryRef}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label={t("messageHistoryLabel", {
                name: activeConversation.counterpartyName,
              })}
              className="min-h-[18rem] min-w-0 flex-1 space-y-3 overflow-y-auto bg-surface/25 p-3 sm:p-5"
            >
              {activeConversation.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.direction === "incoming" ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl border px-3.5 py-2.5 text-primary sm:max-w-[75%] ${
                      message.direction === "incoming"
                        ? "border-border bg-background"
                        : "border-primary/10 bg-primary/[0.07]"
                    }`}
                    aria-label={`${message.senderName}, ${formatTime(message.createdAt)}`}
                  >
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {message.body}
                    </p>
                    <p className="mt-1 text-right text-[11px] text-tertiary">
                      {formatTime(message.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="sticky bottom-0 min-w-0 space-y-2 border-t border-border bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
              <label htmlFor="dashboard-reply-message" className="sr-only">
                {t("messageReplyPlaceholder")}
              </label>
              <textarea
                id="dashboard-reply-message"
                name="dashboard-reply-message"
                rows={2}
                maxLength={2000}
                value={replyMessage}
                onChange={(event) => updateMessageUiState({ replyMessage: event.target.value })}
                onKeyDown={handleReplyKeyDown}
                placeholder={t("messageReplyPlaceholder")}
                className="input min-h-[4.5rem] w-full resize-y"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 text-xs text-secondary">
                  <p>{t("messageSendShortcut")}</p>
                  <p className="mt-0.5 text-tertiary">{t("messageReplyProtection")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void sendReply()}
                  disabled={isSendingReply || !replyMessage.trim()}
                  className="market-action-primary min-h-11 w-full shrink-0 px-5 py-2 text-sm disabled:opacity-50 sm:w-auto"
                >
                  {isSendingReply ? t("messageSending") : t("messageReply")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="market-card flex h-full items-center justify-center p-12">
            <div className="text-center">
              <MessageIcon className="size-12 mx-auto text-tertiary mb-4" />
              <p className="text-secondary">{t("selectConversation")}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
type SettingsProfile = {
  full_name?: string | null;
  phone?: string | null;
  notify_moderation_email?: boolean;
} | null;

type SettingsStatusMessage = {
  type: "success" | "error";
  text: string;
};

type SettingsTabState = {
  phone: string;
  savedPhone: string;
  isSaving: boolean;
  saveMessage: SettingsStatusMessage | null;
  newPassword: string;
  confirmPassword: string;
  isUpdatingPassword: boolean;
  passwordMessage: SettingsStatusMessage | null;
  deleteConfirm: string;
  isDeletingAccount: boolean;
  deleteMessage: SettingsStatusMessage | null;
};

type SettingsTabAction =
  | { type: "setPhone"; value: string }
  | { type: "setSavedPhone"; value: string }
  | { type: "setIsSaving"; value: boolean }
  | { type: "setSaveMessage"; value: SettingsStatusMessage | null }
  | { type: "setNewPassword"; value: string }
  | { type: "setConfirmPassword"; value: string }
  | { type: "setIsUpdatingPassword"; value: boolean }
  | { type: "setPasswordMessage"; value: SettingsStatusMessage | null }
  | { type: "setDeleteConfirm"; value: string }
  | { type: "setIsDeletingAccount"; value: boolean }
  | { type: "setDeleteMessage"; value: SettingsStatusMessage | null };

const REQUEST_TIMEOUT_MS = 15000;

function normalizePhoneNumber(raw: string, countryCode: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const hasPlus = trimmed.startsWith("+");
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (hasPlus) return `+${digitsOnly}`;
  if (digitsOnly.startsWith(countryCode)) return `+${digitsOnly}`;
  if (digitsOnly.startsWith("0") && digitsOnly.length >= 9) {
    return `+${countryCode}${digitsOnly.slice(1)}`;
  }
  if (digitsOnly.length === 9) return `+${countryCode}${digitsOnly}`;

  return trimmed;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function settingsTabReducer(
  state: SettingsTabState,
  action: SettingsTabAction,
): SettingsTabState {
  switch (action.type) {
    case "setPhone":
      return { ...state, phone: action.value };
    case "setSavedPhone":
      return { ...state, savedPhone: action.value };
    case "setIsSaving":
      return { ...state, isSaving: action.value };
    case "setSaveMessage":
      return { ...state, saveMessage: action.value };
    case "setNewPassword":
      return { ...state, newPassword: action.value };
    case "setConfirmPassword":
      return { ...state, confirmPassword: action.value };
    case "setIsUpdatingPassword":
      return { ...state, isUpdatingPassword: action.value };
    case "setPasswordMessage":
      return { ...state, passwordMessage: action.value };
    case "setDeleteConfirm":
      return { ...state, deleteConfirm: action.value };
    case "setIsDeletingAccount":
      return { ...state, isDeletingAccount: action.value };
    case "setDeleteMessage":
      return { ...state, deleteMessage: action.value };
    default:
      return state;
  }
}

function createInitialSettingsTabState(profile: SettingsProfile): SettingsTabState {
  return {
    phone: profile?.phone || "",
    savedPhone: profile?.phone || "",
    isSaving: false,
    saveMessage: null,
    newPassword: "",
    confirmPassword: "",
    isUpdatingPassword: false,
    passwordMessage: null,
    deleteConfirm: "",
    isDeletingAccount: false,
    deleteMessage: null,
  };
}

function SettingsStatusAlert({
  message,
  className = "",
  id,
}: {
  message: SettingsStatusMessage | null;
  className?: string;
  id?: string;
}) {
  if (!message) return null;

  return (
    <div
      id={id}
      role={message.type === "error" ? "alert" : "status"}
      aria-live={message.type === "error" ? "assertive" : "polite"}
      className={`${className} px-4 py-2 rounded-lg text-sm font-medium ${
        message.type === "success"
          ? "bg-success/10 text-success"
          : "bg-error/10 text-error"
      }`}
    >
      {message.text}
    </div>
  );
}

function SettingsPersonalDetailsSection({
  profile,
  email,
  phone,
  onPhoneChange,
  onPhoneBlur,
  saveMessage,
  onSave,
  isSaving,
  isPhoneDirty,
}: {
  profile: SettingsProfile;
  email?: string | null;
  phone: string;
  onPhoneChange: (value: string) => void;
  onPhoneBlur: () => void;
  saveMessage: SettingsStatusMessage | null;
  onSave: () => void;
  isSaving: boolean;
  isPhoneDirty: boolean;
}) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const phonePlaceholder = useMarket().phonePlaceholder;

  return (
    <section
      aria-labelledby="dashboard-personal-details-heading"
      className="market-card market-card-static p-5 sm:p-6"
    >
      <h2
        id="dashboard-personal-details-heading"
        className="mb-4 text-lg font-semibold text-text-primary"
      >
        {t("personalDetails")}
      </h2>
      <dl className="divide-y divide-border border-y border-border">
        <div className="flex items-start justify-between gap-4 py-3">
          <dt className="text-sm text-secondary">{t("name")}</dt>
          <dd className="text-right text-sm font-medium text-text-primary">
            {profile?.full_name || t("notProvided")}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4 py-3">
          <dt className="text-sm text-secondary">{t("emailAddress")}</dt>
          <dd className="break-all text-right text-sm font-medium text-text-primary">
            {email || t("notProvided")}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm leading-5 text-secondary">
        {t("contactAdminToChangeName")}{" "}
        <Link href="/kontakt" className="font-semibold text-primary underline-offset-2 hover:underline">
          {t("contactSupport")}
        </Link>
      </p>
      <form
        className="mt-6 space-y-4 border-t border-border pt-5"
        action={() => {
          onSave();
        }}
      >
        <h3 className="text-base font-semibold text-text-primary">{t("contactInfo")}</h3>
        <div>
          <label
            htmlFor="dashboard-settings-phone"
            className="mb-2 block text-sm font-medium text-text-primary"
          >
            {t("phoneNumber")}
          </label>
          <input
            id="dashboard-settings-phone"
            name="phone"
            type="tel"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            onBlur={onPhoneBlur}
            placeholder={phonePlaceholder}
            className="input"
            autoComplete="tel"
            inputMode="tel"
            aria-describedby="dashboard-settings-phone-help"
          />
          <p id="dashboard-settings-phone-help" className="mt-1.5 text-sm leading-5 text-secondary">
            {t("phoneVisibility")}
          </p>
        </div>

        <SettingsStatusAlert id="dashboard-settings-phone-status" message={saveMessage} />

        <button
          type="submit"
          disabled={isSaving || !isPhoneDirty}
          className="market-action-account px-6 py-2.5 disabled:cursor-not-allowed disabled:border-border disabled:bg-background-muted disabled:text-text-secondary disabled:opacity-100"
        >
          {isSaving ? tCommon("loading") : t("saveChanges")}
        </button>
      </form>
    </section>
  );
}

function SettingsSecuritySection({
  newPassword,
  confirmPassword,
  isPasswordFormValid,
  onNewPasswordChange,
  onConfirmPasswordChange,
  passwordMessage,
  onChangePassword,
  isUpdatingPassword,
}: {
  newPassword: string;
  confirmPassword: string;
  isPasswordFormValid: boolean;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  passwordMessage: SettingsStatusMessage | null;
  onChangePassword: () => void;
  isUpdatingPassword: boolean;
}) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const isSubmitDisabled = isUpdatingPassword || !isPasswordFormValid;
  const hasConfirmation = confirmPassword.length > 0;
  const passwordsMatch = hasConfirmation && newPassword === confirmPassword;

  return (
    <section
      aria-labelledby="dashboard-security-heading"
      className="market-card market-card-static p-5 sm:p-6"
    >
      <h2 id="dashboard-security-heading" className="mb-4 text-lg font-semibold text-text-primary">
        {t("security")}
      </h2>
      <form
        className="space-y-4"
        action={() => {
          onChangePassword();
        }}
      >
        <div>
          <label
            htmlFor="dashboard-settings-new-password"
            className="mb-2 block text-sm font-medium text-text-primary"
          >
            {t("newPassword")}
          </label>
          <div className="relative">
            <input
              id="dashboard-settings-new-password"
              name="newPassword"
              type={showNewPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => onNewPasswordChange(e.target.value)}
              className="input pr-12"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
              aria-describedby="dashboard-settings-password-length"
            />
            <button
              type="button"
              aria-label={showNewPassword ? t("hidePassword") : t("showPassword")}
              aria-pressed={showNewPassword}
              onClick={() => setShowNewPassword((visible) => !visible)}
              className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-tertiary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            >
              {showNewPassword ? (
                <EyeOffIcon className="size-5" />
              ) : (
                <EyeIcon className="size-5" />
              )}
            </button>
          </div>
          <p
            id="dashboard-settings-password-length"
            className={`mt-1.5 text-sm leading-5 ${
              newPassword.length >= MIN_PASSWORD_LENGTH ? "text-success" : "text-tertiary"
            }`}
          >
            {t("passwordMinLength", { min: MIN_PASSWORD_LENGTH })}
          </p>
        </div>
        <div>
          <label
            htmlFor="dashboard-settings-confirm-password"
            className="mb-2 block text-sm font-medium text-text-primary"
          >
            {t("confirmPassword")}
          </label>
          <div className="relative">
            <input
              id="dashboard-settings-confirm-password"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => onConfirmPasswordChange(e.target.value)}
              className="input pr-12"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
              aria-invalid={hasConfirmation && !passwordsMatch}
              aria-describedby="dashboard-settings-password-match"
            />
            <button
              type="button"
              aria-label={showConfirmPassword ? t("hidePassword") : t("showPassword")}
              aria-pressed={showConfirmPassword}
              onClick={() => setShowConfirmPassword((visible) => !visible)}
              className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-tertiary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            >
              {showConfirmPassword ? (
                <EyeOffIcon className="size-5" />
              ) : (
                <EyeIcon className="size-5" />
              )}
            </button>
          </div>
          <p
            id="dashboard-settings-password-match"
            aria-live="polite"
            className={`mt-1.5 text-sm leading-5 ${
              hasConfirmation ? (passwordsMatch ? "text-success" : "text-error") : "text-tertiary"
            }`}
          >
            {hasConfirmation
              ? passwordsMatch
                ? t("passwordsMatch")
                : t("passwordMismatch")
              : t("passwordMatchHint")}
          </p>
        </div>
        <p className="-mt-1 text-sm leading-5 text-secondary">{t("passwordDirectSetHint")}</p>

        <SettingsStatusAlert id="dashboard-settings-password-status" message={passwordMessage} />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="market-action-account px-6 py-2.5 disabled:cursor-not-allowed disabled:border-border disabled:bg-background-muted disabled:text-text-secondary disabled:opacity-100"
          >
            {isUpdatingPassword ? tCommon("loading") : t("changePassword")}
          </button>
        </div>
      </form>

    </section>
  );
}

function SettingsSessionsSection({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const t = useTranslations("dashboard");

  return (
    <section
      aria-labelledby="dashboard-session-security-heading"
      className="market-card market-card-static p-5 sm:p-6 lg:col-span-2"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2
            id="dashboard-session-security-heading"
            className="text-base font-semibold text-text-primary"
          >
            {t("sessionSecurity")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-secondary">{t("logoutAllDevicesHint")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void onSignOut();
          }}
          className="market-action-secondary shrink-0 px-5 py-2.5"
        >
          {t("logoutAllDevices")}
        </button>
      </div>
    </section>
  );
}

function SettingsDangerZoneSection({
  deleteConfirm,
  onDeleteConfirmChange,
  deleteMessage,
  onDeleteAccount,
  onResetDelete,
  isDeletingAccount,
  deleteConfirmToken,
  isDeleteConfirmed,
}: {
  deleteConfirm: string;
  onDeleteConfirmChange: (value: string) => void;
  deleteMessage: SettingsStatusMessage | null;
  onDeleteAccount: () => void;
  onResetDelete: () => void;
  isDeletingAccount: boolean;
  deleteConfirmToken: string;
  isDeleteConfirmed: boolean;
}) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const closeDeleteDialog = () => {
    if (isDeletingAccount) return;
    setIsDeleteDialogOpen(false);
    onResetDelete();
  };

  return (
    <section
      aria-labelledby="dashboard-danger-zone-heading"
      className="rounded-xl border border-error/30 bg-error/[0.06] p-5 sm:p-6 lg:col-span-2"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <h2 id="dashboard-danger-zone-heading" className="text-lg font-semibold text-error">
            {t("dangerZone")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-secondary">{t("deleteAccountWarning")}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsDeleteDialogOpen(true)}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-error bg-error/[0.03] px-5 py-2.5 font-semibold text-error transition-colors hover:bg-error/10"
        >
          {t("deleteAccount")}
        </button>
      </div>

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsDeleteDialogOpen(true);
          } else {
            closeDeleteDialog();
          }
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="text-error">{t("deleteDialogTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDialogDescription")}</DialogDescription>
          </DialogHeader>
          <form
            action={() => {
              onDeleteAccount();
            }}
          >
            <label
              htmlFor="dashboard-delete-confirm"
              className="mb-2 block text-sm font-medium text-text-primary"
            >
              {t("deleteConfirmLabel", { token: deleteConfirmToken })}
            </label>
            <input
              id="dashboard-delete-confirm"
              name="deleteConfirm"
              type="text"
              value={deleteConfirm}
              onChange={(event) => onDeleteConfirmChange(event.target.value)}
              className="input"
              placeholder={deleteConfirmToken}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="dashboard-delete-confirm-help"
            />
            <p id="dashboard-delete-confirm-help" className="mt-2 text-sm leading-5 text-secondary">
              {t("deleteDialogDescription")}
            </p>

            <SettingsStatusAlert message={deleteMessage} className="mt-4" />

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={closeDeleteDialog}
                className="market-action-secondary px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                disabled={isDeletingAccount || !isDeleteConfirmed}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-error bg-error px-5 py-2.5 font-semibold text-white transition-colors hover:bg-error/90 disabled:cursor-not-allowed disabled:border-border disabled:bg-background-muted disabled:text-text-secondary disabled:opacity-100"
              >
                {isDeletingAccount ? tCommon("loading") : t("deleteAccount")}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

type SettingsMfaState = {
  challenge: { factorId: string; challengeId: string } | null;
  code: string;
  error: string | null;
  isVerifying: boolean;
};

const INITIAL_SETTINGS_MFA_STATE: SettingsMfaState = {
  challenge: null,
  code: "",
  error: null,
  isVerifying: false,
};

function SettingsMfaDialog({
  state,
  onCodeChange,
  onClose,
  onVerify,
}: {
  state: SettingsMfaState;
  onCodeChange: (value: string) => void;
  onClose: () => void;
  onVerify: () => void;
}) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const isCodeValid = /^\d{6}$/.test(state.code.trim());

  return (
    <Dialog
      open={Boolean(state.challenge)}
      onOpenChange={(open) => {
        if (!open && !state.isVerifying) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>{t("mfaDialogTitle")}</DialogTitle>
          <DialogDescription>{t("mfaDialogDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          action={() => {
            onVerify();
          }}
        >
          <div>
            <label htmlFor="dashboard-settings-mfa-code" className="mb-2 block text-sm font-medium text-primary">
              {t("mfaCode")}
            </label>
            <input
              id="dashboard-settings-mfa-code"
              name="mfaCode"
              type="text"
              value={state.code}
              onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="input text-center tracking-[0.35em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </div>

          <SettingsStatusAlert
            message={state.error ? { type: "error", text: state.error } : null}
          />

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <button
                type="button"
                disabled={state.isVerifying}
                className="market-action-secondary px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("cancel")}
              </button>
            </DialogClose>
            <button
              type="submit"
              disabled={state.isVerifying || !isCodeValid}
              className="market-action-account px-5 py-2.5 disabled:cursor-not-allowed disabled:border-border disabled:bg-background-muted disabled:text-text-secondary disabled:opacity-100"
            >
              {state.isVerifying ? tCommon("loading") : t("verifyMfaAndChangePassword")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SettingsTab({
  profile,
  signOut,
}: {
  profile: SettingsProfile;
  signOut: () => Promise<void>;
}) {
  const { user, refreshProfile } = useAuth();
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const market = useMarket();
  const supabase = useMemo(() => createClient(), []);
  const { replace, refresh } = useRouter();
  const [state, dispatch] = useReducer(
    settingsTabReducer,
    profile,
    createInitialSettingsTabState,
  );
  const [mfaState, setMfaState] = useState<SettingsMfaState>(INITIAL_SETTINGS_MFA_STATE);
  const {
    phone,
    savedPhone,
    isSaving,
    saveMessage,
    newPassword,
    confirmPassword,
    isUpdatingPassword,
    passwordMessage,
    deleteConfirm,
    isDeletingAccount,
    deleteMessage,
  } = state;

  const isPasswordFormValid =
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword.length >= MIN_PASSWORD_LENGTH &&
    newPassword === confirmPassword;
  const isPhoneDirty =
    normalizePhoneNumber(phone, market.callingCode) !==
    normalizePhoneNumber(savedPhone, market.callingCode);
  const deleteConfirmToken = t("deleteConfirmToken");
  const isDeleteConfirmed =
    deleteConfirm.trim().toLocaleUpperCase(locale) ===
    deleteConfirmToken.toLocaleUpperCase(locale);

  const submitPasswordChange = useCallback(
    () =>
      withTimeout(
        fetch("/api/account/password", {
          method: "POST",
          headers: createCsrfHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ password: newPassword }),
        }),
        REQUEST_TIMEOUT_MS,
      ),
    [newPassword],
  );

  const markPasswordUpdated = () => {
    dispatch({
      type: "setPasswordMessage",
      value: { type: "success", text: t("passwordUpdated") },
    });
    dispatch({ type: "setNewPassword", value: "" });
    dispatch({ type: "setConfirmPassword", value: "" });
  };

  const handleChangePassword = async () => {
    if (!user) return;

    dispatch({ type: "setIsUpdatingPassword", value: true });
    dispatch({ type: "setPasswordMessage", value: null });

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      dispatch({
        type: "setPasswordMessage",
        value: {
          type: "error",
          text: t("passwordMinLength", { min: MIN_PASSWORD_LENGTH }),
        },
      });
      dispatch({ type: "setIsUpdatingPassword", value: false });
      return;
    }

    if (newPassword !== confirmPassword) {
      dispatch({
        type: "setPasswordMessage",
        value: { type: "error", text: t("passwordMismatch") },
      });
      dispatch({ type: "setIsUpdatingPassword", value: false });
      return;
    }

    try {
      const response = await submitPasswordChange();
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; code?: string }
        | null;

      if (response.status === 403 && payload?.code === "mfa_required") {
        const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;

        const factor = factors?.all?.find((candidate) => candidate.status === "verified");
        if (!factor) {
          dispatch({
            type: "setPasswordMessage",
            value: { type: "error", text: t("mfaNoFactors") },
          });
          return;
        }

        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: factor.id,
        });
        if (challengeError) throw challengeError;

        setMfaState({
          challenge: { factorId: factor.id, challengeId: challenge.id },
          code: "",
          error: null,
          isVerifying: false,
        });
        return;
      }

      if (!response.ok || !payload?.ok) {
        dispatch({
          type: "setPasswordMessage",
          value: {
            type: "error",
            text: payload?.error || t("passwordUpdateFailed"),
          },
        });
        return;
      }

      markPasswordUpdated();
    } catch (err) {
      dispatch({
        type: "setPasswordMessage",
        value: {
          type: "error",
          text:
            err instanceof Error && err.message === "timeout"
              ? t("requestTimeout")
              : t("passwordUpdateFailed"),
        },
      });
    } finally {
      dispatch({ type: "setIsUpdatingPassword", value: false });
    }
  };

  const handleVerifyMfaAndChangePassword = async () => {
    const challenge = mfaState.challenge;
    const code = mfaState.code.trim();
    if (!challenge || !/^\d{6}$/.test(code)) {
      setMfaState((current) => ({ ...current, error: t("mfaCodeInvalid") }));
      return;
    }

    setMfaState((current) => ({ ...current, error: null, isVerifying: true }));

    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: challenge.factorId,
        challengeId: challenge.challengeId,
        code,
      });
      if (verifyError) {
        setMfaState((current) => ({ ...current, error: t("mfaCodeInvalid") }));
        return;
      }

      const response = await submitPasswordChange();
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setMfaState((current) => ({
          ...current,
          error: payload?.error || t("passwordUpdateFailed"),
        }));
        return;
      }

      setMfaState(INITIAL_SETTINGS_MFA_STATE);
      markPasswordUpdated();
    } catch (err) {
      setMfaState((current) => ({
        ...current,
        error:
          err instanceof Error && err.message === "timeout"
            ? t("requestTimeout")
            : t("passwordUpdateFailed"),
      }));
    } finally {
      setMfaState((current) => ({ ...current, isVerifying: false }));
    }
  };

  const handleSavePhone = async () => {
    if (!user || !isPhoneDirty) return;
    dispatch({ type: "setIsSaving", value: true });
    dispatch({ type: "setSaveMessage", value: null });

    try {
      const nextPhone = normalizePhoneNumber(phone, market.callingCode);
      dispatch({ type: "setPhone", value: nextPhone });

      const phoneResponse = await withTimeout(
        fetch("/api/account/phone", {
          method: "POST",
          headers: createCsrfHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            phone: nextPhone.length ? nextPhone : null,
          }),
        }),
        REQUEST_TIMEOUT_MS,
      );

      const phonePayload = (await phoneResponse.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!phoneResponse.ok) {
        dispatch({
          type: "setSaveMessage",
          value: {
            type: "error",
            text: phonePayload?.error || t("saveFailed"),
          },
        });
      } else {
        dispatch({ type: "setSavedPhone", value: nextPhone });
        dispatch({
          type: "setSaveMessage",
          value: { type: "success", text: t("changesSaved") },
        });
        await refreshProfile().catch(() => undefined);
      }
    } catch (err) {
      dispatch({
        type: "setSaveMessage",
        value: {
          type: "error",
          text:
            err instanceof Error && err.message === "timeout"
              ? t("requestTimeout")
              : t("saveFailed"),
        },
      });
    } finally {
      dispatch({ type: "setIsSaving", value: false });
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    if (!isDeleteConfirmed) {
      dispatch({
        type: "setDeleteMessage",
        value: {
          type: "error",
          text: t("deleteConfirmMismatch", { token: deleteConfirmToken }),
        },
      });
      return;
    }

    dispatch({ type: "setIsDeletingAccount", value: true });
    dispatch({ type: "setDeleteMessage", value: null });

    try {
      const response = await withTimeout(
        fetch("/api/account/delete", {
          method: "POST",
          headers: createCsrfHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ confirm: "DELETE" }),
        }),
        REQUEST_TIMEOUT_MS,
      );

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok) {
        dispatch({
          type: "setDeleteMessage",
          value: {
            type: "error",
            text: payload?.error || t("deleteFailed"),
          },
        });
        return;
      }

      dispatch({
        type: "setDeleteMessage",
        value: { type: "success", text: t("accountDeleted") },
      });
      replace("/");
      refresh();
    } catch (err) {
      dispatch({
        type: "setDeleteMessage",
        value: {
          type: "error",
          text:
            err instanceof Error && err.message === "timeout"
              ? t("requestTimeout")
              : t("deleteFailed"),
        },
      });
    } finally {
      dispatch({ type: "setIsDeletingAccount", value: false });
    }
  };

  return (
    <>
      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-2 lg:items-start">
        <SettingsPersonalDetailsSection
          profile={profile}
          email={user?.email}
          phone={phone}
          onPhoneChange={(value) => {
            dispatch({ type: "setPhone", value });
            dispatch({ type: "setSaveMessage", value: null });
          }}
          onPhoneBlur={() =>
            dispatch({
              type: "setPhone",
              value: normalizePhoneNumber(phone, market.callingCode),
            })
          }
          saveMessage={saveMessage}
          onSave={() => {
            void handleSavePhone();
          }}
          isSaving={isSaving}
          isPhoneDirty={isPhoneDirty}
        />
        <SettingsSecuritySection
          newPassword={newPassword}
          confirmPassword={confirmPassword}
          isPasswordFormValid={isPasswordFormValid}
          onNewPasswordChange={(value) => dispatch({ type: "setNewPassword", value })}
          onConfirmPasswordChange={(value) =>
            dispatch({ type: "setConfirmPassword", value })
          }
          passwordMessage={passwordMessage}
          onChangePassword={() => {
            void handleChangePassword();
          }}
          isUpdatingPassword={isUpdatingPassword}
        />
        <SettingsSessionsSection onSignOut={signOut} />
        <SettingsDangerZoneSection
          deleteConfirm={deleteConfirm}
          onDeleteConfirmChange={(value) => dispatch({ type: "setDeleteConfirm", value })}
          deleteMessage={deleteMessage}
          onDeleteAccount={() => {
            void handleDeleteAccount();
          }}
          onResetDelete={() => {
            dispatch({ type: "setDeleteConfirm", value: "" });
            dispatch({ type: "setDeleteMessage", value: null });
          }}
          isDeletingAccount={isDeletingAccount}
          deleteConfirmToken={deleteConfirmToken}
          isDeleteConfirmed={isDeleteConfirmed}
        />
      </div>

      <SettingsMfaDialog
        state={mfaState}
        onCodeChange={(code) =>
          setMfaState((current) => ({ ...current, code, error: null }))
        }
        onClose={() => setMfaState(INITIAL_SETTINGS_MFA_STATE)}
        onVerify={() => {
          void handleVerifyMfaAndChangePassword();
        }}
      />
    </>
  );
}
